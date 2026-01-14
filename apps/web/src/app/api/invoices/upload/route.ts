import { put, del } from "@vercel/blob"
import { NextResponse } from "next/server"
import { db } from "@repo/database"
import { accounts, globalAdmins, invoices } from "@repo/database"
import { eq } from "drizzle-orm"
import { createClient } from "@/lib/supabase/server"

const ALLOWED_TYPES = ["application/pdf"]

async function checkGlobalAdmin(): Promise<{ error?: string; accountId?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Unauthorized" }
  }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  })

  if (!account) {
    return { error: "Account not found" }
  }

  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, account.id),
  })

  if (!admin) {
    return { error: "Only global admins can upload invoices" }
  }

  return { accountId: account.id }
}

export async function POST(request: Request) {
  try {
    // Check global admin
    const authResult = await checkGlobalAdmin()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get("file") as File | null
    const invoiceId = formData.get("invoiceId") as string | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Check allowed types (PDF only for invoices)
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only PDF files are allowed for invoices" },
        { status: 400 }
      )
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    // Upload to Vercel Blob
    const filename = `invoices/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`
    const blob = await put(filename, file, {
      access: "public",
      contentType: file.type,
    })

    // If invoice ID is provided, update the invoice record
    if (invoiceId) {
      const invoice = await db.query.invoices.findFirst({
        where: eq(invoices.id, invoiceId),
      })

      if (invoice) {
        // Delete old PDF if exists
        if (invoice.pdfUrl) {
          try {
            await del(invoice.pdfUrl)
          } catch {
            // Ignore deletion errors
          }
        }

        // Update invoice with new PDF URL
        await db
          .update(invoices)
          .set({ pdfUrl: blob.url })
          .where(eq(invoices.id, invoiceId))
      }
    }

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
      name: file.name,
    })
  } catch (error) {
    console.error("Invoice upload error:", error)
    return NextResponse.json(
      { error: "Failed to upload invoice", details: String(error) },
      { status: 500 }
    )
  }
}

// DELETE endpoint to remove an invoice PDF
export async function DELETE(request: Request) {
  try {
    const authResult = await checkGlobalAdmin()
    if (authResult.error) {
      return NextResponse.json({ error: authResult.error }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const url = searchParams.get("url")
    const invoiceId = searchParams.get("invoiceId")

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 })
    }

    // Delete from Vercel Blob
    await del(url)

    // If invoice ID is provided, clear the pdfUrl field
    if (invoiceId) {
      await db
        .update(invoices)
        .set({ pdfUrl: null })
        .where(eq(invoices.id, invoiceId))
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Invoice delete error:", error)
    return NextResponse.json(
      { error: "Failed to delete invoice PDF", details: String(error) },
      { status: 500 }
    )
  }
}
