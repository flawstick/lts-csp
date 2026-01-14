import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { pendingInvitations, orgMembers, accounts } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token } = body

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "You must be logged in to accept an invitation" }, { status: 401 })
    }

    // Find the invitation
    const invitation = await db.query.pendingInvitations.findFirst({
      where: and(
        eq(pendingInvitations.token, token),
        eq(pendingInvitations.status, "pending")
      ),
      with: {
        organisation: true,
      },
    })

    if (!invitation) {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 })
    }

    // Check if invitation has expired
    if (new Date() > invitation.expiresAt) {
      await db
        .update(pendingInvitations)
        .set({ status: "expired" })
        .where(eq(pendingInvitations.id, invitation.id))
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 })
    }

    // Verify email matches (case-insensitive)
    if (user.email?.toLowerCase() !== invitation.email.toLowerCase()) {
      return NextResponse.json({
        error: `This invitation was sent to ${invitation.email}. Please log in with that email address.`
      }, { status: 403 })
    }

    // Get or create account
    let account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      // Create account if it doesn't exist
      const [newAccount] = await db
        .insert(accounts)
        .values({
          userId: user.id,
          fullName: user.user_metadata?.full_name || user.email?.split("@")[0] || "New User",
          avatarUrl: user.user_metadata?.avatar_url,
        })
        .returning()
      account = newAccount
    }

    // Check if already a member
    const existingMembership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, invitation.orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    if (existingMembership) {
      // Mark invitation as accepted anyway
      await db
        .update(pendingInvitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(pendingInvitations.id, invitation.id))

      return NextResponse.json({
        success: true,
        message: "You are already a member of this organisation",
        orgId: invitation.orgId,
        orgSlug: invitation.organisation.slug,
      })
    }

    // Add user to organisation
    await db.insert(orgMembers).values({
      orgId: invitation.orgId,
      accountId: account.id,
      role: invitation.role,
    })

    // Mark invitation as accepted
    await db
      .update(pendingInvitations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(pendingInvitations.id, invitation.id))

    return NextResponse.json({
      success: true,
      message: `You have joined ${invitation.organisation.name}`,
      orgId: invitation.orgId,
      orgSlug: invitation.organisation.slug,
    })
  } catch (error) {
    console.error("Failed to accept invitation:", error)
    return NextResponse.json({ error: "Failed to accept invitation" }, { status: 500 })
  }
}

// GET invitation details (for display on accept page)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    // Find the invitation
    const invitation = await db.query.pendingInvitations.findFirst({
      where: and(
        eq(pendingInvitations.token, token),
        eq(pendingInvitations.status, "pending")
      ),
      with: {
        organisation: {
          columns: {
            id: true,
            name: true,
            slug: true,
            logoUrl: true,
          },
        },
        invitedByAccount: {
          columns: {
            id: true,
            fullName: true,
            avatarUrl: true,
          },
        },
      },
    })

    if (!invitation) {
      return NextResponse.json({ error: "Invalid or expired invitation" }, { status: 404 })
    }

    // Check if invitation has expired
    if (new Date() > invitation.expiresAt) {
      return NextResponse.json({ error: "This invitation has expired" }, { status: 410 })
    }

    return NextResponse.json({
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
      organisation: invitation.organisation,
      invitedBy: invitation.invitedByAccount,
    })
  } catch (error) {
    console.error("Failed to get invitation:", error)
    return NextResponse.json({ error: "Failed to get invitation" }, { status: 500 })
  }
}
