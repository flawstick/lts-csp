import { db } from "@repo/database";
import { eq } from "drizzle-orm";
import { pendingInvitations, accounts } from "@repo/database";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST - Accept platform invitation
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Please sign in to accept this invitation" }, { status: 401 });
    }

    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });
    }

    const invitation = await db.query.pendingInvitations.findFirst({
      where: eq(pendingInvitations.token, token),
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation token" }, { status: 404 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json({ error: `Invitation has already been ${invitation.status}` }, { status: 400 });
    }

    if (new Date() > invitation.expiresAt) {
      await db
        .update(pendingInvitations)
        .set({ status: "expired" })
        .where(eq(pendingInvitations.id, invitation.id));

      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 });
    }

    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json({
        error: `This invitation was sent to ${invitation.email}. Please sign in with that email address.`,
      }, { status: 403 });
    }

    // Check if account already exists
    const existingAccount = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    });

    if (existingAccount) {
      if (existingAccount.accountType === "portal") {
        await db
          .update(accounts)
          .set({ accountType: "dual" })
          .where(eq(accounts.id, existingAccount.id));
      }

      // User already has an account - just mark invitation accepted
      await db
        .update(pendingInvitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(pendingInvitations.id, invitation.id));

      return NextResponse.json({
        success: true,
        message: "Welcome back! You already have an account.",
      });
    }

    // Create new account for the user
    const [newAccount] = await db
      .insert(accounts)
      .values({
        userId: user.id,
        fullName: user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? null,
        avatarUrl: user.user_metadata?.avatar_url ?? null,
        accountType: "internal",
      })
      .returning();

    if (!newAccount) {
      return NextResponse.json({ error: "Failed to create account" }, { status: 500 });
    }

    // Mark invitation as accepted
    await db
      .update(pendingInvitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(pendingInvitations.id, invitation.id));

    return NextResponse.json({
      success: true,
      message: "Welcome to LTS Tax!",
    });
  } catch (error) {
    console.error("Failed to accept invitation:", error);
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 });
  }
}

// GET - Get invitation details by token
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ error: "Invitation token is required" }, { status: 400 });
    }

    const invitation = await db.query.pendingInvitations.findFirst({
      where: eq(pendingInvitations.token, token),
      with: {
        invitedByAccount: {
          columns: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    }

    const isExpired = new Date() > invitation.expiresAt;
    const isAccepted = invitation.status === "accepted";
    const isRevoked = invitation.status === "revoked";

    return NextResponse.json({
      id: invitation.id,
      email: invitation.email,
      status: invitation.status,
      expiresAt: invitation.expiresAt,
      isExpired,
      isAccepted,
      isRevoked,
      invitedBy: invitation.invitedByAccount,
    });
  } catch (error) {
    console.error("Failed to get invitation:", error);
    return NextResponse.json({ error: "Failed to get invitation details" }, { status: 500 });
  }
}
