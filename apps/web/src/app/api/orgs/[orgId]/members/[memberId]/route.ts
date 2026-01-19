import { NextResponse } from "next/server"

// This endpoint is deprecated - members are now platform-wide
export async function PATCH() {
  return NextResponse.json({ error: "This endpoint is deprecated." }, { status: 410 })
}

export async function DELETE() {
  return NextResponse.json({ error: "This endpoint is deprecated." }, { status: 410 })
}
