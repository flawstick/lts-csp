/**
 * Pure classification of a finished Browser Use run. Kept separate from the
 * worker entrypoint so it can be unit tested.
 */

export type SubmissionMode = "prepare_only" | "submit_and_capture_pdf";

const PREPARE_ONLY_READY_MARKERS = [
  "ready_for_manual_submission",
  "ready for manual submission",
];

// Phrases that only appear once a filing has actually gone through.
const STRONG_SUBMISSION_MARKERS = [
  "submitted successfully",
  "successfully submitted",
  "submission complete",
  "submission completed",
  "filing complete",
  "filing completed",
  "post-submission confirmation",
  "downloaded completion pdf",
  "downloaded the receipt",
  // Filenames the GRS portal gives the post-submission receipt.
  "company-tax-submitted",
  "submitted.pdf",
];

// Phrases an agent also uses when describing the next (not yet taken) step,
// e.g. "clicking Submit will show the confirmation page".
const WEAK_SUBMISSION_MARKERS = ["confirmation page", "downloaded the pdf"];

const REQUIRES_ATTENTION_OUTPUT_MARKERS = [
  "requires_attention",
  "requires attention",
];

export const REQUIRES_ATTENTION_KEYWORDS = [
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

const NEGATION_PATTERN =
  /\b(not|never|no|without|before|until|didn't|did not|haven't|has not|have not|hasn't|wasn't|was not|isn't|is not|won't|will not|do not|don't|nothing)\b[^.!?\n]*$/;

function normalize(output: string) {
  return output.toLowerCase();
}

/** True when `marker` appears in `text` without a negation earlier in the same sentence. */
function hasAffirmedMarker(text: string, marker: string) {
  let index = text.indexOf(marker);
  while (index !== -1) {
    const sentenceStart = Math.max(
      text.lastIndexOf(".", index - 1),
      text.lastIndexOf("!", index - 1),
      text.lastIndexOf("?", index - 1),
      text.lastIndexOf("\n", index - 1),
    );
    const prefix = text.slice(sentenceStart + 1, index);
    if (!NEGATION_PATTERN.test(prefix)) {
      return true;
    }
    index = text.indexOf(marker, index + marker.length);
  }
  return false;
}

export function isPrepareOnlyReadyOutput(output: string): boolean {
  const normalized = normalize(output);
  return PREPARE_ONLY_READY_MARKERS.some((marker) =>
    normalized.includes(marker),
  );
}

export function isLikelySubmittedOutput(output: string): boolean {
  const normalized = normalize(output);
  const ready = isPrepareOnlyReadyOutput(output);
  const markers = ready
    ? STRONG_SUBMISSION_MARKERS
    : [...STRONG_SUBMISSION_MARKERS, ...WEAK_SUBMISSION_MARKERS];
  return markers.some((marker) => hasAffirmedMarker(normalized, marker));
}

export function hasRequiresAttentionOutputMarker(output: string): boolean {
  const normalized = normalize(output).trimStart();
  if (normalized.startsWith("**requires_attention") || normalized.startsWith("requires_attention")) {
    return true;
  }
  return REQUIRES_ATTENTION_OUTPUT_MARKERS.some((marker) =>
    hasAffirmedMarker(normalized, marker),
  );
}

export type RunOutcome = {
  success: boolean;
  prepareOnlyReady: boolean;
  /** The run reached (or claims to have reached) a filed state. */
  likelySubmitted: boolean;
  /** prepare_only run that appears to have submitted anyway. */
  prepareOnlyLikelySubmitted: boolean;
  needsAttention: boolean;
  /**
   * The agent stopped on the GRS contact step because no organisation filing
   * contact is configured. Always also `needsAttention`.
   */
  needsFilingContact: boolean;
};

/** Agent output marker for a run that stopped at the GRS contact step. */
export const NEEDS_FILING_CONTACT_MARKER = "NEEDS_FILING_CONTACT";

export function classifyRunOutcome(input: {
  submissionMode: SubmissionMode;
  sessionStatus: string;
  output: string;
  isTaskSuccessful?: boolean | null;
}): RunOutcome {
  const { submissionMode, output } = input;
  const lowerOutput = normalize(output);
  const prepareOnlyReady =
    submissionMode === "prepare_only" && isPrepareOnlyReadyOutput(output);
  const likelySubmitted = isLikelySubmittedOutput(output);
  const prepareOnlyLikelySubmitted =
    submissionMode === "prepare_only" && likelySubmitted;

  let success =
    input.sessionStatus === "idle" &&
    !hasAffirmedMarker(lowerOutput, "cancelled") &&
    (input.isTaskSuccessful ?? true);

  // The agent's explicit READY marker is the contract for prepare_only: the
  // draft is on the review/submit page awaiting a human. Browser Use's own
  // success judgement is not reliable for "stop before the last step" tasks.
  if (prepareOnlyReady && input.sessionStatus === "idle") {
    success = true;
  }

  if (prepareOnlyLikelySubmitted) {
    success = false;
  }

  const explicitRequiresAttention = hasRequiresAttentionOutputMarker(output);
  // A READY marker wins: the run reached the review/submit page, so it was
  // not left on the contact step (the return is review_required either way).
  const needsFilingContact =
    !prepareOnlyLikelySubmitted &&
    !prepareOnlyReady &&
    lowerOutput.includes(NEEDS_FILING_CONTACT_MARKER.toLowerCase());
  const needsAttention =
    !prepareOnlyLikelySubmitted &&
    (prepareOnlyReady
      ? false
      : needsFilingContact ||
        explicitRequiresAttention ||
        (!success &&
          REQUIRES_ATTENTION_KEYWORDS.some((keyword) =>
            lowerOutput.includes(keyword),
          )));

  return {
    success,
    prepareOnlyReady,
    likelySubmitted,
    prepareOnlyLikelySubmitted,
    needsAttention,
    needsFilingContact,
  };
}

/**
 * Tax return status after a finished run, before receipt gating. A prepared
 * draft and an unexpected/unverified submission both need a person to look at
 * the return, which is "review_required" — not "failed" — for the client.
 */
export function getTaxReturnStatusForOutcome(
  submissionMode: SubmissionMode,
  outcome: Pick<RunOutcome, "success" | "prepareOnlyLikelySubmitted"> &
    Partial<Pick<RunOutcome, "likelySubmitted">>,
): "completed" | "review_required" | "failed" {
  if (outcome.prepareOnlyLikelySubmitted) return "review_required";
  // A run can error out after the portal accepted the filing (e.g. while
  // downloading the receipt). It may be filed with GRS: never mark it failed.
  if (!outcome.success && outcome.likelySubmitted) return "review_required";
  if (!outcome.success) return "failed";
  return submissionMode === "prepare_only" ? "review_required" : "completed";
}

/**
 * Whether to look for the filed-return PDF. Any run that may have filed the
 * return needs its receipt — including failed runs that claim a submission and
 * prepare_only runs that submitted anyway. Submit-mode runs always look,
 * because the agent can file and then fail before reporting it.
 */
export function shouldCaptureFiledReturnPdf(
  submissionMode: SubmissionMode,
  outcome: Pick<RunOutcome, "success" | "prepareOnlyLikelySubmitted"> &
    Partial<Pick<RunOutcome, "likelySubmitted">>,
) {
  return (
    submissionMode === "submit_and_capture_pdf" ||
    outcome.prepareOnlyLikelySubmitted ||
    outcome.likelySubmitted === true
  );
}

export type ReceiptStatus = "uploaded" | "missing" | "failed" | "not_attempted";

export type FinalRunStatuses = {
  taxReturnStatus: "completed" | "review_required" | "failed";
  jobStatus: "completed" | "failed";
  taskStatus: "completed" | "failed";
  /**
   * Why a run that otherwise looked filed was held back from "completed".
   * Null when no receipt gate applied.
   */
  receiptGate: "receipt_missing" | "receipt_from_unsuccessful_run" | null;
};

/**
 * Receipt-gated final statuses. A return is only "completed" by the worker
 * when the portal-generated receipt was saved to the return; a likely filing
 * without a saved receipt is held at "review_required" so staff recover the
 * receipt instead of the client seeing a completed return with no PDF.
 */
export function resolveFinalRunStatuses(
  submissionMode: SubmissionMode,
  outcome: Pick<
    RunOutcome,
    "success" | "prepareOnlyLikelySubmitted" | "likelySubmitted"
  >,
  receiptStatus: ReceiptStatus,
): FinalRunStatuses {
  let taxReturnStatus = getTaxReturnStatusForOutcome(submissionMode, outcome);
  let receiptGate: FinalRunStatuses["receiptGate"] = null;

  if (taxReturnStatus === "completed" && receiptStatus !== "uploaded") {
    taxReturnStatus = "review_required";
    receiptGate = "receipt_missing";
  }

  // An unsuccessful run that nonetheless produced a new receipt PDF probably
  // filed: keep it for a human to confirm rather than failing the return.
  if (taxReturnStatus === "failed" && receiptStatus === "uploaded") {
    taxReturnStatus = "review_required";
    receiptGate = "receipt_from_unsuccessful_run";
  }

  const jobStatus = outcome.success ? "completed" : "failed";
  return { taxReturnStatus, jobStatus, taskStatus: jobStatus, receiptGate };
}
