import { describe, expect, it } from "vitest";

import {
  classifyRunOutcome,
  getTaxReturnStatusForOutcome,
  isLikelySubmittedOutput,
  shouldCaptureFiledReturnPdf,
} from "./run-outcome";

const readyOutput = `**READY_FOR_MANUAL_SUBMISSION:** The return is on the Review and Submit page.
Nothing requires attention. Clicking "Submit" will take the reviewer to the confirmation page.
I did not click Submit.`;

describe("classifyRunOutcome", () => {
  it("treats a prepared draft as ready for review, not failed or paused", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output: readyOutput,
      // Browser Use sometimes judges "stopped before submit" as unsuccessful.
      isTaskSuccessful: false,
    });

    expect(outcome).toMatchObject({
      success: true,
      prepareOnlyReady: true,
      prepareOnlyLikelySubmitted: false,
      needsAttention: false,
    });
    expect(getTaxReturnStatusForOutcome("prepare_only", outcome)).toBe(
      "review_required",
    );
  });

  it("does not treat negated submission phrases as a submission", () => {
    expect(
      isLikelySubmittedOutput(
        "The return has not been submitted successfully yet; it is waiting on the summary page.",
      ),
    ).toBe(false);
    expect(
      isLikelySubmittedOutput(
        "Return submitted successfully. Downloaded the receipt.",
      ),
    ).toBe(true);
  });

  it("flags a prepare_only run that really submitted and captures its PDF", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output: "The filing was submitted successfully and I downloaded the receipt.",
      isTaskSuccessful: true,
    });

    expect(outcome.prepareOnlyLikelySubmitted).toBe(true);
    expect(outcome.success).toBe(false);
    expect(outcome.needsAttention).toBe(false);
    expect(getTaxReturnStatusForOutcome("prepare_only", outcome)).toBe(
      "review_required",
    );
    expect(shouldCaptureFiledReturnPdf("prepare_only", outcome)).toBe(true);
  });

  it("pauses for an explicit requires-attention report", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output:
        "**REQUIRES_ATTENTION:** Is the entity incorporated in Guernsey? is required but no value was provided.",
      isTaskSuccessful: false,
    });

    expect(outcome.needsAttention).toBe(true);
    expect(outcome.success).toBe(false);
  });

  it("pauses when an unsuccessful run reports a login problem", () => {
    expect(
      classifyRunOutcome({
        submissionMode: "submit_and_capture_pdf",
        sessionStatus: "idle",
        output: "Unable to proceed: the portal asked me to log in again (password).",
        isTaskSuccessful: false,
      }).needsAttention,
    ).toBe(true);
  });

  it("completes a successful submit run and captures its PDF", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output: "Submitted successfully and downloaded the completion PDF.",
      isTaskSuccessful: true,
    });

    expect(outcome.success).toBe(true);
    expect(getTaxReturnStatusForOutcome("submit_and_capture_pdf", outcome)).toBe(
      "completed",
    );
    expect(shouldCaptureFiledReturnPdf("submit_and_capture_pdf", outcome)).toBe(
      true,
    );
  });

  it("fails a stopped session", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "stopped",
      output: "",
      isTaskSuccessful: null,
    });
    expect(outcome.success).toBe(false);
    expect(getTaxReturnStatusForOutcome("prepare_only", outcome)).toBe("failed");
    expect(shouldCaptureFiledReturnPdf("prepare_only", outcome)).toBe(false);
  });
});
