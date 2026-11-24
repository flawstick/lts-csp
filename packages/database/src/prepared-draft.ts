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
   * Canonical review/submit page URL of this draft
   * (https://revenueservice.gov.gg/company-tax-ui/<draftId>/reviewAndSubmit/summary).
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

// The Guernsey Revenue Service company-tax-ui review/submit page of one draft
// (see prepare-only-guard/guard-core.js: the draft id in this path is the id
// the submit API posts to, /company-tax-api/v1/draftTaxReturn/<id>/...).
// Exact host and path only: a generic gov.gg page does not identify a draft.
const REVIEW_URL_PATTERN =
  /^https:\/\/revenueservice\.gov\.gg\/company-tax-ui\/(?:company-tax\/tax-returns\/)?([A-Za-z0-9_-]{1,128})\/reviewAndSubmit\/summary\/?$/;

/**
 * The draft id when `value` is the canonical review/submit page URL of a
 * specific draft, otherwise null (other hosts, paths, query or fragment).
 */
export function getGuernseyReviewDraftId(value: string): string | null {
  return value.trim().match(REVIEW_URL_PATTERN)?.[1] ?? null;
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
  "An earlier Submit prepared return run reached the portal and did not save a filed-return receipt, so the portal may have accepted the filing. Check the Guernsey Tax Portal and record the filed return instead of submitting again.";

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
 * Why no new submission (Submit prepared return or a full submit run) may
 * start for a return, from durable job evidence, or null.
 *
 * Any submit_prepared job that was dispatched to the browser counts, whatever
 * its status: cancelled, failed, timed out, lost worker or paused after an
 * error all may follow an accepted final click. There is no objectively safe
 * job state that clears it; a completed filing is recorded on the return
 * (which then refuses every new run as already completed).
 */
export function getUnconfirmedSubmitBlocker(input: {
  jobs: PreparedDraftJob[];
  /** The job being started (worker side): ignored. */
  excludeJobId?: string;
}): string | null {
  return input.jobs.some(
    (job) =>
      job.id !== input.excludeJobId && hasSubmitPreparedDispatch(job.resultData),
  )
    ? UNCONFIRMED_SUBMIT_BLOCKER
    : null;
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
