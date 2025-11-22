import { publishJobEvent } from "@repo/redis";
import { JobLogger } from "./lib/logger";
import { createBrowserSession } from "./lib/browser";

interface JobPayload {
  jobId: string;
  type: "tax-submission";
  data: {
    assignmentId: string;
    credentials: {
      username: string;
      password: string;
    };
  };
}

async function runJob(payload: JobPayload) {
  const logger = new JobLogger(payload.jobId);
  await logger.init();

  await publishJobEvent({
    type: "job:started",
    jobId: payload.jobId,
    timestamp: Date.now(),
    data: { type: payload.type },
  });

  let session;

  try {
    await logger.info("Starting tax submission job", {
      assignmentId: payload.data.assignmentId,
    });

    session = await createBrowserSession(logger, {
      headless: process.env.HEADLESS !== "false",
    });

    const { page } = session;

    // Step 1: Navigate to GFSC
    await logger.step("Navigating to GFSC portal");
    await page.goto(process.env.GFSC_URL || "https://gfsc.gg");
    await page.waitForLoadState("networkidle");

    // Step 2: Login
    await logger.step("Logging in");
    // TODO: Implement actual login flow
    // await page.fill('input[name="username"]', payload.data.credentials.username);
    // await page.fill('input[name="password"]', payload.data.credentials.password);
    // await page.click('button[type="submit"]');

    // Step 3: Navigate to assignment
    await logger.step("Navigating to assignment", {
      assignmentId: payload.data.assignmentId,
    });
    // TODO: Implement assignment navigation

    // Step 4: Submit tax return
    await logger.step("Submitting tax return");
    // TODO: Implement submission logic

    await publishJobEvent({
      type: "job:completed",
      jobId: payload.jobId,
      timestamp: Date.now(),
      data: { success: true },
    });

    await logger.info("Job completed successfully");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    await logger.error(`Job failed: ${errorMessage}`);

    await publishJobEvent({
      type: "job:failed",
      jobId: payload.jobId,
      timestamp: Date.now(),
      data: { error: errorMessage },
    });

    throw error;
  } finally {
    if (session) {
      await session.close();
    }
  }
}

// Entry point - parse job from env or stdin
async function main() {
  console.log("@repo/jobs starting...");

  // Job payload can come from ECS task env or stdin
  const jobPayload = process.env.JOB_PAYLOAD;

  if (!jobPayload) {
    console.log("No JOB_PAYLOAD provided, waiting for input...");
    // In development, you might want to wait for stdin or use a queue
    return;
  }

  const payload = JSON.parse(jobPayload) as JobPayload;
  await runJob(payload);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

export { runJob, type JobPayload };
