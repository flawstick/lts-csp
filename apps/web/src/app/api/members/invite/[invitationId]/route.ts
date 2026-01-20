import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { db, globalAdmins, invitations, accounts } from "@repo/database"
import { eq } from "drizzle-orm"

async function checkGlobalAdmin(accountId: string): Promise<boolean> {
  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, accountId),
  })
  return !!admin
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ invitationId: string }> }
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
      return NextResponse.json({ error: "Only admins can revoke invitations" }, { status: 403 })
    }

    const { invitationId } = await params

    // Get the invitation
    const invitation = await db.query.invitations.findFirst({
      where: eq(invitations.id, invitationId),
    })

    if (!invitation) {
      return NextResponse.json({ error: "Invitation not found" }, { status: 404 })
    }

    // Delete the invitation
    await db.delete(invitations).where(eq(invitations.id, invitationId))

    return NextResponse.json({ success: true, message: "Invitation revoked successfully" })
  } catch (error) {
    console.error("Failed to revoke invitation:", error)
    return NextResponse.json({ error: "Failed to revoke invitation" }, { status: 500 })
  }
}
