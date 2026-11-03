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
};

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
  const needsAttention =
    !prepareOnlyLikelySubmitted &&
    (prepareOnlyReady
      ? false
      : explicitRequiresAttention ||
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
  };
}

/**
 * Tax return status after a finished run. A prepared draft and an
 * unexpected/unverified submission both need a person to look at the return,
 * which is "review_required" — not "failed" — for the client.
 */
export function getTaxReturnStatusForOutcome(
  submissionMode: SubmissionMode,
  outcome: Pick<RunOutcome, "success" | "prepareOnlyLikelySubmitted">,
): "completed" | "review_required" | "failed" {
  if (outcome.prepareOnlyLikelySubmitted) return "review_required";
  if (!outcome.success) return "failed";
  return submissionMode === "prepare_only" ? "review_required" : "completed";
}

/**
 * Whether the filed-return PDF must be captured. Any run that may have filed
 * the return needs its artifact, including a prepare_only run that submitted.
 */
export function shouldCaptureFiledReturnPdf(
  submissionMode: SubmissionMode,
  outcome: Pick<RunOutcome, "success" | "prepareOnlyLikelySubmitted">,
) {
  return (
    (submissionMode === "submit_and_capture_pdf" && outcome.success) ||
    outcome.prepareOnlyLikelySubmitted
  );
}
