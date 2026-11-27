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
 * receipt, so no further submission may start for the return.
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

export const UNCONFIRMED_SUBMIT_BLOCKER =
  "An earlier Submit prepared return run reached the portal and did not save a filed-return receipt, so the portal may have accepted the filing. Check the Guernsey Tax Portal and record the filed return instead of submitting again. If the portal shows the return was not submitted, a staff member can record that on the run's task page.";

/** True once a submit_prepared run may have reached the final Submit. */
export function hasSubmitPreparedDispatch(resultData: unknown): boolean {
  return (
    isRecord(resultData) &&
    getFilingOperation(resultData) === SUBMIT_PREPARED_OPERATION &&
    resultData[SUBMIT_PREPARED_DISPATCHED_KEY] !== undefined &&
    resultData[SUBMIT_PREPARED_DISPATCHED_KEY] !== null
  );
}

// ── Staff confirmation that a dispatched run did not file ──────────────────

/**
 * Web-written `resultData` key on a dispatched submit_prepared job: a staff
 * member checked the Guernsey Tax Portal and recorded that this run did NOT
 * submit the return. It is the only thing that lifts the dispatch lock; the
 * agent's own report (e.g. PREPARED_DRAFT_NOT_VERIFIED) never does.
 *
 * Deliberately not a web-owned key (see ./operator-messages): if a worker is
 * somehow still writing this job, its next write drops the confirmation and
 * the lock returns.
 */
export const SUBMIT_NOT_FILED_CONFIRMATION_KEY = "submitNotFiledConfirmation" as const;

/** Job statuses a dispatched run must have ended in before it can be confirmed. */
export const SUBMIT_NOT_FILED_CONFIRMABLE_STATUSES = ["failed", "cancelled"] as const;

/**
 * How long a run must have been quiet (no worker heartbeat, ended) before it
 * can be confirmed, so a worker or browser that is still winding down cannot
 * submit after staff checked the portal.
 */
export const SUBMIT_NOT_FILED_QUIET_PERIOD_MS = 5 * 60_000;

/**
 * When the app cannot stop the run's browser and read back that it stopped
 * (no Browser Use session id was recorded, or Browser Use cannot report the
 * session), an autonomous Browser Use agent may still be driving the portal.
 * Only after this long with no activity at all may the run be confirmed. It is
 * far longer than any Browser Use run, pause or keep-alive window.
 */
export const SUBMIT_NOT_FILED_UNVERIFIED_QUIET_PERIOD_MS = 24 * 60 * 60_000;

/**
 * Web-written `resultData` key: a staff member stopped this run's Browser Use
 * session from the task page, and what Browser Use reported before and after.
 * The "not submitted" confirmation is only accepted at least
 * SUBMIT_NOT_FILED_QUIET_PERIOD_MS after a verified stop, so the person's
 * portal check comes after the browser could no longer act. Like the
 * confirmation it is not a web-owned key: a worker write drops it.
 */
export const SUBMIT_BROWSER_STOP_KEY = "submitBrowserStop" as const;

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

export type SubmitBrowserStopRecord = {
  version: 1;
  /** Epoch ms when Browser Use was asked to stop and reported back. */
  stoppedAt: number;
  stoppedBy: string;
  stoppedByName: string | null;
  /** The dispatch marker this stop answers (must still match). */
  dispatchedAt: number;
  sessionId: string;
  /** Status read before asking it to stop (null: not readable). */
  statusBefore: string | null;
  /** Status read after the stop (null: not readable). */
  statusAfter: string | null;
  /** True only when Browser Use reported a stopped status after the stop. */
  verified: boolean;
};

export function parseSubmitBrowserStop(
  resultData: unknown,
): SubmitBrowserStopRecord | null {
  if (!isRecord(resultData)) return null;
  const value = resultData[SUBMIT_BROWSER_STOP_KEY];
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    typeof value.stoppedAt !== "number" ||
    !Number.isFinite(value.stoppedAt) ||
    typeof value.stoppedBy !== "string" ||
    !value.stoppedBy.trim() ||
    typeof value.sessionId !== "string" ||
    !value.sessionId ||
    typeof value.dispatchedAt !== "number" ||
    value.dispatchedAt !== resultData[SUBMIT_PREPARED_DISPATCHED_KEY]
  ) {
    return null;
  }
  const statusAfter = typeof value.statusAfter === "string" ? value.statusAfter : null;
  return {
    version: 1,
    stoppedAt: value.stoppedAt,
    stoppedBy: value.stoppedBy,
    stoppedByName: typeof value.stoppedByName === "string" ? value.stoppedByName : null,
    dispatchedAt: value.dispatchedAt,
    sessionId: value.sessionId,
    statusBefore: typeof value.statusBefore === "string" ? value.statusBefore : null,
    statusAfter,
    // Never trust a stored flag without the status that justifies it.
    verified: value.verified === true && isBrowserSessionStoppedStatus(statusAfter),
  };
}

/** The stop record for the run's own recorded session, or null. */
function getCurrentBrowserStop(data: Record<string, unknown>): SubmitBrowserStopRecord | null {
  const sessionId = getSubmitRunBrowserSessionId(data);
  const stop = parseSubmitBrowserStop(data);
  return sessionId && stop && stop.sessionId === sessionId ? stop : null;
}

export const SUBMIT_NOT_FILED_NOTE_MIN_LENGTH = 10;
export const SUBMIT_NOT_FILED_NOTE_MAX_LENGTH = 1000;

export type SubmitNotFiledConfirmation = {
  version: 1;
  /** ISO timestamp of the staff confirmation. */
  confirmedNotFiledAt: string;
  /** Account id of the staff member who checked the portal. */
  confirmedNotFiledBy: string;
  confirmedNotFiledByName: string | null;
  /** What the staff member saw on the portal. */
  note: string;
  /** The dispatch marker this confirmation answers (must still match). */
  dispatchedAt: number;
  /**
   * Browser Use session status read (without stopping it) when the
   * confirmation was recorded; null when there was no session or it was not
   * readable.
   */
  browserSessionStatus: string | null;
  /** The verified or unverified browser stop the person checked the portal after. */
  browserStoppedAt: number | null;
  /**
   * True when Browser Use reported the session stopped, both at the stop and
   * at confirmation. False means the 24-hour quiet period applied instead.
   */
  browserStopVerified: boolean;
};

export function parseSubmitNotFiledConfirmation(
  resultData: unknown,
): SubmitNotFiledConfirmation | null {
  if (!isRecord(resultData)) return null;
  const value = resultData[SUBMIT_NOT_FILED_CONFIRMATION_KEY];
  if (!isRecord(value) || value.version !== 1) return null;
  if (
    typeof value.confirmedNotFiledAt !== "string" ||
    Number.isNaN(Date.parse(value.confirmedNotFiledAt)) ||
    typeof value.confirmedNotFiledBy !== "string" ||
    !value.confirmedNotFiledBy.trim() ||
    typeof value.note !== "string" ||
    value.note.trim().length < SUBMIT_NOT_FILED_NOTE_MIN_LENGTH ||
    typeof value.dispatchedAt !== "number" ||
    // Bound to this run's own dispatch evidence.
    value.dispatchedAt !== resultData[SUBMIT_PREPARED_DISPATCHED_KEY]
  ) {
    return null;
  }
  return {
    version: 1,
    confirmedNotFiledAt: value.confirmedNotFiledAt,
    confirmedNotFiledBy: value.confirmedNotFiledBy,
    confirmedNotFiledByName:
      typeof value.confirmedNotFiledByName === "string"
        ? value.confirmedNotFiledByName
        : null,
    note: value.note,
    dispatchedAt: value.dispatchedAt,
    browserSessionStatus:
      typeof value.browserSessionStatus === "string"
        ? value.browserSessionStatus
        : null,
    browserStoppedAt:
      typeof value.browserStoppedAt === "number" ? value.browserStoppedAt : null,
    browserStopVerified: value.browserStopVerified === true,
  };
}

function isConfirmableStatus(status: string): boolean {
  return (SUBMIT_NOT_FILED_CONFIRMABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * A dispatched submit_prepared job that ended (failed/cancelled) and that a
 * staff member confirmed, after checking the portal, did not file.
 */
export function isSubmitConfirmedNotFiled(job: PreparedDraftJob): boolean {
  return (
    hasSubmitPreparedDispatch(job.resultData) &&
    isConfirmableStatus(job.status) &&
    parseSubmitNotFiledConfirmation(job.resultData) !== null
  );
}

/** Dispatched submit_prepared jobs no person has confirmed as not filed. */
export function getUnconfirmedSubmitJobs<T extends PreparedDraftJob>(input: {
  jobs: T[];
  excludeJobId?: string;
}): T[] {
  return input.jobs.filter(
    (job) =>
      job.id !== input.excludeJobId &&
      hasSubmitPreparedDispatch(job.resultData) &&
      !isSubmitConfirmedNotFiled(job),
  );
}

/**
 * Why no new submission (Submit prepared return or a full submit run) may
 * start for a return, from durable job evidence, or null.
 *
 * Any submit_prepared job that was dispatched to the browser counts, whatever
 * its status: cancelled, failed, timed out, lost worker or paused after an
 * error all may follow an accepted final click. There is no objectively safe
 * job state that clears it; a completed filing is recorded on the return
 * (which then refuses every new run as already completed). The only way past
 * it is a staff member recording, after checking the portal, that the run did
 * not file (see planSubmitNotFiledConfirmation).
 */
export function getUnconfirmedSubmitBlocker(input: {
  jobs: PreparedDraftJob[];
  /** The job being started (worker side): ignored. */
  excludeJobId?: string;
}): string | null {
  return getUnconfirmedSubmitJobs(input).length > 0
    ? UNCONFIRMED_SUBMIT_BLOCKER
    : null;
}

export type SubmitNotFiledReturnState = {
  status: string;
  files?: unknown;
  metadata?: unknown;
};

export type SubmitNotFiledJobState = PreparedDraftJob & {
  completedAt?: Date | string | null;
  updatedAt?: Date | string | null;
};

function toMillis(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const ms = typeof value === "number" ? value : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Why a staff member may not stop a dispatched run's browser from the task
 * page (the first step before confirming it did not file), or null.
 */
export function getSubmitBrowserStopRefusal(job: PreparedDraftJob): string | null {
  const data = jobData(job);
  if (!hasSubmitPreparedDispatch(data)) {
    return "Only a Submit prepared return run that reached the portal needs this.";
  }
  if (parseSubmitNotFiledConfirmation(data)) {
    return "This run is already confirmed as not filed.";
  }
  if (!isConfirmableStatus(job.status)) {
    return "This run has not ended. Cancel it first, wait for it to stop, then check the portal.";
  }
  if (!getSubmitRunBrowserSessionId(data)) {
    return "This run recorded no browser session, so the app cannot stop or check its browser.";
  }
  return null;
}

export type SubmitBrowserStopPlan =
  | { ok: true; record: SubmitBrowserStopRecord; wasActive: boolean }
  | { ok: false; code: "BAD_REQUEST" | "PRECONDITION_FAILED"; message: string };

/**
 * The record written once the server asked a dispatched run's Browser Use
 * session to stop and read its status back, or why none is written. A stop
 * is only "verified" when Browser Use itself reported a stopped status.
 */
export function planSubmitBrowserStop(input: {
  job: PreparedDraftJob;
  /** Read before asking it to stop (null: not readable). */
  statusBefore: string | null;
  /** Read after asking it to stop and waiting (null: not readable). */
  statusAfter: string | null;
  actor: { id: string; name?: string | null };
  now: number;
}): SubmitBrowserStopPlan {
  if (!input.actor.id.trim()) {
    return { ok: false, code: "BAD_REQUEST", message: "Sign in again." };
  }
  const refusal = getSubmitBrowserStopRefusal(input.job);
  if (refusal) return { ok: false, code: "PRECONDITION_FAILED", message: refusal };
  const data = jobData(input.job);
  const sessionId = getSubmitRunBrowserSessionId(data) as string;
  const dispatchedAt = data[SUBMIT_PREPARED_DISPATCHED_KEY];
  if (typeof dispatchedAt !== "number") {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "This run's portal dispatch record is not readable, so it cannot be confirmed here.",
    };
  }
  if (input.statusAfter !== null && !isBrowserSessionStoppedStatus(input.statusAfter)) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: `The run's browser has been asked to stop but Browser Use still reports it as "${input.statusAfter}". Try again in a minute.`,
    };
  }
  return {
    ok: true,
    wasActive: !isBrowserSessionStoppedStatus(input.statusBefore),
    record: {
      version: 1,
      stoppedAt: input.now,
      stoppedBy: input.actor.id,
      stoppedByName: input.actor.name?.trim() || null,
      dispatchedAt,
      sessionId,
      statusBefore: input.statusBefore,
      statusAfter: input.statusAfter,
      verified: isBrowserSessionStoppedStatus(input.statusAfter),
    },
  };
}

/**
 * Why a staff member may not (yet) record that a dispatched run did not file,
 * from the job and return state, or null. The server re-checks it under a row
 * lock, with the Browser Use session status read at that moment.
 *
 * The person's portal check must come after the run's browser could no
 * longer act, so a run with a browser session needs a verified stop (from
 * the task page) at least SUBMIT_NOT_FILED_QUIET_PERIOD_MS old. When the app
 * cannot stop or read the browser, only the much longer
 * SUBMIT_NOT_FILED_UNVERIFIED_QUIET_PERIOD_MS without any activity will do.
 */
export function getSubmitNotFiledConfirmationRefusal(input: {
  job: SubmitNotFiledJobState;
  taxReturn: SubmitNotFiledReturnState;
  hasActiveJob: boolean;
  now: number;
  /**
   * The run's Browser Use session status read just now without stopping it
   * (null: not readable). Undefined when it was not read (display only); the
   * server always reads it before recording a confirmation.
   */
  browserSessionStatus?: string | null;
}): string | null {
  const { job, taxReturn } = input;
  const data = jobData(job);
  if (!hasSubmitPreparedDispatch(data)) {
    return "Only a Submit prepared return run that reached the portal needs this confirmation.";
  }
  if (parseSubmitNotFiledConfirmation(data)) {
    return "This run is already confirmed as not filed.";
  }
  if (!isConfirmableStatus(job.status)) {
    return "This run has not ended. Cancel it first, wait for it to stop, then check the portal.";
  }
  if (input.hasActiveJob) {
    return "Another run is active on this return. Wait for it to end first.";
  }
  if (taxReturn.status === "completed") {
    return "This return is already completed.";
  }
  const files = Array.isArray(taxReturn.files) ? taxReturn.files : [];
  if (files.some((file) => isRecord(file) && file.role === "filed_return_pdf")) {
    return "A filed-return receipt is attached to this return, so it may already be filed. Check the portal and record the filed return instead.";
  }
  if (
    files.some(
      (file) =>
        isRecord(file) &&
        isRecord(file.metadata) &&
        file.metadata.kind === "filed_return_pdf" &&
        file.metadata.jobId === job.id,
    )
  ) {
    return "This run saved a filed-return receipt, so it may have filed the return. Check the portal and record the filed return instead.";
  }
  const capture = isRecord(taxReturn.metadata) ? taxReturn.metadata.filedReturnPdf : null;
  if (
    isRecord(capture) &&
    capture.jobId === job.id &&
    (capture.status === "uploaded" || (typeof capture.fileUrl === "string" && capture.fileUrl))
  ) {
    return "This run captured a filed-return receipt, so it may have filed the return. Check the portal and record the filed return instead.";
  }
  const completionPdf = isRecord(data.completionPdf) ? data.completionPdf : null;
  if (completionPdf?.status === "uploaded" || (typeof data.receiptGate === "string" && data.receiptGate)) {
    return "This run recorded receipt evidence, so it may have filed the return. Check the portal and record the filed return instead.";
  }
  const lastActivity = Math.max(
    toMillis(job.completedAt) ?? 0,
    toMillis(typeof data.lastHeartbeatAt === "number" ? data.lastHeartbeatAt : null) ?? 0,
    toMillis(typeof data.pauseExpiredAt === "number" ? data.pauseExpiredAt : null) ?? 0,
    toMillis(typeof data.staleFailureAt === "number" ? data.staleFailureAt : null) ?? 0,
    // No end time recorded at all: fall back to the last row update.
    toMillis(job.completedAt) === null ? toMillis(job.updatedAt) ?? 0 : 0,
  );
  const minutes = Math.round(SUBMIT_NOT_FILED_QUIET_PERIOD_MS / 60_000);
  if (lastActivity === 0 || input.now - lastActivity < SUBMIT_NOT_FILED_QUIET_PERIOD_MS) {
    return `This run was active in the last ${minutes} minutes. Wait until it has been quiet for ${minutes} minutes, then check the portal again.`;
  }

  const sessionId = getSubmitRunBrowserSessionId(data);
  const stop = getCurrentBrowserStop(data);
  const hours = Math.round(SUBMIT_NOT_FILED_UNVERIFIED_QUIET_PERIOD_MS / 3_600_000);
  if (sessionId) {
    const live = input.browserSessionStatus;
    if (typeof live === "string" && !isBrowserSessionStoppedStatus(live)) {
      return `Browser Use reports this run's browser as "${live}", so it may still be acting on the portal. Stop the browser again, wait ${minutes} minutes, check the portal again, then confirm.`;
    }
    if (!stop) {
      return `Stop this run's browser first. Then wait ${minutes} minutes, check the Guernsey Tax Portal, and confirm.`;
    }
    // Verified only when Browser Use reported it stopped then and (when read) now.
    if (stop.verified && live !== null) {
      if (input.now - stop.stoppedAt < SUBMIT_NOT_FILED_QUIET_PERIOD_MS) {
        return `The browser was stopped less than ${minutes} minutes ago. Wait until ${minutes} minutes after the stop, check the Guernsey Tax Portal again, then confirm.`;
      }
      return null;
    }
  }
  const dispatchedAt = toMillis(
    typeof data[SUBMIT_PREPARED_DISPATCHED_KEY] === "number"
      ? (data[SUBMIT_PREPARED_DISPATCHED_KEY] as number)
      : null,
  ) ?? 0;
  const since = Math.max(lastActivity, dispatchedAt, stop?.stoppedAt ?? 0);
  if (input.now - since < SUBMIT_NOT_FILED_UNVERIFIED_QUIET_PERIOD_MS) {
    return sessionId
      ? `Browser Use could not confirm that this run's browser stopped, so an agent may still be acting on the portal. It can be confirmed only after ${hours} hours with no activity. Check the portal again then.`
      : `This run recorded no browser session, so the app cannot stop or check its browser and an agent may still be acting on the portal. It can be confirmed only after ${hours} hours with no activity. Check the portal again then.`;
  }
  return null;
}

export type SubmitNotFiledConfirmationPlan =
  | { ok: true; confirmation: SubmitNotFiledConfirmation }
  | { ok: false; code: "BAD_REQUEST" | "PRECONDITION_FAILED"; message: string };

/**
 * The record a staff member's "I checked the Guernsey portal: this return
 * was NOT submitted" writes on a dispatched submit_prepared job, or why it
 * is refused. Never files or resumes anything.
 */
export function planSubmitNotFiledConfirmation(input: {
  job: SubmitNotFiledJobState;
  taxReturn: SubmitNotFiledReturnState;
  hasActiveJob: boolean;
  /**
   * The run's Browser Use session status read just now WITHOUT stopping it,
   * or null when there is no session or it was not readable.
   */
  browserSessionStatus: string | null;
  /**
   * The browser stop time the person was shown when they confirmed (null:
   * none). Must match the stored stop, so a later stop means a new check.
   */
  checkedAfterBrowserStoppedAt: number | null;
  actor: { id: string; name?: string | null };
  note: string;
  now: number;
}): SubmitNotFiledConfirmationPlan {
  const note = input.note.trim();
  if (
    note.length < SUBMIT_NOT_FILED_NOTE_MIN_LENGTH ||
    note.length > SUBMIT_NOT_FILED_NOTE_MAX_LENGTH
  ) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: `Describe what the Guernsey Tax Portal shows for this return (${SUBMIT_NOT_FILED_NOTE_MIN_LENGTH} to ${SUBMIT_NOT_FILED_NOTE_MAX_LENGTH} characters).`,
    };
  }
  if (!input.actor.id.trim()) {
    return { ok: false, code: "BAD_REQUEST", message: "Sign in again." };
  }
  const refusal = getSubmitNotFiledConfirmationRefusal(input);
  if (refusal) return { ok: false, code: "PRECONDITION_FAILED", message: refusal };
  const data = jobData(input.job);
  const stop = getCurrentBrowserStop(data);
  if ((stop?.stoppedAt ?? null) !== input.checkedAfterBrowserStoppedAt) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message:
        "The run's browser stop changed after you opened this. Reload, check the Guernsey Tax Portal again, then confirm.",
    };
  }
  const dispatchedAt = data[SUBMIT_PREPARED_DISPATCHED_KEY];
  if (typeof dispatchedAt !== "number") {
    // The worker always writes Date.now(); anything else is not understood.
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message: "This run's portal dispatch record is not readable, so it cannot be confirmed here.",
    };
  }
  const sessionId = getSubmitRunBrowserSessionId(data);
  return {
    ok: true,
    confirmation: {
      version: 1,
      confirmedNotFiledAt: new Date(input.now).toISOString(),
      confirmedNotFiledBy: input.actor.id,
      confirmedNotFiledByName: input.actor.name?.trim() || null,
      note,
      dispatchedAt,
      browserSessionStatus: sessionId ? input.browserSessionStatus : null,
      browserStoppedAt: stop?.stoppedAt ?? null,
      browserStopVerified:
        !!sessionId &&
        !!stop?.verified &&
        isBrowserSessionStoppedStatus(input.browserSessionStatus),
    },
  };
}

const AGENT_REPORT_MAX_LENGTH = 6000;

function clip(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.length > AGENT_REPORT_MAX_LENGTH
    ? `${text.slice(0, AGENT_REPORT_MAX_LENGTH)}…`
    : text;
}

/**
 * What a dispatched run itself reported, shown to the staff member deciding
 * whether it filed. Information only: it never lifts the lock.
 */
export function getSubmitRunAgentReport(job: {
  resultData?: unknown;
  errorMessage?: string | null;
}): {
  output: string | null;
  question: string | null;
  error: string | null;
} {
  const data = isRecord(job.resultData) ? job.resultData : {};
  const output = clip(data.output) ?? clip(data.pauseReason);
  const question = isRecord(data.pendingQuestion) ? clip(data.pendingQuestion.text) : null;
  return {
    output,
    question: question && question !== output ? question : null,
    error: clip(job.errorMessage) ?? clip(data.startupError),
  };
}

/**
 * Finds the prepared draft a submit_prepared run may file, or why it may not.
 *
 * The latest prepare job on the return must have reached the review page
 * (READY), without any submission breach, with a recorded draft whose input
 * fingerprint still matches the current return, and a specific draft
 * identity. The only runs allowed after it are earlier submit_prepared
 * attempts on that same draft that failed or were cancelled before reaching
 * the browser. Anything else may have changed or filed the portal draft.
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
  const unconfirmed = getUnconfirmedSubmitBlocker(input);
  if (unconfirmed) return { ok: false, blocker: unconfirmed };

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
      (later.status === "failed" || later.status === "cancelled") &&
      !hasSubmitPreparedDispatch(data);
    if (isSubmitConfirmedNotFiled(later)) {
      // Staff confirmed it did not file, but it had the draft open in the
      // browser: the draft is re-checked by a new Prepare only run.
      return {
        ok: false,
        blocker: `A Submit prepared return run already had this draft open on the portal (staff confirmed it did not submit). ${PREPARE_AGAIN}`,
      };
    }
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
