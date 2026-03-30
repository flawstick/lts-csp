import { CloudWatchLogsClient, GetLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs"
import { db, taxSyncJobs, organisations, jurisdictions } from "@repo/database"
import { eq, desc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { triggerTaxSync } from "@/lib/tax-sync-launcher"

export async function POST(_request: Request) {
  try {
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

    // Launch on ECS (auth handled by container via MYGOV_USERNAME/MYGOV_PASSWORD env vars)
    let ecsResult = null
    let logStream: string | null = null
    try {
      ecsResult = await triggerTaxSync({
        jobId: job.id,
        orgId: org.id,
        jurisdictionCode: jurisdiction.code,
      })

      if (ecsResult.mode === "ecs" && ecsResult.taskArn) {
        logStream = `ecs/lts-tax-sync/${ecsResult.taskArn.split("/").pop()}`
        await db
          .update(taxSyncJobs)
          .set({
            status: "running",
            ecsTaskArn: ecsResult.taskArn,
            cloudwatchLogGroup: "/ecs/lts-tax-sync",
            cloudwatchLogStream: logStream,
          })
          .where(eq(taxSyncJobs.id, job.id))
      } else {
        await db
          .update(taxSyncJobs)
          .set({
            status: "running",
            ecsTaskArn: null,
            cloudwatchLogGroup: null,
            cloudwatchLogStream: null,
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
        mode: ecsResult?.mode,
        cloudwatchLogGroup:
          ecsResult?.mode === "ecs" ? "/ecs/lts-tax-sync" : null,
        cloudwatchLogStream: logStream,
      },
      organisation: { id: org.id, name: org.name },
      jurisdiction: { id: jurisdiction.id, code: jurisdiction.code, name: jurisdiction.name },
      message:
        ecsResult?.mode === "railway"
          ? "Tax sync job sent to Railway handler"
          : "Tax sync job launched on ECS",
    })
  } catch (error) {
    console.error("Tax sync error:", error)
    return NextResponse.json(
      { error: "Failed to launch tax sync", details: String(error) },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get("jobId")
    const limitParam = searchParams.get("limit")
    const limit = limitParam ? Math.min(Number(limitParam), 1000) : 200

    if (jobId) {
      const job = await db.query.taxSyncJobs.findFirst({
        where: eq(taxSyncJobs.id, jobId),
      })

      if (!job) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 })
      }

      if (!job.cloudwatchLogGroup || !job.cloudwatchLogStream) {
        return NextResponse.json({ logs: [], job })
      }

      try {
        const client = new CloudWatchLogsClient({ region: "eu-west-2" })
        const command = new GetLogEventsCommand({
          logGroupName: job.cloudwatchLogGroup,
          logStreamName: job.cloudwatchLogStream,
          startFromHead: true,
          limit,
        })

        const response = await client.send(command)
        const logs = (response.events || []).map((event) => ({
          timestamp: event.timestamp,
          message: event.message || "",
        }))

        return NextResponse.json({ logs, job })
      } catch (logError) {
        console.error("Failed to fetch CloudWatch logs:", logError)
        return NextResponse.json(
          { error: "Failed to fetch logs", job, details: String(logError) },
          { status: 500 }
        )
      }
    }

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
        launch: "POST (no body required - auth via MYGOV_USERNAME/PASSWORD env vars)",
        logs: "GET /api/debug/tax-sync?jobId=<uuid>&limit=200",
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
