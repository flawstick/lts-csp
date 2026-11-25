import {
  getGuernseyNoticeOfAssessmentBlocker,
  getGuernseyScopedRequirementBlocker,
} from "@repo/database/guernsey-filing";
import {
  getPendingGbpConversionMessage,
  hasManagerSignoff,
  hasSubmissionSignoff,
} from "@repo/database/return-readiness";

type FilingStartTaxReturn = {
  status: string;
  returnType: string | null;
  metadata?: unknown;
  files?: unknown;
  readyForSubmissionAt?: Date | string | null;
  jurisdiction?: { code: string } | null;
  substanceForm?: {
    managerSignOff?: string | null;
    managerSignOffDate?: string | null;
    certificateType?: string | null;
    relevantActivity?: string | null;
    adequacyExpenditureDetails?: string | null;
    noticeOfAssessment?: string | null;
  } | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Evidence that an earlier run may already have filed this return: a saved
 * portal receipt, or a worker receipt gate (a run reported or produced a
 * submission without the return being completed). Submitting again could
 * file twice, so staff must check the portal and recover the receipt instead.
 */
export function getPossibleFilingEvidence(taxReturn: {
  files?: unknown;
  metadata?: unknown;
}): string | null {
  const files = Array.isArray(taxReturn.files) ? taxReturn.files : [];
  if (
    files.some(
      (file) => isRecord(file) && file.role === "filed_return_pdf",
    )
  ) {
    return "filed_return_pdf_attached";
  }
  const capture = isRecord(taxReturn.metadata)
    ? taxReturn.metadata.filedReturnPdf
    : undefined;
  if (isRecord(capture)) {
    if (capture.status === "uploaded") return "receipt_captured";
    if (typeof capture.receiptGate === "string" && capture.receiptGate) {
      return capture.receiptGate;
    }
  }
  return null;
}

/**
 * Reason a browser filing run must not start, or null when it may.
 *
 * Preparing a draft (prepare_only) stops before the final submit and is
 * reviewed by LTS, so it is allowed before any approval. Submitting to the
 * Guernsey Tax Portal (a full submit or Submit prepared return) requires the
 * reviewer's notice-of-assessment answer, the manager's signoff on the form,
 * the client's signoff on the current data, and GBP financial figures.
 */
export function getFilingStartBlocker(input: {
  taxReturn: FilingStartTaxReturn;
  submissionMode: "prepare_only" | "submit_and_capture_pdf";
}): string | null {
  const { taxReturn } = input;
  const isGuernseyEsr =
    taxReturn.jurisdiction?.code === "GG" &&
    taxReturn.returnType === "economic_substance";

  if (!isGuernseyEsr || input.submissionMode !== "submit_and_capture_pdf") {
    return null;
  }

  if (taxReturn.status === "completed") {
    return "This return is already completed in the Guernsey Tax Portal.";
  }

  const filingEvidence = getPossibleFilingEvidence(taxReturn);
  if (filingEvidence) {
    return `An earlier run may already have filed this return (${filingEvidence}). Check the Guernsey Tax Portal and recover the filed-return PDF instead of submitting again.`;
  }

  // In-scope-only requirements are checked against the current form data, so
  // an older approval cannot carry a missing value through to filing.
  const scopedRequirementBlocker = getGuernseyScopedRequirementBlocker(
    taxReturn.substanceForm,
  );
  if (scopedRequirementBlocker) return scopedRequirementBlocker;

  // The portal's declaration page asks it on every submission. A person
  // decides it per return; the filing agent is never left to pick it.
  const noticeOfAssessmentBlocker = getGuernseyNoticeOfAssessmentBlocker(
    taxReturn.substanceForm,
  );
  if (noticeOfAssessmentBlocker) return noticeOfAssessmentBlocker;

  if (!hasManagerSignoff(taxReturn.substanceForm)) {
    return "The manager has not signed off this return. Record the manager's name and sign-off date under Finalising the Return, then have an authorised signatory mark it ready for submission in the client portal.";
  }

  if (!hasSubmissionSignoff(taxReturn)) {
    return "The client has not signed off this return. An authorised signatory must mark it ready for submission in the client portal before it can be submitted. Edits made after signoff require a new signoff.";
  }

  return getPendingGbpConversionMessage(taxReturn.metadata);
}
