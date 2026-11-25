/**
 * Offline walk-through of Prepare only -> Submit prepared return using the
 * same pure pieces the worker and API use (no DB, browser or portal).
 */
import { describe, expect, it } from "vitest";
import {
  fingerprintPreparedInputs,
  getUnconfirmedSubmitBlocker,
  parsePreparedDraftOutput,
  resolvePreparedDraft,
  type PreparedDraftJob,
  type PreparedDraftRecord,
  SUBMIT_PREPARED_DISPATCHED_KEY,
} from "@repo/database/prepared-draft";
import {
  getGuernseyNoticeOfAssessment,
  getGuernseyNoticeOfAssessmentBlocker,
  GUERNSEY_NOTICE_OF_ASSESSMENT_REQUIRED_MESSAGE,
} from "@repo/database/guernsey-filing";
import { buildSubmitPreparedReturnPrompt } from "./prompt-builder";
import {
  classifyRunOutcome,
  resolveFinalRunStatuses,
  shouldCaptureFiledReturnPdf,
} from "./run-outcome";

const taxReturn = {
  entityName: "Example Limited",
  taxYear: 2025,
  link: "https://my.gov.gg/revenue/case/abc/process",
  files: [{ url: "https://blob/fs.pdf", name: "fs.pdf", role: "financial_statements" }],
};
const substanceForm = {
  companyNumber: "12345",
  accountingPeriodStart: "2025-01-01",
  accountingPeriodEnd: "2025-12-31",
  relevantActivity: "None of the above",
  managerSignOff: null as string | null,
  noticeOfAssessment: null as string | null,
};

function prepareRun(output: string): PreparedDraftJob {
  const outcome = classifyRunOutcome({
    submissionMode: "prepare_only",
    sessionStatus: "idle",
    output,
    isTaskSuccessful: false,
  });
  const ready = outcome.success && outcome.prepareOnlyReady;
  const preparedDraft: PreparedDraftRecord | undefined = ready
    ? {
        version: 1,
        preparedAt: 1,
        inputFingerprint: fingerprintPreparedInputs({ ...taxReturn, substanceForm }),
        ...parsePreparedDraftOutput(output),
      }
    : undefined;
  return {
    id: "prep",
    status: outcome.success ? "completed" : "failed",
    createdAt: "2026-11-20T10:00:00Z",
    resultData: {
      submissionMode: "prepare_only",
      prepareOnlyReadyAt: ready ? 1 : undefined,
      preparedDraft,
    },
  };
}

const READY_OUTPUT = `**READY_FOR_MANUAL_SUBMISSION:** The return is on the review page; the remaining action is Submit.
REVIEW_PAGE_URL: https://revenueservice.gov.gg/company-tax-ui/abc/reviewAndSubmit/summary
PORTAL_REFERENCE: ESR-42`;

describe("prepare then submit prepared return", () => {
  it("submits the exact recorded draft and gates completion on the receipt", () => {
    const prepared = prepareRun(READY_OUTPUT);
    // Manager signs off and the reviewer answers the notice of assessment
    // after reviewing the draft: neither invalidates it.
    const signedOff = {
      ...substanceForm,
      managerSignOff: "J Smith",
      noticeOfAssessment: "No",
    };
    const resolution = resolvePreparedDraft({
      jobs: [prepared],
      currentFingerprint: fingerprintPreparedInputs({ ...taxReturn, substanceForm: signedOff }),
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;

    const prompt = buildSubmitPreparedReturnPrompt({
      taxReturn,
      substanceForm: signedOff,
      portalUrl: "https://my.gov.gg",
      returnLink: taxReturn.link,
      reviewUrl: resolution.draft.reviewUrl,
      portalReference: resolution.draft.portalReference,
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
      noticeOfAssessment: getGuernseyNoticeOfAssessment(signedOff),
    });
    expect(prompt).toContain("https://revenueservice.gov.gg/company-tax-ui/abc/reviewAndSubmit/summary");
    expect(prompt).toContain("**ESR-42**");
    expect(prompt).toContain("select **No** for the notice of assessment question");

    // Submitted with a saved receipt -> completed.
    const filed = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output: "The prepared return was submitted successfully. Confirmation ESR-42. Downloaded company-tax-submitted.pdf",
      isTaskSuccessful: true,
    });
    expect(shouldCaptureFiledReturnPdf("submit_and_capture_pdf", filed)).toBe(true);
    expect(resolveFinalRunStatuses("submit_and_capture_pdf", filed, "uploaded").taxReturnStatus).toBe("completed");
    // Submitted but receipt not saved -> held for review, never completed.
    expect(resolveFinalRunStatuses("submit_and_capture_pdf", filed, "missing")).toMatchObject({
      taxReturnStatus: "review_required",
      receiptGate: "receipt_missing",
    });
  });

  it("cannot submit the prepared draft until the reviewer answers the notice of assessment", () => {
    const prepared = prepareRun(READY_OUTPUT);
    // The draft itself stays valid without the answer...
    const resolution = resolvePreparedDraft({
      jobs: [prepared],
      currentFingerprint: fingerprintPreparedInputs({ ...taxReturn, substanceForm }),
    });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    // ...but the submit is refused before any browser run, and the agent is
    // never handed a prompt that leaves the choice to it.
    expect(getGuernseyNoticeOfAssessmentBlocker(substanceForm)).toBe(
      GUERNSEY_NOTICE_OF_ASSESSMENT_REQUIRED_MESSAGE,
    );
    expect(() =>
      buildSubmitPreparedReturnPrompt({
        taxReturn,
        substanceForm,
        portalUrl: "https://my.gov.gg",
        reviewUrl: resolution.draft.reviewUrl,
        portalReference: resolution.draft.portalReference,
        contactName: "NSM Filings Team",
        contactEmail: "filings@nsm.example",
        noticeOfAssessment: getGuernseyNoticeOfAssessment(substanceForm),
      }),
    ).toThrow("notice of assessment");
  });

  it("pauses instead of submitting when the draft cannot be verified", () => {
    const refused = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output: "**REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED:** Entity name on the review page is Other Limited.",
      isTaskSuccessful: false,
    });
    expect(refused.needsAttention).toBe(true);
    expect(refused.likelySubmitted).toBe(false);
  });

  it("refuses to submit when data changed after preparation or no draft was recorded", () => {
    const prepared = prepareRun(READY_OUTPUT);
    const edited = resolvePreparedDraft({
      jobs: [prepared],
      currentFingerprint: fingerprintPreparedInputs({
        ...taxReturn,
        substanceForm: { ...substanceForm, relevantActivity: "Banking" },
      }),
    });
    expect(edited.ok).toBe(false);

    const stoppedAtContact = prepareRun("REQUIRES_ATTENTION: NEEDS_FILING_CONTACT: stopped on the contact step");
    expect(
      resolvePreparedDraft({
        jobs: [stoppedAtContact],
        currentFingerprint: fingerprintPreparedInputs({ ...taxReturn, substanceForm }),
      }).ok,
    ).toBe(false);
  });

  it("never submits again after a submit run reached the browser and ended without a receipt", () => {
    const prepared = prepareRun(READY_OUTPUT);
    const currentFingerprint = fingerprintPreparedInputs({ ...taxReturn, substanceForm });
    // Enqueued and cancelled before the worker dispatched: safe to retry.
    const notDispatched: PreparedDraftJob = {
      id: "submit-1",
      status: "cancelled",
      createdAt: "2026-11-21T10:00:00Z",
      resultData: { submissionMode: "submit_and_capture_pdf", filingOperation: "submit_prepared", preparedJobId: "prep" },
    };
    expect(resolvePreparedDraft({ jobs: [prepared, notDispatched], currentFingerprint }).ok).toBe(true);
    // Dispatched (evidence written before the browser run), then cancelled.
    const dispatched: PreparedDraftJob = {
      ...notDispatched,
      resultData: { ...(notDispatched.resultData as object), [SUBMIT_PREPARED_DISPATCHED_KEY]: 1 },
    };
    expect(resolvePreparedDraft({ jobs: [prepared, dispatched], currentFingerprint }).ok).toBe(false);
    // The full submit path is refused too (web enqueue and worker startup).
    expect(getUnconfirmedSubmitBlocker({ jobs: [prepared, dispatched], excludeJobId: "full-submit" })).toContain(
      "record the filed return instead of submitting again",
    );
  });

  it("does not record a draft identity from a generic portal URL", () => {
    const prepared = prepareRun(
      "READY_FOR_MANUAL_SUBMISSION: ready.\nREVIEW_PAGE_URL: https://my.gov.gg/revenue\nPORTAL_REFERENCE: NONE",
    );
    const resolution = resolvePreparedDraft({
      jobs: [prepared],
      currentFingerprint: fingerprintPreparedInputs({ ...taxReturn, substanceForm }),
    });
    expect(!resolution.ok && resolution.blocker).toContain("cannot be confirmed");
  });
});
