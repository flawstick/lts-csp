import { db } from "@repo/database"
import { eq } from "drizzle-orm"
import { accounts, globalAdmins } from "@repo/database"
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

    // All platform users have access to orgs
    return NextResponse.json({
      role: isGlobalAdmin ? "admin" : "member",
      memberId: account.id,
      isGlobalAdmin,
    })
  } catch (error) {
    console.error("Failed to fetch member info:", error)
    return NextResponse.json({ error: "Failed to fetch member info" }, { status: 500 })
  }
}
