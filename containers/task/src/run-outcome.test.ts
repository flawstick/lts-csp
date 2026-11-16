import { describe, expect, it } from "vitest";

import {
  classifyRunOutcome,
  getTaxReturnStatusForOutcome,
  isLikelySubmittedOutput,
  resolveFinalRunStatuses,
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

describe("receipt-gated completion", () => {
  const submitted = classifyRunOutcome({
    submissionMode: "submit_and_capture_pdf",
    sessionStatus: "idle",
    output: "Submitted successfully and downloaded the completion PDF.",
    isTaskSuccessful: true,
  });

  it("completes a submit run only when the receipt was saved", () => {
    expect(
      resolveFinalRunStatuses("submit_and_capture_pdf", submitted, "uploaded"),
    ).toEqual({
      taxReturnStatus: "completed",
      jobStatus: "completed",
      taskStatus: "completed",
      receiptGate: null,
    });
  });

  it.each(["missing", "failed", "not_attempted"] as const)(
    "holds a successful submit run for review when the receipt is %s",
    (receiptStatus) => {
      expect(
        resolveFinalRunStatuses("submit_and_capture_pdf", submitted, receiptStatus),
      ).toMatchObject({
        taxReturnStatus: "review_required",
        receiptGate: "receipt_missing",
      });
    },
  );

  it("looks for the receipt even when a submit run failed (Minoru pattern)", () => {
    // The run errored but its output says the receipt was saved.
    const failed = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "error",
      output:
        "Saved the receipt to /workspace/downloads/company-tax-submitted.pdf",
      isTaskSuccessful: false,
    });
    expect(failed.success).toBe(false);
    expect(failed.likelySubmitted).toBe(true);
    expect(shouldCaptureFiledReturnPdf("submit_and_capture_pdf", failed)).toBe(
      true,
    );
    // Possibly filed: never "failed", even without a receipt.
    expect(
      resolveFinalRunStatuses("submit_and_capture_pdf", failed, "missing"),
    ).toMatchObject({ taxReturnStatus: "review_required", jobStatus: "failed" });
    expect(
      resolveFinalRunStatuses("submit_and_capture_pdf", failed, "uploaded"),
    ).toMatchObject({ taxReturnStatus: "review_required" });
  });

  it("holds an unsuccessful run with a new receipt for review instead of failing it", () => {
    const failed = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "error",
      output: "Something went wrong.",
      isTaskSuccessful: false,
    });
    expect(shouldCaptureFiledReturnPdf("submit_and_capture_pdf", failed)).toBe(
      true,
    );
    expect(
      resolveFinalRunStatuses("submit_and_capture_pdf", failed, "uploaded"),
    ).toMatchObject({
      taxReturnStatus: "review_required",
      receiptGate: "receipt_from_unsuccessful_run",
    });
    expect(
      resolveFinalRunStatuses("submit_and_capture_pdf", failed, "missing"),
    ).toMatchObject({ taxReturnStatus: "failed", receiptGate: null });
  });

  it("keeps prepare-only drafts at review_required without a receipt", () => {
    const ready = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output: readyOutput,
      isTaskSuccessful: true,
    });
    expect(shouldCaptureFiledReturnPdf("prepare_only", ready)).toBe(false);
    expect(
      resolveFinalRunStatuses("prepare_only", ready, "not_attempted"),
    ).toMatchObject({
      taxReturnStatus: "review_required",
      jobStatus: "completed",
      receiptGate: null,
    });
  });
});
