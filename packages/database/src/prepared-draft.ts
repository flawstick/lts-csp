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
 * Earlier Submit prepared return runs on the return that reached the portal
 * (dispatched to the browser) and saved no filed-return receipt, oldest
 * first. Any of them may have filed. They never block a new submission: the
 * new run is told about them and first checks on the portal that the return
 * is not already submitted (REQUIRES_ATTENTION: ALREADY_SUBMITTED otherwise).
 * A run that did save a receipt is not listed: the receipt itself refuses a
 * new submission (see the web filing start guard).
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
        hasSubmitPreparedDispatch(job.resultData) &&
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
  if (numbers.length === 1) return `Run ${numbers[0]}`;
  return `Runs ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/**
 * The one-line caution shown before starting a submission when earlier
 * submit runs may have filed, or null when there are none.
 */
export function getEarlierUnreceiptedSubmitCaution(
  jobs: Array<{ jobNumber?: number | null }>,
): string | null {
  if (jobs.length === 0) return null;
  const runs =
    formatRunNumbers(jobs) ??
    (jobs.length === 1
      ? "An earlier Submit prepared return run"
      : "Earlier Submit prepared return runs");
  return `${runs} reached the portal and saved no receipt. This run first checks the portal shows the return as not yet submitted.`;
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
