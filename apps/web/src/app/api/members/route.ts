import { db } from "@repo/database"
import { eq } from "drizzle-orm"
import { accounts, globalAdmins } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient, createAdminClient } from "@/lib/supabase/server"

async function checkGlobalAdmin(accountId: string): Promise<boolean> {
  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, accountId),
  })
  return !!admin
}

// GET - List all platform members
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!isGlobalAdmin) {
      return NextResponse.json({ error: "Only admins can view members" }, { status: 403 })
    }

    // Get all accounts with their global admin status
    const allAccounts = await db.query.accounts.findMany({
      with: {
        globalAdmin: true,
      },
      orderBy: (accounts, { desc }) => [desc(accounts.createdAt)],
    })

    // Get user emails from Supabase using admin client
    const adminClient = createAdminClient()
    const { data: authUsers } = await adminClient.auth.admin.listUsers()

    const members = allAccounts.map(acc => {
      const authUser = authUsers?.users?.find(u => u.id === acc.userId)
      return {
        id: acc.id,
        email: authUser?.email || "Unknown",
        fullName: acc.fullName,
        avatarUrl: acc.avatarUrl,
        role: acc.globalAdmin ? "admin" : "member",
        createdAt: acc.createdAt,
      }
    })

    return NextResponse.json(members)
  } catch (error) {
    console.error("Failed to get members:", error)
    return NextResponse.json({ error: "Failed to get members" }, { status: 500 })
  }
}
