import { NextResponse } from "next/server"

// Import the auth module directly to test locally
async function testAuth() {
  const { authenticate } = await import("../../../../../../../../../containers/tax-sync/src/auth")

  const username = process.env.MYGOV_USERNAME
  const password = process.env.MYGOV_PASSWORD

  if (!username || !password) {
    throw new Error("MYGOV_USERNAME and MYGOV_PASSWORD env vars required")
  }

  return authenticate(username, password)
}

export async function GET() {
  try {
    console.log("[DEBUG] Starting auth test...")
    const result = await testAuth()
    console.log("[DEBUG] Auth result:", result)
    return NextResponse.json({ success: true, result })
  } catch (error) {
    console.error("[DEBUG] Auth error:", error)
    return NextResponse.json({
      error: String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}
