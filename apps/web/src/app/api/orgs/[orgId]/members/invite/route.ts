import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { orgMembers, accounts, globalAdmins } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canManageMembers, canEditMemberRoles, type OrgRole } from "@/lib/permissions"

async function checkGlobalAdmin(accountId: string): Promise<boolean> {
  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, accountId),
  })
  return !!admin
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get account by user ID
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Check if user is a member with permission
    const currentMembership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!currentMembership && !isGlobalAdmin) {
      return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 })
    }

    // Only admins, owners, or global admins can invite
    if (!isGlobalAdmin && !canManageMembers(currentMembership?.role as OrgRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const { email, role } = body

    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required" }, { status: 400 })
    }

    if (!["owner", "admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Only owners or global admins can invite owners
    if (role === "owner" && !isGlobalAdmin && !canEditMemberRoles(currentMembership?.role as OrgRole)) {
      return NextResponse.json({ error: "Only owners can invite other owners" }, { status: 403 })
    }

    // In a real implementation, you would:
    // 1. Check if the user exists by email
    // 2. If they exist, add them directly to the org
    // 3. If they don't exist, send an invite email

    // For now, we'll look up the account by checking if there's a user with this email
    // This is a simplified implementation - in production you'd want email invites

    // Try to find an existing account (this is a placeholder - you'd need to join with auth.users)
    // For demo purposes, return success
    return NextResponse.json({
      success: true,
      message: "Invitation functionality would send an email to " + email
    })
  } catch (error) {
    console.error("Failed to invite member:", error)
    return NextResponse.json({ error: "Failed to invite member" }, { status: 500 })
  }
}
