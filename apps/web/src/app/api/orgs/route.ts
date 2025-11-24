import { db } from "@repo/database"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const orgs = await db.query.organisations.findMany({
      orderBy: (o, { asc }) => [asc(o.name)],
    })

    return NextResponse.json({ orgs })
  } catch (error) {
    console.error("Failed to fetch orgs:", error)
    return NextResponse.json({ error: "Failed to fetch organisations" }, { status: 500 })
  }
}
