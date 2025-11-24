import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { orgMembers, accounts } from "@repo/database"
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

    // Check if user is a member
    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    if (!membership) {
      return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 })
    }

    // Get all members
    const members = await db.query.orgMembers.findMany({
      where: eq(orgMembers.orgId, orgId),
      with: {
        account: true,
      },
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    })

    return NextResponse.json({ members })
  } catch (error) {
    console.error("Failed to fetch members:", error)
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 })
  }
}
