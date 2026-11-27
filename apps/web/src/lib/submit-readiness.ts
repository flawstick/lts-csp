import { resolveGuernseyCertificateType } from "@repo/database/guernsey-filing";
import {
  fingerprintPreparedInputs,
  getEarlierUnreceiptedSubmitCaution,
  getEarlierUnreceiptedSubmitJobs,
  resolvePreparedDraft,
  type PreparedDraftJob,
} from "@repo/database/prepared-draft";
import { getFilingStartBlocker } from "@/lib/filing-start-guard";
import { ACTIVE_JOB_STATUSES } from "@/lib/manual-completion";

/**
 * Start gates for browser filing runs, shared by `startJob` (which enforces
 * them) and `getTask` (which reports them so the task page can disable a
 * submit action and say why before anyone clicks it).
 *
 * Readiness is advisory only. The server re-runs every gate inside the
 * enqueue transaction, under the return row lock, whatever the page showed.
 */

export const JERSEY_AUTOMATION_UNAVAILABLE_MESSAGE =
  "Jersey browser automation is not implemented yet. Use the Jersey return form workflow instead.";
export const SUBMIT_PREPARED_GUERNSEY_ONLY_MESSAGE =
  "Submit prepared return is only available for Guernsey ESR returns.";
export const UNRESOLVED_CERTIFICATE_MESSAGE =
  "Certificate type is unresolved for this Guernsey return. Confirm Certificate 2 or Certificate 3 on the return page before starting automation.";
export const RETURN_ALREADY_COMPLETED_MESSAGE =
  "This return is already completed.";
export const ACTIVE_JOB_ON_RETURN_MESSAGE =
  "A job is already running for this return";

type StartTargetReturn = {
  returnType: string | null;
  metadata?: unknown;
  jurisdiction?: { code: string } | null;
  substanceForm?: { certificateType?: string | null } | null;
};

function isGuernseyEsr(taxReturn: StartTargetReturn) {
  return (
    taxReturn.jurisdiction?.code === "GG" &&
    taxReturn.returnType === "economic_substance"
  );
}

/**
 * Why no browser run of this kind can start for the return at all, from the
 * return itself (jurisdiction, return type, certificate), or null.
 */
export function getStartTargetBlocker(input: {
  taxReturn: StartTargetReturn;
  isSubmitPrepared: boolean;
}): string | null {
  const { taxReturn } = input;
  if (
    taxReturn.jurisdiction?.code === "JE" &&
    taxReturn.returnType === "company"
  ) {
    return JERSEY_AUTOMATION_UNAVAILABLE_MESSAGE;
  }
  if (input.isSubmitPrepared && !isGuernseyEsr(taxReturn)) {
    return SUBMIT_PREPARED_GUERNSEY_ONLY_MESSAGE;
  }
  if (isGuernseyEsr(taxReturn)) {
    const resolution = resolveGuernseyCertificateType({
      metadata:
        taxReturn.metadata && typeof taxReturn.metadata === "object"
          ? (taxReturn.metadata as Record<string, unknown>)
          : null,
      savedCertificateType: taxReturn.substanceForm?.certificateType ?? null,
    });
    if (resolution.unresolved) return UNRESOLVED_CERTIFICATE_MESSAGE;
  }
  return null;
}

export type SubmitDraftGate =
  | { ok: true; preparedJobId: string | null }
  | { ok: false; blocker: string };

/**
 * The job-evidence gate for a submit run: for Submit prepared return, a
 * prepared draft that still matches the current return. `returnJobs` must be
 * every job on the return (all of its tasks), not only the task being
 * started. An earlier submit run that reached the portal without a receipt
 * does not block (see getEarlierSubmitCaution): the new run checks the
 * portal first.
 */
export function getSubmitDraftGate(input: {
  isSubmitPrepared: boolean;
  returnJobs: PreparedDraftJob[];
  taxReturn: {
    entityName?: string | null;
    taxYear?: number | string | null;
    link?: string | null;
    files?: unknown;
  };
  substanceForm: Record<string, unknown> | null | undefined;
}): SubmitDraftGate {
  if (!input.isSubmitPrepared) return { ok: true, preparedJobId: null };

  const form = input.substanceForm ?? null;
  const resolution = resolvePreparedDraft({
    jobs: input.returnJobs,
    requireNetBookValueReview: form?.certificateType !== "Certificate 2",
    currentFingerprint: fingerprintPreparedInputs({
      entityName: input.taxReturn.entityName,
      taxYear: input.taxReturn.taxYear,
      link: input.taxReturn.link,
      files: input.taxReturn.files,
      substanceForm: form,
    }),
  });
  if (!resolution.ok) return { ok: false, blocker: resolution.blocker };
  return { ok: true, preparedJobId: resolution.preparedJob.id };
}

/** A return job with its run number, as getTask and startJob read it. */
export type ReturnJob = PreparedDraftJob & { jobNumber?: number | null };

/**
 * Ids of the earlier submit runs on the return that reached the portal and
 * saved no receipt, and the one-line caution shown before a new submission
 * (null when there are none). Never a blocker.
 */
export function getEarlierSubmitCaution(returnJobs: ReturnJob[]): {
  jobIds: string[];
  caution: string | null;
} {
  const earlier = getEarlierUnreceiptedSubmitJobs({ jobs: returnJobs });
  return {
    jobIds: earlier.map((job) => job.id),
    caution: getEarlierUnreceiptedSubmitCaution(earlier),
  };
}

export type SubmitReadiness = { ready: boolean; blocker: string | null };

export type SubmitReadinessByOperation = {
  /** A full submit run (fill or refill, then submit). */
  submit: SubmitReadiness;
  /** Submit prepared return: file the last Prepare only draft unchanged. */
  submitPrepared: SubmitReadiness;
  /**
   * Shown in both submit confirmations when earlier submit runs reached the
   * portal without a receipt; null otherwise. Advisory only.
   */
  caution: string | null;
};

type ReadinessTaxReturn = Parameters<typeof getFilingStartBlocker>[0]["taxReturn"] &
  StartTargetReturn & {
    entityName?: string | null;
    taxYear?: number | string | null;
    link?: string | null;
    substanceForm?: Record<string, unknown> | null;
  };

/**
 * Whether a submit run of this kind would pass every start gate now, and the
 * first reason it would not. Same gates, same order and same messages as
 * `startJob`; read-only.
 */
export function getSubmitReadiness(input: {
  isSubmitPrepared: boolean;
  taxReturn: ReadinessTaxReturn;
  returnJobs: ReturnJob[];
  maintenanceBlocker?: string | null;
}): SubmitReadiness {
  const blocker =
    input.maintenanceBlocker ||
    getStartTargetBlocker({
      taxReturn: input.taxReturn,
      isSubmitPrepared: input.isSubmitPrepared,
    }) ||
    getFilingStartBlocker({
      taxReturn: input.taxReturn,
      submissionMode: "submit_and_capture_pdf",
    }) ||
    (input.taxReturn.status === "completed"
      ? RETURN_ALREADY_COMPLETED_MESSAGE
      : null) ||
    (input.returnJobs.some((job) =>
      (ACTIVE_JOB_STATUSES as readonly string[]).includes(job.status),
    )
      ? ACTIVE_JOB_ON_RETURN_MESSAGE
      : null) ||
    (() => {
      const gate = getSubmitDraftGate({
        isSubmitPrepared: input.isSubmitPrepared,
        returnJobs: input.returnJobs,
        taxReturn: input.taxReturn,
        substanceForm: input.taxReturn.substanceForm,
      });
      return gate.ok ? null : gate.blocker;
    })();
  return blocker ? { ready: false, blocker } : { ready: true, blocker: null };
}

/** Readiness of both submit operations (see getSubmitReadiness). */
export function getSubmitReadinessByOperation(
  input: Omit<Parameters<typeof getSubmitReadiness>[0], "isSubmitPrepared">,
): SubmitReadinessByOperation {
  return {
    submit: getSubmitReadiness({ ...input, isSubmitPrepared: false }),
    submitPrepared: getSubmitReadiness({ ...input, isSubmitPrepared: true }),
    caution: getEarlierSubmitCaution(input.returnJobs).caution,
  };
}
