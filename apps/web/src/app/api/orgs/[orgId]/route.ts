import {
  accounts,
  db,
  mergeOrgDemoModeSettings,
  orgSettings,
  organisations,
  parseOrgDemoModeSettings,
  taxReturns,
} from "@repo/database"
import { desc, eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

async function getOrgResponse(orgId: string) {
  const organisation = await db.query.organisations.findFirst({
    where: eq(organisations.id, orgId),
    with: {
      settings: true,
    },
  })

  if (!organisation) {
    return null
  }

  const clientRows = await db
    .select({
      entityName: taxReturns.entityName,
    })
    .from(taxReturns)
    .where(eq(taxReturns.orgId, orgId))
    .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt))

  const availableDemoClients = Array.from(
    new Set(
      clientRows
        .map((row) => row.entityName.trim())
        .filter((entityName) => entityName.length > 0),
    ),
  ).sort((a, b) => a.localeCompare(b))

  return {
    ...organisation,
    demoMode: parseOrgDemoModeSettings(organisation.settings?.settings),
    availableDemoClients,
  }
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

    const org = await getOrgResponse(orgId)

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

    // Get account - all platform users can access orgs
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    const body = await request.json()
    const { name, slug, demoMode } = body

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

    if (Object.keys(updateData).length > 1) {
      await db
        .update(organisations)
        .set(updateData)
        .where(eq(organisations.id, orgId))
    }

    if (demoMode !== undefined) {
      const existingOrgSettings = await db.query.orgSettings.findFirst({
        where: eq(orgSettings.orgId, orgId),
      })

      const nextSettings = mergeOrgDemoModeSettings(
        existingOrgSettings?.settings,
        demoMode,
      )

      if (existingOrgSettings) {
        await db
          .update(orgSettings)
          .set({
            settings: nextSettings,
            updatedAt: new Date(),
          })
          .where(eq(orgSettings.orgId, orgId))
      } else {
        await db.insert(orgSettings).values({
          orgId,
          settings: nextSettings,
        })
      }
    }

    const updated = await getOrgResponse(orgId)

    return NextResponse.json(updated)
  } catch (error) {
    console.error("Failed to update organisation:", error)
    return NextResponse.json({ error: "Failed to update organisation" }, { status: 500 })
  }
}
