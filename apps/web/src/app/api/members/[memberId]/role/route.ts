import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/database";
import { accounts, globalAdmins } from "@repo/database";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the current user's account
    const currentAccount = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
      with: {
        globalAdmin: true,
      },
    });

    if (!currentAccount || !currentAccount.globalAdmin) {
      return NextResponse.json(
        { error: "Only admins can update member roles" },
        { status: 403 }
      );
    }

    const { memberId } = await params;
    const { role } = await request.json();

    if (!role || !["admin", "member"].includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be 'admin' or 'member'" },
        { status: 400 }
      );
    }

    // Get the target account
    const targetAccount = await db.query.accounts.findFirst({
      where: eq(accounts.id, memberId),
      with: {
        globalAdmin: true,
      },
    });

    if (!targetAccount) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    // If changing to member (removing admin), check if this is the last admin
    if (role === "member" && targetAccount.globalAdmin) {
      const adminCount = await db
        .select({ count: globalAdmins.id })
        .from(globalAdmins);

      if (adminCount.length <= 1) {
        return NextResponse.json(
          { error: "Cannot remove the last admin" },
          { status: 400 }
        );
      }
    }

    // Update the role
    if (role === "admin") {
      // Add global admin if not already one
      if (!targetAccount.globalAdmin) {
        await db.insert(globalAdmins).values({
          accountId: targetAccount.id,
          createdBy: currentAccount.id,
        });
      }
    } else {
      // Remove global admin if they are one
      if (targetAccount.globalAdmin) {
        await db
          .delete(globalAdmins)
          .where(eq(globalAdmins.accountId, targetAccount.id));
      }
    }

    return NextResponse.json({ success: true, role });
  } catch (error) {
    console.error("Failed to update member role:", error);
    return NextResponse.json(
      { error: "Failed to update member role" },
      { status: 500 }
    );
  }
}
