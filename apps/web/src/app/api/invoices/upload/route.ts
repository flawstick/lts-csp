import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/database";
import { eq } from "drizzle-orm";
import { accounts, globalAdmins, invoices } from "@repo/database";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.userId, user.id),
    });

    if (!account) {
      return NextResponse.json({ error: "Account not found" }, { status: 404 });
    }

    const admin = await db.query.globalAdmins.findFirst({
      where: eq(globalAdmins.accountId, account.id),
    });

    if (!admin) {
      return NextResponse.json({ error: "Only global admins can upload invoices" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const invoiceId = formData.get("invoiceId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are allowed" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File size must be less than 10MB" }, { status: 400 });
    }

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filename = `invoices/${timestamp}-${sanitizedName}`;

    const blob = await put(filename, file, {
      access: "public",
      contentType: "application/pdf",
    });

    if (invoiceId) {
      await db
        .update(invoices)
        .set({ pdfUrl: blob.url })
        .where(eq(invoices.id, invoiceId));
    }

    return NextResponse.json({
      success: true,
      url: blob.url,
      filename: blob.pathname,
    });
  } catch (error) {
    console.error("Failed to upload invoice:", error);
    return NextResponse.json({ error: "Failed to upload invoice" }, { status: 500 });
  }
}
