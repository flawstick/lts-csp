import { db, tasks, jobs, taxReturns, substanceForms, organisations, jurisdictions, eq } from "@repo/database";
import { NextResponse } from "next/server";
import { launchBrowserTask } from "@/lib/ecs";

// Debug route to launch browser task for a tax return
// FOR DEVELOPMENT ONLY

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const taxReturnId = body.taxReturnId;

    if (!taxReturnId) {
      // List available tax returns with substance forms
      const returns = await db.query.taxReturns.findMany({
        with: { substanceForm: true, jurisdiction: true },
        limit: 10,
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });

      return NextResponse.json({
        error: "taxReturnId is required",
        availableReturns: returns.map((r) => ({
          id: r.id,
          entityName: r.entityName,
          taxYear: r.taxYear,
          status: r.status,
          hasSubstanceForm: !!r.substanceForm,
          substanceFormComplete: r.substanceForm?.isComplete,
          jurisdiction: r.jurisdiction?.code,
        })),
        usage: "POST with { taxReturnId: '<uuid>' }",
      });
    }

    // Fetch tax return
    const taxReturn = await db.query.taxReturns.findFirst({
      where: eq(taxReturns.id, taxReturnId),
      with: { substanceForm: true, jurisdiction: true, organisation: true },
    });

    if (!taxReturn) {
      return NextResponse.json({ error: "Tax return not found" }, { status: 404 });
    }

    if (!taxReturn.substanceForm) {
      return NextResponse.json(
        { error: "Tax return has no substance form. Run fill-form script first." },
        { status: 400 }
      );
    }

    // Create task
    const [task] = await db
      .insert(tasks)
      .values({
        orgId: taxReturn.orgId,
        jurisdictionId: taxReturn.jurisdictionId,
        name: `Browser Task - ${taxReturn.entityName} (${taxReturn.taxYear})`,
        description: `Automated substance form submission for ${taxReturn.entityName}`,
        taskType: "submission",
        status: "pending",
        metadata: {
          taxReturnId,
          entityName: taxReturn.entityName,
          taxYear: taxReturn.taxYear,
        },
      })
      .returning();

    if (!task) {
      return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
    }

    // Create job
    const [job] = await db
      .insert(jobs)
      .values({
        taskId: task.id,
        jobNumber: 1,
        status: "pending",
        aiModel: "claude-sonnet-4",
      })
      .returning();

    if (!job) {
      return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
    }

    // Launch ECS task
    console.log("Launching browser task on ECS...");
    const ecsResult = await launchBrowserTask({
      jobId: job.id,
      taxReturnId: taxReturn.id,
      taskId: task.id,
    });

    // Update job with ECS info
    await db
      .update(jobs)
      .set({
        status: "queued",
        ecsTaskArn: ecsResult.taskArn || null,
      })
      .where(eq(jobs.id, job.id));

    // Update tax return status
    await db
      .update(taxReturns)
      .set({ status: "in_progress" })
      .where(eq(taxReturns.id, taxReturnId));

    return NextResponse.json({
      success: true,
      task: {
        id: task.id,
        name: task.name,
      },
      job: {
        id: job.id,
        status: "queued",
      },
      taxReturn: {
        id: taxReturn.id,
        entityName: taxReturn.entityName,
        taxYear: taxReturn.taxYear,
      },
      ecs: {
        taskArn: ecsResult.taskArn,
        cloudwatchLogGroup: ecsResult.cloudwatchLogGroup,
        cloudwatchLogStream: ecsResult.cloudwatchLogStream,
      },
      viewAt: `/tasks/${task.id}`,
      sseEndpoint: `/api/jobs/${job.id}/events`,
    });
  } catch (error) {
    console.error("Browser task launch error:", error);
    return NextResponse.json(
      { error: "Failed to launch browser task", details: String(error) },
      { status: 500 }
    );
  }
}

export async function GET() {
  // List tax returns with substance forms
  try {
    const returns = await db.query.taxReturns.findMany({
      with: { substanceForm: true, jurisdiction: true, organisation: true },
      limit: 20,
      orderBy: (t, { desc }) => [desc(t.createdAt)],
    });

    return NextResponse.json({
      taxReturns: returns.map((r) => ({
        id: r.id,
        entityName: r.entityName,
        taxYear: r.taxYear,
        status: r.status,
        hasSubstanceForm: !!r.substanceForm,
        substanceFormComplete: r.substanceForm?.isComplete,
        jurisdiction: r.jurisdiction?.code,
        organisation: r.organisation?.name,
        link: r.link,
      })),
      usage: {
        launch: "POST /api/debug/browser-task with { taxReturnId: '<uuid>' }",
        fillForm: "cd packages/database && bun run fill-form <taxReturnId>",
      },
    });
  } catch (error) {
    console.error("Error listing tax returns:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
