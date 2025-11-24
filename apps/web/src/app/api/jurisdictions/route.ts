import { db } from "@repo/database"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const jurisdictions = await db.query.jurisdictions.findMany({
      orderBy: (j, { asc }) => [asc(j.name)],
    })

    return NextResponse.json({ jurisdictions })
  } catch (error) {
    console.error("Failed to fetch jurisdictions:", error)
    return NextResponse.json({ error: "Failed to fetch jurisdictions" }, { status: 500 })
  }
}
