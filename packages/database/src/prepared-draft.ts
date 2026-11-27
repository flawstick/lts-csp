/**
 * Prepared-draft identity for the "Submit prepared return" operation.
 *
 * A prepare_only run that reaches the review/submit page records a
 * `preparedDraft` on its job: the review URL and portal reference the agent
 * reported, plus a fingerprint of the return data the draft was filled from.
 * A later submit_prepared run may only file that exact draft, and only while
 * the data it was filled from is unchanged and no other run touched the return
 * in between. Pure functions: shared by the web API (enqueue) and the worker
 * (re-checked before any browser run starts).
 */

import { createHash } from "node:crypto";

export const SUBMIT_PREPARED_OPERATION = "submit_prepared" as const;
export type FilingOperation = "fill" | typeof SUBMIT_PREPARED_OPERATION;

export type PreparedDraftRecord = {
  version: 1;
  preparedAt: number;
  /** Fingerprint of the form data, files and case the draft was filled from. */
  inputFingerprint: string;
  /**
   * Canonical review/submit page URL of this draft: the review summary or the
   * declaration step after it, where a prepare run with a filing contact stops
   * (https://revenueservice.gov.gg/company-tax-ui/[company-tax/tax-returns/]<draftId>/reviewAndSubmit/{summary,declaration}).
   */
  reviewUrl: string | null;
  /** Return/case reference the agent read on the review page, if shown. */
  portalReference: string | null;
};

/**
 * Worker-written `resultData` key on a submit_prepared job: set (durably,
 * before the browser run is dispatched) once the run may reach the final
 * Submit. From then on the portal may have accepted the filing even if the
 * run is cancelled, times out, loses its worker or errors without saving a
 * receipt. That does not block a later submission: every submit run first
 * checks on the portal that the return is not already submitted, and a later
 * run is told which earlier runs may have filed (getEarlierUnreceiptedSubmitJobs).
 */
export const SUBMIT_PREPARED_DISPATCHED_KEY = "submitPreparedDispatchedAt" as const;

// Bookkeeping and internal approval fields that are never entered on the
// portal, so changing them does not make the portal draft stale.
const NON_PORTAL_FORM_KEYS = new Set([
  "id",
  "taxReturnId",
  "createdAt",
  "updatedAt",
  "lastEditedAt",
  "lastEditedBy",
  "managerSignOff",
  "managerSignOffDate",
  // Answered on the declaration page after the review summary. A prepare run
  // selects it there, but the portal keeps declaration-page state in the
  // browser session only (it is sent with the final submitDeclaration), so a
  // Submit prepared return run re-applies the current answer in its own
  // session: changing it after Prepare only leaves the prepared draft valid.
  "noticeOfAssessment",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(stableValue);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value ?? null;
}

/**
 * Fingerprint of everything a prepare run fills the portal from. Any edit to
 * portal-facing form data, the attached source files or the case link changes
 * it. Filed-return receipts are excluded: they are outputs, not inputs.
 */
export function fingerprintPreparedInputs(input: {
  entityName?: string | null;
  taxYear?: number | string | null;
  link?: string | null;
  files?: unknown;
  substanceForm?: Record<string, unknown> | null;
}): string {
  const form = isRecord(input.substanceForm)
    ? Object.fromEntries(
        Object.entries(input.substanceForm).filter(
          ([key]) => !NON_PORTAL_FORM_KEYS.has(key),
        ),
      )
    : null;
  const files = (Array.isArray(input.files) ? input.files : [])
    .filter((file) => isRecord(file) && file.role !== "filed_return_pdf")
    .map((file) => {
      const row = file as Record<string, unknown>;
      return {
        url: row.url ?? null,
        name: row.name ?? null,
        role: row.role ?? null,
        category: row.category ?? null,
      };
    })
    .sort((a, b) => String(a.url).localeCompare(String(b.url)));
  const payload = JSON.stringify(
    stableValue({
      entityName: input.entityName ?? null,
      taxYear: input.taxYear ?? null,
      link: input.link ?? null,
      files,
      form,
    }),
  );
  return createHash("sha256").update(payload).digest("hex");
}

/** https URL on a Guernsey government host (gov.gg or a subdomain). */
export function isGuernseyPortalUrl(value: string): boolean {
  // No userinfo, explicit https, host must be gov.gg or *.gov.gg.
  const match = value
    .trim()
    .match(/^https:\/\/([a-z0-9.-]+)(?::\d+)?(?:[/?#]|$)/i);
  const host = match?.[1]?.toLowerCase();
  return Boolean(host && (host === "gov.gg" || host.endsWith(".gov.gg")));
}

// The Guernsey Revenue Service company-tax-ui review/submit pages of one
// draft: the review summary and the declaration step after it (see
// prepare-only-guard/guard-core.js: the draft id in this path is the id the
// submit API posts to, /company-tax-api/v1/draftTaxReturn/<id>/...).
// Exact host and path only: a generic gov.gg page does not identify a draft.
const REVIEW_URL_PATTERN =
  /^https:\/\/revenueservice\.gov\.gg(\/company-tax-ui\/(?:company-tax\/tax-returns\/)?([A-Za-z0-9_-]{1,128})\/reviewAndSubmit)\/(?:summary|declaration)\/?$/;

/**
 * The draft id when `value` is the canonical review summary or declaration
 * page URL of a specific draft, otherwise null (other hosts, paths, query or
 * fragment).
 */
export function getGuernseyReviewDraftId(value: string): string | null {
  return value.trim().match(REVIEW_URL_PATTERN)?.[2] ?? null;
}

/**
 * The review summary page of the draft a canonical review summary or
 * declaration URL names, keeping its exact path, or null when `value` is not
 * one. A Submit prepared return run verifies the draft there before it moves
 * on to the declaration step.
 */
export function getGuernseyReviewSummaryUrl(value: string): string | null {
  const base = value.trim().match(REVIEW_URL_PATTERN)?.[1];
  return base ? `https://revenueservice.gov.gg${base}/summary` : null;
}

/**
 * A portal reference specific enough to identify a return: a short
 * reference-like value with both letters and digits (e.g. "ESR-2025-0042"),
 * not a word such as "none"/"submitted" or a bare number such as the tax
 * year. Anything else is rejected, never truncated.
 */
export function normalizePortalReference(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const reference = value.trim();
  return /^(?=[^\n]*\d)(?=[^\n]*[A-Za-z])[A-Za-z0-9][A-Za-z0-9 ._/-]{2,63}$/.test(reference)
    ? reference
    : null;
}

/** True when the record names a specific portal draft (URL and/or reference). */
export function hasPreparedDraftIdentity(
  draft: Pick<PreparedDraftRecord, "reviewUrl" | "portalReference">,
): boolean {
  return Boolean(
    (draft.reviewUrl && getGuernseyReviewDraftId(draft.reviewUrl)) ||
      normalizePortalReference(draft.portalReference),
  );
}

/**
 * Reads the REVIEW_PAGE_URL / PORTAL_REFERENCE lines a prepare run reports
 * with READY_FOR_MANUAL_SUBMISSION. Anything that is not a canonical draft
 * review URL or a specific reference is dropped.
 */
export function parsePreparedDraftOutput(output: string): {
  reviewUrl: string | null;
  portalReference: string | null;
} {
  const line = (label: string) => {
    const match = output.match(
      new RegExp(`${label}\\**\\s*:\\s*\\**\\s*([^\\n]+)`, "i"),
    );
    return match?.[1]?.replace(/[*`<>]/g, "").trim() || null;
  };
  const rawUrl = line("REVIEW_PAGE_URL");
  const urlToken = rawUrl?.match(/https?:\/\/\S+/)?.[0]?.replace(/[).,;]+$/, "");
  const reviewUrl =
    urlToken && getGuernseyReviewDraftId(urlToken) ? urlToken : null;
  const portalReference = normalizePortalReference(line("PORTAL_REFERENCE"));
  return { reviewUrl, portalReference };
}

export function parsePreparedDraftRecord(
  value: unknown,
): PreparedDraftRecord | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (typeof value.inputFingerprint !== "string" || !value.inputFingerprint) {
    return null;
  }
  if (typeof value.preparedAt !== "number") return null;
  const reviewUrl =
    typeof value.reviewUrl === "string" &&
    getGuernseyReviewDraftId(value.reviewUrl)
      ? value.reviewUrl.trim()
      : null;
  return {
    version: 1,
    preparedAt: value.preparedAt,
    inputFingerprint: value.inputFingerprint,
    reviewUrl,
    portalReference: normalizePortalReference(value.portalReference),
  };
}

export type PreparedDraftJob = {
  id: string;
  status: string;
  createdAt: Date | string;
  resultData?: unknown;
};

function jobData(job: PreparedDraftJob): Record<string, unknown> {
  return isRecord(job.resultData) ? job.resultData : {};
}

export function getFilingOperation(resultData: unknown): FilingOperation {
  return isRecord(resultData) &&
    resultData.filingOperation === SUBMIT_PREPARED_OPERATION
    ? SUBMIT_PREPARED_OPERATION
    : "fill";
}

export type PreparedDraftResolution =
  | { ok: true; preparedJob: PreparedDraftJob; draft: PreparedDraftRecord }
  | { ok: false; blocker: string };

const PREPARE_AGAIN = "Run Prepare only again, then submit the new draft.";

/** True once a submit_prepared run may have reached the final Submit. */
export function hasSubmitPreparedDispatch(resultData: unknown): boolean {
  return (
    isRecord(resultData) &&
    getFilingOperation(resultData) === SUBMIT_PREPARED_OPERATION &&
    resultData[SUBMIT_PREPARED_DISPATCHED_KEY] !== undefined &&
    resultData[SUBMIT_PREPARED_DISPATCHED_KEY] !== null
  );
}

/**
 * Worker-written `resultData` key on every submit-mode job (a full submit or
 * Submit prepared return): set durably before its first browser task is
 * dispatched. From then on the run may have filed, whatever it later
 * reports. Submit prepared return runs also keep SUBMIT_PREPARED_DISPATCHED_KEY
 * (older rows only have that one).
 */
export const SUBMIT_DISPATCHED_KEY = "submitDispatchedAt" as const;

/** When a submit-mode run was first dispatched to the browser, or null. */
export function getSubmitDispatchedAt(resultData: unknown): number | null {
  if (!isRecord(resultData)) return null;
  const value = resultData[SUBMIT_DISPATCHED_KEY];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (hasSubmitPreparedDispatch(resultData)) {
    const legacy = resultData[SUBMIT_PREPARED_DISPATCHED_KEY];
    return typeof legacy === "number" && Number.isFinite(legacy) ? legacy : 0;
  }
  return null;
}

/**
 * True once any submit-mode run (full submit or Submit prepared return) was
 * dispatched to the browser, so it may have reached the final Submit.
 */
export function hasSubmitDispatch(resultData: unknown): boolean {
  return getSubmitDispatchedAt(resultData) !== null;
}

// ── Earlier submit runs that may have filed: a caution, never a lock ───────

/**
 * Key on a submit run's `resultData`: ids of the earlier submit runs it was
 * cautioned about (set when the run is enqueued, and again by the worker with
 * the runs its prompt named). Traceability only.
 */
export const EARLIER_UNRECEIPTED_SUBMIT_JOBS_KEY = "earlierUnreceiptedSubmitJobIds" as const;

/** The run saved the portal's filed-return receipt (worker `completionPdf`). */
function hasSavedReceipt(data: Record<string, unknown>): boolean {
  return isRecord(data.completionPdf) && data.completionPdf.status === "uploaded";
}

/**
 * Earlier submit runs on the return (full submit or Submit prepared return)
 * that reached the portal (dispatched to the browser) and saved no
 * filed-return receipt, oldest first. Any of them may have filed. They never
 * block a new submission: the new run is told about them and first checks on
 * the portal that the return is not already submitted
 * (REQUIRES_ATTENTION: ALREADY_SUBMITTED otherwise). A run that did save a
 * receipt is not listed: the receipt itself refuses a new submission (see the
 * web filing start guard).
 */
export function getEarlierUnreceiptedSubmitJobs<T extends PreparedDraftJob>(input: {
  jobs: T[];
  /** The job being started or enqueued: ignored. */
  excludeJobId?: string;
}): T[] {
  return input.jobs
    .filter(
      (job) =>
        job.id !== input.excludeJobId &&
        hasSubmitDispatch(job.resultData) &&
        !hasSavedReceipt(jobData(job)),
    )
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
}

/** "Run #3", "Runs #3 and #5", "Runs #2, #3 and #5"; null without numbers. */
export function formatRunNumbers(
  jobs: Array<{ jobNumber?: number | null }>,
): string | null {
  const numbers = jobs
    .map((job) => job.jobNumber)
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n))
    .map((n) => `#${n}`);
  if (numbers.length === 0 || numbers.length !== jobs.length) return null;
  if (new Set(numbers).size !== numbers.length) return null;
  if (numbers.length === 1) return `Run ${numbers[0]}`;
  return `Runs ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** An earlier run as named to staff and the agent. */
export type EarlierSubmitRunRef = {
  /** Run number within its own task (jobs.job_number). */
  jobNumber?: number | null;
  taskId?: string | null;
  /** The task's name, to tell runs on other tasks of the return apart. */
  taskName?: string | null;
};

function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Unambiguous names for earlier runs on a return, or null when they cannot
 * be named safely (then use generic wording). Run numbers count per task,
 * while the runs come from every task on the return. When every run is on
 * the current task they are named by number ("Run #3", "Runs #2 and #3");
 * otherwise every run is named with its task, the current one included
 * ("Run #3 of task “Acme 2025” and Run #3 of task “Acme 2025 (rerun)”"), so
 * the same number never appears once bare and once qualified. Runs with no
 * task recorded are named by number only, and only when no run has a task.
 * Null when a number is missing, two runs would read the same, or a task
 * that must be named has no name or shares one with another task.
 */
export function describeEarlierSubmitRuns(
  runs: EarlierSubmitRunRef[],
  current?: { taskId?: string | null; taskName?: string | null },
): string | null {
  if (runs.length === 0) return null;
  if (runs.some((run) => typeof run.jobNumber !== "number" || !Number.isFinite(run.jobNumber))) {
    return null;
  }
  const withTask = runs.filter((run) => typeof run.taskId === "string" && run.taskId);
  if (withTask.length === 0) return formatRunNumbers(runs);
  if (withTask.length !== runs.length) return null;

  const currentTaskId = current?.taskId ?? null;
  // Group by task, keeping the first-seen order (oldest run first).
  const groups = new Map<string, EarlierSubmitRunRef[]>();
  for (const run of runs) {
    const key = run.taskId as string;
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  // Every run on the current task: the compact form ("Runs #2 and #3").
  if (currentTaskId && groups.size === 1 && groups.has(currentTaskId)) {
    return formatRunNumbers(runs);
  }

  const namesByTask = new Map<string, string>();
  for (const [taskId, group] of groups) {
    const name =
      group[0]?.taskName?.trim() ||
      (taskId === currentTaskId ? current?.taskName?.trim() : undefined);
    if (!name) return null;
    namesByTask.set(taskId, name);
  }
  const names = [...namesByTask.values()].map((name) => name.toLowerCase());
  if (new Set(names).size !== names.length) return null;
  // Another task named like the current one (whose runs are not listed).
  const currentName = current?.taskName?.trim().toLowerCase();
  if (
    currentName &&
    [...namesByTask].some(
      ([taskId, name]) => taskId !== currentTaskId && name.toLowerCase() === currentName,
    )
  ) {
    return null;
  }

  const parts: string[] = [];
  for (const [taskId, group] of groups) {
    const numbers = formatRunNumbers(group);
    if (!numbers) return null;
    parts.push(`${numbers} of task \u201c${namesByTask.get(taskId)}\u201d`);
  }
  return joinWithAnd(parts);
}

/**
 * The one-line caution shown before starting a submission when earlier
 * submit runs may have filed, or null when there are none.
 */
export function getEarlierUnreceiptedSubmitCaution(
  jobs: EarlierSubmitRunRef[],
  current?: { taskId?: string | null; taskName?: string | null },
): string | null {
  if (jobs.length === 0) return null;
  const runs =
    describeEarlierSubmitRuns(jobs, current) ??
    (jobs.length === 1 ? "An earlier submit run" : "Earlier submit runs");
  return `${runs} reached the portal and saved no receipt. This run first checks the portal shows the return as not yet submitted.`;
}

// ── Earlier submit runs' browsers: stopped before a new submit run starts ──

/**
 * Job statuses of a run that may still be acting. Such a run is never touched
 * here: it blocks any new run on the return (the active-run guard).
 */
const ACTIVE_RUN_STATUSES = new Set(["pending", "queued", "starting", "running", "paused"]);

/** Browser Use session statuses that mean the agent can no longer act. */
export const BROWSER_SESSION_STOPPED_STATUSES = [
  "idle",
  "stopped",
  "error",
  "timed_out",
] as const;

export function isBrowserSessionStoppedStatus(
  status: string | null | undefined,
): boolean {
  return (
    typeof status === "string" &&
    (BROWSER_SESSION_STOPPED_STATUSES as readonly string[]).includes(status)
  );
}

/** The Browser Use session a run recorded, if any (same keys the web app reads). */
export function getSubmitRunBrowserSessionId(resultData: unknown): string | null {
  if (!isRecord(resultData)) return null;
  for (const key of ["browserUseSessionId", "sessionId"]) {
    const value = resultData[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Worker-written `resultData` key: Browser Use refused to create the first
 * run of a submit-mode dispatch with a definite client error (4xx), so no
 * agent was started and none can be orphaned.
 */
export const SUBMIT_DISPATCH_REJECTED_KEY = "submitDispatchRejectedAt" as const;

/**
 * `resultData` key (worker or web): a completed search of the Browser Use
 * sessions in a dispatched run's own workspace, for a run that recorded no
 * session id (its create request timed out or failed after Browser Use may
 * have accepted it, or its worker died mid-dispatch). Lists the sessions
 * found, which are stopped like a recorded session.
 */
export const SUBMIT_DISPATCH_SESSION_SEARCH_KEY = "submitDispatchSessionSearch" as const;

export type SubmitDispatchSessionSearch = {
  searchedAt: number;
  sessionIds: string[];
};

export function getSubmitDispatchSessionSearch(
  resultData: unknown,
): SubmitDispatchSessionSearch | null {
  if (!isRecord(resultData)) return null;
  const value = resultData[SUBMIT_DISPATCH_SESSION_SEARCH_KEY];
  if (!isRecord(value)) return null;
  const searchedAt = value.searchedAt;
  if (typeof searchedAt !== "number" || !Number.isFinite(searchedAt)) return null;
  const sessionIds = Array.isArray(value.sessionIds)
    ? value.sessionIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  return { searchedAt, sessionIds };
}

/**
 * A dispatched run that recorded no Browser Use session holds a new run for
 * at least this long: a create request still in flight at Browser Use has
 * produced its session by then, so a search of the run's workspace after it
 * is complete.
 */
export const EARLIER_SUBMIT_QUIET_PERIOD_MS = 2 * 60_000;

/** Clock skew allowed when matching sessions to a dispatch by creation time. */
export const EARLIER_SUBMIT_SESSION_SEARCH_SKEW_MS = 5 * 60_000;

/**
 * The longest a Browser Use agent can act unattended: the maximum session
 * timeout (4 hours) plus the worker's keep-alive window. A dispatched run
 * whose session can be neither read nor found holds new runs this long.
 */
export const EARLIER_SUBMIT_MAX_AGENT_LIFETIME_MS = (240 + 15) * 60_000;

/**
 * A dispatched run quiet for longer than this is not checked: no Browser Use
 * agent run, pause or keep-alive window lasts this long.
 */
export const EARLIER_SUBMIT_BROWSER_CHECK_WINDOW_MS = 24 * 60 * 60_000;

/** Why a new run may not start yet (never a manual procedure). */
export const EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE =
  "The previous submit run's browser is still shutting down. Try again in a minute.";

export type EarlierSubmitRunJob = PreparedDraftJob & {
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function toMillis(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** The last time an ended run was seen acting (end, heartbeat, stale mark). */
export function getRunLastActivityAt(job: EarlierSubmitRunJob): number {
  const data = jobData(job);
  const num = (key: string) =>
    typeof data[key] === "number" ? (data[key] as number) : null;
  const candidates = [
    toMillis(job.completedAt),
    toMillis(num("lastHeartbeatAt")),
    toMillis(num("staleFailureAt")),
    toMillis(num("pauseExpiredAt")),
    toMillis(num("lastResumedAt")),
    toMillis(getSubmitDispatchedAt(data) || null),
  ].filter((value): value is number => value !== null);
  if (candidates.length > 0) return Math.max(...candidates);
  return toMillis(job.updatedAt) ?? toMillis(job.createdAt) ?? 0;
}

export type EarlierSubmitBrowserCheck =
  /** Nothing to do: never dispatched, still active (blocked elsewhere), or long quiet. */
  | { kind: "none" }
  /** Stop these sessions and read back a stopped status before the new run starts. */
  | { kind: "stop_sessions"; sessionIds: string[] }
  /**
   * No session recorded: find the sessions Browser Use created in the run's
   * own workspace since the dispatch, stop them, read them back as stopped
   * and record the search (SUBMIT_DISPATCH_SESSION_SEARCH_KEY).
   */
  | { kind: "find_sessions"; workspaceId: string; createdAfter: number }
  /** No session recorded and it cannot be found yet: the new run must wait. */
  | { kind: "wait" };

/**
 * What must happen to an earlier submit run's browser before a new browser
 * run (of any mode) on the same return may start: a dispatched, ended run's
 * Browser Use agent may still be driving the portal (its worker was killed,
 * its create request failed after Browser Use accepted it, or a stop
 * failed), and it could file the return alongside, or in the middle of, the
 * new run. Shared by the web start (startJob) and the worker.
 *
 * A run that recorded no session id is never assumed quiet: it is cleared
 * only by a definite Browser Use rejection of the create request, or a
 * search of its workspace made after the quiet period (its sessions then
 * stopped). With no workspace to search it holds new runs for the longest an
 * agent can act.
 */
export function planEarlierSubmitBrowserCheck(
  job: EarlierSubmitRunJob,
  now: number,
): EarlierSubmitBrowserCheck {
  if (ACTIVE_RUN_STATUSES.has(job.status)) return { kind: "none" };
  const data = jobData(job);
  if (!hasSubmitDispatch(data)) return { kind: "none" };
  const quietFor = now - getRunLastActivityAt(job);
  if (quietFor > EARLIER_SUBMIT_BROWSER_CHECK_WINDOW_MS) return { kind: "none" };

  const recorded = getSubmitRunBrowserSessionId(data);
  const search = getSubmitDispatchSessionSearch(data);
  const found = search?.sessionIds ?? [];
  const stopFound = (): EarlierSubmitBrowserCheck =>
    found.length > 0 ? { kind: "stop_sessions", sessionIds: found } : { kind: "none" };
  if (recorded) {
    return {
      kind: "stop_sessions",
      sessionIds: [...new Set([recorded, ...found])],
    };
  }

  const rejectedAt = data[SUBMIT_DISPATCH_REJECTED_KEY];
  if (typeof rejectedAt === "number" && Number.isFinite(rejectedAt)) return stopFound();

  const dispatchedAt = Math.max(
    getSubmitDispatchedAt(data) ?? 0,
    toMillis(job.createdAt) ?? 0,
  );
  if (search && search.searchedAt >= dispatchedAt + EARLIER_SUBMIT_QUIET_PERIOD_MS) {
    return stopFound();
  }
  if (quietFor < EARLIER_SUBMIT_QUIET_PERIOD_MS) return { kind: "wait" };

  const workspaceId =
    typeof data.workspaceId === "string" && data.workspaceId.trim()
      ? data.workspaceId.trim()
      : null;
  if (workspaceId) {
    return {
      kind: "find_sessions",
      workspaceId,
      createdAfter: dispatchedAt - EARLIER_SUBMIT_SESSION_SEARCH_SKEW_MS,
    };
  }
  return quietFor < EARLIER_SUBMIT_MAX_AGENT_LIFETIME_MS ? { kind: "wait" } : stopFound();
}

/** One Browser Use V4 session as listed (most recent first). */
export type ListedBrowserUseSession = {
  sessionId: string;
  workspaceId: string | null;
  createdAt: string;
  updatedAt?: string | null;
};

/** How many session pages a workspace search reads before giving up. */
export const SESSION_SEARCH_MAX_PAGES = 20;

/**
 * The Browser Use sessions in `workspaceId` (a worker creates one workspace
 * per job, so they are that job's), read from the account's session list
 * (most recent first) until a page reaches sessions last active before
 * `createdAfter`. Null when the search could not reach that point (too many
 * pages): then it is not complete.
 */
export async function findWorkspaceSessionIds(
  listPage: (cursor: string | null) => Promise<{
    sessions: ListedBrowserUseSession[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }>,
  input: { workspaceId: string; createdAfter: number; maxPages?: number },
): Promise<string[] | null> {
  const maxPages = input.maxPages ?? SESSION_SEARCH_MAX_PAGES;
  const found: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await listPage(cursor);
    let reachedOlder = false;
    for (const session of result.sessions) {
      if (session.workspaceId === input.workspaceId && !found.includes(session.sessionId)) {
        found.push(session.sessionId);
      }
      // Ordered by creation or by latest run: either way, a session last
      // active before the dispatch means every later one is older still.
      const times = [session.createdAt, session.updatedAt]
        .map((value) => (value ? Date.parse(value) : Number.NaN))
        .filter((value) => Number.isFinite(value));
      const lastActive = times.length > 0 ? Math.max(...times) : null;
      if (lastActive !== null && lastActive < input.createdAfter) {
        reachedOlder = true;
      }
    }
    if (reachedOlder || !result.hasMore || !result.nextCursor) return found;
    cursor = result.nextCursor;
  }
  return null;
}

/**
 * Finds the prepared draft a submit_prepared run may file, or why it may not.
 *
 * The latest prepare job on the return must have reached the review page
 * (READY), without any submission breach, with a recorded draft whose input
 * fingerprint still matches the current return, and a specific draft
 * identity. The only runs allowed after it are earlier submit_prepared
 * attempts on that same draft that failed or were cancelled, whether or not
 * they reached the browser: a submit_prepared run never edits the draft, and
 * the new run re-verifies it and first checks on the portal that it was not
 * already submitted. Anything else may have changed or filed the portal
 * draft. A receipt or the portal reporting the return as submitted is
 * recorded on the return and refuses new submissions there.
 */
export function resolvePreparedDraft(input: {
  jobs: PreparedDraftJob[];
  currentFingerprint: string;
  /** The submit_prepared job being started (worker side): ignored. */
  excludeJobId?: string;
  /** The prepared job the submit run was enqueued against (worker side). */
  expectedPreparedJobId?: string | null;
  /** Certificate 3 drafts must have passed the current Net Book Value policy. */
  requireNetBookValueReview?: boolean;
}): PreparedDraftResolution {
  const ordered = input.jobs
    .filter((job) => job.id !== input.excludeJobId)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  const preparedIndex = ordered.findIndex(
    (job) =>
      getFilingOperation(job.resultData) === "fill" &&
      jobData(job).submissionMode !== "submit_and_capture_pdf",
  );
  const preparedJob = preparedIndex >= 0 ? ordered[preparedIndex] : undefined;
  if (!preparedJob) {
    return {
      ok: false,
      blocker: `No prepared draft found for this return. ${PREPARE_AGAIN}`,
    };
  }

  for (const later of ordered.slice(0, preparedIndex)) {
    const data = jobData(later);
    const isRetryOfSameDraft =
      getFilingOperation(data) === SUBMIT_PREPARED_OPERATION &&
      data.preparedJobId === preparedJob.id &&
      (later.status === "failed" || later.status === "cancelled");
    if (!isRetryOfSameDraft) {
      return {
        ok: false,
        blocker: `Another run started after the draft was prepared, so the portal draft may have changed. ${PREPARE_AGAIN}`,
      };
    }
  }

  const data = jobData(preparedJob);
  if (
    preparedJob.status !== "completed" ||
    typeof data.prepareOnlyReadyAt !== "number"
  ) {
    return {
      ok: false,
      blocker: `The latest preparation did not finish on the review page. ${PREPARE_AGAIN}`,
    };
  }
  if (data.prepareOnlyBreach || data.prepareOnlyLikelySubmitted) {
    return {
      ok: false,
      blocker:
        "The latest preparation reported or attempted a submission. Check the Guernsey Tax Portal instead of submitting again.",
    };
  }
  const netBookValueBlocker = getNetBookValueSubmitBlocker(data, input.requireNetBookValueReview);
  if (netBookValueBlocker) return { ok: false, blocker: netBookValueBlocker };
  const draft = parsePreparedDraftRecord(data.preparedDraft);
  if (!draft) {
    return {
      ok: false,
      blocker: `The latest preparation has no recorded draft identity (it predates Submit prepared return). ${PREPARE_AGAIN}`,
    };
  }
  if (!hasPreparedDraftIdentity(draft)) {
    return {
      ok: false,
      blocker: `The latest preparation did not record the draft's review page URL or portal reference, so the exact draft cannot be confirmed. ${PREPARE_AGAIN}`,
    };
  }
  if (draft.inputFingerprint !== input.currentFingerprint) {
    return {
      ok: false,
      blocker: `The return's data or files changed after the draft was prepared. ${PREPARE_AGAIN}`,
    };
  }
  if (
    input.expectedPreparedJobId &&
    input.expectedPreparedJobId !== preparedJob.id
  ) {
    return {
      ok: false,
      blocker: `The prepared draft changed after this submission was requested. ${PREPARE_AGAIN}`,
    };
  }
  return { ok: true, preparedJob, draft };
}

/** Worker-written: what the prepared draft holds for Net Book Value. */
export const PORTAL_NET_BOOK_VALUE_KEY = "portalNetBookValue";

/**
 * A draft whose Net Book Value still needs a reviewer, or holds 0 in place of
 * a negative figure no person has confirmed on the form, is not filed.
 */
export function getNetBookValueSubmitBlocker(
  resultData: unknown,
  requireReviewRecord = false,
): string | null {
  const record =
    resultData && typeof resultData === "object" && !Array.isArray(resultData)
      ? (resultData as Record<string, unknown>)[PORTAL_NET_BOOK_VALUE_KEY]
      : null;
  const status =
    record && typeof record === "object" && !Array.isArray(record)
      ? (record as Record<string, unknown>).status
      : null;
  if (status === "unresolved") {
    return `The latest preparation left Net Book Value for a reviewer to confirm. Enter the tangible-asset Net Book Value on the form. ${PREPARE_AGAIN}`;
  }
  if (status === "zero_unconfirmed") {
    return `The latest preparation entered Net Book Value as 0 in place of a negative figure. Confirm the Net Book Value on the form (0, or the correct tangible-asset amount). ${PREPARE_AGAIN}`;
  }
  if (requireReviewRecord && status !== "as_saved" && status !== "reviewer_confirmed" && status !== "missing") {
    return `The latest draft was prepared before the tangible-asset Net Book Value check. ${PREPARE_AGAIN}`;
  }
  return null;
}
