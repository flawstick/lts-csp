import { db } from "@repo/database"
import { eq, and } from "drizzle-orm"
import { orgMembers, accounts, organisations, globalAdmins } from "@repo/database"
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { put, del } from "@vercel/blob"
import { canEditOrgSettings, type OrgRole } from "@/lib/permissions"

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]

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

    // Get account
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Check permissions
    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!membership && !isGlobalAdmin) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    if (!isGlobalAdmin && !canEditOrgSettings(membership?.role as OrgRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Get the org to check for existing logo
    const org = await db.query.organisations.findFirst({
      where: eq(organisations.id, orgId),
    })

    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 })
    }

    // Parse form data
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only images are allowed (JPEG, PNG, GIF, WebP, SVG)" },
        { status: 400 }
      )
    }

    // Max 5MB for images
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 })
    }

    // Delete old logo if exists
    if (org.logoUrl) {
      try {
        await del(org.logoUrl)
      } catch (e) {
        console.warn("Failed to delete old logo:", e)
      }
    }

    // Upload to Vercel Blob
    const blob = await put(`orgs/${orgId}/logo-${Date.now()}${getExtension(file.type)}`, file, {
      access: "public",
      contentType: file.type,
    })

    // Update org with new logo URL
    const [updated] = await db
      .update(organisations)
      .set({ logoUrl: blob.url, updatedAt: new Date() })
      .where(eq(organisations.id, orgId))
      .returning()

    return NextResponse.json({
      success: true,
      logoUrl: blob.url,
      org: updated,
    })
  } catch (error) {
    console.error("Logo upload error:", error)
    return NextResponse.json(
      { error: "Failed to upload logo" },
      { status: 500 }
    )
  }
}

export async function DELETE(
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

    // Get account
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    })

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 })
    }

    // Check permissions
    const membership = await db.query.orgMembers.findFirst({
      where: and(
        eq(orgMembers.orgId, orgId),
        eq(orgMembers.accountId, account.id)
      ),
    })

    const isGlobalAdmin = await checkGlobalAdmin(account.id)

    if (!membership && !isGlobalAdmin) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 })
    }

    if (!isGlobalAdmin && !canEditOrgSettings(membership?.role as OrgRole)) {
      return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 })
    }

    // Get the org
    const org = await db.query.organisations.findFirst({
      where: eq(organisations.id, orgId),
    })

    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 404 })
    }

    // Delete blob if exists
    if (org.logoUrl) {
      try {
        await del(org.logoUrl)
      } catch (e) {
        console.warn("Failed to delete logo from blob:", e)
      }
    }

    // Clear logo URL
    const [updated] = await db
      .update(organisations)
      .set({ logoUrl: null, updatedAt: new Date() })
      .where(eq(organisations.id, orgId))
      .returning()

    return NextResponse.json({
      success: true,
      org: updated,
    })
  } catch (error) {
    console.error("Logo delete error:", error)
    return NextResponse.json(
      { error: "Failed to delete logo" },
      { status: 500 }
    )
  }
}

function getExtension(mimeType: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
  }
  return extensions[mimeType] || ""
}
