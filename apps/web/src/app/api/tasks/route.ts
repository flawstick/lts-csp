import { db, tasks, jobs, organisations, jurisdictions } from "@repo/database"
import { eq, desc } from "drizzle-orm"
import { NextResponse } from "next/server"
import { launchTask as launchEcsTask } from "@/lib/ecs"

export async function GET() {
  try {
    const allTasks = await db.query.tasks.findMany({
      with: {
        jobs: true,
        organisation: true,
        jurisdiction: true,
      },
      orderBy: (t) => [desc(t.createdAt)],
      limit: 50,
    })

    return NextResponse.json({
      tasks: allTasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        taskType: t.taskType,
        status: t.status,
        pdfUrls: t.pdfUrls,
        organisation: t.organisation,
        jurisdiction: t.jurisdiction,
        jobs: t.jobs,
        createdAt: t.createdAt,
      })),
    })
  } catch (error) {
    console.error("Failed to fetch tasks:", error)
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const { name, description, taskType, orgId, jurisdictionId, pdfUrls, launchEcs } = body

    if (!name || !orgId || !jurisdictionId) {
      return NextResponse.json(
        { error: "name, orgId, and jurisdictionId are required" },
        { status: 400 }
      )
    }

    // Verify org and jurisdiction exist
    const org = await db.query.organisations.findFirst({
      where: eq(organisations.id, orgId),
    })

    if (!org) {
      return NextResponse.json({ error: "Organisation not found" }, { status: 400 })
    }

    const jurisdiction = await db.query.jurisdictions.findFirst({
      where: eq(jurisdictions.id, jurisdictionId),
    })

    if (!jurisdiction) {
      return NextResponse.json({ error: "Jurisdiction not found" }, { status: 400 })
    }

    // Create the task
    const [task] = await db
      .insert(tasks)
      .values({
        orgId,
        jurisdictionId,
        name,
        description: description || null,
        taskType: taskType || "tax_return",
        status: "pending",
        pdfUrls: pdfUrls || [],
        metadata: {
          createdAt: new Date().toISOString(),
        },
      })
      .returning()

    // Create the first job
    const [job] = await db
      .insert(jobs)
      .values({
        taskId: task.id,
        jobNumber: 1,
        status: "pending",
      })
      .returning()

    // Optionally launch on ECS
    let ecsResult = null
    if (launchEcs) {
      try {
        ecsResult = await launchEcsTask({
          taskId: task.id,
          jobId: job.id,
          targetUrl: jurisdiction.portalUrl || "https://eforms.gov.gg",
        })

        if (ecsResult.taskArn) {
          await db
            .update(jobs)
            .set({
              status: "queued",
              ecsTaskArn: ecsResult.taskArn,
            })
            .where(eq(jobs.id, job.id))
        }
      } catch (ecsError) {
        console.error("ECS launch error:", ecsError)
        ecsResult = { error: String(ecsError) }
      }
    }

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        name: task.name,
        status: task.status,
      },
      job: {
        id: job.id,
        jobNumber: job.jobNumber,
        status: launchEcs ? "queued" : job.status,
        ecsTaskArn: ecsResult?.taskArn,
      },
      ecs: ecsResult,
    })
  } catch (error) {
    console.error("Failed to create task:", error)
    return NextResponse.json(
      { error: "Failed to create task", details: String(error) },
      { status: 500 }
    )
  }
}
