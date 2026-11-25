import { describe, expect, it } from "vitest";
import { GUERNSEY_NOTICE_OF_ASSESSMENT_REQUIRED_MESSAGE } from "@repo/database/guernsey-filing";
import {
  fingerprintPreparedInputs,
  SUBMIT_PREPARED_DISPATCHED_KEY,
  UNCONFIRMED_SUBMIT_BLOCKER,
  type PreparedDraftJob,
} from "@repo/database/prepared-draft";
import {
  ACTIVE_JOB_ON_RETURN_MESSAGE,
  getStartTargetBlocker,
  getSubmitDraftGate,
  getSubmitReadiness,
  getSubmitReadinessByOperation,
  JERSEY_AUTOMATION_UNAVAILABLE_MESSAGE,
  SUBMIT_PREPARED_GUERNSEY_ONLY_MESSAGE,
  UNRESOLVED_CERTIFICATE_MESSAGE,
} from "./submit-readiness";

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

const dispatchedSubmit: PreparedDraftJob = {
  id: "submit-1",
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

  it("blocks every submission after an unconfirmed dispatch", () => {
    for (const isSubmitPrepared of [true, false]) {
      expect(
        getSubmitDraftGate({
          isSubmitPrepared,
          returnJobs: [preparedJob(currentFingerprint), dispatchedSubmit],
          taxReturn: signedOffReturn,
          substanceForm,
        }),
      ).toEqual({ ok: false, blocker: UNCONFIRMED_SUBMIT_BLOCKER });
    }
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
        substanceForm: { ...substanceForm, noticeOfAssessment: null },
      },
      returnJobs: [preparedJob(currentFingerprint)],
    });
    expect(readiness.submit.blocker).toBe(
      GUERNSEY_NOTICE_OF_ASSESSMENT_REQUIRED_MESSAGE,
    );
    expect(readiness.submitPrepared.blocker).toBe(
      GUERNSEY_NOTICE_OF_ASSESSMENT_REQUIRED_MESSAGE,
    );
  });

  it("reports the dispatch lock for both operations", () => {
    const readiness = getSubmitReadinessByOperation({
      taxReturn: signedOffReturn,
      returnJobs: [preparedJob(currentFingerprint), dispatchedSubmit],
    });
    expect(readiness.submit.blocker).toBe(UNCONFIRMED_SUBMIT_BLOCKER);
    expect(readiness.submitPrepared.blocker).toBe(UNCONFIRMED_SUBMIT_BLOCKER);
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
