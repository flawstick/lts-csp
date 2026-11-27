import { describe, expect, it } from "vitest";

import {
  ALREADY_SUBMITTED_MARKER,
  classifyRunOutcome,
  getTaxReturnStatusForOutcome,
  isAlreadySubmittedOutput,
  isLikelySubmittedOutput,
  PORTAL_ALREADY_SUBMITTED_GATE,
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

  it("flags a prepare-only run that stopped at the contact step for a filing contact", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output:
        "**REQUIRES_ATTENTION: NEEDS_FILING_CONTACT:** All sections are complete. I stopped on the contact step; the contact fields are pre-filled and were left untouched.",
      // Browser Use may judge a deliberate stop as successful.
      isTaskSuccessful: true,
    });

    expect(outcome).toMatchObject({
      needsFilingContact: true,
      needsAttention: true,
      prepareOnlyReady: false,
      prepareOnlyLikelySubmitted: false,
    });
  });

  it("does not flag a filing-contact stop once the run reached the review page", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output: `${readyOutput}\nThe NEEDS_FILING_CONTACT step was completed by a person.`,
      isTaskSuccessful: true,
    });

    expect(outcome.needsFilingContact).toBe(false);
    expect(outcome.needsAttention).toBe(false);
    expect(getTaxReturnStatusForOutcome("prepare_only", outcome)).toBe(
      "review_required",
    );
  });

  it("never treats a likely submission as a filing-contact stop", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output:
        "REQUIRES_ATTENTION: NEEDS_FILING_CONTACT: the return was submitted successfully.",
      isTaskSuccessful: true,
    });

    expect(outcome.prepareOnlyLikelySubmitted).toBe(true);
    expect(outcome.needsFilingContact).toBe(false);
    expect(outcome.needsAttention).toBe(false);
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

describe("prepare run that completed the declaration step", () => {
  // Shape of the Pudleston (2026-11-27) prepare output once the declaration
  // step is completed in the prepare run.
  const declarationReady = `READY_FOR_MANUAL_SUBMISSION: The return is prepared and on the final declaration/submit page. Notice of assessment: selected "Yes" (LTS's default answer). All three declaration confirmations are ticked: "I declare that the information given in this return is correct and complete", "I confirm that I am authorised to submit this return on behalf of the company" and the third declaration box. The final button "Complete submission to Revenue Service" is now enabled and was not clicked; it is the only remaining portal action.
REVIEW_PAGE_URL: https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/0b6f3c1e-8f7d-4b39-9a51-2f1c7d6e4a10/reviewAndSubmit/declaration
PORTAL_REFERENCE: NONE`;

  it("is a prepared draft, not a submission", () => {
    expect(isLikelySubmittedOutput(declarationReady)).toBe(false);
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output: declarationReady,
      isTaskSuccessful: false,
    });
    expect(outcome).toMatchObject({
      success: true,
      prepareOnlyReady: true,
      likelySubmitted: false,
      prepareOnlyLikelySubmitted: false,
      needsAttention: false,
      needsFilingContact: false,
    });
    expect(shouldCaptureFiledReturnPdf("prepare_only", outcome)).toBe(false);
    expect(getTaxReturnStatusForOutcome("prepare_only", outcome)).toBe("review_required");
  });

  it.each([
    "**REQUIRES_ATTENTION: DECLARATION_INCOMPLETE:** The second declaration box would not stay ticked; \"Complete submission to Revenue Service\" is still disabled. I did not click it.",
    "REQUIRES_ATTENTION: DECLARATION_INCOMPLETE: 'Please indicate if you wish to receive a notice of assessment' shows no 'Yes' option (options: 'Paper', 'Email'). This is not READY_FOR_MANUAL_SUBMISSION; nothing was submitted.",
  ])("pauses when the declaration could not be completed: %s", (output) => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output,
      isTaskSuccessful: true,
    });
    expect(outcome).toMatchObject({
      prepareOnlyReady: false,
      likelySubmitted: false,
      prepareOnlyLikelySubmitted: false,
      needsAttention: true,
      needsFilingContact: false,
    });
  });

  // Reports that describe the button or the next page in weak-marker terms
  // (review finding: these were classified as a prepare run that filed).
  it.each([
    'REQUIRES_ATTENTION: DECLARATION_INCOMPLETE: Selected "Yes" and ticked all three declaration boxes, but "Complete submission to Revenue Service" is still greyed out, so the return cannot move on to the confirmation page. URL: https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-1/reviewAndSubmit/declaration',
    "REQUIRES_ATTENTION: DECLARATION_INCOMPLETE: box 2 will not stay ticked. Clicking the final button would show the confirmation page.",
    "**REQUIRES_ATTENTION: DECLARATION_INCOMPLETE:** Box 3 keeps un-ticking. The confirmation page is only shown after \"Complete submission to Revenue Service\", which I did not click.",
    "REQUIRES_ATTENTION: DECLARATION_INCOMPLETE: The notice of assessment radio can't be selected; the return couldn't reach the confirmation page.",
  ])("does not treat a DECLARATION_INCOMPLETE report as a filing: %s", (output) => {
    expect(isLikelySubmittedOutput(output)).toBe(false);
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output,
      isTaskSuccessful: true,
    });
    expect(outcome).toMatchObject({
      prepareOnlyReady: false,
      likelySubmitted: false,
      prepareOnlyLikelySubmitted: false,
      needsAttention: true,
    });
    expect(shouldCaptureFiledReturnPdf("prepare_only", outcome)).toBe(false);
  });

  it("does not treat a PREPARED_DRAFT_NOT_VERIFIED report as a filing", () => {
    const output =
      "REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED: The entity name on the declaration page differs. I did not click the final button, so the portal never showed the confirmation page.";
    const outcome = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output,
      isTaskSuccessful: true,
    });
    expect(outcome.likelySubmitted).toBe(false);
    expect(outcome.needsAttention).toBe(true);
  });

  it("still treats a stopped-before-filing report with a strong marker as a filing", () => {
    const output =
      "REQUIRES_ATTENTION: DECLARATION_INCOMPLETE: The return was submitted successfully after the third box was ticked.";
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output,
      isTaskSuccessful: true,
    });
    expect(outcome.prepareOnlyLikelySubmitted).toBe(true);
  });

  it("keeps weak markers for other REQUIRES_ATTENTION outputs (a submit run that filed but lost the receipt)", () => {
    const output =
      "REQUIRES_ATTENTION: I reached the confirmation page but the receipt download failed.";
    expect(isLikelySubmittedOutput(output)).toBe(true);
    const outcome = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output,
      isTaskSuccessful: false,
    });
    expect(getTaxReturnStatusForOutcome("submit_and_capture_pdf", outcome)).toBe(
      "review_required",
    );
  });

  it("negates weak markers with modal and inability words, but not strong markers", () => {
    expect(
      isLikelySubmittedOutput("Clicking the final button would show the confirmation page."),
    ).toBe(false);
    expect(
      isLikelySubmittedOutput("The return cannot reach the confirmation page yet."),
    ).toBe(false);
    expect(
      isLikelySubmittedOutput(
        "I cannot find the receipt link, but the return was submitted successfully.",
      ),
    ).toBe(true);
    expect(
      isLikelySubmittedOutput("The portal showed the confirmation page with reference GRS-1."),
    ).toBe(true);
  });

  it("lets a leading REQUIRES_ATTENTION win over a later READY marker", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output: `REQUIRES_ATTENTION: a box will not tick.\n${declarationReady}`,
      isTaskSuccessful: true,
    });
    expect(outcome.prepareOnlyReady).toBe(false);
    expect(outcome.needsAttention).toBe(true);
    expect(outcome.prepareOnlyLikelySubmitted).toBe(false);
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

describe("submit run that finds the return already submitted", () => {
  const output = `**REQUIRES_ATTENTION: ${ALREADY_SUBMITTED_MARKER}:** The case view shows status "Submitted" for the 2025 return (submitted successfully on 25/11/2026, reference ESR-2025-123). I did not change anything and did not click Complete submission to Revenue Service. I downloaded the filed return PDF company-tax-submitted.pdf.`;
  const classify = (mode: "submit_and_capture_pdf" | "prepare_only" = "submit_and_capture_pdf") =>
    classifyRunOutcome({ submissionMode: mode, sessionStatus: "idle", output, isTaskSuccessful: true });

  it("recognises the marker, bold or not, only at the start", () => {
    expect(isAlreadySubmittedOutput(output)).toBe(true);
    expect(isAlreadySubmittedOutput("REQUIRES_ATTENTION: ALREADY_SUBMITTED: status Received")).toBe(true);
    expect(isAlreadySubmittedOutput("  **REQUIRES_ATTENTION**: **ALREADY_SUBMITTED**: Submitted")).toBe(true);
    expect(isAlreadySubmittedOutput("REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED: not ALREADY_SUBMITTED")).toBe(false);
    expect(isAlreadySubmittedOutput("The return was submitted successfully. ALREADY_SUBMITTED")).toBe(false);
  });

  it("is held for review: not a success, not a filing by this run, never paused for a reply", () => {
    const outcome = classify();
    expect(outcome).toMatchObject({
      alreadySubmitted: true,
      success: false,
      likelySubmitted: false,
      prepareOnlyLikelySubmitted: false,
      needsAttention: true,
      needsFilingContact: false,
    });
  });

  it("captures any filed-return PDF but never completes the return on its own", () => {
    const outcome = classify();
    expect(shouldCaptureFiledReturnPdf("submit_and_capture_pdf", outcome)).toBe(true);
    for (const receipt of ["uploaded", "missing", "failed", "not_attempted"] as const) {
      expect(resolveFinalRunStatuses("submit_and_capture_pdf", outcome, receipt)).toEqual({
        taxReturnStatus: "review_required",
        jobStatus: "failed",
        taskStatus: "failed",
        receiptGate: PORTAL_ALREADY_SUBMITTED_GATE,
      });
    }
    expect(getTaxReturnStatusForOutcome("submit_and_capture_pdf", outcome)).toBe("review_required");
  });

  it("is only a submit-run outcome", () => {
    const prepare = classify("prepare_only");
    // A prepare run is never asked for the check; its submission wording
    // falls under the existing prepare-only guardrail.
    expect(prepare.alreadySubmitted).toBe(false);
    expect(prepare.prepareOnlyLikelySubmitted).toBe(true);
  });

  it("after a continuation, never writes off a submission this run may have made", () => {
    // The job had dispatched an earlier browser task (resume or recovery),
    // which may have clicked the final button.
    const continued = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output,
      isTaskSuccessful: true,
      browserTaskCount: 2,
    });
    expect(continued).toMatchObject({
      alreadySubmitted: false,
      portalReportsSubmitted: true,
      success: false,
      likelySubmitted: true,
      needsAttention: true,
      needsFilingContact: false,
    });
    expect(shouldCaptureFiledReturnPdf("submit_and_capture_pdf", continued)).toBe(true);
    // Held for review whatever was downloaded, never "failed" as not filed.
    for (const receipt of ["uploaded", "missing", "failed", "not_attempted"] as const) {
      expect(resolveFinalRunStatuses("submit_and_capture_pdf", continued, receipt)).toEqual({
        taxReturnStatus: "review_required",
        jobStatus: "failed",
        taskStatus: "failed",
        receiptGate: PORTAL_ALREADY_SUBMITTED_GATE,
      });
    }
    expect(getTaxReturnStatusForOutcome("submit_and_capture_pdf", continued)).toBe("review_required");
    // The first browser task: the portal's filing is not this run's.
    expect(classify()).toMatchObject({ alreadySubmitted: true, portalReportsSubmitted: true, likelySubmitted: false });
    expect(
      classifyRunOutcome({ submissionMode: "submit_and_capture_pdf", sessionStatus: "idle", output, browserTaskCount: 1 })
        .alreadySubmitted,
    ).toBe(true);
  });

  it("a continuation that reports its own submission completes as before", () => {
    const filed = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output:
        "The case now shows the return as Submitted after my earlier click; submitted successfully, downloaded the receipt company-tax-submitted.pdf.",
      isTaskSuccessful: true,
      browserTaskCount: 3,
    });
    expect(filed).toMatchObject({ success: true, likelySubmitted: true, alreadySubmitted: false, portalReportsSubmitted: false });
    expect(resolveFinalRunStatuses("submit_and_capture_pdf", filed, "uploaded")).toMatchObject({
      taxReturnStatus: "completed",
      jobStatus: "completed",
      receiptGate: null,
    });
  });

  it("does not affect other submit outcomes", () => {
    const filed = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output: "Submitted successfully and downloaded the completion PDF.",
      isTaskSuccessful: true,
    });
    expect(filed.alreadySubmitted).toBe(false);
    expect(filed.success).toBe(true);
  });
});
