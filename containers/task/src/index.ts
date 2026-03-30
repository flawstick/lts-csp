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
  type TaxReturnFileCategory,
  type TaxReturnFileRole,
} from "@repo/database";
import { publishJobEvent } from "@repo/redis";
import type { FileInfo as BrowserUseFileInfo } from "browser-use-sdk/v3";
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
const ENV_TAX_RETURN_ID = process.env.TAX_RETURN_ID || "";
const ENV_JOB_ID = process.env.JOB_ID || "";
const ENV_TASK_ID = process.env.TASK_ID || "";
const ENV_OVERRIDE_SAVED = process.env.OVERRIDE_SAVED === "true";
const ENV_SUBMISSION_MODE =
  process.env.SUBMISSION_MODE === "submit_and_capture_pdf"
    ? "submit_and_capture_pdf"
    : "prepare_only";
const BLOB_READ_WRITE_TOKEN = process.env.BLOB_READ_WRITE_TOKEN || "";
const BROWSER_USE_MODEL: BrowserUseModel = "bu-max";
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

const FILED_RETURN_PDF_KEYWORDS = [
  "return",
  "submission",
  "receipt",
  "confirmation",
  "confirm",
  "print",
  "download",
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

type SubmissionMode = "prepare_only" | "submit_and_capture_pdf";

type BrowserFileSource = "session" | "workspace";

type BrowserUseDownloadCandidate = {
  path: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
  source: BrowserFileSource;
  wasPresentAtBaseline: boolean;
  keywordMatches: string[];
  score: number;
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
  return (
    status === "idle" ||
    status === "stopped" ||
    status === "timed_out" ||
    status === "error"
  );
}

function normalizeResultData(
  value: unknown,
): Record<string, unknown> {
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
  runtime.resultData = mergeResultData(runtime.resultData, params.resultDataPatch);

  const nextValues: Record<string, unknown> = {
    ...(params.set ?? {}),
    resultData: runtime.resultData,
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
      resultData: runtime.resultData,
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

function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getPathBaseName(path: string): string {
  const normalized = path.split("?")[0] ?? path;
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function sanitizeFileBaseName(name: string, fallback: string): string {
  const withoutExtension = name.replace(/\.pdf$/i, "").trim();
  const safe = withoutExtension
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return safe || fallback;
}

function buildFiledReturnDisplayName(entityName: string, taxYear: number): string {
  const safeEntity = sanitizeFileBaseName(entityName, "return");
  return `${safeEntity}-${taxYear}-filed-return.pdf`;
}

function isPdfArtifact(file: { path: string; url?: string | null }): boolean {
  const haystack = `${file.path} ${file.url ?? ""}`.toLowerCase();
  return haystack.includes(".pdf") || haystack.includes("pdf");
}

function getBrowserFileBaselineKey(
  source: BrowserFileSource,
  path: string,
): string {
  return `${source}:${path}`;
}

function isFinancialStatementsArtifact(
  file: BrowserUseFileInfo,
  source: BrowserFileSource,
  financialStatementsFile: BrowserSessionInputFile | null,
): boolean {
  if (!financialStatementsFile) {
    return false;
  }

  if (
    source === "workspace" &&
    file.path === financialStatementsFile.sessionFilePath
  ) {
    return true;
  }

  const fileName = getPathBaseName(file.path).toLowerCase();
  return fileName === financialStatementsFile.sessionFileName.toLowerCase();
}

function scoreCompletionPdfCandidate(
  file: BrowserUseFileInfo,
  source: BrowserFileSource,
  baselineKeys: Set<string>,
): BrowserUseDownloadCandidate | null {
  if (!file.url || !isPdfArtifact(file)) {
    return null;
  }

  const name = getPathBaseName(file.path);
  const haystack = `${file.path} ${name}`.toLowerCase();
  const keywordMatches = FILED_RETURN_PDF_KEYWORDS.filter((token) =>
    haystack.includes(token),
  );
  const wasPresentAtBaseline = baselineKeys.has(
    getBrowserFileBaselineKey(source, file.path),
  );
  const score =
    (wasPresentAtBaseline ? 0 : 100) +
    keywordMatches.length * 20 +
    (source === "session" ? 10 : 0) +
    Math.floor(toTimestamp(file.lastModified) / 1_000);

  return {
    path: file.path,
    name,
    size: file.size,
    lastModified: file.lastModified,
    url: file.url,
    source,
    wasPresentAtBaseline,
    keywordMatches,
    score,
  };
}

function buildCompletionPdfCandidates(params: {
  sessionFiles: BrowserUseFileInfo[];
  workspaceFiles: BrowserUseFileInfo[];
  baselineKeys: Set<string>;
  financialStatementsFile: BrowserSessionInputFile | null;
}): BrowserUseDownloadCandidate[] {
  const candidates: BrowserUseDownloadCandidate[] = [];

  for (const file of params.sessionFiles) {
    if (
      isFinancialStatementsArtifact(file, "session", params.financialStatementsFile)
    ) {
      continue;
    }

    const candidate = scoreCompletionPdfCandidate(
      file,
      "session",
      params.baselineKeys,
    );

    if (candidate) {
      candidates.push(candidate);
    }
  }

  for (const file of params.workspaceFiles) {
    if (
      isFinancialStatementsArtifact(
        file,
        "workspace",
        params.financialStatementsFile,
      )
    ) {
      continue;
    }

    const candidate = scoreCompletionPdfCandidate(
      file,
      "workspace",
      params.baselineKeys,
    );

    if (candidate) {
      candidates.push(candidate);
    }
  }

  return candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    const timeDiff =
      toTimestamp(right.lastModified) - toTimestamp(left.lastModified);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    return left.path.localeCompare(right.path);
  });
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
  const { client, sessionId, workspaceId, financialStatementsFile, baselineKeys } =
    params;

  const sessionFiles = await client.getAllSessionFiles(sessionId);
  const workspaceFiles = workspaceId
    ? await client.getAllWorkspaceFiles(workspaceId)
    : [];

  await params.logFn("Collected Browser Use files after submission", {
    sessionFileCount: sessionFiles.length,
    workspaceFileCount: workspaceFiles.length,
  });

  const candidates = buildCompletionPdfCandidates({
    sessionFiles,
    workspaceFiles,
    baselineKeys,
    financialStatementsFile,
  });

  await params.logFn("Discovered completion PDF candidates", {
    candidateCount: candidates.length,
    candidates: candidates.map((candidate) => ({
      path: candidate.path,
      name: candidate.name,
      source: candidate.source,
      wasPresentAtBaseline: candidate.wasPresentAtBaseline,
      keywordMatches: candidate.keywordMatches,
      lastModified: candidate.lastModified,
      score: candidate.score,
    })),
  });

  const selectedCandidate = candidates[0];
  if (!selectedCandidate) {
    return {
      status: "missing",
      error: "No downloadable completion PDF was found in the Browser Use files.",
    };
  }

  await params.logFn("Selected completion PDF candidate", {
    path: selectedCandidate.path,
    name: selectedCandidate.name,
    source: selectedCandidate.source,
    lastModified: selectedCandidate.lastModified,
    keywordMatches: selectedCandidate.keywordMatches,
  });

  if (!BLOB_READ_WRITE_TOKEN) {
    return {
      status: "failed",
      error: "BLOB_READ_WRITE_TOKEN is missing in the browser task environment.",
      browserUsePath: selectedCandidate.path,
      browserUseUrl: selectedCandidate.url,
    };
  }

  const response = await fetch(selectedCandidate.url);
  if (!response.ok) {
    return {
      status: "failed",
      error: `Failed to download completion PDF from Browser Use: ${response.status}`,
      browserUsePath: selectedCandidate.path,
      browserUseUrl: selectedCandidate.url,
    };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const now = new Date();
  const uploadedAt = now.toISOString();
  const blobPath = `portal/${params.orgId}/${params.taxReturnId}/supporting/${now.getTime()}-filed-return.pdf`;

  const blob = await put(
    blobPath,
    new Blob([buffer], { type: "application/pdf" }),
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
      browserUseUrl: selectedCandidate.url,
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

async function persistClaimMetadata(runtime: ActiveJobRuntime) {
  const now = Date.now();
  runtime.resultData = mergeResultData(runtime.resultData, {
    submissionMode: runtime.submissionMode,
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
      resultData: runtime.resultData,
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
    throw new Error("JOB_ID, TASK_ID, and TAX_RETURN_ID are required in single mode");
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

async function initializeBrowserUseSession(
  client: BrowserUseClient,
  useProxy: boolean,
) {
  const runtime = getRequiredRuntime();
  const deadline = Date.now() + runtime.startupTimeoutMs;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= 2 && Date.now() < deadline; attempt += 1) {
    let createdSessionId: string | null = null;

    try {
      await publishStatus("starting", {
        goal: "Connecting Browser Use session",
        message: "Connecting Browser Use session",
      });

      await log("Creating Browser Use session", {
        phase: "startup",
        attempt,
        useProxy,
      });

      const session = await client.createSession({
        ...(useProxy && { proxyCountryCode: "uk" as const }),
      });
      createdSessionId = session.id;

      if (!session.id) {
        throw new Error("Browser Use did not return a session id");
      }

      const sessionDetails = await client.getSession(session.id);
      const liveUrl = session.liveUrl || sessionDetails.liveUrl;
      if (!liveUrl) {
        throw new Error("Browser Use did not return a live URL");
      }

      await client.getMessages(session.id, null);

      return {
        ...sessionDetails,
        id: session.id,
        liveUrl,
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error : new Error(String(error));

      await log("Browser Use startup attempt failed", {
        phase: "startup",
        attempt,
        error: lastError.message,
      });

      if (createdSessionId) {
        try {
          await client.stopSession(createdSessionId, "session");
        } catch {}
      }

      if (attempt >= 2 || Date.now() >= deadline) {
        break;
      }
    }
  }

  throw lastError ?? new Error("Browser Use session failed to initialize");
}

async function markActiveRuntimeFailed(errorMessage: string) {
  const runtime = getRequiredRuntime();
  runtime.resultData = mergeResultData(runtime.resultData, {
    startupError: errorMessage,
    lastHeartbeatAt: Date.now(),
  });

  await db
    .update(taxReturns)
    .set({ status: "failed" })
    .where(eq(taxReturns.id, runtime.taxReturnId));

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
      resultData: runtime.resultData,
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

    const taxReturnFiles = getTaxReturnFiles(taxReturn.files);
    const useProxy = process.env.USE_UK_PROXY !== "false";

    session = await initializeBrowserUseSession(client, useProxy);

    const latestJobStatus = await db.query.jobs.findFirst({
      where: eq(jobs.id, runtime.jobId),
      columns: { status: true },
    });

    if (latestJobStatus?.status === "cancelled") {
      await log("Job was cancelled during startup", { phase: "startup" });
      try {
        await client.stopSession(session.id, "session");
      } catch {}
      return;
    }

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
        aiModel: BROWSER_USE_MODEL,
        resultData: runtime.resultData,
      })
      .where(eq(jobs.id, runtime.jobId));

    await publishJobEvent({
      type: "job:started",
      jobId: runtime.jobId,
      timestamp: Date.now(),
      data: {
        liveUrl: session.liveUrl,
        sessionId: session.id,
        workspaceId: null,
        taxReturnId: runtime.taxReturnId,
        entityName: taxReturn.entityName,
        submissionMode,
      },
    });

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
          resultData: runtime.resultData,
        })
        .where(eq(jobs.id, runtime.jobId));

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

    try {
      const [baselineSessionFiles, baselineWorkspaceFiles] = await Promise.all([
        client.getAllSessionFiles(session.id),
        workspaceId
          ? client.getAllWorkspaceFiles(workspaceId)
          : Promise.resolve([]),
      ]);

      baselineBrowserFileKeys = new Set(
        [
          ...baselineSessionFiles.map((file) =>
            getBrowserFileBaselineKey("session", file.path),
          ),
          ...baselineWorkspaceFiles.map((file) =>
            getBrowserFileBaselineKey("workspace", file.path),
          ),
        ],
      );

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
    });

    const prompt = buildSubstanceFormPrompt({
      taxReturn: taxReturn as any,
      substanceForm: taxReturn.substanceForm as any,
      portalUrl: taxReturn.jurisdiction?.portalUrl || "https://my.gov.gg",
      returnLink: taxReturn.link || undefined,
      overrideSaved,
      submissionMode,
      financialStatementsFile,
      financialStatementsUrl: financialStatementsFile?.url ?? null,
    });
    const recoveryReturnUrl =
      taxReturn.link ||
      taxReturn.jurisdiction?.portalUrl ||
      "https://my.gov.gg";

    await log("Starting Browser Use task", {
      sessionId: session.id,
      model: BROWSER_USE_MODEL,
      submissionMode,
    });

    let currentRunPromise = Promise.resolve(
      client.runTask(prompt, {
        sessionId: session.id,
        model: BROWSER_USE_MODEL,
        timeoutMs: MAX_RUNTIME_MS,
        workspaceId: workspaceId ?? undefined,
      }),
    );

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
          jobId: runtime.jobId,
          timestamp: Date.now(),
          data: {
            liveUrl: session.liveUrl,
            sessionId: session.id,
            message:
              "Task paused. Complete any manual actions in the browser and click Resume.",
          },
        });

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

        const pauseStartTime = Date.now();
        let resumed = false;
        while (Date.now() - pauseStartTime < MAX_PAUSE_DURATION_MS) {
          await sleep(PAUSE_CHECK_INTERVAL_MS);
          const checkJob = await db.query.jobs.findFirst({
            where: eq(jobs.id, runtime.jobId),
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

        const finalCheck = await db.query.jobs.findFirst({
          where: eq(jobs.id, runtime.jobId),
          columns: { status: true },
        });
        if (!resumed || finalCheck?.status !== "running") {
          if (finalCheck?.status === "paused") {
            await log("Pause timeout - marking as failed");
            await markActiveRuntimeFailed(
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
      const orderedMessages = [...newMessages.messages].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
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
            phase: "run",
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

          const recoveryPrompt = `
The browser entered an unstable state after a bad click or detached tab.

RECOVERY RULES:
- Use only Browser Use native tools: switch, close, navigate, go_back, click, input, upload_file, evaluate, screenshot.
- Do NOT use Python or browser-wrapper recovery helpers such as get_tabs.
- If a stray tab or blank page is open, use switch or close to return to the main Guernsey portal tab.
- If you cannot recover the portal tab quickly, navigate directly to: ${recoveryReturnUrl}
- If you land on a page ending in reviewAndSubmit/summary, ${
            submissionMode === "submit_and_capture_pdf"
              ? "treat it as a draft summary until every section has been rechecked in this run. Only use the final submit path after the filing is fully validated and you are ready to download the portal-generated completion PDF."
              : "this is a saved draft summary. Do NOT click Submit, Confirm, Print, or Download from that page."
          }
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
        const runResult = await currentRunPromise.catch(() => null);
        const output = normalizeBrowserUseOutput(
          runResult?.output ?? browserSession.output,
        );
        const success =
          browserSession.status === "idle" &&
          (runResult?.isTaskSuccessful ??
            browserSession.isTaskSuccessful ??
            true);

        const needsAttention =
          !success &&
          REQUIRES_ATTENTION_KEYWORDS.some((keyword) =>
            output.toLowerCase().includes(keyword.toLowerCase()),
          );

        if (needsAttention) {
          await log("Task requires user attention - pausing", { output });

          await publishJobEvent({
            type: "job:requires_attention",
            jobId: runtime.jobId,
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

          await updateActiveJobRecord({
            set: {
              status: "paused",
            },
            resultDataPatch: {
              output,
              browserUseSessionId: session.id,
              liveUrl: session.liveUrl,
              sessionId: session.id,
              pausedAt: Date.now(),
              pauseReason: output,
            },
          });

          await log("Waiting for user to complete action and resume...");
          const pauseStartTime = Date.now();

          while (Date.now() - pauseStartTime < MAX_PAUSE_DURATION_MS) {
            await sleep(PAUSE_CHECK_INTERVAL_MS);

            const currentJob = await db.query.jobs.findFirst({
              where: eq(jobs.id, runtime.jobId),
            });

            if (!currentJob) {
              break;
            }

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

          const finalJobCheck = await db.query.jobs.findFirst({
            where: eq(jobs.id, runtime.jobId),
          });

          if (finalJobCheck?.status === "paused") {
            await log("Pause timeout - marking as failed");
            await markActiveRuntimeFailed("Timed out waiting for user intervention");
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
          },
        );

        let completionPdf: CompletionPdfIngestionResult | undefined;
        if (success && submissionMode === "submit_and_capture_pdf") {
          try {
            completionPdf = await captureCompletionPdf({
              client,
              sessionId: session.id,
              workspaceId,
              taxReturnId: runtime.taxReturnId,
              orgId: taxReturn.orgId,
              entityName: taxReturn.entityName,
              taxYear: taxReturn.taxYear,
              financialStatementsFile,
              baselineKeys: baselineBrowserFileKeys,
              logFn: log,
            });

            if (completionPdf.status === "missing") {
              await log("No completion PDF was ingested after submission", {
                error: completionPdf.error,
              });
            } else if (completionPdf.status === "failed") {
              await log("Completion PDF ingestion failed after submission", {
                error: completionPdf.error,
                browserUsePath: completionPdf.browserUsePath,
              });
            }
          } catch (error) {
            completionPdf = {
              status: "failed",
              error: error instanceof Error ? error.message : String(error),
            };
            await log("Completion PDF ingestion threw an unexpected error", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
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
          },
        });

        await db
          .update(taxReturns)
          .set({ status: success ? "completed" : "failed" })
          .where(eq(taxReturns.id, runtime.taxReturnId));
        await db
          .update(tasks)
          .set({ status: success ? "completed" : "failed" })
          .where(eq(tasks.id, runtime.taskId));
        await updateActiveJobRecord({
          set: {
            status: success ? "completed" : "failed",
            completedAt: new Date(),
          },
          resultDataPatch: {
            output,
            browserUseSessionId: session.id,
            liveUrl: session.liveUrl,
            workspaceId,
            completionPdf,
          },
        });

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

    if (workspaceId) {
      try {
        await client.deleteWorkspace(workspaceId);
        await log("Workspace deleted", { workspaceId });
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
      console.error("Failed to stop active Browser Use session on shutdown", error);
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
