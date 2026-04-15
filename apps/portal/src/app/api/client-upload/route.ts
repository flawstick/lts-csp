import { put } from "@vercel/blob";
import { NextResponse } from "next/server";

import { db } from "@repo/database";

import { resolvePortalClientAccessShare } from "@/server/client-access";

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
    const formData = await request.formData();
    const file = formData.get("file");
    const token = formData.get("token");
    const category = formData.get("category");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    if (typeof token !== "string" || token.length === 0) {
      return NextResponse.json(
        { error: "Client access token is required." },
        { status: 400 },
      );
    }

    if (
      !ALLOWED_TYPES.some(
        (type) => file.type.includes(type) || type.includes(file.type),
      )
    ) {
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

    const share = await resolvePortalClientAccessShare({
      db,
      token,
    });

    const safeCategory =
      typeof category === "string" && category.length > 0 ? category : "misc";
    const pathname = `portal/${share.orgId}/${share.taxReturnId}/${safeCategory}/${Date.now()}-${sanitizeFilename(file.name)}`;

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
        category: safeCategory,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Upload failed.",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
