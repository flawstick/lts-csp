/**
 * Browser Use Task Runner
 * Runs on ECS, uses Browser Use Cloud API, streams status via Redis
 */

import { db, taxReturns, substanceForms, jobs, tasks, eq } from "@repo/database";
import { publishJobEvent } from "@repo/redis";
import { BrowserUseClient } from "./browser-use-client";
import { buildSubstanceFormPrompt } from "./prompt-builder";

// ============================================================================
// Configuration
// ============================================================================

const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY || "";
const TAX_RETURN_ID = process.env.TAX_RETURN_ID || "";
const JOB_ID = process.env.JOB_ID || "";
const TASK_ID = process.env.TASK_ID || "";
const OVERRIDE_SAVED = process.env.OVERRIDE_SAVED === "true";

const POLL_INTERVAL_MS = 2000;
const MAX_RUNTIME_MS = 30 * 60 * 1000;
const PAUSE_CHECK_INTERVAL_MS = 5000;
const MAX_PAUSE_DURATION_MS = 10 * 60 * 1000; // 10 minutes max pause

// Keywords that indicate the agent needs user intervention
const REQUIRES_ATTENTION_KEYWORDS = [
  "login",
  "sign in",
  "sign-in",
  "authentication",
  "credentials",
  "password",
  "cannot proceed",
  "unable to proceed",
  "requires attention",
  "need to log in",
  "need to login",
];

// ============================================================================
// Logging + Redis Publishing
// ============================================================================

async function log(message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data) : "");

  try {
    await publishJobEvent({
      type: "job:step",
      jobId: JOB_ID,
      timestamp: Date.now(),
      data: { message, ...data },
    });
  } catch {}
}

async function publishStatus(status: string, data: Record<string, unknown>) {
  try {
    await publishJobEvent({
      type: "job:progress",
      jobId: JOB_ID,
      timestamp: Date.now(),
      data: { status, ...data },
    });
  } catch (err) {
    console.error("Redis publish failed:", err);
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  await log("Task runner starting", { taxReturnId: TAX_RETURN_ID, jobId: JOB_ID });

  if (!BROWSER_USE_API_KEY) {
    await log("ERROR: BROWSER_USE_API_KEY is required");
    process.exit(1);
  }

  if (!TAX_RETURN_ID) {
    await log("ERROR: TAX_RETURN_ID is required");
    process.exit(1);
  }

  const client = new BrowserUseClient(BROWSER_USE_API_KEY);

  try {
    // Update job status
    if (JOB_ID) {
      await db.update(jobs).set({ status: "running", startedAt: new Date() }).where(eq(jobs.id, JOB_ID));
    }

    // Fetch tax return with substance form
    await log("Fetching tax return data");
    const taxReturn = await db.query.taxReturns.findFirst({
      where: eq(taxReturns.id, TAX_RETURN_ID),
      with: { substanceForm: true, jurisdiction: true },
    });

    if (!taxReturn) throw new Error("Tax return not found");
    if (!taxReturn.substanceForm) throw new Error("Substance form not found");

    await log("Building AI prompt", { entity: taxReturn.entityName, year: taxReturn.taxYear });

    // Build prompt
    const prompt = buildSubstanceFormPrompt({
      taxReturn: taxReturn as any,
      substanceForm: taxReturn.substanceForm as any,
      portalUrl: taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
      returnLink: taxReturn.link || undefined,
      overrideSaved: OVERRIDE_SAVED,
    });

    // Create Browser Use session (try without proxy first, then with UK proxy)
    const useProxy = process.env.USE_UK_PROXY !== "false";
    await log(`Creating Browser Use session ${useProxy ? "with UK proxy" : "without proxy"}`);
    const session = await client.createSession({
      ...(useProxy && { proxyCountryCode: "uk" as const }),
      startUrl: taxReturn.link || taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
    });

    await log("Session created", { sessionId: session.id, liveUrl: session.liveUrl });

    // Publish live URL immediately
    await publishJobEvent({
      type: "job:started",
      jobId: JOB_ID,
      timestamp: Date.now(),
      data: {
        liveUrl: session.liveUrl,
        sessionId: session.id,
        taxReturnId: TAX_RETURN_ID,
        entityName: taxReturn.entityName,
      },
    });

    // Update job with live URL
    if (JOB_ID) {
      await db.update(jobs).set({
        resultData: { liveUrl: session.liveUrl, sessionId: session.id },
      }).where(eq(jobs.id, JOB_ID));
    }

    // Create task
    await log("Creating Browser Use task");
    const taskResponse = await client.createTask({
      task: prompt,
      sessionId: session.id,
      llm: "claude-sonnet-4-20250514",
      maxSteps: 100,
      highlightElements: true,
      vision: "auto",
      metadata: {
        taxReturnId: TAX_RETURN_ID,
        entityName: taxReturn.entityName,
        taxYear: String(taxReturn.taxYear),
      },
    });

    await log("Task created", { taskId: taskResponse.id });

    // Poll for completion
    const startTime = Date.now();
    let lastStepCount = 0;

    while (Date.now() - startTime < MAX_RUNTIME_MS) {
      await sleep(POLL_INTERVAL_MS);

      // Check if user paused/cancelled the job from frontend
      const currentJobStatus = await db.query.jobs.findFirst({
        where: eq(jobs.id, JOB_ID),
        columns: { status: true },
      });

      if (currentJobStatus?.status === "cancelled") {
        await log("Job cancelled by user");
        try {
          await client.updateTask(taskResponse.id, "stop_task_and_session");
        } catch {}
        break;
      }

      if (currentJobStatus?.status === "paused") {
        await log("Job paused by user - waiting for resume");
        await publishJobEvent({
          type: "job:requires_attention",
          jobId: JOB_ID,
          timestamp: Date.now(),
          data: {
            liveUrl: session.liveUrl,
            sessionId: session.id,
            message: "Task paused. Complete any manual actions in the browser and click Resume.",
          },
        });

        // Pause the browser-use task
        try {
          await client.updateTask(taskResponse.id, "pause");
        } catch {}

        // Wait for resume
        const pauseStartTime = Date.now();
        while (Date.now() - pauseStartTime < MAX_PAUSE_DURATION_MS) {
          await sleep(PAUSE_CHECK_INTERVAL_MS);
          const checkJob = await db.query.jobs.findFirst({
            where: eq(jobs.id, JOB_ID),
            columns: { status: true },
          });

          if (checkJob?.status === "running") {
            await log("User resumed - continuing task");
            try {
              await client.updateTask(taskResponse.id, "resume");
            } catch {}
            break;
          }
          if (checkJob?.status === "cancelled") {
            await log("Job cancelled during pause");
            try {
              await client.updateTask(taskResponse.id, "stop_task_and_session");
            } catch {}
            break;
          }
        }

        // Check if we timed out or cancelled
        const finalCheck = await db.query.jobs.findFirst({
          where: eq(jobs.id, JOB_ID),
          columns: { status: true },
        });
        if (finalCheck?.status !== "running") {
          break;
        }
      }

      const task = await client.getTask(taskResponse.id);

      // Publish new steps
      if (task.steps.length > lastStepCount) {
        for (const step of task.steps.slice(lastStepCount)) {
          await publishStatus("step", {
            stepNumber: step.number,
            goal: step.nextGoal,
            memory: step.memory,
            url: step.url,
            actions: step.actions,
            screenshotUrl: step.screenshotUrl,
          });
          await log(`Step ${step.number}: ${step.nextGoal}`);
        }
        lastStepCount = task.steps.length;
      }

      // Check completion
      if (task.status === "finished") {
        const success = task.isSuccess ?? true;
        const output = task.output || "";

        // Check if the agent needs user intervention (e.g., login required)
        const needsAttention = !success && REQUIRES_ATTENTION_KEYWORDS.some(
          keyword => output.toLowerCase().includes(keyword.toLowerCase())
        );

        if (needsAttention) {
          await log("Task requires user attention - pausing", { output });

          await publishJobEvent({
            type: "job:requires_attention",
            jobId: JOB_ID,
            timestamp: Date.now(),
            data: {
              output,
              browserUseTaskId: taskResponse.id,
              liveUrl: session.liveUrl,
              sessionId: session.id,
              message: "Agent needs user intervention. The browser session is still active - please complete the required action (e.g., login) and resume.",
            },
          });

          // Update job to paused status
          if (JOB_ID) {
            await db.update(jobs).set({
              status: "paused",
              resultData: {
                output,
                browserUseTaskId: taskResponse.id,
                liveUrl: session.liveUrl,
                sessionId: session.id,
                pausedAt: Date.now(),
                pauseReason: output,
              },
            }).where(eq(jobs.id, JOB_ID));
          }

          // Wait for user to resume or timeout
          await log("Waiting for user to complete action and resume...");
          const pauseStartTime = Date.now();

          while (Date.now() - pauseStartTime < MAX_PAUSE_DURATION_MS) {
            await sleep(PAUSE_CHECK_INTERVAL_MS);

            // Check if job status changed (user clicked resume)
            const currentJob = await db.query.jobs.findFirst({
              where: eq(jobs.id, JOB_ID),
            });

            if (!currentJob) break;

            if (currentJob.status === "running") {
              await log("User resumed - creating new task to continue");

              // User resumed, create a new browser-use task to continue
              const continuePrompt = `
Continue from where you left off. The user has completed the login/authentication.
Now proceed with the original task:

${prompt}
`;
              const continueTask = await client.createTask({
                task: continuePrompt,
                sessionId: session.id,
                llm: "claude-sonnet-4-20250514",
                maxSteps: 100,
                highlightElements: true,
                vision: "auto",
              });

              // Reset polling for the new task
              lastStepCount = 0;
              // Update taskResponse reference for continued polling
              Object.assign(taskResponse, { id: continueTask.id });
              break;
            }

            if (currentJob.status === "cancelled" || currentJob.status === "failed") {
              await log("Job was cancelled or failed during pause");
              break;
            }
          }

          // If we're still paused after max duration, fail
          const finalJobCheck = await db.query.jobs.findFirst({
            where: eq(jobs.id, JOB_ID),
          });

          if (finalJobCheck?.status === "paused") {
            await log("Pause timeout - marking as failed");
            await db.update(jobs).set({
              status: "failed",
              completedAt: new Date(),
              errorMessage: "Timed out waiting for user intervention",
            }).where(eq(jobs.id, JOB_ID));
            break;
          }

          continue; // Continue the main polling loop with the new task
        }

        await log(success ? "Task completed successfully" : "Task finished with issues", {
          output: task.output,
          isSuccess: success,
        });

        await publishJobEvent({
          type: success ? "job:completed" : "job:failed",
          jobId: JOB_ID,
          timestamp: Date.now(),
          data: { output: task.output, isSuccess: success, browserUseTaskId: taskResponse.id },
        });

        // Update DB
        await db.update(taxReturns).set({ status: success ? "completed" : "failed" }).where(eq(taxReturns.id, TAX_RETURN_ID));
        if (JOB_ID) {
          await db.update(jobs).set({
            status: success ? "completed" : "failed",
            completedAt: new Date(),
            resultData: { output: task.output, browserUseTaskId: taskResponse.id, liveUrl: session.liveUrl },
          }).where(eq(jobs.id, JOB_ID));
        }

        break;
      }

      if (task.status === "stopped") {
        await log("Task was stopped");
        await publishJobEvent({
          type: "job:failed",
          jobId: JOB_ID,
          timestamp: Date.now(),
          data: { reason: "stopped" },
        });
        break;
      }

      if (task.status === "paused") {
        await publishStatus("paused", { message: "Task paused - waiting for intervention" });
      }
    }

    // Cleanup
    try {
      await client.stopSession(session.id);
      await log("Session stopped");
    } catch {}

    process.exit(0);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await log("Fatal error", { error: errorMsg });

    await publishJobEvent({
      type: "job:failed",
      jobId: JOB_ID,
      timestamp: Date.now(),
      data: { error: errorMsg },
    });

    if (JOB_ID) {
      await db.update(jobs).set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: errorMsg,
      }).where(eq(jobs.id, JOB_ID));
    }

    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
