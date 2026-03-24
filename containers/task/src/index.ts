/**
 * Browser Use Task Runner
 * Runs on ECS, uses Browser Use Cloud API, streams status via Redis
 */

import { db, taxReturns, jobs, tasks, eq } from "@repo/database";
import { publishJobEvent } from "@repo/redis";
import {
  BrowserUseClient,
  type BrowserUseModel,
  type BrowserUseSessionStatus,
} from "./browser-use-client";
import { buildSubstanceFormPrompt } from "./prompt-builder";

// ============================================================================
// Configuration
// ============================================================================

const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY || "";
const TAX_RETURN_ID = process.env.TAX_RETURN_ID || "";
const JOB_ID = process.env.JOB_ID || "";
const TASK_ID = process.env.TASK_ID || "";
const OVERRIDE_SAVED = process.env.OVERRIDE_SAVED === "true";
const BROWSER_USE_MODEL: BrowserUseModel = "bu-max";

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

const DETACHED_BROWSER_RECOVERY_PATTERNS = [
  "cdp still not connected",
  "target may have detached",
  "no valid agent focus available",
  "about:blank",
  "expected at least one handler to return a non-none result",
  "reconnection failed",
];

type TaxReturnAttachedFile = {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  category?: string;
  role?: string;
};

type BrowserSessionInputFile = {
  originalName: string;
  sessionFileName: string;
  sessionFilePath: string;
  url: string;
  category?: string;
  role?: string;
};

// ============================================================================
// Logging + Redis Publishing
// ============================================================================

async function log(
  message: string,
  data?: Record<string, unknown>,
  options?: { publish?: boolean },
) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data) : "");

  if (options?.publish === false) {
    return;
  }

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

function isTerminalSessionStatus(status: BrowserUseSessionStatus): boolean {
  return (
    status === "idle" ||
    status === "stopped" ||
    status === "timed_out" ||
    status === "error"
  );
}

function normalizeBrowserUseOutput(output: unknown): string {
  if (typeof output === "string") {
    return output;
  }

  if (output == null) {
    return "";
  }

  try {
    return JSON.stringify(output, null, 2);
  } catch {
    return String(output);
  }
}

function isDetachedBrowserRecoveryError(message: {
  summary?: string | null;
  data?: unknown;
  type?: string | null;
}): boolean {
  const dataText =
    typeof message.data === "string"
      ? message.data
      : message.data == null
        ? ""
        : JSON.stringify(message.data);

  const haystack = `${message.summary ?? ""} ${dataText} ${message.type ?? ""}`
    .toLowerCase()
    .trim();

  return DETACHED_BROWSER_RECOVERY_PATTERNS.some((pattern) =>
    haystack.includes(pattern),
  );
}

async function waitForSessionToLeaveRunning(
  client: BrowserUseClient,
  sessionId: string,
  timeoutMs = 10_000,
): Promise<BrowserUseSessionStatus> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: BrowserUseSessionStatus = "running";

  while (Date.now() < deadline) {
    const session = await client.getSession(sessionId);
    lastStatus = session.status;

    if (session.status !== "running") {
      return session.status;
    }

    await sleep(250);
  }

  return lastStatus;
}

async function syncProgressCursorAfterPause(
  client: BrowserUseClient,
  sessionId: string,
  lastMessageId: string | null,
  lastStepCount: number,
): Promise<{ lastMessageId: string | null; lastStepCount: number }> {
  const session = await client.getSession(sessionId);
  const newMessages = await client.getMessages(sessionId, lastMessageId);
  const orderedMessages = [...newMessages.messages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return {
    lastMessageId:
      orderedMessages.length > 0
        ? (orderedMessages[orderedMessages.length - 1]?.id ?? lastMessageId)
        : lastMessageId,
    lastStepCount: Math.max(lastStepCount, session.stepCount),
  };
}

function getTaxReturnFiles(files: unknown): TaxReturnAttachedFile[] {
  if (!Array.isArray(files)) return [];

  const parsed: TaxReturnAttachedFile[] = [];

  for (const file of files) {
    if (!file || typeof file !== "object") continue;

    const row = file as Record<string, unknown>;
    if (typeof row.url !== "string" || typeof row.name !== "string") {
      continue;
    }

    parsed.push({
      url: row.url,
      name: row.name,
      size: typeof row.size === "number" ? row.size : 0,
      type:
        typeof row.type === "string" ? row.type : "application/octet-stream",
      uploadedAt:
        typeof row.uploadedAt === "string"
          ? row.uploadedAt
          : new Date().toISOString(),
      category: typeof row.category === "string" ? row.category : undefined,
      role: typeof row.role === "string" ? row.role : undefined,
    });
  }

  return parsed;
}

function isPdf(file: TaxReturnAttachedFile): boolean {
  const haystack = `${file.name} ${file.type} ${file.url}`.toLowerCase();
  return haystack.includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}

function looksLikeFinancialStatements(file: TaxReturnAttachedFile): boolean {
  const haystack = `${file.name} ${file.url}`.toLowerCase();
  return [
    "financial statement",
    "financial-statements",
    "financials",
    "accounts",
    "annual report",
    "audited",
    "report and financial",
  ].some((token) => haystack.includes(token));
}

function chooseFinancialStatementsFile(
  files: TaxReturnAttachedFile[],
): TaxReturnAttachedFile | null {
  const pdfFiles = files.filter(isPdf);

  return (
    pdfFiles.find((file) => file.role === "financial_statements") ??
    pdfFiles.find(
      (file) =>
        file.category === "financial" && looksLikeFinancialStatements(file),
    ) ??
    pdfFiles.find((file) => file.category === "financial") ??
    pdfFiles.find((file) => looksLikeFinancialStatements(file)) ??
    null
  );
}

function sanitizeSessionFileName(name: string, fallbackBase: string): string {
  const trimmed = name.trim();
  const safeName = (trimmed || fallbackBase)
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safeName || fallbackBase;
}

function getPdfExtension(file: TaxReturnAttachedFile): string {
  if (file.name.toLowerCase().endsWith(".pdf")) {
    return ".pdf";
  }
  return file.type.toLowerCase().includes("pdf") ? ".pdf" : "";
}

async function uploadFinancialStatementsFile(
  client: BrowserUseClient,
  workspaceId: string,
  files: TaxReturnAttachedFile[],
  logFn: typeof log,
): Promise<BrowserSessionInputFile | null> {
  const selectedFile = chooseFinancialStatementsFile(files);

  if (!selectedFile) {
    await logFn("No financial statements PDF found on tax return");
    return null;
  }

  await logFn("Preparing financial statements PDF for Browser Use session", {
    fileName: selectedFile.name,
    fileUrl: selectedFile.url,
    role: selectedFile.role,
    category: selectedFile.category,
  });

  const response = await fetch(selectedFile.url);
  if (!response.ok) {
    throw new Error(
      `Failed to download financial statements PDF: ${response.status}`,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const uploadName =
    selectedFile.role === "financial_statements"
      ? `financial-statements${getPdfExtension(selectedFile) || ".pdf"}`
      : sanitizeSessionFileName(
          selectedFile.name,
          `financial-statements${getPdfExtension(selectedFile) || ".pdf"}`,
        );

  const uploadedFile = await client.uploadFileToWorkspace(workspaceId, {
    name: uploadName,
    type:
      selectedFile.type ||
      response.headers.get("content-type") ||
      "application/pdf",
    buffer,
  });

  const workspaceFiles = await client.getWorkspaceFiles(workspaceId);
  const isUploaded = workspaceFiles.files.some(
    (file) => file.path === uploadedFile.path || file.path.endsWith(uploadName),
  );

  if (!isUploaded) {
    throw new Error(
      `Browser Use workspace upload could not be verified for ${uploadName}`,
    );
  }

  await logFn("Uploaded financial statements PDF to Browser Use workspace", {
    originalName: selectedFile.name,
    sessionFileName: uploadedFile.name,
    sessionFilePath: uploadedFile.path,
    workspaceId,
  });

  return {
    originalName: selectedFile.name,
    sessionFileName: uploadedFile.name,
    sessionFilePath: uploadedFile.path,
    url: selectedFile.url,
    category: selectedFile.category,
    role: selectedFile.role,
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  await log("Task runner starting", {
    taxReturnId: TAX_RETURN_ID,
    jobId: JOB_ID,
  });

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
      await db
        .update(jobs)
        .set({
          status: "running",
          startedAt: new Date(),
          aiModel: BROWSER_USE_MODEL,
        })
        .where(eq(jobs.id, JOB_ID));
    }

    // Fetch tax return with substance form
    await log("Fetching tax return data");
    const taxReturn = await db.query.taxReturns.findFirst({
      where: eq(taxReturns.id, TAX_RETURN_ID),
      with: { substanceForm: true, jurisdiction: true },
    });

    if (!taxReturn) throw new Error("Tax return not found");
    if (!taxReturn.substanceForm) throw new Error("Substance form not found");
    const taxReturnFiles = getTaxReturnFiles(taxReturn.files);

    // Create Browser Use session (try without proxy first, then with UK proxy)
    const useProxy = process.env.USE_UK_PROXY !== "false";
    await log(
      `Creating Browser Use session ${useProxy ? "with UK proxy" : "without proxy"}`,
    );
    const session = await client.createSession({
      ...(useProxy && { proxyCountryCode: "uk" as const }),
    });

    await log("Session created", {
      sessionId: session.id,
      liveUrl: session.liveUrl,
    });

    let workspaceId: string | null = null;
    let financialStatementsFile: BrowserSessionInputFile | null = null;
    try {
      const workspace = await client.createWorkspace(
        `tax-return-${TAX_RETURN_ID}`,
      );
      workspaceId = workspace.id;
      await log("Browser Use workspace created", {
        workspaceId,
      });

      financialStatementsFile = await uploadFinancialStatementsFile(
        client,
        workspaceId,
        taxReturnFiles,
        log,
      );
    } catch (error) {
      await log(
        "Failed to prepare financial statements PDF for Browser Use workspace",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
    }

    await log("Building AI prompt", {
      entity: taxReturn.entityName,
      year: taxReturn.taxYear,
      hasFinancialStatementsFile: Boolean(financialStatementsFile),
    });

    // Build prompt
    const prompt = buildSubstanceFormPrompt({
      taxReturn: taxReturn as any,
      substanceForm: taxReturn.substanceForm as any,
      portalUrl: taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
      returnLink: taxReturn.link || undefined,
      overrideSaved: OVERRIDE_SAVED,
      financialStatementsFile,
      financialStatementsUrl: financialStatementsFile?.url ?? null,
    });
    const recoveryReturnUrl =
      taxReturn.link ||
      taxReturn.jurisdiction?.portalUrl ||
      "https://my.gov.gg";

    // Publish live URL immediately
    await publishJobEvent({
      type: "job:started",
      jobId: JOB_ID,
      timestamp: Date.now(),
      data: {
        liveUrl: session.liveUrl,
        sessionId: session.id,
        workspaceId,
        taxReturnId: TAX_RETURN_ID,
        entityName: taxReturn.entityName,
      },
    });

    // Update job with live URL
    if (JOB_ID) {
      await db
        .update(jobs)
        .set({
          aiModel: BROWSER_USE_MODEL,
          resultData: {
            liveUrl: session.liveUrl,
            sessionId: session.id,
            workspaceId,
          },
        })
        .where(eq(jobs.id, JOB_ID));
    }

    await log("Starting Browser Use task", {
      sessionId: session.id,
      model: BROWSER_USE_MODEL,
    });

    let currentRunPromise = Promise.resolve(
      client.runTask(prompt, {
        sessionId: session.id,
        model: BROWSER_USE_MODEL,
        timeoutMs: MAX_RUNTIME_MS,
        workspaceId: workspaceId ?? undefined,
      }),
    );

    // Poll for completion
    const startTime = Date.now();
    let lastStepCount = 0;
    let lastMessageId: string | null = null;
    let terminalStateHandled = false;
    let detachedBrowserRecoveryFailures = 0;
    let hasAttemptedDetachedBrowserRecovery = false;

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
          await client.stopSession(session.id, "session");
        } catch {}
        void currentRunPromise.catch(() => undefined);
        terminalStateHandled = true;
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
            message:
              "Task paused. Complete any manual actions in the browser and click Resume.",
          },
        });

        // Stop the active task but keep the session/browser alive for manual work.
        try {
          await client.stopSession(session.id, "task");
          const stoppedStatus = await waitForSessionToLeaveRunning(
            client,
            session.id,
          );
          await log("Pause stop request processed", {
            sessionId: session.id,
            sessionStatus: stoppedStatus,
          });
        } catch {}
        void currentRunPromise.catch(() => undefined);
        const pausedCursor = await syncProgressCursorAfterPause(
          client,
          session.id,
          lastMessageId,
          lastStepCount,
        );
        lastMessageId = pausedCursor.lastMessageId;
        lastStepCount = pausedCursor.lastStepCount;

        // Wait for resume
        const pauseStartTime = Date.now();
        let resumed = false;
        while (Date.now() - pauseStartTime < MAX_PAUSE_DURATION_MS) {
          await sleep(PAUSE_CHECK_INTERVAL_MS);
          const checkJob = await db.query.jobs.findFirst({
            where: eq(jobs.id, JOB_ID),
            columns: { status: true },
          });

          if (checkJob?.status === "running") {
            await log("User resumed - continuing task");
            const continuePrompt = `
Continue from where you left off. The user has completed any manual intervention or authentication.
Now proceed with the original task:

${prompt}
`;
            currentRunPromise = Promise.resolve(
              client.runTask(continuePrompt, {
                sessionId: session.id,
                model: BROWSER_USE_MODEL,
                timeoutMs: MAX_RUNTIME_MS,
                workspaceId: workspaceId ?? undefined,
              }),
            );
            resumed = true;
            break;
          }
          if (checkJob?.status === "cancelled") {
            await log("Job cancelled during pause");
            try {
              await client.stopSession(session.id, "session");
            } catch {}
            terminalStateHandled = true;
            break;
          }
        }

        if (terminalStateHandled) {
          break;
        }

        // Check if we timed out or cancelled
        const finalCheck = await db.query.jobs.findFirst({
          where: eq(jobs.id, JOB_ID),
          columns: { status: true },
        });
        if (!resumed || finalCheck?.status !== "running") {
          if (finalCheck?.status === "paused") {
            await log("Pause timeout - marking as failed");
            await db
              .update(jobs)
              .set({
                status: "failed",
                completedAt: new Date(),
                errorMessage: "Timed out waiting for user intervention",
              })
              .where(eq(jobs.id, JOB_ID));
            terminalStateHandled = true;
          }
          break;
        }

        continue;
      }

      const browserSession = await client.getSession(session.id);
      const newMessages = await client.getMessages(session.id, lastMessageId);
      const orderedMessages = [...newMessages.messages].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const publishedMessageUpdate = orderedMessages.length > 0;
      let sawDetachedBrowserRecoveryError = false;

      for (const message of orderedMessages) {
        const detachedBrowserRecoveryError =
          isDetachedBrowserRecoveryError(message);
        if (detachedBrowserRecoveryError) {
          sawDetachedBrowserRecoveryError = true;
        }

        const summary = message.summary?.trim() || message.type;
        await publishStatus("step", {
          stepNumber: browserSession.stepCount,
          goal: summary,
          liveUrl: browserSession.liveUrl ?? session.liveUrl,
          memory: message.data,
          url: browserSession.liveUrl ?? session.liveUrl,
          actions: [message.type],
        });
        await log(
          summary,
          {
            type: message.type,
            role: message.role,
            sessionId: session.id,
          },
          { publish: false },
        );
        lastMessageId = message.id;
      }

      if (orderedMessages.length > 0) {
        detachedBrowserRecoveryFailures = sawDetachedBrowserRecoveryError
          ? detachedBrowserRecoveryFailures + 1
          : 0;
      }

      if (
        browserSession.stepCount > lastStepCount &&
        browserSession.lastStepSummary &&
        !publishedMessageUpdate
      ) {
        await publishStatus("step", {
          stepNumber: browserSession.stepCount,
          goal: browserSession.lastStepSummary,
          liveUrl: browserSession.liveUrl ?? session.liveUrl,
          url: browserSession.liveUrl ?? session.liveUrl,
          actions: [],
        });
        await log(
          `Step ${browserSession.stepCount}: ${browserSession.lastStepSummary}`,
          {
            sessionId: session.id,
          },
          { publish: false },
        );
      }
      lastStepCount = Math.max(lastStepCount, browserSession.stepCount);

      if (
        browserSession.status === "running" &&
        detachedBrowserRecoveryFailures >= 3
      ) {
        if (!hasAttemptedDetachedBrowserRecovery) {
          await log(
            "Browser Use lost tab focus repeatedly - restarting with recovery instructions",
            {
              sessionId: session.id,
              recoveryReturnUrl,
              failureCount: detachedBrowserRecoveryFailures,
            },
          );

          try {
            await client.stopSession(session.id, "task");
            await waitForSessionToLeaveRunning(client, session.id);
          } catch {}

          const recoveryPrompt = `
The browser entered an unstable state after a bad click or detached tab.

RECOVERY RULES:
- Use only Browser Use native tools: switch, close, navigate, go_back, click, input, upload_file, evaluate, screenshot.
- Do NOT use Python or browser-wrapper recovery helpers such as get_tabs.
- If a stray tab or blank page is open, use switch or close to return to the main Guernsey portal tab.
- If you cannot recover the portal tab quickly, navigate directly to: ${recoveryReturnUrl}
- If you land on a page ending in reviewAndSubmit/summary, this is a saved draft summary. Do NOT click Submit, Confirm, Print, or Download from that page.
- From the summary page, use a Change or Edit link to reopen the filing sections and continue the return.
- Verify the Financial Statements / Accounts upload before leaving that section, and do not continue while the control still says "No file chosen".

Continue the original task now:

${prompt}
`;

          currentRunPromise = Promise.resolve(
            client.runTask(recoveryPrompt, {
              sessionId: session.id,
              model: BROWSER_USE_MODEL,
              timeoutMs: MAX_RUNTIME_MS,
              workspaceId: workspaceId ?? undefined,
            }),
          );
          hasAttemptedDetachedBrowserRecovery = true;
          detachedBrowserRecoveryFailures = 0;
          continue;
        }

        const focusFailureMessage =
          "Browser Use lost browser focus repeatedly after a detached tab/blank page and could not recover automatically.";

        await log(focusFailureMessage, {
          sessionId: session.id,
          failureCount: detachedBrowserRecoveryFailures,
        });

        await publishJobEvent({
          type: "job:failed",
          jobId: JOB_ID,
          timestamp: Date.now(),
          data: {
            error: focusFailureMessage,
            browserUseSessionId: session.id,
            liveUrl: session.liveUrl,
          },
        });

        await db
          .update(taxReturns)
          .set({ status: "failed" })
          .where(eq(taxReturns.id, TAX_RETURN_ID));

        if (JOB_ID) {
          await db
            .update(jobs)
            .set({
              status: "failed",
              completedAt: new Date(),
              errorMessage: focusFailureMessage,
              resultData: {
                liveUrl: session.liveUrl,
                browserUseSessionId: session.id,
                workspaceId,
              },
            })
            .where(eq(jobs.id, JOB_ID));
        }

        try {
          await client.stopSession(session.id, "task");
        } catch {}

        terminalStateHandled = true;
        break;
      }

      if (isTerminalSessionStatus(browserSession.status)) {
        const runResult = await currentRunPromise.catch(() => null);
        const output = normalizeBrowserUseOutput(
          runResult?.output ?? browserSession.output,
        );
        const success =
          browserSession.status === "idle" &&
          (runResult?.isTaskSuccessful ??
            browserSession.isTaskSuccessful ??
            true);

        // Check if the agent needs user intervention (e.g., login required)
        const needsAttention =
          !success &&
          REQUIRES_ATTENTION_KEYWORDS.some((keyword) =>
            output.toLowerCase().includes(keyword.toLowerCase()),
          );

        if (needsAttention) {
          await log("Task requires user attention - pausing", { output });

          await publishJobEvent({
            type: "job:requires_attention",
            jobId: JOB_ID,
            timestamp: Date.now(),
            data: {
              output,
              browserUseSessionId: session.id,
              liveUrl: session.liveUrl,
              sessionId: session.id,
              message:
                "Agent needs user intervention. The browser session is still active - please complete the required action (e.g., login) and resume.",
            },
          });

          // Update job to paused status
          if (JOB_ID) {
            await db
              .update(jobs)
              .set({
                status: "paused",
                resultData: {
                  output,
                  browserUseSessionId: session.id,
                  liveUrl: session.liveUrl,
                  sessionId: session.id,
                  pausedAt: Date.now(),
                  pauseReason: output,
                },
              })
              .where(eq(jobs.id, JOB_ID));
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
              await log(
                "User resumed - creating new Browser Use run to continue",
              );

              const continuePrompt = `
Continue from where you left off. The user has completed the login/authentication.
Now proceed with the original task:

${prompt}
`;
              currentRunPromise = Promise.resolve(
                client.runTask(continuePrompt, {
                  sessionId: session.id,
                  model: BROWSER_USE_MODEL,
                  timeoutMs: MAX_RUNTIME_MS,
                  workspaceId: workspaceId ?? undefined,
                }),
              );

              break;
            }

            if (
              currentJob.status === "cancelled" ||
              currentJob.status === "failed"
            ) {
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
            await db
              .update(jobs)
              .set({
                status: "failed",
                completedAt: new Date(),
                errorMessage: "Timed out waiting for user intervention",
              })
              .where(eq(jobs.id, JOB_ID));
            break;
          }

          continue; // Continue the main polling loop with the new task
        }

        await log(
          success ? "Task completed successfully" : "Task finished with issues",
          {
            output,
            isSuccess: success,
            sessionStatus: browserSession.status,
          },
        );

        await publishJobEvent({
          type: success ? "job:completed" : "job:failed",
          jobId: JOB_ID,
          timestamp: Date.now(),
          data: {
            output,
            isSuccess: success,
            browserUseSessionId: session.id,
          },
        });

        // Update DB
        await db
          .update(taxReturns)
          .set({ status: success ? "completed" : "failed" })
          .where(eq(taxReturns.id, TAX_RETURN_ID));
        if (JOB_ID) {
          await db
            .update(jobs)
            .set({
              status: success ? "completed" : "failed",
              completedAt: new Date(),
              resultData: {
                output,
                browserUseSessionId: session.id,
                liveUrl: session.liveUrl,
                workspaceId,
              },
            })
            .where(eq(jobs.id, JOB_ID));
        }

        terminalStateHandled = true;
        break;
      }

      if (browserSession.status === "running") {
        await publishStatus("running", {
          stepCount: browserSession.stepCount,
          lastStepSummary: browserSession.lastStepSummary,
          liveUrl: browserSession.liveUrl ?? session.liveUrl,
        });
      }
    }

    if (!terminalStateHandled) {
      const timeoutMessage =
        "Browser Use session timed out before reaching a terminal state";
      void currentRunPromise.catch(() => undefined);
      await log(timeoutMessage, { sessionId: session.id });

      await publishJobEvent({
        type: "job:failed",
        jobId: JOB_ID,
        timestamp: Date.now(),
        data: { error: timeoutMessage, browserUseSessionId: session.id },
      });

      await db
        .update(taxReturns)
        .set({ status: "failed" })
        .where(eq(taxReturns.id, TAX_RETURN_ID));

      if (JOB_ID) {
        await db
          .update(jobs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorMessage: timeoutMessage,
            resultData: {
              liveUrl: session.liveUrl,
              browserUseSessionId: session.id,
              workspaceId,
            },
          })
          .where(eq(jobs.id, JOB_ID));
      }
    }

    // Cleanup
    try {
      await client.stopSession(session.id);
      await log("Session stopped");
    } catch {}

    if (workspaceId) {
      try {
        await client.deleteWorkspace(workspaceId);
        await log("Workspace deleted", { workspaceId });
      } catch {}
    }

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
      await db
        .update(jobs)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: errorMsg,
        })
        .where(eq(jobs.id, JOB_ID));
    }

    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
