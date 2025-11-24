import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { orgMembers, accounts, globalAdmins } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(
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

    // Check if global admin
    const globalAdmin = await db.query.globalAdmins.findFirst({
      where: eq(globalAdmins.accountId, account.id),
    })
    const isGlobalAdmin = !!globalAdmin

    // Get membership
    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    // Global admins can access even if not a member
    if (!membership && !isGlobalAdmin) {
      return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 })
    }

    return NextResponse.json({
      role: membership?.role ?? "owner", // Global admins get owner-level access
      memberId: membership?.id,
      isGlobalAdmin,
    })
  } catch (error) {
    console.error("Failed to fetch member info:", error)
    return NextResponse.json({ error: "Failed to fetch member info" }, { status: 500 })
  }
}
