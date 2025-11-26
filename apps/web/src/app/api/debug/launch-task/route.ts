import { db, tasks, jobs, organisations, jurisdictions } from "@repo/database"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { launchTask as launchEcsTask } from "@/lib/ecs"

// Debug route to create and launch a task without authentication
// FOR DEVELOPMENT ONLY - remove in production

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))

    // Get the first org (LTS)
    const org = await db.query.organisations.findFirst({
      where: eq(organisations.slug, "lts"),
    })

    if (!org) {
      return NextResponse.json(
        { error: "No organisation found. Run db:seed first." },
        { status: 400 }
      )
    }

    // Get Guernsey jurisdiction
    const jurisdiction = await db.query.jurisdictions.findFirst({
      where: eq(jurisdictions.code, "GG"),
    })

    if (!jurisdiction) {
      return NextResponse.json(
        { error: "Guernsey jurisdiction not found. Run db:seed first." },
        { status: 400 }
      )
    }

    // Create a new task
    const [task] = await db
      .insert(tasks)
      .values({
        orgId: org.id,
        jurisdictionId: jurisdiction.id,
        name: body.name || "Debug Task - eforms.gov.gg Login Test",
        description: body.description || "Debug task to test eforms.gov.gg login automation",
        taskType: "tax_return",
        status: "pending",
        metadata: {
          debug: true,
          createdAt: new Date().toISOString(),
        },
      })
      .returning()

    if (!task) {
      return NextResponse.json({ error: "Failed to create task" }, { status: 500 })
    }

    // Get the count of existing jobs for this task
    const existingJobs = await db.query.jobs.findMany({
      where: eq(jobs.taskId, task.id),
    })

    // Create a job for the task
    const [job] = await db
      .insert(jobs)
      .values({
        taskId: task.id,
        jobNumber: existingJobs.length + 1,
        status: "pending",
        aiModel: body.aiModel || "gpt-4",
      })
      .returning()

    if (!job) {
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 })
    }

    // Optionally launch on ECS
    let ecsResult = null
    if (body.launchEcs) {
      try {
        ecsResult = await launchEcsTask({
          taskId: task.id,
          jobId: job.id,
          targetUrl: jurisdiction.portalUrl || "https://eforms.gov.gg",
          eformsUsername: body.eformsUsername,
          eformsPassword: body.eformsPassword,
        })

        // Update job with ECS task ARN
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

    // Return task and job info
    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        name: task.name,
        status: task.status,
        orgId: task.orgId,
        jurisdictionId: task.jurisdictionId,
      },
      job: {
        id: job.id,
        jobNumber: job.jobNumber,
        status: body.launchEcs ? "queued" : job.status,
        ecsTaskArn: ecsResult?.taskArn,
      },
      organisation: {
        id: org.id,
        name: org.name,
      },
      jurisdiction: {
        id: jurisdiction.id,
        code: jurisdiction.code,
        name: jurisdiction.name,
        portalUrl: jurisdiction.portalUrl,
      },
      ecs: ecsResult,
      message: body.launchEcs
        ? "Task launched on ECS. Navigate to /tasks to view the stream."
        : "Task and job created. Navigate to /tasks to view the stream.",
      streamUrl: `/tasks?taskId=${task.id}`,
    })
  } catch (error) {
    console.error("Debug launch task error:", error)
    return NextResponse.json(
      { error: "Failed to create task", details: String(error) },
      { status: 500 }
    )
  }
}

export async function GET() {
  // Return info about existing tasks and jobs
  try {
    const allTasks = await db.query.tasks.findMany({
      with: {
        jobs: true,
        organisation: true,
        jurisdiction: true,
      },
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit: 10,
    })

    const orgs = await db.query.organisations.findMany()
    const jurs = await db.query.jurisdictions.findMany()

    return NextResponse.json({
      tasks: allTasks.map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        organisation: t.organisation?.name,
        jurisdiction: t.jurisdiction?.name,
        jobCount: t.jobs.length,
        latestJobStatus: t.jobs[t.jobs.length - 1]?.status,
        createdAt: t.createdAt,
      })),
      organisations: orgs,
      jurisdictions: jurs,
      usage: {
        createTask: "POST /api/debug/launch-task with optional { name, description, aiModel, launchEcs, eformsUsername, eformsPassword }",
        example: {
          local: "POST with { name: 'Test Task' }",
          ecs: "POST with { launchEcs: true, eformsUsername: '...', eformsPassword: '...' }",
        },
      },
    })
  } catch (error) {
    console.error("Debug get tasks error:", error)
    return NextResponse.json(
      { error: "Failed to fetch tasks", details: String(error) },
      { status: 500 }
    )
  }
}
