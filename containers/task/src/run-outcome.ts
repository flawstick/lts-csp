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

const NEGATION_WORDS =
  "not|never|no|without|before|until|didn't|did not|haven't|has not|have not|hasn't|wasn't|was not|isn't|is not|won't|will not|do not|don't|nothing";

const NEGATION_PATTERN = new RegExp(
  `\\b(${NEGATION_WORDS})\\b[^.!?\\n]*$`,
);

// Weak markers are also how an agent describes a step it could not or did not
// take ("cannot move on to the confirmation page", "clicking it would show the
// confirmation page"), so modal and inability words also negate them. They are
// not applied to strong markers: "I cannot find the receipt link, but the
// return was submitted successfully" must still count as a filing.
const WEAK_NEGATION_PATTERN = new RegExp(
  `\\b(${NEGATION_WORDS}|cannot|can['\u2019]t|could not|couldn['\u2019]t|unable|would|will|could)\\b[^.!?\\n]*$`,
);

function normalize(output: string) {
  return output.toLowerCase();
}

/** True when `marker` appears in `text` without a negation earlier in the same sentence. */
function hasAffirmedMarker(
  text: string,
  marker: string,
  negation: RegExp = NEGATION_PATTERN,
) {
  let index = text.indexOf(marker);
  while (index !== -1) {
    const sentenceStart = Math.max(
      text.lastIndexOf(".", index - 1),
      text.lastIndexOf("!", index - 1),
      text.lastIndexOf("?", index - 1),
      text.lastIndexOf("\n", index - 1),
    );
    const prefix = text.slice(sentenceStart + 1, index);
    if (!negation.test(prefix)) {
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

/** The output opens with the REQUIRES_ATTENTION marker (optionally bold). */
function startsWithRequiresAttention(output: string): boolean {
  return /^\**\s*requires_attention\b/.test(normalize(output).trimStart());
}

/**
 * The output is one of the "stopped before the final button" reports
 * (REQUIRES_ATTENTION: DECLARATION_INCOMPLETE / PREPARED_DRAFT_NOT_VERIFIED).
 * Both contracts mean the final filing action was not clicked, and both ask
 * the agent to describe the page and the button, so they are judged on
 * strong markers only, like a READY output.
 */
function isStoppedBeforeFilingOutput(output: string): boolean {
  if (!startsWithRequiresAttention(output)) return false;
  const normalized = normalize(output);
  return STOPPED_BEFORE_FILING_MARKERS.some((marker) =>
    normalized.includes(marker.toLowerCase()),
  );
}

export function isLikelySubmittedOutput(output: string): boolean {
  const normalized = normalize(output);
  const strongOnly =
    isPrepareOnlyReadyOutput(output) || isStoppedBeforeFilingOutput(output);
  if (
    STRONG_SUBMISSION_MARKERS.some((marker) =>
      hasAffirmedMarker(normalized, marker),
    )
  ) {
    return true;
  }
  return (
    !strongOnly &&
    WEAK_SUBMISSION_MARKERS.some((marker) =>
      hasAffirmedMarker(normalized, marker, WEAK_NEGATION_PATTERN),
    )
  );
}

export function hasRequiresAttentionOutputMarker(output: string): boolean {
  const normalized = normalize(output);
  if (startsWithRequiresAttention(output)) {
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
  /**
   * A submit run's first check found the return already submitted on the
   * portal (REQUIRES_ATTENTION: ALREADY_SUBMITTED:), so it did not submit.
   * Always also `needsAttention`, never `success` or `likelySubmitted`: the
   * filing is not this run's, and the run is held for review rather than
   * paused and re-driven.
   */
  alreadySubmitted: boolean;
};

/** Agent output marker for a run that stopped at the GRS contact step. */
export const NEEDS_FILING_CONTACT_MARKER = "NEEDS_FILING_CONTACT";

/**
 * Agent output marker for a prepare run that reached the declaration step but
 * could not leave it complete (notice of assessment answer not selectable, a
 * declaration box that will not tick, or the final button still disabled).
 * Always reported as "REQUIRES_ATTENTION: DECLARATION_INCOMPLETE: ...", which
 * pauses the run and records no prepared draft.
 */
export const DECLARATION_INCOMPLETE_MARKER = "DECLARATION_INCOMPLETE";

/** Output marker for a submit_prepared run that refused to submit. */
export const PREPARED_DRAFT_NOT_VERIFIED_MARKER = "PREPARED_DRAFT_NOT_VERIFIED";

/**
 * Output marker for a submit run whose first check found the return already
 * submitted on the portal (an earlier run, or a person, filed it). Reported
 * as "REQUIRES_ATTENTION: ALREADY_SUBMITTED: ..." before anything is changed.
 */
export const ALREADY_SUBMITTED_MARKER = "ALREADY_SUBMITTED";

const STOPPED_BEFORE_FILING_MARKERS = [
  DECLARATION_INCOMPLETE_MARKER,
  PREPARED_DRAFT_NOT_VERIFIED_MARKER,
  ALREADY_SUBMITTED_MARKER,
];

/**
 * The output opens with "REQUIRES_ATTENTION: ALREADY_SUBMITTED:" (bold
 * markers anywhere in it allowed, e.g. "**REQUIRES_ATTENTION: ALREADY_SUBMITTED:**").
 */
export function isAlreadySubmittedOutput(output: string): boolean {
  const lead = normalize(output).trimStart().replace(/\*+|__/g, "");
  return /^\s*requires_attention\s*:\s*already_submitted\b/.test(lead);
}

export function classifyRunOutcome(input: {
  submissionMode: SubmissionMode;
  sessionStatus: string;
  output: string;
  isTaskSuccessful?: boolean | null;
}): RunOutcome {
  const { submissionMode, output } = input;
  const lowerOutput = normalize(output);
  // An output that opens with REQUIRES_ATTENTION is a stop, even if it also
  // mentions the READY marker (e.g. "not READY_FOR_MANUAL_SUBMISSION").
  const prepareOnlyReady =
    submissionMode === "prepare_only" &&
    isPrepareOnlyReadyOutput(output) &&
    !startsWithRequiresAttention(output);
  // Only submit runs are asked for the check; the portal's own "Submitted"
  // status it quotes is not a filing by this run.
  const alreadySubmitted =
    submissionMode === "submit_and_capture_pdf" &&
    isAlreadySubmittedOutput(output);
  const likelySubmitted = !alreadySubmitted && isLikelySubmittedOutput(output);
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

  if (prepareOnlyLikelySubmitted || alreadySubmitted) {
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
    needsAttention: needsAttention || alreadySubmitted,
    needsFilingContact: needsFilingContact && !alreadySubmitted,
    alreadySubmitted,
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
    Partial<Pick<RunOutcome, "likelySubmitted" | "alreadySubmitted">>,
): "completed" | "review_required" | "failed" {
  if (outcome.prepareOnlyLikelySubmitted) return "review_required";
  // The portal shows it filed (not by this run): a person confirms it and
  // records the filed return; it is never "failed" and never completed here.
  if (outcome.alreadySubmitted) return "review_required";
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
  receiptGate:
    | "receipt_missing"
    | "receipt_from_unsuccessful_run"
    | typeof PORTAL_ALREADY_SUBMITTED_GATE
    | null;
};

/**
 * Receipt gate for a submit run that found the return already submitted on
 * the portal. Recorded on the return (metadata.filedReturnPdf), where it
 * refuses any new submission until staff record the filed return.
 */
export const PORTAL_ALREADY_SUBMITTED_GATE = "portal_reports_already_submitted";

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
  > &
    Partial<Pick<RunOutcome, "alreadySubmitted">>,
  receiptStatus: ReceiptStatus,
): FinalRunStatuses {
  let taxReturnStatus = getTaxReturnStatusForOutcome(submissionMode, outcome);
  let receiptGate: FinalRunStatuses["receiptGate"] = null;

  // Held for review whatever was downloaded: a filed-return PDF the agent
  // found is attached to the return (as for any receipt), but the return is
  // only completed once a person confirms it on the portal.
  if (outcome.alreadySubmitted) {
    return {
      taxReturnStatus: "review_required",
      jobStatus: "failed",
      taskStatus: "failed",
      receiptGate: PORTAL_ALREADY_SUBMITTED_GATE,
    };
  }

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
