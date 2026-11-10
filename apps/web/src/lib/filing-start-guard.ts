import { getGuernseyScopedRequirementBlocker } from "@repo/database/guernsey-filing";
import {
  getPendingGbpConversionMessage,
  hasManagerSignoff,
  hasSubmissionSignoff,
} from "@repo/database/return-readiness";

type FilingStartTaxReturn = {
  status: string;
  returnType: string | null;
  metadata?: unknown;
  readyForSubmissionAt?: Date | string | null;
  jurisdiction?: { code: string } | null;
  substanceForm?: {
    managerSignOff?: string | null;
    managerSignOffDate?: string | null;
    certificateType?: string | null;
    relevantActivity?: string | null;
    adequacyExpenditureDetails?: string | null;
  } | null;
};

/**
 * Reason a browser filing run must not start, or null when it may.
 *
 * Preparing a draft (prepare_only) stops before the final submit and is
 * reviewed by LTS, so it is allowed before any approval. Submitting to the
 * Guernsey Tax Portal requires the manager's signoff on the form, the client's
 * signoff on the current data, and GBP financial figures.
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

  // In-scope-only requirements are checked against the current form data, so
  // an older approval cannot carry a missing value through to filing.
  const scopedRequirementBlocker = getGuernseyScopedRequirementBlocker(
    taxReturn.substanceForm,
  );
  if (scopedRequirementBlocker) return scopedRequirementBlocker;

  if (!hasManagerSignoff(taxReturn.substanceForm)) {
    return "The manager has not signed off this return. Record the manager's name and sign-off date under Finalising the Return, then have an authorised signatory mark it ready for submission in the client portal.";
  }

  if (!hasSubmissionSignoff(taxReturn)) {
    return "The client has not signed off this return. An authorised signatory must mark it ready for submission in the client portal before it can be submitted. Edits made after signoff require a new signoff.";
  }

  return getPendingGbpConversionMessage(taxReturn.metadata);
}
