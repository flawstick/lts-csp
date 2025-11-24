import { db, taxSyncJobs, organisations, jurisdictions } from "@repo/database"
import { eq, desc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { launchTaxSync } from "@/lib/ecs"

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))

    if (!body.eformsCookie) {
      return NextResponse.json(
        { error: "eformsCookie is required" },
        { status: 400 }
      )
    }

    const org = await db.query.organisations.findFirst({
      where: eq(organisations.slug, "lts"),
    })

    if (!org) {
      return NextResponse.json(
        { error: "No organisation found. Run db:seed first." },
        { status: 400 }
      )
    }

    const jurisdiction = await db.query.jurisdictions.findFirst({
      where: eq(jurisdictions.code, "GG"),
    })

    if (!jurisdiction) {
      return NextResponse.json(
        { error: "Guernsey jurisdiction not found. Run db:seed first." },
        { status: 400 }
      )
    }

    // Create tax sync job
    const [job] = await db
      .insert(taxSyncJobs)
      .values({
        orgId: org.id,
        jurisdictionId: jurisdiction.id,
        status: "pending",
        cloudwatchLogGroup: "/ecs/lts-tax-sync",
      })
      .returning()

    if (!job) {
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
    }

    // Launch on ECS
    let ecsResult = null
    try {
      ecsResult = await launchTaxSync({
        jobId: job.id,
        eformsCookie: body.eformsCookie,
      })

      if (ecsResult.taskArn) {
        await db
          .update(taxSyncJobs)
          .set({
            status: "running",
            ecsTaskArn: ecsResult.taskArn,
            cloudwatchLogStream: `ecs/lts-tax-sync/${ecsResult.taskArn.split("/").pop()}`,
          })
          .where(eq(taxSyncJobs.id, job.id))
      }
    } catch (ecsError) {
      console.error("ECS launch error:", ecsError)
      await db
        .update(taxSyncJobs)
        .set({ status: "failed", errorMessage: String(ecsError) })
        .where(eq(taxSyncJobs.id, job.id))
      return NextResponse.json(
        { error: "Failed to launch ECS task", details: String(ecsError) },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        status: "running",
        ecsTaskArn: ecsResult?.taskArn,
      },
      organisation: { id: org.id, name: org.name },
      jurisdiction: { id: jurisdiction.id, code: jurisdiction.code, name: jurisdiction.name },
      message: "Tax sync job launched on ECS",
    })
  } catch (error) {
    console.error("Tax sync error:", error)
    return NextResponse.json(
      { error: "Failed to launch tax sync", details: String(error) },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const jobs = await db.query.taxSyncJobs.findMany({
      with: { organisation: true, jurisdiction: true },
      orderBy: [desc(taxSyncJobs.createdAt)],
      limit: 20,
    })

    return NextResponse.json({
      jobs: jobs.map((j) => ({
        id: j.id,
        status: j.status,
        returnsFound: j.returnsFound,
        organisation: j.organisation?.name,
        jurisdiction: j.jurisdiction?.name,
        ecsTaskArn: j.ecsTaskArn,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        errorMessage: j.errorMessage,
        createdAt: j.createdAt,
      })),
      usage: {
        launch: "POST with { eformsCookie: '...' }",
      },
    })
  } catch (error) {
    console.error("Get tax sync jobs error:", error)
    return NextResponse.json(
      { error: "Failed to fetch jobs", details: String(error) },
      { status: 500 }
    )
  }
}
