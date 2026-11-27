import { describe, expect, it } from "vitest";
import {
  fingerprintPreparedInputs,
  SUBMIT_PREPARED_DISPATCHED_KEY,
  type PreparedDraftJob,
} from "@repo/database/prepared-draft";
import {
  ACTIVE_JOB_ON_RETURN_MESSAGE,
  getStartTargetBlocker,
  getEarlierSubmitCaution,
  getSubmitDraftGate,
  getSubmitReadiness,
  getSubmitReadinessByOperation,
  JERSEY_AUTOMATION_UNAVAILABLE_MESSAGE,
  SUBMIT_PREPARED_GUERNSEY_ONLY_MESSAGE,
  UNRESOLVED_CERTIFICATE_MESSAGE,
} from "./submit-readiness";
import { ACTIVE_JOB_STATUSES } from "./manual-completion";

const substanceForm = {
  id: "form-1",
  certificateType: "Certificate 2",
  managerSignOff: "J Smith",
  managerSignOffDate: "2026-11-01",
  noticeOfAssessment: "Yes",
  totalFte: 1,
} as Record<string, unknown> & {
  certificateType?: string | null;
  noticeOfAssessment?: string | null;
};

const signedOffReturn = {
  status: "pending",
  returnType: "economic_substance",
  jurisdiction: { code: "GG" },
  readyForSubmissionAt: new Date("2026-11-20T00:00:00Z"),
  metadata: null as unknown,
  files: [] as unknown[],
  entityName: "Example Limited",
  taxYear: 2025,
  link: "https://my.gov.gg/revenue/case/abc/process",
  substanceForm,
};

function preparedJob(fingerprint: string): PreparedDraftJob {
  return {
    id: "prep",
    status: "completed",
    createdAt: "2026-11-24T21:00:00Z",
    resultData: {
      submissionMode: "prepare_only",
      prepareOnlyReadyAt: 1,
      preparedDraft: {
        version: 1,
        preparedAt: 1,
        inputFingerprint: fingerprint,
        reviewUrl:
          "https://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary",
        portalReference: null,
      },
    },
  };
}

const currentFingerprint = fingerprintPreparedInputs({
  entityName: signedOffReturn.entityName,
  taxYear: signedOffReturn.taxYear,
  link: signedOffReturn.link,
  files: signedOffReturn.files,
  substanceForm,
});

const dispatchedSubmit: PreparedDraftJob & { jobNumber: number } = {
  id: "submit-1",
  jobNumber: 3,
  status: "failed",
  createdAt: "2026-11-24T22:49:00Z",
  resultData: {
    submissionMode: "submit_and_capture_pdf",
    filingOperation: "submit_prepared",
    preparedJobId: "prep",
    [SUBMIT_PREPARED_DISPATCHED_KEY]: Date.parse("2026-11-24T22:50:00Z"),
  },
};

describe("getStartTargetBlocker", () => {
  it("refuses Jersey company returns", () => {
    expect(
      getStartTargetBlocker({
        taxReturn: { returnType: "company", jurisdiction: { code: "JE" } },
        isSubmitPrepared: false,
      }),
    ).toBe(JERSEY_AUTOMATION_UNAVAILABLE_MESSAGE);
  });

  it("allows Submit prepared return only for Guernsey ESR", () => {
    expect(
      getStartTargetBlocker({
        taxReturn: { returnType: "income_tax", jurisdiction: { code: "GG" } },
        isSubmitPrepared: true,
      }),
    ).toBe(SUBMIT_PREPARED_GUERNSEY_ONLY_MESSAGE);
    expect(
      getStartTargetBlocker({
        taxReturn: { returnType: "income_tax", jurisdiction: { code: "GG" } },
        isSubmitPrepared: false,
      }),
    ).toBeNull();
  });

  it("refuses a Guernsey ESR return with an unresolved certificate", () => {
    expect(
      getStartTargetBlocker({
        taxReturn: {
          returnType: "economic_substance",
          jurisdiction: { code: "GG" },
          metadata: null,
          substanceForm: { certificateType: null },
        },
        isSubmitPrepared: false,
      }),
    ).toBe(UNRESOLVED_CERTIFICATE_MESSAGE);
  });
});

describe("getSubmitDraftGate", () => {
  it("passes a full submit with no dispatched submit_prepared run", () => {
    expect(
      getSubmitDraftGate({
        isSubmitPrepared: false,
        returnJobs: [preparedJob("anything")],
        taxReturn: signedOffReturn,
        substanceForm,
      }),
    ).toEqual({ ok: true, preparedJobId: null });
  });

  it("returns the prepared job when the draft still matches", () => {
    expect(
      getSubmitDraftGate({
        isSubmitPrepared: true,
        returnJobs: [preparedJob(currentFingerprint)],
        taxReturn: signedOffReturn,
        substanceForm,
      }),
    ).toEqual({ ok: true, preparedJobId: "prep" });
  });

  it("does not block either submission after a dispatched run without a receipt (Pudleston)", () => {
    expect(
      getSubmitDraftGate({
        isSubmitPrepared: true,
        returnJobs: [preparedJob(currentFingerprint), dispatchedSubmit],
        taxReturn: signedOffReturn,
        substanceForm,
      }),
    ).toEqual({ ok: true, preparedJobId: "prep" });
    expect(
      getSubmitDraftGate({
        isSubmitPrepared: false,
        returnJobs: [preparedJob(currentFingerprint), dispatchedSubmit],
        taxReturn: signedOffReturn,
        substanceForm,
      }),
    ).toEqual({ ok: true, preparedJobId: null });
  });
});

describe("getSubmitReadiness", () => {
  it("is ready when every gate passes", () => {
    expect(
      getSubmitReadinessByOperation({
        taxReturn: signedOffReturn,
        returnJobs: [preparedJob(currentFingerprint)],
      }),
    ).toEqual({
      submit: { ready: true, blocker: null },
      submitPrepared: { ready: true, blocker: null },
      caution: null,
    });
  });

  it("reports the Notclif case: the latest preparation did not finish", () => {
    const failedPrepare: PreparedDraftJob = {
      id: "prep-failed",
      status: "failed",
      createdAt: "2026-11-24T22:20:00Z",
      resultData: { submissionMode: "prepare_only" },
    };
    const readiness = getSubmitReadinessByOperation({
      taxReturn: signedOffReturn,
      returnJobs: [failedPrepare],
    });
    expect(readiness.submit).toEqual({ ready: true, blocker: null });
    expect(readiness.submitPrepared.ready).toBe(false);
    expect(readiness.submitPrepared.blocker).toContain("Run Prepare only again");
  });

  it("reports the filing start blocker for both operations", () => {
    const readiness = getSubmitReadinessByOperation({
      taxReturn: {
        ...signedOffReturn,
        substanceForm: { ...substanceForm, managerSignOff: null },
      },
      returnJobs: [preparedJob(currentFingerprint)],
    });
    expect(readiness.submit.blocker).toContain("manager has not signed off");
    expect(readiness.submitPrepared.blocker).toContain("manager has not signed off");
  });

  it("is ready for both operations with no notice of assessment answer saved (defaults to Yes)", () => {
    const readiness = getSubmitReadinessByOperation({
      taxReturn: {
        ...signedOffReturn,
        substanceForm: { ...substanceForm, noticeOfAssessment: null },
      },
      returnJobs: [preparedJob(currentFingerprint)],
    });
    expect(readiness.submit).toEqual({ ready: true, blocker: null });
    expect(readiness.submitPrepared).toEqual({ ready: true, blocker: null });
  });

  it("is ready with a caution after a dispatched run without a receipt", () => {
    const caution =
      "Run #3 reached the portal and saved no receipt. This run first checks the portal shows the return as not yet submitted.";
    expect(
      getSubmitReadinessByOperation({
        taxReturn: signedOffReturn,
        returnJobs: [preparedJob(currentFingerprint), dispatchedSubmit],
      }),
    ).toEqual({
      submit: { ready: true, blocker: null },
      submitPrepared: { ready: true, blocker: null },
      caution,
    });
    expect(getEarlierSubmitCaution([preparedJob(currentFingerprint), dispatchedSubmit])).toEqual({
      jobIds: ["submit-1"],
      caution,
    });
  });

  it("keeps the other gates after a dispatched run: a receipt or the portal's own report refuses", () => {
    for (const metadata of [
      { filedReturnPdf: { status: "uploaded", jobId: "submit-1" } },
      { filedReturnPdf: { status: "missing", receiptGate: "portal_reports_already_submitted" } },
    ]) {
      const readiness = getSubmitReadinessByOperation({
        taxReturn: { ...signedOffReturn, metadata },
        returnJobs: [preparedJob(currentFingerprint), dispatchedSubmit],
      });
      expect(readiness.submit.ready).toBe(false);
      expect(readiness.submitPrepared.blocker).toContain("may already have filed this return");
    }
  });

  it("reports an active run anywhere on the return", () => {
    expect(
      getSubmitReadiness({
        isSubmitPrepared: false,
        taxReturn: signedOffReturn,
        returnJobs: [
          { id: "other", status: "paused", createdAt: "2026-11-25T00:00:00Z" },
        ],
      }),
    ).toEqual({ ready: false, blocker: ACTIVE_JOB_ON_RETURN_MESSAGE });
  });

  it("a paused submit run that reached the portal blocks both submit operations", () => {
    // Its browser may still be live: it is never stopped by a new start; the
    // active-run guard refuses the start instead.
    const pausedSubmit = { ...dispatchedSubmit, status: "paused" };
    const readiness = getSubmitReadinessByOperation({
      taxReturn: signedOffReturn,
      returnJobs: [preparedJob(currentFingerprint), pausedSubmit],
    });
    expect(readiness.submit).toEqual({ ready: false, blocker: ACTIVE_JOB_ON_RETURN_MESSAGE });
    expect(readiness.submitPrepared).toEqual({ ready: false, blocker: ACTIVE_JOB_ON_RETURN_MESSAGE });
    expect(ACTIVE_JOB_STATUSES).toContain("paused");
  });

  it("names an earlier run on another task of the return with its task", () => {
    const readiness = getSubmitReadinessByOperation({
      taxReturn: signedOffReturn,
      returnJobs: [
        preparedJob(currentFingerprint),
        { ...dispatchedSubmit, jobNumber: 2, taskId: "task-a", taskName: "Example 2025" },
      ],
      currentTask: { taskId: "task-b", taskName: "Example 2025 resubmit" },
    });
    expect(readiness.caution).toBe(
      "Run #2 of task \u201cExample 2025\u201d reached the portal and saved no receipt. This run first checks the portal shows the return as not yet submitted.",
    );
  });

  it("puts filing maintenance first", () => {
    expect(
      getSubmitReadiness({
        isSubmitPrepared: true,
        taxReturn: signedOffReturn,
        returnJobs: [preparedJob(currentFingerprint)],
        maintenanceBlocker: "Filing automation is paused for maintenance.",
      }),
    ).toEqual({
      ready: false,
      blocker: "Filing automation is paused for maintenance.",
    });
  });

  it("refuses a completed return", () => {
    const readiness = getSubmitReadiness({
      isSubmitPrepared: false,
      taxReturn: { ...signedOffReturn, status: "completed" },
      returnJobs: [],
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blocker).toContain("already completed");
  });
});
