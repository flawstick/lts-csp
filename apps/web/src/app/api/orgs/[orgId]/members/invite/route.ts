import { NextResponse } from "next/server"

// This endpoint is deprecated - use /api/members/invite for platform-wide invites
export async function POST() {
  return NextResponse.json({ error: "This endpoint is deprecated. Use /api/members/invite instead." }, { status: 410 })
}
