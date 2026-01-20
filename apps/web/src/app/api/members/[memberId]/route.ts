import { NextRequest, NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"
import { db, globalAdmins, accounts } from "@repo/database"
import { eq } from "drizzle-orm"

async function checkGlobalAdmin(accountId: string): Promise<boolean> {
  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, accountId),
  })
  return !!admin
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get the current user's account
    const currentAccount = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!currentAccount) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Check if user is a global admin
    const isAdmin = await checkGlobalAdmin(currentAccount.id)
    if (!isAdmin) {
      return NextResponse.json({ error: "Only admins can remove members" }, { status: 403 })
    }

    const { memberId } = await params

    // Get the target account
    const targetAccount = await db.query.accounts.findFirst({
      where: eq(accounts.id, memberId),
    })

    if (!targetAccount) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 })
    }

    // Prevent removing yourself
    if (targetAccount.id === currentAccount.id) {
      return NextResponse.json({ error: "You cannot remove yourself" }, { status: 400 })
    }

    // Check if target is an admin
    const targetIsAdmin = await db.query.globalAdmins.findFirst({
      where: eq(globalAdmins.accountId, targetAccount.id),
    })

    // If removing an admin, check there's at least one other admin
    if (targetIsAdmin) {
      const adminCount = await db.query.globalAdmins.findMany()
      if (adminCount.length <= 1) {
        return NextResponse.json({ error: "Cannot remove the last admin" }, { status: 400 })
      }

      // Remove from global admins
      await db.delete(globalAdmins).where(eq(globalAdmins.accountId, targetAccount.id))
    }

    // Delete the user from Supabase Auth using admin client
    const adminClient = createAdminClient()
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(targetAccount.userId)
    if (deleteError) {
      console.error("Failed to delete user from Supabase:", deleteError)
      return NextResponse.json({ error: "Failed to remove user" }, { status: 500 })
    }

    // Delete the account record (this will cascade to related records)
    await db.delete(accounts).where(eq(accounts.id, targetAccount.id))

    return NextResponse.json({ success: true, message: "Member removed successfully" })
  } catch (error) {
    console.error("Failed to remove member:", error)
    return NextResponse.json({ error: "Failed to remove member" }, { status: 500 })
  }
}
