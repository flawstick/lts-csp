import { put } from "@vercel/blob"
import { NextResponse } from "next/server"
import { trackServer } from "@/lib/analytics"

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File | null

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Check allowed types
    if (!ALLOWED_TYPES.some((t) => file.type.includes(t) || t.includes(file.type))) {
      return NextResponse.json(
        { error: "Only PDF, Excel, and image files are allowed" },
        { status: 400 }
      )
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 })
    }

    // Upload to Vercel Blob
    const isImage = file.type.startsWith("image/")
    const folder = isImage ? "avatars" : "tasks"
    const blob = await put(`${folder}/${Date.now()}-${file.name}`, file, {
      access: "public",
      contentType: file.type,
    })

    // Track document upload
    await trackServer({
      name: "document_uploaded",
      data: {
        documentType: file.type.startsWith("application/pdf") ? "pdf" :
                     file.type.startsWith("image/") ? "image" : "other",
        sizeBytes: file.size,
        uploadContext: folder as "avatar" | "task",
      },
    })

    return NextResponse.json({
      success: true,
      url: blob.url,
      pathname: blob.pathname,
      size: file.size,
      name: file.name,
    })
  } catch (error) {
    console.error("Upload error:", error)
    return NextResponse.json(
      { error: "Failed to upload file", details: String(error) },
      { status: 500 }
    )
  }
}
