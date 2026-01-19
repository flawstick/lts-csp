import { NextResponse } from "next/server"

// This endpoint is deprecated - members are now platform-wide
export async function GET() {
  return NextResponse.json({ members: [] })
}
