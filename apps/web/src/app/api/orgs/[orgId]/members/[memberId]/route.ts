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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const { orgId, memberId } = await params
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

    // Only owners or global admins can edit roles
    if (!isGlobalAdmin && !canEditMemberRoles(currentMembership?.role as OrgRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const { role } = body

    if (!["owner", "admin", "member"].includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 })
    }

    // Update the member role
    await db
      .update(orgMembers)
      .set({ role, updatedAt: new Date() })
      .where(eq(orgMembers.id, memberId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to update member:", error)
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ orgId: string; memberId: string }> }
) {
  try {
    const { orgId, memberId } = await params
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

    // Only admins, owners, or global admins can remove members
    if (!isGlobalAdmin && !canManageMembers(currentMembership?.role as OrgRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Can't remove yourself (unless global admin)
    if (!isGlobalAdmin && currentMembership?.id === memberId) {
      return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 })
    }

    // Get the member being removed
    const targetMember = await db.query.orgMembers.findFirst({
      where: eq(orgMembers.id, memberId),
    })

    if (!targetMember) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Admins can't remove owners
    if (currentMembership.role === "admin" && targetMember.role === "owner") {
      return NextResponse.json({ error: "Admins cannot remove owners" }, { status: 403 })
    }

    // Delete the member
    await db.delete(orgMembers).where(eq(orgMembers.id, memberId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to remove member:", error)
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 })
  }
}
