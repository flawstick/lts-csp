import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
  "application/zip",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const orgId = formData.get("orgId");
    const taxReturnId = formData.get("taxReturnId");
    const category = formData.get("category");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (typeof orgId !== "string" || typeof taxReturnId !== "string") {
      return NextResponse.json({ error: "Invalid upload context." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.some((type) => file.type.includes(type) || type.includes(file.type))) {
      return NextResponse.json(
        { error: "Only PDF, Office, CSV, ZIP, and image files are allowed." },
        { status: 400 },
      );
    }

    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File too large. Maximum allowed size is 20MB." },
        { status: 400 },
      );
    }

    const safeCategory = typeof category === "string" && category.length > 0 ? category : "misc";
    const pathname = `portal/${orgId}/${taxReturnId}/${safeCategory}/${Date.now()}-${sanitizeFilename(file.name)}`;

    const blob = await put(pathname, file, {
      access: "public",
      contentType: file.type,
    });

    return NextResponse.json({
      success: true,
      file: {
        url: blob.url,
        pathname: blob.pathname,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Upload failed.", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
