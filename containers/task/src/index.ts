/**
 * Browser Use Task Runner
 * Runs on ECS, uses Browser Use Cloud API, streams status via Redis
 */

import { put } from "@vercel/blob";
import {
  db,
  taxReturns,
  jobs,
  tasks,
  eq,
  sql,
  orgSettings,
  getGuernseyNoticeOfAssessment,
  isGuernseyNoticeOfAssessmentDefaulted,
  parseFinancialFiguresMetadata,
  type TaxReturnFileCategory,
  type TaxReturnFileRole,
} from "@repo/database";
import { publishJobEvent } from "@repo/redis";
import {
  EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
  EARLIER_UNRECEIPTED_SUBMIT_JOBS_KEY,
  fingerprintPreparedInputs,
  getEarlierUnreceiptedSubmitJobs,
  getFilingOperation,
  parsePreparedDraftOutput,
  PORTAL_NET_BOOK_VALUE_KEY,
  resolvePreparedDraft,
  isBrowserSessionStoppedStatus,
  planEarlierSubmitBrowserCheck,
  SUBMIT_DISPATCHED_KEY,
  SUBMIT_PREPARED_DISPATCHED_KEY,
  SUBMIT_PREPARED_OPERATION,
  type FilingOperation,
  type PreparedDraftRecord,
} from "@repo/database/prepared-draft";
import {
  buildStatusReply,
  deliveryAcknowledgement,
  extractAgentQuestionText,
  extractAgentReplyToReviewer,
  getPendingOperatorMessages,
  getPendingStatusQuestions,
  isQuestionLike,
  hasPendingOperatorInterrupt,
  parsePendingAgentQuestion,
  withOperatorMessages,
  type AgentQuestion,
  type AgentQuestionReason,
} from "@repo/database/operator-messages";
import {
  markOperatorMessagesDeliveredSql,
  preserveWebOwnedResultDataSql,
  setAgentReplySql,
} from "@repo/database/operator-messages-sql";
import {
  BrowserUseClient,
  type BrowserUseSessionStatus,
  type BrowserUseFileInfo,
  type BrowserUseSession,
} from "./browser-use-client";
import {
  getBrowserFileBaselineKey,
  looksLikePdf,
  selectCompletionPdfCandidates,
} from "./completion-pdf";
import {
  detectPrepareOnlyBreach,
  evaluatePrepareOnlyGuard,
  isPrepareOnlyGuardRequired,
  prepareOnlyGuardFailure,
  type PrepareOnlyGuardStatus,
} from "./prepare-only-guard";
import { decideFilingContactStartup } from "./filing-contact-policy";
import {
  isBudgetExhausted,
  modelTakesNoParams,
  profileForSubmissionMode,
  resolveBrowserUseRunConfig,
} from "./browser-use-config";
import {
  decidePortalNetBookValue,
  initialNetBookValueStatus,
  isNetBookValueQuestion,
  MAX_UNCLEAR_NET_BOOK_VALUE_REPLIES,
  netBookValuePauseQuestion,
  netBookValueProvenanceFromMetadata,
  portalNetBookValueFromReviewerReply,
  type PortalNetBookValue,
  type PortalNetBookValueStatus,
  type ReviewerNetBookValue,
} from "./portal-net-book-value";
import {
  buildNoticeOfAssessmentContinuationRule,
  buildResumePrompt,
  buildSubmitPreparedReturnPrompt,
  buildSubstanceFormPrompt,
  hasConfiguredFilingContact,
} from "./prompt-builder";
import {
  classifyRunOutcome,
  resolveFinalRunStatuses,
  shouldCaptureFiledReturnPdf,
  type SubmissionMode,
} from "./run-outcome";

/** Job error for a submit run that found the return already submitted. */
const ALREADY_SUBMITTED_JOB_MESSAGE =
  "The Guernsey Tax Portal shows this return as already submitted, so this run did not submit it. Check the portal and record the filed return (any filed-return PDF the run found is attached to the return).";

/**
 * Job error for a submit run that reported the return already submitted in a
 * continuation (after an earlier browser task of the same run, which may
 * have clicked the final button): it may be this run's own submission.
 */
const SUBMITTED_AFTER_CONTINUATION_JOB_MESSAGE =
  "The Guernsey Tax Portal shows this return as submitted. This run had already continued in the same browser session, so it may have submitted it itself. Check the portal and record the filed return (any filed-return PDF the run found is attached to the return).";

// ============================================================================
// Configuration
// ============================================================================

const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY || "";
const ENV_TAX_RETURN_ID = process.env.TAX_RETURN_ID || "";
const ENV_JOB_ID = process.env.JOB_ID || "";
const ENV_TASK_ID = process.env.TASK_ID || "";
const ENV_OVERRIDE_SAVED = process.env.OVERRIDE_SAVED === "true";
const ENV_SUBMISSION_MODE =
  process.env.SUBMISSION_MODE === "submit_and_capture_pdf"
    ? "submit_and_capture_pdf"
    : "prepare_only";
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
// Browser Use extension id (from POST /api/v4/extensions) of the uploaded
// prepare-only guard (containers/task/prepare-only-guard). Unset = prepare_only
// runs are refused (fail closed) unless
// BROWSER_USE_PREPARE_ONLY_GUARD_REQUIRED=false explicitly opts out.
const PREPARE_ONLY_GUARD_EXTENSION_ID =
  process.env.BROWSER_USE_PREPARE_ONLY_GUARD_EXTENSION_ID?.trim() || null;
const PREPARE_ONLY_GUARD_REQUIRED = isPrepareOnlyGuardRequired(
  process.env.BROWSER_USE_PREPARE_ONLY_GUARD_REQUIRED,
);
// Model, effort and per-session USD budget by mode (see browser-use-config).
// Invalid values refuse each job before any browser run; never a fallback.
const BROWSER_USE_RUN_CONFIG = resolveBrowserUseRunConfig(process.env);
const WORKER_MODE =
  process.env.WORKER_MODE === "single"
    ? "single"
    : process.env.WORKER_MODE === "service"
      ? "service"
      : ENV_JOB_ID && ENV_TAX_RETURN_ID
        ? "single"
        : "service";
const BROWSER_STARTUP_TIMEOUT_MS = Number(
  process.env.BROWSER_STARTUP_TIMEOUT_MS || 45_000,
);
const BROWSER_JOB_POLL_INTERVAL_MS = Number(
  process.env.BROWSER_JOB_POLL_INTERVAL_MS || 1_500,
);
const BROWSER_JOB_HEARTBEAT_INTERVAL_MS = Number(
  process.env.BROWSER_JOB_HEARTBEAT_INTERVAL_MS || 10_000,
);
const CLOUDWATCH_LOG_GROUP = process.env.CLOUDWATCH_LOG_GROUP || "/ecs/lts-task";
const WORKER_CONTAINER_NAME = process.env.WORKER_CONTAINER_NAME || "lts-task";

const POLL_INTERVAL_MS = 2000;
const MAX_RUNTIME_MS = 30 * 60 * 1000;
const PAUSE_CHECK_INTERVAL_MS = 5000;
const MAX_PAUSE_DURATION_MS = 10 * 60 * 1000; // 10 minutes max pause
const FILING_CONTACT_PAUSE_MESSAGE =
  "Needs filing contact: no organisation filing contact is configured, so the draft is stopped at the portal's contact step and the contact fields were left untouched. Enter the organisation's filing contact in the live browser and click Resume to continue to the review page (it will not submit), or leave it and the return will be marked for review.";
const FILING_CONTACT_REVIEW_REASON =
  "Needs filing contact: no organisation filing contact is configured, so the draft was stopped at the portal's contact step for a person to complete";

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
  category?: TaxReturnFileCategory;
  role?: TaxReturnFileRole;
  metadata?: Record<string, unknown>;
};

type BrowserSessionInputFile = {
  originalName: string;
  sessionFileName: string;
  sessionFilePath: string;
  url: string;
  category?: TaxReturnFileCategory;
  role?: TaxReturnFileRole;
};

type CompletionPdfIngestionResult = {
  status: "uploaded" | "missing" | "failed";
  fileUrl?: string;
  fileName?: string;
  browserUsePath?: string;
  browserUseUrl?: string;
  error?: string;
};

type ActiveJobRuntime = {
  jobId: string;
  taskId: string;
  taxReturnId: string;
  overrideSaved: boolean;
  submissionMode: SubmissionMode;
  /** "submit_prepared": submit the exact draft a prepare run left ready. */
  filingOperation: FilingOperation;
  preparedJobId: string | null;
  resultData: Record<string, unknown>;
  workerId: string;
  workerTaskArn: string | null;
  workerLogStream: string | null;
  startupTimeoutMs: number;
};

type WorkerMetadata = {
  workerId: string;
  workerTaskArn: string | null;
  workerLogStream: string | null;
};

type ClaimedJobRow = {
  id: string;
  taskId: string;
  taxReturnId: string;
  resultData: Record<string, unknown> | null;
};

let activeRuntime: ActiveJobRuntime | null = null;
let workerMetadata: WorkerMetadata = {
  workerId: `local-${process.pid}`,
  workerTaskArn: null,
  workerLogStream: null,
};
let shuttingDown = false;

function getActiveRuntime() {
  return activeRuntime;
}

function getRequiredRuntime() {
  const runtime = getActiveRuntime();
  if (!runtime) {
    throw new Error("No active browser job runtime is set");
  }

  return runtime;
}

function currentJobId() {
  return getActiveRuntime()?.jobId ?? ENV_JOB_ID;
}

function currentTaskId() {
  return getActiveRuntime()?.taskId ?? ENV_TASK_ID;
}

function currentTaxReturnId() {
  return getActiveRuntime()?.taxReturnId ?? ENV_TAX_RETURN_ID;
}

function currentSubmissionMode(): SubmissionMode {
  return getActiveRuntime()?.submissionMode ?? ENV_SUBMISSION_MODE;
}

function currentOverrideSaved() {
  return getActiveRuntime()?.overrideSaved ?? ENV_OVERRIDE_SAVED;
}

// ============================================================================
// Logging + Redis Publishing
// ============================================================================

async function log(
  message: string,
  data?: Record<string, unknown>,
  options?: { publish?: boolean },
) {
  const runtime = getActiveRuntime();
  const payload = {
    timestamp: new Date().toISOString(),
    level: "info",
    workerMode: WORKER_MODE,
    workerId: runtime?.workerId ?? workerMetadata.workerId,
    jobId: runtime?.jobId ?? null,
    taskId: runtime?.taskId ?? null,
    taxReturnId: runtime?.taxReturnId ?? null,
    sessionId:
      typeof runtime?.resultData.sessionId === "string"
        ? runtime.resultData.sessionId
        : typeof runtime?.resultData.browserUseSessionId === "string"
          ? runtime.resultData.browserUseSessionId
          : null,
    message,
    ...(data ?? {}),
  };

  console.log(JSON.stringify(payload));

  if (options?.publish === false) {
    return;
  }

  const jobId = currentJobId();
  if (!jobId) {
    return;
  }

  try {
    await publishJobEvent({
      type: "job:step",
      jobId,
      timestamp: Date.now(),
      data: { message, ...data },
    });
  } catch {}
}

async function publishStatus(status: string, data: Record<string, unknown>) {
  const jobId = currentJobId();
  if (!jobId) {
    return;
  }

  try {
    await publishJobEvent({
      type: "job:progress",
      jobId,
      timestamp: Date.now(),
      data: { status, ...data },
    });
  } catch (err) {
    console.error("Redis publish failed:", err);
  }
}

function isTerminalSessionStatus(status: BrowserUseSessionStatus): boolean {
  return status === "idle" || status === "stopped" || status === "error";
}

function normalizeResultData(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return { ...(value as Record<string, unknown>) };
}

function mergeResultData(
  existing: Record<string, unknown>,
  patch?: Record<string, unknown>,
) {
  if (!patch) {
    return existing;
  }

  return {
    ...existing,
    ...patch,
  };
}

async function updateActiveJobRecord(params: {
  set?: Record<string, unknown>;
  resultDataPatch?: Record<string, unknown>;
}) {
  const runtime = getRequiredRuntime();
  runtime.resultData = mergeResultData(
    runtime.resultData,
    params.resultDataPatch,
  );

  const nextValues: Record<string, unknown> = {
    ...(params.set ?? {}),
    resultData: preserveWebOwnedResultDataSql(runtime.resultData),
  };

  await db.update(jobs).set(nextValues).where(eq(jobs.id, runtime.jobId));
}

async function heartbeatActiveJob() {
  const runtime = getActiveRuntime();
  if (!runtime) {
    return;
  }

  runtime.resultData = mergeResultData(runtime.resultData, {
    lastHeartbeatAt: Date.now(),
  });

  await db
    .update(jobs)
    .set({
      resultData: preserveWebOwnedResultDataSql(runtime.resultData),
    })
    .where(eq(jobs.id, runtime.jobId));
}

function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }

  if (
    result &&
    typeof result === "object" &&
    "rows" in result &&
    Array.isArray((result as { rows?: unknown[] }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }

  return [];
}

async function loadWorkerMetadata(): Promise<WorkerMetadata> {
  const taskMetadataUrl = process.env.ECS_CONTAINER_METADATA_URI_V4
    ? `${process.env.ECS_CONTAINER_METADATA_URI_V4}/task`
    : null;

  if (!taskMetadataUrl) {
    return workerMetadata;
  }

  try {
    const response = await fetch(taskMetadataUrl);
    if (!response.ok) {
      throw new Error(
        `Metadata request failed: ${response.status} ${response.statusText}`,
      );
    }

    const metadata = (await response.json()) as {
      TaskARN?: string;
    };
    const taskArn =
      typeof metadata.TaskARN === "string" ? metadata.TaskARN : null;
    const taskId = taskArn?.split("/").pop() ?? `local-${process.pid}`;

    return {
      workerId: taskId,
      workerTaskArn: taskArn,
      workerLogStream: taskId
        ? `ecs/${WORKER_CONTAINER_NAME}/${taskId}`
        : null,
    };
  } catch (error) {
    console.error("Failed to load ECS task metadata", error);
    return workerMetadata;
  }
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
      category:
        row.category === "esr" ||
        row.category === "financial" ||
        row.category === "supporting" ||
        row.category === "misc"
          ? row.category
          : undefined,
      role:
        row.role === "financial_statements" ||
        row.role === "filed_return_pdf"
          ? row.role
          : undefined,
      metadata:
        row.metadata && typeof row.metadata === "object"
          ? (row.metadata as Record<string, unknown>)
          : undefined,
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

function sanitizeFileBaseName(name: string, fallback: string): string {
  const withoutExtension = name.replace(/\.pdf$/i, "").trim();
  const safe = withoutExtension
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || fallback;
}

function buildFiledReturnDisplayName(
  entityName: string,
  taxYear: number,
): string {
  const safeEntity = sanitizeFileBaseName(entityName, "return");
  return `${safeEntity}-${taxYear}-filed-return.pdf`;
}

const COMPLETION_PDF_CAPTURE_ATTEMPTS = 4;
const COMPLETION_PDF_CAPTURE_RETRY_MS = 5_000;

/**
 * Browser Use can report the run as finished before a download triggered on
 * the confirmation page has landed in the session/workspace files, so a
 * single lookup can miss the filed return. Retry briefly before giving up.
 */
async function captureCompletionPdfWithRetry(
  params: Parameters<typeof captureCompletionPdf>[0],
): Promise<CompletionPdfIngestionResult> {
  let result: CompletionPdfIngestionResult = {
    status: "missing",
    error: "Completion PDF capture did not run.",
  };

  for (let attempt = 1; attempt <= COMPLETION_PDF_CAPTURE_ATTEMPTS; attempt++) {
    result = await captureCompletionPdf(params);
    if (result.status !== "missing") {
      break;
    }

    if (attempt < COMPLETION_PDF_CAPTURE_ATTEMPTS) {
      await params.logFn("Completion PDF not found yet - retrying", {
        attempt,
        retryInMs: COMPLETION_PDF_CAPTURE_RETRY_MS,
      });
      await sleep(COMPLETION_PDF_CAPTURE_RETRY_MS);
    }
  }

  return result;
}

/**
 * Record the receipt outcome on the return (including success, so a stale
 * "missing" from an earlier run never lingers). Browser Use V4 stores browser
 * downloads under the BROWSER id, not the agent session id, so both are kept
 * for recovery: list browsers by agentSessionId, then read each browser's
 * downloads.
 */
async function recordFiledReturnPdfOutcome(params: {
  taxReturnId: string;
  sessionId: string;
  workspaceId: string | null;
  browserIds: string[];
  completionPdf: CompletionPdfIngestionResult;
  receiptGate: string | null;
  workspaceRetained: boolean;
}) {
  const filedReturnPdf = {
    status: params.completionPdf.status,
    error: params.completionPdf.error ?? null,
    jobId: currentJobId(),
    browserUseApiVersion: 4,
    browserUseSessionId: params.sessionId,
    browserUseBrowserIds: params.browserIds,
    browserUseWorkspaceId: params.workspaceId,
    workspaceRetained: params.workspaceRetained,
    browserUsePath: params.completionPdf.browserUsePath ?? null,
    fileUrl: params.completionPdf.fileUrl ?? null,
    receiptGate: params.receiptGate,
    recordedAt: new Date().toISOString(),
  };

  await db
    .update(taxReturns)
    .set({
      metadata: sql`coalesce(${taxReturns.metadata}, '{}'::jsonb) || ${JSON.stringify({ filedReturnPdf })}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(taxReturns.id, params.taxReturnId));
}

async function captureCompletionPdf(params: {
  client: BrowserUseClient;
  sessionId: string;
  workspaceId: string | null;
  taxReturnId: string;
  orgId: string;
  entityName: string;
  taxYear: number;
  financialStatementsFile: BrowserSessionInputFile | null;
  baselineKeys: Set<string>;
  logFn: typeof log;
}): Promise<CompletionPdfIngestionResult> {
  const {
    client,
    sessionId,
    workspaceId,
    financialStatementsFile,
    baselineKeys,
  } = params;

  const sessionFiles = await client.getAllSessionFiles(sessionId);
  const workspaceFiles = workspaceId
    ? await client.getAllWorkspaceFiles(workspaceId)
    : [];

  await params.logFn("Collected Browser Use files after submission", {
    sessionFileCount: sessionFiles.length,
    workspaceFileCount: workspaceFiles.length,
  });

  const candidates = selectCompletionPdfCandidates({
    sessionFiles,
    workspaceFiles,
    baselineKeys,
    excludedInputs: financialStatementsFile ? [financialStatementsFile] : [],
  });

  await params.logFn("Discovered completion PDF candidates", {
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      path: candidate.path,
      name: candidate.name,
      source: candidate.source,
      size: candidate.size,
      keywordMatches: candidate.keywordMatches,
      lastModified: candidate.lastModified,
    })),
  });

  if (candidates.length === 0) {
    return {
      status: "missing",
      error: "No new PDF was downloaded during the run (browser downloads and workspace checked).",
    };
  }

  if (!BLOB_READ_WRITE_TOKEN) {
    return {
      status: "failed",
      error: "BLOB_READ_WRITE_TOKEN is missing in the browser task environment.",
      browserUsePath: candidates[0]!.path,
      browserUseUrl: candidates[0]!.url,
    };
  }

  // Try candidates best-first; a download that is not a real PDF (an HTML
  // error page, a truncated file) must never be attached as the receipt.
  let selectedCandidate: (typeof candidates)[number] | undefined;
  let buffer: Buffer | undefined;
  const rejected: Array<{ path: string; reason: string }> = [];
  for (const candidate of candidates) {
    const response = await fetch(candidate.url);
    if (!response.ok) {
      rejected.push({ path: candidate.path, reason: `HTTP ${response.status}` });
      continue;
    }
    const body = Buffer.from(await response.arrayBuffer());
    if (!looksLikePdf(body)) {
      rejected.push({ path: candidate.path, reason: "not a PDF (missing %PDF- header)" });
      continue;
    }
    selectedCandidate = candidate;
    buffer = body;
    break;
  }

  if (!selectedCandidate || !buffer) {
    await params.logFn("No completion PDF candidate could be verified", {
      rejected,
    });
    return {
      status: "failed",
      error: `Completion PDF candidates could not be verified: ${rejected
        .map((item) => `${item.path} (${item.reason})`)
        .join("; ")}`,
      browserUsePath: candidates[0]!.path,
    };
  }

  await params.logFn("Selected completion PDF candidate", {
    path: selectedCandidate.path,
    name: selectedCandidate.name,
    source: selectedCandidate.source,
    size: buffer.length,
    lastModified: selectedCandidate.lastModified,
    keywordMatches: selectedCandidate.keywordMatches,
  });
  const now = new Date();
  const uploadedAt = now.toISOString();
  const blobPath = `portal/${params.orgId}/${params.taxReturnId}/supporting/${now.getTime()}-filed-return.pdf`;

  const blob = await put(
    blobPath,
    new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
    {
      access: "public",
      contentType: "application/pdf",
      token: BLOB_READ_WRITE_TOKEN,
    },
  );

  const currentTaxReturn = await db.query.taxReturns.findFirst({
    where: eq(taxReturns.id, params.taxReturnId),
  });

  if (!currentTaxReturn) {
    return {
      status: "failed",
      error: "Tax return disappeared before the completion PDF could be attached.",
      browserUsePath: selectedCandidate.path,
      browserUseUrl: selectedCandidate.url,
    };
  }

  const existingFiles = getTaxReturnFiles(currentTaxReturn.files);
  let supersededCount = 0;
  const nextFiles = existingFiles.map((file) => {
    if (file.role !== "filed_return_pdf") {
      return file;
    }

    supersededCount += 1;
    return {
      ...file,
      role: undefined,
      metadata: {
        ...(file.metadata ?? {}),
        source:
          typeof file.metadata?.source === "string"
            ? file.metadata.source
            : "browser_use_download",
        kind: "filed_return_pdf",
        supersededAt: uploadedAt,
        supersededByJobId: currentJobId(),
      },
    };
  });

  const displayName = buildFiledReturnDisplayName(
    params.entityName,
    params.taxYear,
  );

  nextFiles.push({
    url: blob.url,
    name: displayName,
    size: buffer.length,
    type: "application/pdf",
    uploadedAt,
    category: "supporting",
    role: "filed_return_pdf",
    metadata: {
      source: "browser_use_download",
      kind: "filed_return_pdf",
      jobId: currentJobId(),
      taskId: currentTaskId(),
      browserUseSessionId: sessionId,
      browserUsePath: selectedCandidate.path,
      browserUseSource: selectedCandidate.source,
      // The signed Browser Use URL is not stored: it expires and file
      // metadata is visible to client-portal users.
    },
  });

  await db
    .update(taxReturns)
    .set({
      files: nextFiles,
      updatedAt: now,
    })
    .where(eq(taxReturns.id, params.taxReturnId));

  await params.logFn("Attached completion PDF to tax return files", {
    blobUrl: blob.url,
    fileName: displayName,
    supersededCount,
    browserUsePath: selectedCandidate.path,
    source: selectedCandidate.source,
  });

  return {
    status: "uploaded",
    fileUrl: blob.url,
    fileName: displayName,
    browserUsePath: selectedCandidate.path,
    browserUseUrl: selectedCandidate.url,
  };
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

function parseSubmissionMode(value: unknown): SubmissionMode {
  return value === "submit_and_capture_pdf"
    ? "submit_and_capture_pdf"
    : "prepare_only";
}

function parseOverrideSaved(value: unknown) {
  return value === true;
}

function parsePreparedJobId(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/**
 * Submit-prepared runs re-check, before any browser starts, that the draft
 * they were enqueued against is still the latest prepared draft for the
 * return and that the return data it was filled from is unchanged.
 */
async function listReturnJobs(taxReturnId: string) {
  return db
    .select({
      id: jobs.id,
      taskId: jobs.taskId,
      taskName: tasks.name,
      jobNumber: jobs.jobNumber,
      status: jobs.status,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
      updatedAt: jobs.updatedAt,
      resultData: jobs.resultData,
    })
    .from(jobs)
    .innerJoin(tasks, eq(jobs.taskId, tasks.id))
    .where(eq(tasks.taxReturnId, taxReturnId));
}

/**
 * Defence in depth for the web start check: stop the Browser Use session of
 * every earlier dispatched submit run on the return, and refuse this run
 * unless each one reads back as stopped (or recorded no session and has been
 * quiet long enough). Two agents on one return could both file it. Runs
 * still active are never touched.
 */
async function stopEarlierSubmitRunBrowsers(
  client: BrowserUseClient,
  returnJobs: Awaited<ReturnType<typeof listReturnJobs>>,
  currentJobId: string,
) {
  const now = Date.now();
  for (const job of returnJobs) {
    if (job.id === currentJobId) continue;
    const plan = planEarlierSubmitBrowserCheck(job, now);
    if (plan.kind === "none") continue;
    if (plan.kind === "wait") {
      throw new Error(
        `Submission refused: ${EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE}`,
      );
    }
    try {
      await client.stopSession(plan.sessionId, "session");
    } catch (error) {
      // The read-back below decides; a partial stop may still have worked.
      await log("Stopping an earlier submit run's browser failed", {
        phase: "startup",
        earlierJobId: job.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    let status: string | null = null;
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      try {
        status = await client.getSessionStatus(plan.sessionId);
      } catch (error) {
        status = null;
        await log("Reading an earlier submit run's browser status failed", {
          phase: "startup",
          earlierJobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
        break;
      }
      if (status !== "running") break;
      await sleep(250);
    }
    if (!isBrowserSessionStoppedStatus(status)) {
      await log("An earlier submit run's browser is not confirmed stopped - refusing", {
        phase: "startup",
        earlierJobId: job.id,
        status,
      });
      throw new Error(
        `Submission refused: ${EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE}`,
      );
    }
    await log("Earlier submit run's browser confirmed stopped", {
      phase: "startup",
      earlierJobId: job.id,
      status,
    });
  }
}

/**
 * Earlier submit runs (full submit or Submit prepared return) on the return
 * that reached the portal and saved no receipt, for a submit-mode run, after
 * stopping every earlier submit run's browser. They never stop this run: its
 * prompt names them and its first check confirms on the portal that the
 * return is not already submitted.
 */
async function findEarlierUnreceiptedSubmitRuns(
  runtime: ActiveJobRuntime,
  client: BrowserUseClient,
) {
  if (runtime.submissionMode !== "submit_and_capture_pdf") {
    return { earlier: [], currentTaskName: null };
  }
  const returnJobs = await listReturnJobs(runtime.taxReturnId);
  await stopEarlierSubmitRunBrowsers(client, returnJobs, runtime.jobId);
  return {
    earlier: getEarlierUnreceiptedSubmitJobs({
      jobs: returnJobs,
      excludeJobId: runtime.jobId,
    }),
    currentTaskName:
      returnJobs.find((job) => job.id === runtime.jobId)?.taskName ?? null,
  };
}

async function verifyPreparedDraftForSubmission(params: {
  runtime: ActiveJobRuntime;
  inputFingerprint: string;
  requireNetBookValueReview: boolean;
}): Promise<PreparedDraftRecord> {
  const { runtime, inputFingerprint } = params;
  if (runtime.submissionMode !== "submit_and_capture_pdf") {
    throw new Error("Submit prepared return must run in submit mode");
  }
  if (!runtime.preparedJobId) {
    throw new Error("Submit prepared return has no prepared draft reference");
  }
  const returnJobs = await listReturnJobs(runtime.taxReturnId);
  const resolution = resolvePreparedDraft({
    jobs: returnJobs,
    currentFingerprint: inputFingerprint,
    excludeJobId: runtime.jobId,
    expectedPreparedJobId: runtime.preparedJobId,
    requireNetBookValueReview: params.requireNetBookValueReview,
  });
  if (!resolution.ok) {
    throw new Error(`Submit prepared return refused: ${resolution.blocker}`);
  }
  return resolution.draft;
}

async function persistClaimMetadata(runtime: ActiveJobRuntime) {
  const now = Date.now();
  runtime.resultData = mergeResultData(runtime.resultData, {
    submissionMode: runtime.submissionMode,
    browserUseApiVersion: 4,
    browserUseStartupPhase: "preparing_files",
    overrideSaved: runtime.overrideSaved,
    workerId: runtime.workerId,
    workerTaskArn: runtime.workerTaskArn,
    workerLogStream: runtime.workerLogStream,
    queueClaimedAt: now,
    startupStartedAt: now,
    startupTimeoutMs: runtime.startupTimeoutMs,
    logWindowStartAt: now,
    lastHeartbeatAt: now,
  });

  await db
    .update(jobs)
    .set({
      status: "starting",
      ecsTaskArn: runtime.workerTaskArn,
      cloudwatchLogGroup: CLOUDWATCH_LOG_GROUP,
      cloudwatchLogStream: runtime.workerLogStream,
      resultData: preserveWebOwnedResultDataSql(runtime.resultData),
    })
    .where(eq(jobs.id, runtime.jobId));
}

async function claimNextQueuedJob(): Promise<ActiveJobRuntime | null> {
  const result = await db.execute(sql`
    with next_job as (
      select
        j.id,
        j.task_id as "taskId",
        t.tax_return_id as "taxReturnId",
        coalesce(j.result_data, '{}'::jsonb) as "resultData"
      from lts_job j
      inner join lts_task t on t.id = j.task_id
      where
        j.status = 'queued'
        and t.tax_return_id is not null
      order by j.created_at asc
      for update skip locked
      limit 1
    )
    update lts_job as j
    set
      status = 'starting',
      ecs_task_arn = ${workerMetadata.workerTaskArn},
      cloudwatch_log_group = ${CLOUDWATCH_LOG_GROUP},
      cloudwatch_log_stream = ${workerMetadata.workerLogStream}
    from next_job
    where j.id = next_job.id
    returning
      j.id,
      next_job."taskId",
      next_job."taxReturnId",
      next_job."resultData";
  `);

  const claimed = extractRows<ClaimedJobRow>(result)[0];
  if (!claimed) {
    return null;
  }

  const resultData = normalizeResultData(claimed.resultData);
  const runtime: ActiveJobRuntime = {
    jobId: claimed.id,
    taskId: claimed.taskId,
    taxReturnId: claimed.taxReturnId,
    overrideSaved: parseOverrideSaved(resultData.overrideSaved),
    submissionMode: parseSubmissionMode(resultData.submissionMode),
    filingOperation: getFilingOperation(resultData),
    preparedJobId: parsePreparedJobId(resultData.preparedJobId),
    resultData,
    workerId: workerMetadata.workerId,
    workerTaskArn: workerMetadata.workerTaskArn,
    workerLogStream: workerMetadata.workerLogStream,
    startupTimeoutMs:
      typeof resultData.startupTimeoutMs === "number"
        ? resultData.startupTimeoutMs
        : BROWSER_STARTUP_TIMEOUT_MS,
  };

  await persistClaimMetadata(runtime);
  return runtime;
}

async function prepareSingleJobRuntime(): Promise<ActiveJobRuntime> {
  const jobId = ENV_JOB_ID;
  const taskId = ENV_TASK_ID;
  const taxReturnId = ENV_TAX_RETURN_ID;

  if (!jobId || !taskId || !taxReturnId) {
    throw new Error(
      "JOB_ID, TASK_ID, and TAX_RETURN_ID are required in single mode",
    );
  }

  const job = await db.query.jobs.findFirst({
    where: eq(jobs.id, jobId),
  });

  if (!job) {
    throw new Error("Job not found");
  }

  const resultData = normalizeResultData(job.resultData);
  const runtime: ActiveJobRuntime = {
    jobId,
    taskId,
    taxReturnId,
    overrideSaved:
      parseOverrideSaved(resultData.overrideSaved) || ENV_OVERRIDE_SAVED,
    submissionMode:
      parseSubmissionMode(resultData.submissionMode) ?? ENV_SUBMISSION_MODE,
    filingOperation: getFilingOperation(resultData),
    preparedJobId: parsePreparedJobId(resultData.preparedJobId),
    resultData,
    workerId: workerMetadata.workerId,
    workerTaskArn: workerMetadata.workerTaskArn,
    workerLogStream: workerMetadata.workerLogStream,
    startupTimeoutMs:
      typeof resultData.startupTimeoutMs === "number"
        ? resultData.startupTimeoutMs
        : BROWSER_STARTUP_TIMEOUT_MS,
  };

  await persistClaimMetadata(runtime);
  return runtime;
}

async function listBrowserIdsSafely(
  client: BrowserUseClient,
  sessionId: string,
): Promise<string[]> {
  try {
    return await client.listBrowserIds(sessionId);
  } catch {
    return [];
  }
}

async function captureReceiptSafely(params: {
  client: BrowserUseClient;
  sessionId: string;
  workspaceId: string | null;
  taxReturn: { orgId: string; entityName: string; taxYear: number };
  financialStatementsFile: BrowserSessionInputFile | null;
  baselineKeys: Set<string>;
}): Promise<CompletionPdfIngestionResult> {
  const runtime = getRequiredRuntime();
  try {
    const result = await captureCompletionPdfWithRetry({
      client: params.client,
      sessionId: params.sessionId,
      workspaceId: params.workspaceId,
      taxReturnId: runtime.taxReturnId,
      orgId: params.taxReturn.orgId,
      entityName: params.taxReturn.entityName,
      taxYear: params.taxReturn.taxYear,
      financialStatementsFile: params.financialStatementsFile,
      baselineKeys: params.baselineKeys,
      logFn: log,
    });
    if (result.status !== "uploaded") {
      await log("Filed-return receipt was not saved", {
        status: result.status,
        error: result.error,
        browserUsePath: result.browserUsePath,
      });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log("Completion PDF ingestion threw an unexpected error", {
      error: message,
    });
    return { status: "failed", error: message };
  }
}

/**
 * Never downgrade a return that is already "completed" (for example confirmed
 * as Submitted by the tax-sync portal scrape): it is filed with GRS.
 */
async function setTaxReturnStatusUnlessCompleted(
  taxReturnId: string,
  status: "completed" | "review_required" | "failed",
) {
  await db
    .update(taxReturns)
    .set({ status })
    .where(
      sql`${taxReturns.id} = ${taxReturnId} AND ${taxReturns.status} <> 'completed'`,
    );
}

async function markActiveRuntimeFailed(errorMessage: string) {
  const runtime = getRequiredRuntime();

  // Don't overwrite a "cancelled" status set by the user
  const currentJob = await db.query.jobs.findFirst({
    where: eq(jobs.id, runtime.jobId),
    columns: { status: true },
  });
  if (currentJob?.status === "cancelled") {
    return;
  }

  runtime.resultData = mergeResultData(runtime.resultData, {
    startupError: errorMessage,
    lastHeartbeatAt: Date.now(),
  });

  await setTaxReturnStatusUnlessCompleted(runtime.taxReturnId, "failed");

  await db
    .update(tasks)
    .set({ status: "failed" })
    .where(eq(tasks.id, runtime.taskId));

  await db
    .update(jobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage,
      resultData: preserveWebOwnedResultDataSql(runtime.resultData),
    })
    .where(eq(jobs.id, runtime.jobId));
}

/**
 * A paused run (manual intervention / review) whose pause window expired.
 * The browser run is over, but nothing failed on the return itself: it is
 * waiting for a person, so the client sees "Review Required", not "Failed".
 */
async function markActiveRuntimeAwaitingReview(reason: string) {
  const runtime = getRequiredRuntime();

  const currentJob = await db.query.jobs.findFirst({
    where: eq(jobs.id, runtime.jobId),
    columns: { status: true },
  });
  if (currentJob?.status === "cancelled") {
    return;
  }

  runtime.resultData = mergeResultData(runtime.resultData, {
    pauseExpiredAt: Date.now(),
    pauseExpiredReason: reason,
    lastHeartbeatAt: Date.now(),
  });

  await setTaxReturnStatusUnlessCompleted(
    runtime.taxReturnId,
    "review_required",
  );

  await db
    .update(tasks)
    .set({ status: "failed" })
    .where(eq(tasks.id, runtime.taskId));

  await db
    .update(jobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage: `${reason}. The return has been left for review; start a new run to continue.`,
      resultData: preserveWebOwnedResultDataSql(runtime.resultData),
    })
    .where(eq(jobs.id, runtime.jobId));
}

async function runBrowserJob(runtime: ActiveJobRuntime) {
  activeRuntime = runtime;
  const submissionMode = runtime.submissionMode;
  const overrideSaved = runtime.overrideSaved;

  await log("Browser job starting", {
    phase: "startup",
    submissionMode,
  });

  const client = new BrowserUseClient(BROWSER_USE_API_KEY);
  const heartbeat = setInterval(() => {
    void heartbeatActiveJob().catch((error) => {
      console.error("Failed to update browser worker heartbeat", error);
    });
  }, BROWSER_JOB_HEARTBEAT_INTERVAL_MS);

  let session:
    | (Awaited<ReturnType<BrowserUseClient["getSession"]>> & {
        liveUrl?: string | null;
      })
    | null = null;
  let workspaceId: string | null = null;
  let retainWorkspaceForRecovery = false;
  // Set once a browser run has been dispatched, so a fatal error after the
  // portal may have accepted the filing still looks for the receipt.
  let receiptRecovery: Parameters<typeof captureReceiptSafely>[0] | null =
    null;

  try {
    await log("Fetching tax return data");
    const taxReturn = await db.query.taxReturns.findFirst({
      where: eq(taxReturns.id, runtime.taxReturnId),
      with: { substanceForm: true, jurisdiction: true },
    });

    if (!taxReturn) {
      throw new Error("Tax return not found");
    }
    if (!taxReturn.substanceForm) {
      throw new Error("Substance form not found");
    }
    // What this run fills the portal from; a prepare run records it with the
    // draft so a later submit_prepared run can prove nothing changed since.
    const inputFingerprint = fingerprintPreparedInputs({
      entityName: taxReturn.entityName,
      taxYear: taxReturn.taxYear,
      link: taxReturn.link,
      files: taxReturn.files,
      substanceForm: taxReturn.substanceForm as Record<string, unknown>,
    });
    const isSubmitPrepared =
      runtime.filingOperation === SUBMIT_PREPARED_OPERATION;

    // The GRS final contact is the organisation's explicitly configured
    // contact (e.g. NSM's). No LTS default or launching-user fallback. Submit
    // mode fails closed before any browser run starts when it is not
    // configured; prepare-only drafts without it and stops at the contact
    // step for a person (see filing-contact-policy.ts).
    const orgSettingsRow = await db.query.orgSettings.findFirst({
      where: eq(orgSettings.orgId, taxReturn.orgId),
      columns: { settings: true },
    });
    const filingContactDecision = decideFilingContactStartup(
      submissionMode,
      orgSettingsRow?.settings,
    );
    await updateActiveJobRecord({
      resultDataPatch: {
        filingContactConfigured: filingContactDecision.kind === "configured",
      },
    });
    if (filingContactDecision.kind === "refuse") {
      throw new Error(filingContactDecision.error);
    }
    if (!BROWSER_USE_RUN_CONFIG.ok) {
      throw new Error(BROWSER_USE_RUN_CONFIG.error);
    }
    const runProfile = profileForSubmissionMode(
      BROWSER_USE_RUN_CONFIG.config,
      submissionMode,
    );
    // Only fill runs type Net Book Value (Certificate 3 financial statements);
    // Submit prepared return never edits sections.
    const netBookValueProvenance = netBookValueProvenanceFromMetadata(
      parseFinancialFiguresMetadata(taxReturn.metadata),
    );
    const netBookValueDecision: PortalNetBookValue | null =
      !isSubmitPrepared &&
      taxReturn.substanceForm.certificateType !== "Certificate 2"
        ? decidePortalNetBookValue(
            taxReturn.substanceForm.netBookValue,
            netBookValueProvenance,
          )
        : null;
    // Worker-parsed reviewer answer (kept for the whole session) and how many
    // replies to the Net Book Value question could not be read as an amount.
    let reviewerNetBookValue: ReviewerNetBookValue | null = null;
    let unclearNetBookValueReplies = 0;
    const netBookValueStatus = (): PortalNetBookValueStatus | null =>
      !netBookValueDecision
        ? null
        : reviewerNetBookValue
          ? reviewerNetBookValue.negativeZeroed
            ? "zero_unconfirmed"
            : "reviewer_confirmed"
          : initialNetBookValueStatus(netBookValueDecision);
    // Kinds and counts only: the saved figure stays in the form, unchanged.
    const netBookValueRecord = () =>
      netBookValueDecision
        ? {
            policy: "verified_negative_entered_as_zero",
            decision: netBookValueDecision.kind,
            reason:
              netBookValueDecision.kind === "needs_review"
                ? netBookValueDecision.reason
                : undefined,
            provenance: netBookValueProvenance,
            status: netBookValueStatus(),
            unclearReplies: unclearNetBookValueReplies || undefined,
          }
        : undefined;
    await updateActiveJobRecord({
      resultDataPatch: {
        browserUseModel: runProfile.model,
        browserUseEffort: modelTakesNoParams(runProfile.model)
          ? null
          : runProfile.effort,
        browserUseMaxCostUsd: runProfile.maxCostUsd,
        [PORTAL_NET_BOOK_VALUE_KEY]: netBookValueRecord(),
      },
    });
    if (
      submissionMode === "submit_and_capture_pdf" &&
      (netBookValueDecision?.kind === "needs_review" ||
        netBookValueDecision?.kind === "negative_zero_candidate")
    ) {
      // A final filing never starts from an unverified Net Book Value or an
      // unconfirmed 0 in place of a negative one; a prepare run asks instead.
      throw new Error(
        "Submission refused: the Net Book Value has not been confirmed as a non-negative tangible-asset figure. Enter it on the form, or prepare the return first so a reviewer can confirm it.",
      );
    }
    // The declaration step's notice-of-assessment answer, resolved from the
    // current form: the reviewer's saved "No", otherwise the default "Yes".
    // The agent is always told which to select and never picks it itself.
    // Every run that reaches the declaration step needs it: a submit run, and
    // a prepare run with a filing contact (it completes the declaration and
    // stops before the final button). A prepare run without a contact stops
    // at the contact step and never answers it.
    const prepareCompletesDeclaration =
      submissionMode === "prepare_only" &&
      filingContactDecision.kind === "configured" &&
      hasConfiguredFilingContact(
        filingContactDecision.contact.name,
        filingContactDecision.contact.email,
      );
    const noticeOfAssessment =
      submissionMode === "submit_and_capture_pdf" || prepareCompletesDeclaration
        ? getGuernseyNoticeOfAssessment(taxReturn.substanceForm)
        : null;
    if (noticeOfAssessment) {
      // Audit: the answer this run was instructed to select, and whether it
      // came from the default rather than a saved reviewer answer.
      await updateActiveJobRecord({
        resultDataPatch: {
          noticeOfAssessment,
          noticeOfAssessmentDefaulted: isGuernseyNoticeOfAssessmentDefaulted(
            taxReturn.substanceForm,
          ),
        },
      });
    }
    const {
      earlier: earlierUnreceiptedSubmitJobs,
      currentTaskName,
    } = await findEarlierUnreceiptedSubmitRuns(runtime, client);
    if (earlierUnreceiptedSubmitJobs.length > 0) {
      // Traceability: the runs this run's prompt cautions about.
      await updateActiveJobRecord({
        resultDataPatch: {
          [EARLIER_UNRECEIPTED_SUBMIT_JOBS_KEY]: earlierUnreceiptedSubmitJobs.map(
            (job) => job.id,
          ),
        },
      });
      await log(
        "Earlier submit runs reached the portal without a receipt - the run first checks the return is not already submitted",
        {
          phase: "startup",
          earlierJobIds: earlierUnreceiptedSubmitJobs.map((job) => job.id),
          earlierJobNumbers: earlierUnreceiptedSubmitJobs.map(
            (job) => job.jobNumber,
          ),
        },
      );
    }
    const earlierUnreceiptedSubmitRuns = earlierUnreceiptedSubmitJobs.map(
      (job) => ({
        jobNumber: job.jobNumber,
        taskId: job.taskId,
        taskName: job.taskName,
      }),
    );
    const currentTask = { taskId: runtime.taskId, taskName: currentTaskName };
    const preparedDraft = isSubmitPrepared
      ? await verifyPreparedDraftForSubmission({
          runtime,
          inputFingerprint,
          requireNetBookValueReview: taxReturn.substanceForm.certificateType !== "Certificate 2",
        })
      : null;
    if (preparedDraft) {
      await log("Verified prepared draft for submission", {
        phase: "startup",
        preparedJobId: runtime.preparedJobId,
        hasReviewUrl: Boolean(preparedDraft.reviewUrl),
        hasPortalReference: Boolean(preparedDraft.portalReference),
      });
    }
    const filingContactInfo =
      filingContactDecision.kind === "configured"
        ? filingContactDecision.contact
        : null;
    if (filingContactDecision.kind === "configured") {
      await log("Resolved organisation filing contact", {
        phase: "startup",
        contactSource: "org_settings.portalContactInfo",
        hasPhone: Boolean(filingContactDecision.contact.phone),
      });
    } else {
      await log(
        "Organisation filing contact not configured: preparing without it; the agent will leave the contact fields untouched and stop at the contact step",
        { phase: "startup", problem: filingContactDecision.problem },
      );
    }

    const taxReturnFiles = getTaxReturnFiles(taxReturn.files);
    const useProxy = process.env.USE_UK_PROXY !== "false";

    const latestJobStatus = await db.query.jobs.findFirst({
      where: eq(jobs.id, runtime.jobId),
      columns: { status: true },
    });

    if (latestJobStatus?.status === "cancelled") {
      await log("Job was cancelled during startup", { phase: "startup" });
      return;
    }

    let financialStatementsFile: BrowserSessionInputFile | null = null;
    let baselineBrowserFileKeys = new Set<string>();

    try {
      const workspace = await client.createWorkspace(
        `tax-return-${runtime.taxReturnId}`,
      );
      workspaceId = workspace.id;

      runtime.resultData = mergeResultData(runtime.resultData, {
        workspaceId,
      });
      await db
        .update(jobs)
        .set({
          resultData: preserveWebOwnedResultDataSql(runtime.resultData),
        })
        .where(eq(jobs.id, runtime.jobId));

      await log("Browser Use workspace created", {
        workspaceId,
      });

      // Submitting a prepared draft uploads nothing: the accounts are
      // already attached to the draft.
      financialStatementsFile = isSubmitPrepared
        ? null
        : await uploadFinancialStatementsFile(
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

    try {
      // No run/browser exists yet. All current files are the uploaded sources.
      const baselineSessionFiles: BrowserUseFileInfo[] = [];
      const baselineWorkspaceFiles = workspaceId
        ? await client.getAllWorkspaceFiles(workspaceId)
        : [];

      baselineBrowserFileKeys = new Set([
        ...baselineSessionFiles.map((file) =>
          getBrowserFileBaselineKey("session", file.path),
        ),
        ...baselineWorkspaceFiles.map((file) =>
          getBrowserFileBaselineKey("workspace", file.path),
        ),
      ]);

      await log("Recorded Browser Use file baselines", {
        sessionFileCount: baselineSessionFiles.length,
        workspaceFileCount: baselineWorkspaceFiles.length,
        uploadedFinancialStatementsPath:
          financialStatementsFile?.sessionFilePath ?? null,
      });
    } catch (error) {
      await log("Failed to capture Browser Use file baselines", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    await log("Building AI prompt", {
      entity: taxReturn.entityName,
      year: taxReturn.taxYear,
      hasFinancialStatementsFile: Boolean(financialStatementsFile),
      submissionMode,
      filingOperation: runtime.filingOperation,
    });

    const buildFillPrompt = (firstDispatch = true) =>
      buildSubstanceFormPrompt({
        taxReturn: taxReturn as any,
        substanceForm: taxReturn.substanceForm as any,
        portalUrl: taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
        returnLink: taxReturn.link || undefined,
        overrideSaved,
        submissionMode,
        financialStatementsFile,
        financialStatementsUrl: financialStatementsFile?.url ?? null,
        contactName: filingContactInfo?.name ?? null,
        contactEmail: filingContactInfo?.email ?? null,
        contactPhone: filingContactInfo?.phone ?? null,
        earlierUnreceiptedSubmitRuns,
        currentTask,
        firstDispatch,
        netBookValue: netBookValueDecision
          ? {
              decision: netBookValueDecision,
              reviewer: reviewerNetBookValue,
              stopAsking:
                unclearNetBookValueReplies >= MAX_UNCLEAR_NET_BOOK_VALUE_REPLIES,
            }
          : undefined,
      });
    const buildSubmitPreparedPrompt = (
      draft: NonNullable<typeof preparedDraft>,
      firstDispatch: boolean,
    ) =>
      buildSubmitPreparedReturnPrompt({
        taxReturn,
        substanceForm: taxReturn.substanceForm,
        portalUrl: taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
        returnLink: taxReturn.link || undefined,
        reviewUrl: draft.reviewUrl,
        portalReference: draft.portalReference,
        // Submit mode only starts with a configured contact (refused above).
        contactName: filingContactInfo?.name ?? "",
        contactEmail: filingContactInfo?.email ?? "",
        earlierUnreceiptedSubmitRuns,
        currentTask,
        firstDispatch,
      });
    // The first dispatch of the job. Its FIRST CHECK (stop with
    // ALREADY_SUBMITTED if the portal shows the return submitted) is only
    // right before this run could have clicked the final button.
    let prompt = preparedDraft
      ? buildSubmitPreparedPrompt(preparedDraft, true)
      : buildFillPrompt();
    // The base task resent in every continuation of this run (resume,
    // recovery). For a submit run it carries SUBMISSION STATUS instead of
    // FIRST CHECK: the run may already have submitted the return itself.
    const continuationBasePrompt = () =>
      submissionMode !== "submit_and_capture_pdf"
        ? prompt
        : preparedDraft
          ? buildSubmitPreparedPrompt(preparedDraft, false)
          : buildFillPrompt(false);
    // Restated in every recovery/resume continuation of a run that reaches
    // the declaration step (submit, submit prepared, prepare with a contact).
    const noticeOfAssessmentRule = noticeOfAssessment
      ? buildNoticeOfAssessmentContinuationRule({
          answer: noticeOfAssessment,
          defaulted: isGuernseyNoticeOfAssessmentDefaulted(
            taxReturn.substanceForm,
          ),
          submitPrepared: isSubmitPrepared,
          prepareOnly: submissionMode === "prepare_only",
        })
      : "";
    const recoveryReturnUrl =
      taxReturn.link ||
      taxReturn.jurisdiction?.portalUrl ||
      "https://my.gov.gg";

    let prepareOnlyGuardStatus: PrepareOnlyGuardStatus =
      evaluatePrepareOnlyGuard({
        submissionMode,
        configuredExtensionId: PREPARE_ONLY_GUARD_EXTENSION_ID,
        installedExtensionIds: null,
      });
    if (prepareOnlyGuardStatus === "not_configured") {
      const refusal = prepareOnlyGuardFailure({
        status: prepareOnlyGuardStatus,
        required: PREPARE_ONLY_GUARD_REQUIRED,
      });
      if (refusal) {
        await log(refusal, { phase: "guardrail" });
        await updateActiveJobRecord({
          resultDataPatch: { prepareOnlyGuard: prepareOnlyGuardStatus },
        });
        throw new Error(refusal);
      }
      await log(
        "Prepare-only guard explicitly disabled (BROWSER_USE_PREPARE_ONLY_GUARD_REQUIRED=false): final submission is prevented only by instructions and the event watchdog",
        { phase: "guardrail" },
      );
    }
    // Browser ids already verified to carry the guard, and when the browser
    // run currently awaiting verification was dispatched.
    const verifiedGuardBrowserIds = new Set<string>();
    let guardVerificationStartedAt = Date.now();

    // Browser tasks this job has dispatched (first run, then continuations).
    let browserTaskDispatchCount = 0;

    async function dispatchBrowserTask(
      task: string,
      sessionId?: string,
    ): Promise<BrowserUseSession> {
      const beforeDispatch = await db.query.jobs.findFirst({
        where: eq(jobs.id, runtime.jobId),
        columns: { status: true },
      });
      if (
        !beforeDispatch ||
        beforeDispatch.status === "cancelled" ||
        beforeDispatch.status === "paused" ||
        beforeDispatch.status === "failed"
      ) {
        throw new Error("Browser run cancelled before dispatch");
      }
      if (!sessionId) {
        await updateActiveJobRecord({
          resultDataPatch: {
            browserUseStartupPhase: "dispatching",
            startupStartedAt: Date.now(),
          },
        });
      }
      if (
        submissionMode === "submit_and_capture_pdf" &&
        (typeof runtime.resultData[SUBMIT_DISPATCHED_KEY] !== "number" ||
          (isSubmitPrepared &&
            typeof runtime.resultData[SUBMIT_PREPARED_DISPATCHED_KEY] !==
              "number"))
      ) {
        // Durable before dispatch (a failed write aborts it): from here the
        // run may reach Submit, so a later submit run is cautioned about it
        // (and checks the portal first) unless it saves a receipt, and its
        // browser is stopped before a later submit run starts. Submit
        // prepared return runs keep their original key too.
        const dispatchedAt = Date.now();
        await updateActiveJobRecord({
          resultDataPatch: {
            ...(typeof runtime.resultData[SUBMIT_DISPATCHED_KEY] !== "number"
              ? { [SUBMIT_DISPATCHED_KEY]: dispatchedAt }
              : {}),
            ...(isSubmitPrepared &&
            typeof runtime.resultData[SUBMIT_PREPARED_DISPATCHED_KEY] !==
              "number"
              ? { [SUBMIT_PREPARED_DISPATCHED_KEY]: dispatchedAt }
              : {}),
          },
        });
      }
      // Every dispatch after the first continues this run (resume,
      // recovery): its prompt and outcome must not treat a submission this
      // run may already have made as someone else's.
      browserTaskDispatchCount += 1;
      const started = await client.runTask(task, {
        sessionId,
        profile: runProfile,
        workspaceId: workspaceId ?? undefined,
        proxyCountryCode: useProxy ? "uk" : null,
        extensionIds:
          submissionMode === "prepare_only" && PREPARE_ONLY_GUARD_EXTENSION_ID
            ? [PREPARE_ONLY_GUARD_EXTENSION_ID]
            : undefined,
      });
      if (prepareOnlyGuardStatus === "requested") {
        guardVerificationStartedAt = Date.now();
      }
      try {
        await updateActiveJobRecord({
          resultDataPatch: {
            browserUseApiVersion: 4,
            browserUseSessionId: started.id,
            sessionId: started.id,
            browserUseRunId: started.runId,
            browserUseBrowserId: started.browserId,
            workspaceId: started.workspaceId,
            liveUrl: started.liveUrl,
            prepareOnlyGuard: prepareOnlyGuardStatus,
            // As reported by Browser Use for this run (checked against the profile).
            browserUseModel: started.model ?? runProfile.model,
            browserTaskDispatchCount,
          },
        });
      } catch (error) {
        await client.stopSession(started.id, "session");
        throw error;
      }
      return started;
    }

    // ── Human in the loop ─────────────────────────────────────────────
    // While paused the worker records what it is waiting on; a reviewer's
    // reply (stored by the web app under the web-owned `operatorMessages`
    // key) is handed to the next run in the SAME Browser Use session.
    async function recordPendingQuestion(
      reason: AgentQuestionReason,
      text: string,
    ): Promise<AgentQuestion> {
      const askedAt = Date.now();
      const question: AgentQuestion = {
        id: `q-${askedAt}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        askedAt,
        reason,
        expiresAt: askedAt + MAX_PAUSE_DURATION_MS,
      };
      await updateActiveJobRecord({
        resultDataPatch: { pendingQuestion: question },
      });
      return question;
    }

    // Progress the worker already has, used to answer chat/status questions
    // without stopping the browser run (see classifyOperatorMessage).
    const recentAgentUpdates: string[] = [];
    let runStartedAt: number | null = null;
    // Delivered reviewer questions still waiting for the agent's own answer.
    let awaitingAgentReplyIds: string[] = [];

    function rememberAgentUpdate(summary: string) {
      const text = summary.trim();
      // Browser Use falls back to raw event types ("browser.ready").
      if (!text || /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i.test(text)) return;
      if (recentAgentUpdates[recentAgentUpdates.length - 1] === text) return;
      recentAgentUpdates.push(text);
      if (recentAgentUpdates.length > 10) recentAgentUpdates.shift();
    }

    /** Answer pending chat/status questions; never touches the browser run. */
    async function answerStatusQuestions(
      resultData: unknown,
      phase: "running" | "paused",
    ): Promise<void> {
      const pending = getPendingStatusQuestions(resultData);
      if (pending.length === 0) return;
      const now = Date.now();
      const content = buildStatusReply({
        phase,
        recentUpdates: recentAgentUpdates,
        stepCount: session?.stepCount ?? 0,
        runStartedAt,
        now,
        question: phase === "paused" ? parsePendingAgentQuestion(resultData) : null,
      });
      const ids = pending.map((message) => message.id);
      try {
        await db
          .update(jobs)
          .set({
            resultData: markOperatorMessagesDeliveredSql({
              ids,
              runId: session?.runId ?? null,
              deliveredAt: now,
              reply: { content, createdAt: now, source: "worker" },
            }),
          })
          .where(eq(jobs.id, runtime.jobId));
        await log("Answered reviewer status question without pausing", {
          count: ids.length,
          phase,
        });
        await publishJobEvent({
          type: "job:operator_reply",
          jobId: runtime.jobId,
          timestamp: now,
          data: { messageIds: ids },
        });
      } catch (error) {
        await log("Failed to answer reviewer status question", {
          count: ids.length,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    /** Attach the agent's "Reply to reviewer:" text to the questions it answers. */
    async function captureAgentReply(texts: string[]): Promise<void> {
      if (awaitingAgentReplyIds.length === 0) return;
      const content = texts
        .map((text) => extractAgentReplyToReviewer(text))
        .find((reply): reply is string => reply !== null);
      if (!content) return;
      const ids = awaitingAgentReplyIds;
      awaitingAgentReplyIds = [];
      const now = Date.now();
      try {
        await db
          .update(jobs)
          .set({
            resultData: setAgentReplySql({
              ids,
              reply: { content, createdAt: now, source: "agent" },
            }),
          })
          .where(eq(jobs.id, runtime.jobId));
        await log("Recorded the agent's answer to a reviewer question", {
          count: ids.length,
        });
        await publishJobEvent({
          type: "job:operator_reply",
          jobId: runtime.jobId,
          timestamp: now,
          data: { messageIds: ids },
        });
      } catch (error) {
        await log("Failed to record the agent's answer", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    /** One pause-loop check: resume, stop waiting, or keep waiting. */
    async function checkPausedJob(): Promise<
      "resume" | "cancelled" | "ended" | "wait"
    > {
      const row = await db.query.jobs.findFirst({
        where: eq(jobs.id, runtime.jobId),
        columns: { status: true, resultData: true },
      });
      if (!row || row.status === "failed") return "ended";
      if (row.status === "cancelled") return "cancelled";
      if (row.status === "running") return "resume";
      if (row.status === "paused") {
        await answerStatusQuestions(row.resultData, "paused");
      }
      if (
        row.status === "paused" &&
        getPendingOperatorMessages(row.resultData).length > 0
      ) {
        // A reply sent while the agent was running (or that raced the agent
        // pausing): the worker owns paused -> running, so the run has
        // already been stopped when it resumes.
        const claimed = await db
          .update(jobs)
          .set({ status: "running" })
          .where(
            sql`${jobs.id} = ${runtime.jobId} AND ${jobs.status} = 'paused'`,
          )
          .returning({ id: jobs.id });
        if (claimed.length > 0) return "resume";
      }
      return "wait";
    }

    /**
     * A reply to the Net Book Value question is used only when the worker can
     * parse it as one clear amount; the worker applies the policy and rebuilds
     * the fill prompt, which keeps that answer for the rest of the session.
     * The agent never takes the value from free text. Returns rules to place
     * ahead of the continuation prompt.
     */
    async function resolveNetBookValueReply(
      pending: ReturnType<typeof getPendingOperatorMessages>,
      question: AgentQuestion | null,
    ): Promise<string> {
      if (netBookValueDecision?.kind !== "needs_review") return "";
      const replies = pending.filter((message) =>
        isNetBookValueQuestion(
          message.inReplyTo?.text ??
            (question?.reason === "agent_question" ? question.text : null),
        ),
      );
      if (replies.length === 0) return "";
      const parsed = replies
        .map((message) => portalNetBookValueFromReviewerReply(message.content))
        .filter((value) => value !== null);
      const values = new Set(parsed.map((value) => value.portalValue));
      if (values.size !== 1) {
        unclearNetBookValueReplies += 1;
        prompt = buildFillPrompt();
        await updateActiveJobRecord({
          resultDataPatch: { [PORTAL_NET_BOOK_VALUE_KEY]: netBookValueRecord() },
        });
        await log("Reviewer Net Book Value reply was not one clear amount", {
          replies: replies.length,
          unclearReplies: unclearNetBookValueReplies,
          keptEarlierAnswer: Boolean(reviewerNetBookValue),
        });
        // A confirmed answer is never reset by an unclear follow-up.
        const keep = reviewerNetBookValue
          ? `Keep the Net Book Value already confirmed ("${reviewerNetBookValue.portalValue}"); do not change it because of this reply.`
          : unclearNetBookValueReplies >= MAX_UNCLEAR_NET_BOOK_VALUE_REPLIES
            ? "Do NOT type a Net Book Value from it and do NOT ask about it again: leave the field as the portal shows it and continue as SECTION 4 below says."
            : "Do NOT type a Net Book Value from it. Leave the field as the portal shows it and ask the Net Book Value question in SECTION 4 below once more, asking for the amount only.";
        return `
## NET BOOK VALUE (set by LTS, overrides the reviewer's wording)
The reviewer's reply did not give one clear Net Book Value amount. ${keep}
`;
      }
      const resolved = parsed[0]!;
      reviewerNetBookValue = resolved;
      prompt = buildFillPrompt();
      await updateActiveJobRecord({
        resultDataPatch: { [PORTAL_NET_BOOK_VALUE_KEY]: netBookValueRecord() },
      });
      await log("Reviewer confirmed the Net Book Value", {
        negativeZeroed: resolved.negativeZeroed,
      });
      return `
## NET BOOK VALUE (set by LTS, overrides the reviewer's wording)
LTS read the reviewer's reply as the tangible-asset Net Book Value${resolved.negativeZeroed ? ". It is negative, so under LTS policy it is entered as 0" : ""}. Enter exactly "${resolved.portalValue}" in the Net Book Value field, then continue the task below. Change no other field because of this reply.
`;
    }

    /** Continue in the same browser session, delivering pending reviewer replies. */
    async function resumeSameSession(
      buildContinuation: (basePrompt: string) => string,
      sessionId: string,
    ): Promise<BrowserUseSession> {
      const row = await db.query.jobs.findFirst({
        where: eq(jobs.id, runtime.jobId),
        columns: { resultData: true },
      });
      const pending = getPendingOperatorMessages(row?.resultData);
      const question = parsePendingAgentQuestion(row?.resultData);
      const netBookValueRules = await resolveNetBookValueReply(
        pending,
        question,
      );
      const resumed = await dispatchBrowserTask(
        withOperatorMessages(
          `${netBookValueRules}${noticeOfAssessmentRule}${buildContinuation(continuationBasePrompt())}`,
          {
            messages: pending,
            question,
            submissionMode,
          },
        ),
        sessionId,
      );
      const resumedAt = Date.now();
      const deliveredIds = pending.map((message) => message.id);
      if (deliveredIds.length > 0) {
        try {
          // A visible acknowledgement under each message; questions also ask
          // the agent to answer ("Reply to reviewer:"), which replaces it.
          for (const interrupted of [true, false]) {
            for (const questionLike of [true, false]) {
              const ids = pending
                .filter(
                  (message) =>
                    (message.interrupt === true) === interrupted &&
                    isQuestionLike(message.content) === questionLike,
                )
                .map((message) => message.id);
              if (ids.length === 0) continue;
              await db
                .update(jobs)
                .set({
                  resultData: markOperatorMessagesDeliveredSql({
                    ids,
                    runId: resumed.runId ?? null,
                    deliveredAt: resumedAt,
                    reply: {
                      content: deliveryAcknowledgement({ questionLike, interrupted }),
                      createdAt: resumedAt,
                      source: "worker",
                    },
                  }),
                })
                .where(eq(jobs.id, runtime.jobId));
            }
          }
          awaitingAgentReplyIds = pending
            .filter((message) => isQuestionLike(message.content))
            .map((message) => message.id);
        } catch (error) {
          await log("Failed to mark reviewer messages delivered", {
            count: deliveredIds.length,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      await updateActiveJobRecord({
        resultDataPatch: { pendingQuestion: null, lastResumedAt: resumedAt },
      });
      // Counts and ids only: reviewer message content is client data.
      await log("Resumed agent in the same browser session", {
        sessionId: resumed.id,
        runId: resumed.runId,
        reviewerMessages: deliveredIds.length,
      });
      await publishJobEvent({
        type: "job:resumed",
        jobId: runtime.jobId,
        timestamp: resumedAt,
        data: {
          sessionId: resumed.id,
          liveUrl: resumed.liveUrl,
          deliveredMessageIds: deliveredIds,
        },
      });
      return resumed;
    }

    await log("Starting Browser Use V4 run", {
      model: runProfile.model,
      effort: modelTakesNoParams(runProfile.model) ? null : runProfile.effort,
      maxCostUsd: runProfile.maxCostUsd,
      submissionMode,
    });
    session = await dispatchBrowserTask(prompt);
    runStartedAt = Date.now();
    workspaceId = session.workspaceId;
    receiptRecovery = {
      client,
      sessionId: session.id,
      workspaceId,
      taxReturn,
      financialStatementsFile,
      baselineKeys: baselineBrowserFileKeys,
    };

    runtime.resultData = mergeResultData(runtime.resultData, {
      browserUseSessionId: session.id,
      sessionId: session.id,
      liveUrl: session.liveUrl ?? null,
      startupCompletedAt: Date.now(),
      startupError: null,
      lastHeartbeatAt: Date.now(),
    });

    await db
      .update(jobs)
      .set({
        status: "running",
        startedAt: new Date(),
        aiModel: session.model ?? runProfile.model,
        resultData: preserveWebOwnedResultDataSql(runtime.resultData),
      })
      .where(
        sql`${jobs.id} = ${runtime.jobId} AND ${jobs.status} <> 'cancelled'`,
      );

    await publishJobEvent({
      type: "job:started",
      jobId: runtime.jobId,
      timestamp: Date.now(),
      data: {
        liveUrl: session.liveUrl,
        sessionId: session.id,
        workspaceId,
        taxReturnId: runtime.taxReturnId,
        entityName: taxReturn.entityName,
        submissionMode,
      },
    });

    // Cancellation may arrive while the create-run request is in flight.
    const afterDispatch = await db.query.jobs.findFirst({
      where: eq(jobs.id, runtime.jobId),
      columns: { status: true },
    });
    if (afterDispatch?.status === "cancelled") {
      await client.stopSession(session.id, "session");
      return;
    }

    const startTime = Date.now();
    let lastStepCount = 0;
    let lastMessageId: string | null = null;
    let terminalStateHandled = false;
    let detachedBrowserRecoveryFailures = 0;
    let hasAttemptedDetachedBrowserRecovery = false;

    while (Date.now() - startTime < MAX_RUNTIME_MS) {
      await sleep(POLL_INTERVAL_MS);

      const currentJobStatus = await db.query.jobs.findFirst({
        where: eq(jobs.id, runtime.jobId),
        columns: { status: true, resultData: true },
      });

      if (currentJobStatus?.status === "cancelled") {
        await log("Job cancelled by user");
        try {
          await client.stopSession(session.id, "session");
        } catch {}
        terminalStateHandled = true;
        break;
      }

      if (currentJobStatus?.status === "running") {
        await answerStatusQuestions(currentJobStatus.resultData, "running");
      }

      if (currentJobStatus?.status === "paused") {
        const interrupted = hasPendingOperatorInterrupt(
          currentJobStatus.resultData,
        );
        await log(
          interrupted
            ? "Paused to deliver a reviewer message"
            : "Job paused by user - waiting for resume",
        );
        const pauseMessage = interrupted
          ? "Pausing the agent to pass on your message..."
          : "Task paused. Complete any manual actions in the browser, then resume or send the agent an instruction.";
        const pauseQuestion = await recordPendingQuestion(
          interrupted ? "operator_interrupt" : "user_pause",
          pauseMessage,
        );
        await publishJobEvent({
          type: "job:requires_attention",
          jobId: runtime.jobId,
          timestamp: Date.now(),
          data: {
            liveUrl: session.liveUrl,
            sessionId: session.id,
            message: pauseMessage,
            pendingQuestion: pauseQuestion,
          },
        });

        try {
          await client.stopSession(session.id, "task");
          const stoppedStatus = await waitForSessionToLeaveRunning(
            client,
            session.id,
          );
          if (stoppedStatus === "running") {
            throw new Error("Browser Use did not stop the run before the pause deadline");
          }
          await log("Pause stop request processed", {
            sessionId: session.id,
            sessionStatus: stoppedStatus,
          });
        } catch (error) {
          throw new Error(`Unable to safely pause Browser Use: ${error instanceof Error ? error.message : String(error)}`);
        }
        const pausedCursor = await syncProgressCursorAfterPause(
          client,
          session.id,
          lastMessageId,
          lastStepCount,
        );
        lastMessageId = pausedCursor.lastMessageId;
        lastStepCount = pausedCursor.lastStepCount;

        const pauseStartTime = Date.now();
        let resumed = false;
        let pauseChecks = 0;
        while (Date.now() - pauseStartTime < MAX_PAUSE_DURATION_MS) {
          // A reviewer message is already waiting: check once without delay.
          if (!(interrupted && pauseChecks === 0)) {
            await sleep(PAUSE_CHECK_INTERVAL_MS);
          }
          pauseChecks += 1;
          const pauseCheck = await checkPausedJob();

          if (pauseCheck === "resume") {
            await log("User resumed - continuing task");
            session = await resumeSameSession(
              (basePrompt) => `
Continue from where you left off. The user has completed any manual intervention or authentication.
Now proceed with the original task:

${basePrompt}
`,
              session.id,
            );
            resumed = true;
            break;
          }

          if (pauseCheck === "cancelled") {
            await log("Job cancelled during pause");
            try {
              await client.stopSession(session.id, "session");
            } catch {}
            terminalStateHandled = true;
            break;
          }

          if (pauseCheck === "ended") {
            break;
          }
        }

        if (terminalStateHandled) {
          break;
        }

        const finalCheck = await db.query.jobs.findFirst({
          where: eq(jobs.id, runtime.jobId),
          columns: { status: true },
        });
        if (!resumed || finalCheck?.status !== "running") {
          if (finalCheck?.status === "paused") {
            await log("Pause timeout - ending run, return needs review");
            await markActiveRuntimeAwaitingReview(
              "Timed out waiting for user intervention",
            );
            terminalStateHandled = true;
          }
          break;
        }

        continue;
      }

      const browserSession = await client.getSession(session.id);
      const newMessages = await client.getMessages(session.id, lastMessageId);
      session = browserSession;
      if (
        runtime.resultData.liveUrl !== session.liveUrl ||
        runtime.resultData.browserUseBrowserId !== session.browserId ||
        runtime.resultData.browserUseRunId !== session.runId
      ) {
        await updateActiveJobRecord({
          resultDataPatch: {
            browserUseApiVersion: 4,
            browserUseRunId: session.runId,
            browserUseBrowserId: session.browserId,
            liveUrl: session.liveUrl,
          },
        });
      }

      await log(
        "Poll cycle",
        {
          phase: "run",
          sessionStatus: browserSession.status,
          stepCount: browserSession.stepCount,
          messageCount: newMessages.messages.length,
          lastMessageId,
        },
        { publish: false },
      );

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
        rememberAgentUpdate(summary);
        await captureAgentReply([
          summary,
          ...Object.values(message.data ?? {}).filter(
            (value): value is string => typeof value === "string",
          ),
        ]);
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
            phase: "run",
            type: message.type,
            role: message.role,
            sessionId: session.id,
          },
          { publish: false },
        );
        lastMessageId = message.id;
      }

      if (
        submissionMode === "prepare_only" &&
        PREPARE_ONLY_GUARD_EXTENSION_ID
      ) {
        // Every browser (including one re-provisioned after a detach) must
        // be verified; until then the status is "requested".
        if (
          prepareOnlyGuardStatus === "verified_installed" &&
          session.browserId &&
          !verifiedGuardBrowserIds.has(session.browserId)
        ) {
          prepareOnlyGuardStatus = "requested";
          guardVerificationStartedAt = Date.now();
        }
        if (prepareOnlyGuardStatus === "requested" && session.browserId) {
          let installed: string[] | null = null;
          try {
            installed = await client.getBrowserExtensionIds(session.browserId);
          } catch (error) {
            await log("Prepare-only guard verification request failed", {
              phase: "guardrail",
              browserId: session.browserId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
          if (installed) {
            prepareOnlyGuardStatus = evaluatePrepareOnlyGuard({
              submissionMode,
              configuredExtensionId: PREPARE_ONLY_GUARD_EXTENSION_ID,
              installedExtensionIds: installed,
            });
            if (prepareOnlyGuardStatus === "verified_installed") {
              verifiedGuardBrowserIds.add(session.browserId);
            }
            await updateActiveJobRecord({
              resultDataPatch: {
                prepareOnlyGuard: prepareOnlyGuardStatus,
                prepareOnlyGuardCheckedAt: Date.now(),
                prepareOnlyGuardBrowserId: session.browserId,
              },
            });
            await log("Prepare-only guard verification", {
              phase: "guardrail",
              status: prepareOnlyGuardStatus,
              browserId: session.browserId,
            });
          }
        }
        // Fail closed: missing extension, or not verifiable in time.
        const guardFailure = prepareOnlyGuardFailure({
          status: prepareOnlyGuardStatus,
          required: PREPARE_ONLY_GUARD_REQUIRED,
          elapsedSinceDispatchMs: Date.now() - guardVerificationStartedAt,
        });
        if (guardFailure) {
          await updateActiveJobRecord({
            resultDataPatch: { prepareOnlyGuard: prepareOnlyGuardStatus },
          });
          await client.stopSession(session.id, "session");
          throw new Error(guardFailure);
        }
      }

      if (submissionMode === "prepare_only" && orderedMessages.length > 0) {
        const breach = detectPrepareOnlyBreach(orderedMessages);
        if (breach) {
          await log("Prepare-only breach detected - cancelling run", {
            phase: "guardrail",
            kind: breach.kind,
            evidence: breach.evidence,
          });
          try {
            await client.stopSession(session.id, "task");
          } catch {}
          let completionPdf: CompletionPdfIngestionResult | undefined;
          if (breach.kind === "submission_reported") {
            // It may really be filed: secure the receipt for recovery.
            completionPdf = await captureReceiptSafely({
              client,
              sessionId: session.id,
              workspaceId,
              taxReturn,
              financialStatementsFile,
              baselineKeys: baselineBrowserFileKeys,
            });
            if (completionPdf.status !== "uploaded") {
              retainWorkspaceForRecovery = true;
            }
            await recordFiledReturnPdfOutcome({
              taxReturnId: runtime.taxReturnId,
              sessionId: session.id,
              workspaceId,
              browserIds: await listBrowserIdsSafely(client, session.id),
              completionPdf,
              // Blocks a later submit run until staff check the portal.
              receiptGate: "prepare_only_submission_reported",
              workspaceRetained: retainWorkspaceForRecovery,
            });
          }
          await updateActiveJobRecord({
            resultDataPatch: {
              prepareOnlyBreach: { ...breach, detectedAt: Date.now() },
              prepareOnlyLikelySubmitted:
                breach.kind === "submission_reported" || undefined,
              completionPdf,
            },
          });
          await publishJobEvent({
            type: "job:failed",
            jobId: runtime.jobId,
            timestamp: Date.now(),
            data: {
              error: "Prepare-only run attempted or reported a final submission",
              prepareOnlyBreach: breach,
              completionPdf,
            },
          });
          await markActiveRuntimeAwaitingReview(
            breach.kind === "submission_attempt_blocked"
              ? "Prepare-only guard blocked a final submission attempt; run cancelled"
              : "Prepare-only run reported a submission; run cancelled and receipt checked",
          );
          terminalStateHandled = true;
          break;
        }
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
            phase: "run",
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
              phase: "recovery",
              sessionId: session.id,
              recoveryReturnUrl,
              failureCount: detachedBrowserRecoveryFailures,
            },
          );

          try {
            await client.stopSession(session.id, "task");
            await waitForSessionToLeaveRunning(client, session.id);
          } catch {}

          const recoveryPrompt = isSubmitPrepared
            ? `
The browser entered an unstable state after a bad click or detached tab.

RECOVERY RULES:
- Use the browser controls exposed by this session's current tool schema; do not invoke unavailable helpers such as get_tabs.
- Switch back to the main Guernsey portal tab or close the stray tab. If you cannot recover it quickly, follow step 1 of the task below to reopen the prepared draft.
- Then follow **SUBMISSION STATUS** in the task below before anything else: this run may already have submitted the return.
- If it is not submitted, follow the task below from step 1. Do not edit any section.
${noticeOfAssessmentRule}
Continue the original task now:

${continuationBasePrompt()}
`
            : `
The browser entered an unstable state after a bad click or detached tab.

RECOVERY RULES:
- Use the browser controls exposed by this session's current tool schema and their documented signatures.
- Do not assume legacy V3 tool names or invoke unavailable helpers such as get_tabs.
- If a stray tab or blank page is open, switch back to the main Guernsey portal tab or close the stray tab using the available controls.
- If you cannot recover the portal tab quickly, return directly to: ${recoveryReturnUrl}
- If you land on a page ending in reviewAndSubmit/summary, ${
            submissionMode === "submit_and_capture_pdf"
              ? "treat it as a draft summary until every section has been rechecked in this run. Only use the final submit path after the filing is fully validated and you are ready to download the portal-generated completion PDF."
              : "this is a saved draft summary. Do NOT click Submit, Confirm, Print, or Download from that page."
          }${
            submissionMode === "prepare_only"
              ? " On reviewAndSubmit/declaration, never click Complete submission to Revenue Service or any final filing action."
              : ""
          }
${
            submissionMode === "submit_and_capture_pdf"
              ? "- Before any Change or Edit link, follow **SUBMISSION STATUS** in the task below: if the portal shows this return submitted, do not reopen or edit any section.\n"
              : ""
          }- From the summary page, use a Change or Edit link to reopen the filing sections and continue the return.
- Verify the Financial Statements / Accounts upload before leaving that section, and do not continue while the control still says "No file chosen".
${noticeOfAssessmentRule}
Continue the original task now:

${continuationBasePrompt()}
`;

          session = await dispatchBrowserTask(recoveryPrompt, session.id);
          hasAttemptedDetachedBrowserRecovery = true;
          detachedBrowserRecoveryFailures = 0;
          continue;
        }

        const focusFailureMessage =
          "Browser Use lost browser focus repeatedly after a detached tab/blank page and could not recover automatically.";

        await log(focusFailureMessage, {
          phase: "recovery",
          sessionId: session.id,
          failureCount: detachedBrowserRecoveryFailures,
        });

        await publishJobEvent({
          type: "job:failed",
          jobId: runtime.jobId,
          timestamp: Date.now(),
          data: {
            error: focusFailureMessage,
            browserUseSessionId: session.id,
            liveUrl: session.liveUrl,
          },
        });

        await markActiveRuntimeFailed(focusFailureMessage);

        try {
          await client.stopSession(session.id, "task");
        } catch {}

        terminalStateHandled = true;
        break;
      }

      if (isTerminalSessionStatus(browserSession.status)) {
        // Check if the job was cancelled in the DB before treating as success
        const jobStatusCheck = await db.query.jobs.findFirst({
          where: eq(jobs.id, runtime.jobId),
          columns: { status: true, resultData: true },
        });
        if (jobStatusCheck?.status === "cancelled") {
          await log("Job cancelled by user (detected at terminal state)");
          terminalStateHandled = true;
          break;
        }

        const output = normalizeBrowserUseOutput(browserSession.output);
        const outcome = classifyRunOutcome({
          submissionMode,
          sessionStatus: browserSession.status,
          output,
          isTaskSuccessful: browserSession.isTaskSuccessful,
          browserTaskCount: browserTaskDispatchCount,
        });
        const { success, prepareOnlyReady, prepareOnlyLikelySubmitted } =
          outcome;

        // Recorded spend, for budget tuning and to recognise a run stopped by
        // its session budget. Best effort: never blocks the outcome.
        let sessionSpend: Awaited<
          ReturnType<typeof client.getSessionSpend>
        > | null = null;
        try {
          sessionSpend = await client.getSessionSpend(session.id);
        } catch (error) {
          await log("Could not read Browser Use session cost", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
        // A run out of budget is never re-driven or switched to another
        // model: no follow-up, no pause for a reply that could not run. It
        // ends through the normal path (receipt capture included).
        const budgetExhausted =
          !success &&
          isBudgetExhausted({
            runError: browserSession.runError,
            budgetSpentUsd: sessionSpend?.budgetSpentUsd ?? null,
            maxCostUsd: runProfile.maxCostUsd,
          });
        // A run that found the return already submitted on the portal is
        // never paused for a reply (resuming would re-drive a submit run on a
        // filed return): it ends now, any filed-return PDF it downloaded is
        // captured, and the return is held for review.
        const needsAttention =
          outcome.needsAttention &&
          !budgetExhausted &&
          !outcome.portalReportsSubmitted;
        await updateActiveJobRecord({
          resultDataPatch: {
            browserUseSessionBudgetSpentUsd:
              sessionSpend?.budgetSpentUsd ?? undefined,
            browserUseSessionTotalCostUsd:
              sessionSpend?.totalCostUsd ?? undefined,
            browserUseBudgetExhausted: budgetExhausted || undefined,
          },
        });
        if (budgetExhausted) {
          await log(
            "Browser Use session budget reached - ending without retry",
            {
              phase: "budget",
              maxCostUsd: runProfile.maxCostUsd,
              budgetSpentUsd: sessionSpend?.budgetSpentUsd ?? null,
              model: runProfile.model,
            },
          );
        }
        // Only a prepare-only run started without a configured contact may
        // stop at the contact step and be resumed past it.
        const stoppedForFilingContact =
          outcome.needsFilingContact &&
          submissionMode === "prepare_only" &&
          !filingContactInfo;

        if (prepareOnlyLikelySubmitted) {
          await log("Prepare-only run appears to have submitted anyway", {
            phase: "guardrail",
            output,
          });
        }
        if (outcome.alreadySubmitted) {
          await log(
            "Portal shows the return already submitted - not submitting; holding the return for review",
            { phase: "guardrail", output },
          );
        } else if (outcome.portalReportsSubmitted) {
          await log(
            "Portal shows the return submitted after a continuation of this run - it may be this run's submission; holding the return for review",
            { phase: "guardrail", output, browserTaskDispatchCount },
          );
        }

        // A reviewer reply can land as the run stops (e.g. pause then reply
        // before this worker saw the pause). Deliver it in the same session
        // rather than finishing. Prepare-only runs only: a submit-mode run
        // may have filed without saying so, and must never be re-driven.
        const undeliveredReplies = getPendingOperatorMessages(
          jobStatusCheck?.resultData,
        );
        if (
          undeliveredReplies.length > 0 &&
          submissionMode === "prepare_only" &&
          !needsAttention &&
          !budgetExhausted &&
          !outcome.likelySubmitted &&
          jobStatusCheck?.status === "running"
        ) {
          await log("Reviewer message waiting at run end - continuing", {
            reviewerMessages: undeliveredReplies.length,
          });
          session = await resumeSameSession(
            (basePrompt) =>
              buildResumePrompt(basePrompt, { afterFilingContactStop: false }),
            session.id,
          );
          continue;
        }

        if (needsAttention) {
          await log("Task requires user attention - pausing", {
            output,
            stoppedForFilingContact,
          });

          const askedAt = Date.now();
          // The Net Book Value question is shown as LTS wrote it: providers
          // sometimes wrap it in a long run recap. The full output stays on
          // the job (output / pauseReason) as evidence.
          const questionText =
            (stoppedForFilingContact
              ? null
              : netBookValuePauseQuestion({
                  output,
                  decision: netBookValueDecision,
                  savedValue: taxReturn.substanceForm.netBookValue,
                })) ?? extractAgentQuestionText(output);
          const agentQuestion: AgentQuestion = {
            id: `q-${askedAt}-${Math.random().toString(36).slice(2, 8)}`,
            text: questionText,
            askedAt,
            reason: stoppedForFilingContact ? "filing_contact" : "agent_question",
            expiresAt: askedAt + MAX_PAUSE_DURATION_MS,
          };

          await publishJobEvent({
            type: "job:requires_attention",
            jobId: runtime.jobId,
            timestamp: askedAt,
            data: {
              output,
              pendingQuestion: agentQuestion,
              browserUseSessionId: session.id,
              liveUrl: session.liveUrl,
              sessionId: session.id,
              message: stoppedForFilingContact
                ? FILING_CONTACT_PAUSE_MESSAGE
                : "Agent needs user intervention. The browser session is still active - please complete the required action (e.g., login) and resume.",
              needsFilingContact: stoppedForFilingContact || undefined,
            },
          });

          await updateActiveJobRecord({
            set: {
              status: "paused",
            },
            resultDataPatch: {
              output,
              browserUseSessionId: session.id,
              liveUrl: session.liveUrl,
              sessionId: session.id,
              pausedAt: askedAt,
              pauseReason: output,
              pendingQuestion: agentQuestion,
              needsFilingContact: stoppedForFilingContact || undefined,
            },
          });

          if (stoppedForFilingContact) {
            // The draft is parked on the contact step waiting for a person:
            // the return needs review now, not only once the pause expires.
            await setTaxReturnStatusUnlessCompleted(
              runtime.taxReturnId,
              "review_required",
            );
          }

          await log("Waiting for user to complete action and resume...");
          const pauseStartTime = Date.now();

          while (Date.now() - pauseStartTime < MAX_PAUSE_DURATION_MS) {
            await sleep(PAUSE_CHECK_INTERVAL_MS);

            const pauseCheck = await checkPausedJob();

            if (pauseCheck === "resume") {
              await log(
                "User resumed - creating new Browser Use run to continue",
              );

              session = await resumeSameSession(
                (basePrompt) =>
                  buildResumePrompt(basePrompt, {
                    afterFilingContactStop: stoppedForFilingContact,
                  }),
                session.id,
              );

              break;
            }

            if (pauseCheck === "cancelled" || pauseCheck === "ended") {
              await log("Job was cancelled or failed during pause");
              break;
            }
          }

          const finalJobCheck = await db.query.jobs.findFirst({
            where: eq(jobs.id, runtime.jobId),
          });

          if (finalJobCheck?.status === "paused") {
            await log("Pause timeout - ending run, return needs review");
            await markActiveRuntimeAwaitingReview(
              stoppedForFilingContact
                ? FILING_CONTACT_REVIEW_REASON
                : "Timed out waiting for user intervention",
            );
            terminalStateHandled = true;
            break;
          }

          continue;
        }

        await log(
          success ? "Task completed successfully" : "Task finished with issues",
          {
            output,
            isSuccess: success,
            sessionStatus: browserSession.status,
            prepareOnlyReady,
            prepareOnlyLikelySubmitted,
          },
        );

        let completionPdf: CompletionPdfIngestionResult | undefined;
        const captureReceipt = shouldCaptureFiledReturnPdf(
          submissionMode,
          outcome,
        );
        if (captureReceipt) {
          completionPdf = await captureReceiptSafely({
            client,
            sessionId: session.id,
            workspaceId,
            taxReturn,
            financialStatementsFile,
            baselineKeys: baselineBrowserFileKeys,
          });
        }

        const finalStatuses = resolveFinalRunStatuses(
          submissionMode,
          outcome,
          completionPdf?.status ?? "not_attempted",
        );

        if (completionPdf) {
          // The return may already be filed with GRS: keep the Browser Use
          // workspace whenever the receipt was not saved, so it can be
          // recovered, and record the outcome on the return either way.
          if (completionPdf.status !== "uploaded") {
            retainWorkspaceForRecovery = true;
          }
          await recordFiledReturnPdfOutcome({
            taxReturnId: runtime.taxReturnId,
            sessionId: session.id,
            workspaceId,
            browserIds: await listBrowserIdsSafely(client, session.id),
            completionPdf,
            receiptGate: finalStatuses.receiptGate,
            workspaceRetained: retainWorkspaceForRecovery,
          });
        }

        if (finalStatuses.receiptGate) {
          await log("Return held for review: filed-return receipt gate", {
            phase: "guardrail",
            receiptGate: finalStatuses.receiptGate,
            receiptStatus: completionPdf?.status ?? "not_attempted",
          });
        }

        await publishJobEvent({
          type: success ? "job:completed" : "job:failed",
          jobId: runtime.jobId,
          timestamp: Date.now(),
          data: {
            output,
            isSuccess: success,
            browserUseSessionId: session.id,
            completionPdf,
            receiptGate: finalStatuses.receiptGate,
          },
        });

        // Don't overwrite a "cancelled" status set by the user
        const preUpdateJob = await db.query.jobs.findFirst({
          where: eq(jobs.id, runtime.jobId),
          columns: { status: true },
        });
        if (preUpdateJob?.status !== "cancelled") {
          // prepare_only success means: the agent reached the review/submit page
          // and left it ready for a human. The TASK is done, but the TAX RETURN
          // still needs human review (`review_required`). Submit mode only
          // completes the return when the filed-return receipt was saved.
          await setTaxReturnStatusUnlessCompleted(
            runtime.taxReturnId,
            finalStatuses.taxReturnStatus,
          );
          await db
            .update(tasks)
            .set({ status: finalStatuses.taskStatus })
            .where(eq(tasks.id, runtime.taskId));
          await updateActiveJobRecord({
            set: {
              status: finalStatuses.jobStatus,
              completedAt: new Date(),
              ...(outcome.alreadySubmitted
                ? { errorMessage: ALREADY_SUBMITTED_JOB_MESSAGE }
                : outcome.portalReportsSubmitted
                  ? { errorMessage: SUBMITTED_AFTER_CONTINUATION_JOB_MESSAGE }
                  : budgetExhausted
                    ? {
                        errorMessage: `Browser Use session budget (USD ${runProfile.maxCostUsd}) reached; the run was stopped and not retried. Review the return before starting a new run.`,
                      }
                    : {}),
            },
            resultDataPatch: {
              output,
              browserUseSessionId: session.id,
              liveUrl: session.liveUrl,
              workspaceId,
              completionPdf,
              receiptGate: finalStatuses.receiptGate,
              prepareOnlyReadyAt:
                success && prepareOnlyReady ? Date.now() : undefined,
              // Identity of the draft left on the review page, for a later
              // "Submit prepared return" run.
              preparedDraft:
                success && prepareOnlyReady
                  ? ({
                      version: 1,
                      preparedAt: Date.now(),
                      inputFingerprint,
                      ...parsePreparedDraftOutput(output),
                    } satisfies PreparedDraftRecord)
                  : undefined,
              prepareOnlyLikelySubmitted:
                prepareOnlyLikelySubmitted || undefined,
              // Checked before "Submit prepared return" (prepared-draft).
              [PORTAL_NET_BOOK_VALUE_KEY]: netBookValueRecord(),
            },
          });
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
      await log(timeoutMessage, { sessionId: session.id });
      await publishJobEvent({
        type: "job:failed",
        jobId: runtime.jobId,
        timestamp: Date.now(),
        data: { error: timeoutMessage, browserUseSessionId: session.id },
      });
      await markActiveRuntimeFailed(timeoutMessage);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

    await log("Fatal error", { error: errorMessage });

    if (receiptRecovery && runtime.submissionMode === "submit_and_capture_pdf") {
      const completionPdf = await captureReceiptSafely(receiptRecovery);
      if (completionPdf.status !== "uploaded") {
        retainWorkspaceForRecovery = true;
      }
      try {
        await recordFiledReturnPdfOutcome({
          taxReturnId: runtime.taxReturnId,
          sessionId: receiptRecovery.sessionId,
          workspaceId: receiptRecovery.workspaceId,
          browserIds: await listBrowserIdsSafely(
            receiptRecovery.client,
            receiptRecovery.sessionId,
          ),
          completionPdf,
          receiptGate:
            completionPdf.status === "uploaded"
              ? "receipt_from_unsuccessful_run"
              : null,
          workspaceRetained: retainWorkspaceForRecovery,
        });
      } catch {}
      if (completionPdf.status === "uploaded") {
        // A receipt exists, so the portal probably accepted the filing:
        // hold for a human instead of reporting the return as failed.
        await publishJobEvent({
          type: "job:failed",
          jobId: runtime.jobId,
          timestamp: Date.now(),
          data: { error: errorMessage, completionPdf },
        });
        await markActiveRuntimeAwaitingReview(
          `Run errored after a filed-return receipt was saved: ${errorMessage}`,
        );
        return;
      }
    }
    await publishJobEvent({
      type: "job:failed",
      jobId: runtime.jobId,
      timestamp: Date.now(),
      data: { error: errorMessage },
    });
    await markActiveRuntimeFailed(errorMessage);
  } finally {
    clearInterval(heartbeat);

    if (session) {
      try {
        await client.stopSession(session.id);
        await log("Session stopped");
      } catch {}
    }

    if (workspaceId && retainWorkspaceForRecovery) {
      await log("Workspace retained to recover the filed return PDF", {
        workspaceId,
      });
    } else if (workspaceId) {
      try {
        await client.deleteWorkspace(workspaceId);
        await log("Workspace archived", { workspaceId });
      } catch {}
    }

    activeRuntime = null;
  }
}

async function runWorkerLoop() {
  while (!shuttingDown) {
    const claimedJob = await claimNextQueuedJob();
    if (!claimedJob) {
      await sleep(BROWSER_JOB_POLL_INTERVAL_MS);
      continue;
    }

    await runBrowserJob(claimedJob);
  }
}

async function failActiveRuntimeForShutdown() {
  const runtime = getActiveRuntime();
  if (!runtime) {
    return;
  }

  const shutdownMessage =
    "Browser worker interrupted during ECS shutdown or deployment";
  try {
    await markActiveRuntimeFailed(shutdownMessage);
  } catch (error) {
    console.error("Failed to mark active browser job as interrupted", error);
  }

  const sessionId =
    typeof runtime.resultData.sessionId === "string"
      ? runtime.resultData.sessionId
      : typeof runtime.resultData.browserUseSessionId === "string"
        ? runtime.resultData.browserUseSessionId
        : null;

  if (sessionId) {
    try {
      const client = new BrowserUseClient(BROWSER_USE_API_KEY);
      await client.stopSession(sessionId, "session");
    } catch (error) {
      console.error(
        "Failed to stop active Browser Use session on shutdown",
        error,
      );
    }
  }
}

async function main() {
  workerMetadata = await loadWorkerMetadata();

  await log("Browser worker booting", {
    workerMode: WORKER_MODE,
    configuredSingleJobId: ENV_JOB_ID || null,
    configuredTaxReturnId: ENV_TAX_RETURN_ID || null,
    workerTaskArn: workerMetadata.workerTaskArn,
    workerLogStream: workerMetadata.workerLogStream,
  });

  if (!BROWSER_USE_API_KEY) {
    await log("ERROR: BROWSER_USE_API_KEY is required");
    process.exit(1);
  }

  process.on("SIGTERM", () => {
    shuttingDown = true;
    void failActiveRuntimeForShutdown().finally(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    shuttingDown = true;
    void failActiveRuntimeForShutdown().finally(() => process.exit(0));
  });

  if (WORKER_MODE === "single") {
    const runtime = await prepareSingleJobRuntime();
    await runBrowserJob(runtime);
    process.exit(0);
  }

  await runWorkerLoop();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
