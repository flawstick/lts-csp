import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { orgMembers, accounts, organisations, globalAdmins } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { canEditOrgSettings, type OrgRole } from "@/lib/permissions"

async function checkGlobalAdmin(accountId: string): Promise<boolean> {
  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, accountId),
  })
  return !!admin
}

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

    const org = await db.query.organisations.findFirst({
      where: eq(organisations.id, orgId),
    })

    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 })
    }

    return NextResponse.json(org)
  } catch (error) {
    console.error("Failed to fetch organisation:", error)
    return NextResponse.json({ error: "Failed to fetch organisation" }, { status: 500 })
  }
}

export async function PATCH(
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
    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!membership && !isGlobalAdmin) {
      return NextResponse.json({ error: "Not a member of this organisation" }, { status: 403 })
    }

    // Only admins, owners, or global admins can edit org settings
    if (!isGlobalAdmin && !canEditOrgSettings(membership?.role as OrgRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    const body = await request.json()
    const { name, slug } = body

    // Build update object
    const updateData: Partial<{ name: string; slug: string; updatedAt: Date }> = {
      updatedAt: new Date(),
    }

    if (name !== undefined) {
      updateData.name = name
    }

    if (slug !== undefined) {
      // Check if slug is already taken
      const existingOrg = await db.query.organisations.findFirst({
        where: eq(organisations.slug, slug),
      })

      if (existingOrg && existingOrg.id !== orgId) {
        return NextResponse.json({ error: "Slug already taken" }, { status: 400 })
      }

      updateData.slug = slug
    }

    // Update the organisation
    const [updated] = await db
      .update(organisations)
      .set(updateData)
      .where(eq(organisations.id, orgId))
      .returning()

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update organisation:", error)
    return NextResponse.json({ error: "Failed to update organisation" }, { status: 500 })
  }
}
