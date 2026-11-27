import { describe, expect, it } from "vitest";

import {
  describeEarlierSubmitRuns,
  EARLIER_SUBMIT_BROWSER_CHECK_WINDOW_MS,
  EARLIER_SUBMIT_QUIET_PERIOD_MS,
  EARLIER_UNRECEIPTED_SUBMIT_JOBS_KEY,
  fingerprintPreparedInputs,
  getSubmitDispatchedAt,
  hasSubmitDispatch,
  planEarlierSubmitBrowserCheck,
  SUBMIT_DISPATCHED_KEY,
  formatRunNumbers,
  getEarlierUnreceiptedSubmitCaution,
  getEarlierUnreceiptedSubmitJobs,
  getGuernseyReviewDraftId,
  getGuernseyReviewSummaryUrl,
  isGuernseyPortalUrl,
  normalizePortalReference,
  parsePreparedDraftOutput,
  parsePreparedDraftRecord,
  resolvePreparedDraft,
  SUBMIT_PREPARED_DISPATCHED_KEY,
  type PreparedDraftJob,
} from "./prepared-draft";

const baseInputs = {
  entityName: "Example Limited",
  taxYear: 2025,
  link: "https://my.gov.gg/revenue/case/abc/process",
  files: [
    { url: "https://blob/fs.pdf", name: "fs.pdf", role: "financial_statements" },
  ],
  substanceForm: {
    id: "form-1",
    entityName: "Example Limited",
    totalFte: 1.5,
    employees: [{ name: "A", fteFraction: 1.5 }],
    managerSignOff: null,
    updatedAt: new Date("2026-11-01"),
  },
};

describe("fingerprintPreparedInputs", () => {
  const base = fingerprintPreparedInputs(baseInputs);

  it("is stable across key order, bookkeeping fields and manager signoff", () => {
    expect(
      fingerprintPreparedInputs({
        ...baseInputs,
        substanceForm: {
          employees: [{ fteFraction: 1.5, name: "A" }],
          totalFte: 1.5,
          entityName: "Example Limited",
          id: "form-1",
          managerSignOff: "J Smith",
          managerSignOffDate: "2026-11-20",
          updatedAt: new Date("2026-11-20"),
          lastEditedAt: new Date("2026-11-20"),
        },
      }),
    ).toBe(base);
  });

  it("ignores the notice-of-assessment answer, which is only given at submit", () => {
    for (const noticeOfAssessment of ["Yes", "No", null]) {
      expect(
        fingerprintPreparedInputs({
          ...baseInputs,
          substanceForm: { ...baseInputs.substanceForm, noticeOfAssessment },
        }),
      ).toBe(base);
    }
    // ...while other portal-facing fields set alongside it still count.
    expect(
      fingerprintPreparedInputs({
        ...baseInputs,
        substanceForm: {
          ...baseInputs.substanceForm,
          noticeOfAssessment: "Yes",
          totalFte: 2,
        },
      }),
    ).not.toBe(base);
  });

  it("keeps a prepared draft valid when the notice-of-assessment answer is set after Prepare only", () => {
    const preparedFingerprint = fingerprintPreparedInputs(baseInputs);
    const prepared: PreparedDraftJob = {
      id: "prep",
      status: "completed",
      createdAt: "2026-11-20T10:00:00Z",
      resultData: {
        submissionMode: "prepare_only",
        prepareOnlyReadyAt: 1,
        preparedDraft: {
          version: 1,
          preparedAt: 1,
          inputFingerprint: preparedFingerprint,
          reviewUrl: "https://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary",
          portalReference: null,
        },
      },
    };
    const afterReview = (form: Record<string, unknown>) =>
      resolvePreparedDraft({
        jobs: [prepared],
        currentFingerprint: fingerprintPreparedInputs({
          ...baseInputs,
          substanceForm: { ...baseInputs.substanceForm, ...form },
        }),
      });

    expect(afterReview({ noticeOfAssessment: "No" }).ok).toBe(true);
    const edited = afterReview({ noticeOfAssessment: "No", entityName: "Other Limited" });
    expect(!edited.ok && edited.blocker).toContain("changed after the draft was prepared");
  });

  it("ignores filed-return receipts but not source files", () => {
    expect(
      fingerprintPreparedInputs({
        ...baseInputs,
        files: [
          ...baseInputs.files,
          { url: "https://blob/receipt.pdf", name: "r.pdf", role: "filed_return_pdf" },
        ],
      }),
    ).toBe(base);
    expect(
      fingerprintPreparedInputs({
        ...baseInputs,
        files: [{ url: "https://blob/fs-v2.pdf", name: "fs.pdf", role: "financial_statements" }],
      }),
    ).not.toBe(base);
  });

  it("changes when portal-facing data changes", () => {
    expect(
      fingerprintPreparedInputs({
        ...baseInputs,
        substanceForm: { ...baseInputs.substanceForm, totalFte: 1.4 },
      }),
    ).not.toBe(base);
    expect(
      fingerprintPreparedInputs({ ...baseInputs, link: "https://my.gov.gg/revenue/case/other/process" }),
    ).not.toBe(base);
  });
});

describe("parsePreparedDraftOutput", () => {
  it("reads the review URL and reference the prepare run reports", () => {
    expect(
      parsePreparedDraftOutput(
        "**READY_FOR_MANUAL_SUBMISSION:** ready, click Submit.\n**REVIEW_PAGE_URL:** https://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary.\nPORTAL_REFERENCE: ESR-2025-0042",
      ),
    ).toEqual({
      reviewUrl: "https://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary",
      portalReference: "ESR-2025-0042",
    });
  });

  it("drops non-Guernsey URLs and NONE references", () => {
    expect(
      parsePreparedDraftOutput(
        "READY_FOR_MANUAL_SUBMISSION:\nREVIEW_PAGE_URL: https://evil.example/gov.gg\nPORTAL_REFERENCE: NONE",
      ),
    ).toEqual({ reviewUrl: null, portalReference: null });
    expect(parsePreparedDraftOutput("READY_FOR_MANUAL_SUBMISSION: done")).toEqual({
      reviewUrl: null,
      portalReference: null,
    });
  });

  it("drops generic gov.gg URLs that do not name a draft", () => {
    for (const url of [
      "https://my.gov.gg/revenue/case/abc/process",
      "https://revenueservice.gov.gg/company-tax-ui/",
      "https://revenueservice.gov.gg/company-tax-ui/reviewAndSubmit/summary",
      "https://revenueservice.gov.gg/company-tax-ui/x/sections/entity",
      "https://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary?next=/other",
      "https://other.gov.gg/company-tax-ui/x/reviewAndSubmit/summary",
      "http://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary",
    ]) {
      expect(getGuernseyReviewDraftId(url)).toBeNull();
      expect(
        parsePreparedDraftOutput(`READY_FOR_MANUAL_SUBMISSION:\nREVIEW_PAGE_URL: ${url}`).reviewUrl,
      ).toBeNull();
    }
    expect(
      getGuernseyReviewDraftId("https://revenueservice.gov.gg/company-tax-ui/d-123/reviewAndSubmit/summary/"),
    ).toBe("d-123");
    expect(
      getGuernseyReviewDraftId("https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-123/reviewAndSubmit/summary"),
    ).toBe("d-123");
  });

  it("accepts the declaration page a prepare run now stops on (Pudleston, 2026-11-27)", () => {
    const declaration =
      "https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/0b6f3c1e-8f7d-4b39-9a51-2f1c7d6e4a10/reviewAndSubmit/declaration";
    const output = [
      "READY_FOR_MANUAL_SUBMISSION: The return is prepared and on the final declaration page. The notice of assessment answer selected is Yes and all three declaration boxes are ticked. The remaining portal action is 'Complete submission to Revenue Service', which is enabled and was not clicked.",
      `REVIEW_PAGE_URL: ${declaration}`,
      "PORTAL_REFERENCE: NONE",
    ].join("\n");
    expect(parsePreparedDraftOutput(output)).toEqual({ reviewUrl: declaration, portalReference: null });
    expect(getGuernseyReviewDraftId(declaration)).toBe("0b6f3c1e-8f7d-4b39-9a51-2f1c7d6e4a10");
    expect(getGuernseyReviewDraftId(`${declaration}/`)).toBe("0b6f3c1e-8f7d-4b39-9a51-2f1c7d6e4a10");
    for (const url of [
      `${declaration}?step=2`,
      declaration.replace("/declaration", "/declarations"),
      declaration.replace("/reviewAndSubmit/declaration", "/declaration"),
      declaration.replace("revenueservice.gov.gg", "revenueservice.gov.gg.evil.example"),
    ]) {
      expect(getGuernseyReviewDraftId(url)).toBeNull();
    }
  });

  it("derives the review summary of the same draft, keeping its exact path", () => {
    expect(
      getGuernseyReviewSummaryUrl(
        "https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-123/reviewAndSubmit/declaration",
      ),
    ).toBe("https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-123/reviewAndSubmit/summary");
    expect(
      getGuernseyReviewSummaryUrl("https://revenueservice.gov.gg/company-tax-ui/d-123/reviewAndSubmit/summary/"),
    ).toBe("https://revenueservice.gov.gg/company-tax-ui/d-123/reviewAndSubmit/summary");
    expect(getGuernseyReviewSummaryUrl("https://my.gov.gg/revenue/case/abc/process")).toBeNull();
  });

  it("keeps only specific portal references, never truncated", () => {
    expect(normalizePortalReference(" ESR-2025-0042 ")).toBe("ESR-2025-0042");
    for (const value of ["NONE", "Not shown", "Submitted", "2025", "12", "x".repeat(70) + "1", "ESR-1 (header)", null]) {
      expect(normalizePortalReference(value)).toBeNull();
    }
  });

  it("only accepts https gov.gg hosts", () => {
    expect(isGuernseyPortalUrl("https://my.gov.gg/revenue")).toBe(true);
    expect(isGuernseyPortalUrl("https://gov.gg")).toBe(true);
    expect(isGuernseyPortalUrl("http://my.gov.gg/revenue")).toBe(false);
    expect(isGuernseyPortalUrl("https://my.gov.gg.evil.example/")).toBe(false);
    expect(isGuernseyPortalUrl("https://user@my.gov.gg/")).toBe(false);
    expect(isGuernseyPortalUrl("https://notgov.gg/")).toBe(false);
  });
});

describe("resolvePreparedDraft", () => {
  const fingerprint = "fp-1";
  const prepared: PreparedDraftJob = {
    id: "prep",
    status: "completed",
    createdAt: "2026-11-20T10:00:00Z",
    resultData: {
      submissionMode: "prepare_only",
      prepareOnlyReadyAt: 1,
      preparedDraft: {
        version: 1,
        preparedAt: 1,
        inputFingerprint: fingerprint,
        reviewUrl: "https://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary",
        portalReference: null,
      },
    },
  };
  const later = (overrides: Partial<PreparedDraftJob> & { resultData: Record<string, unknown> }): PreparedDraftJob => ({
    id: "later",
    status: "failed",
    createdAt: "2026-11-21T10:00:00Z",
    ...overrides,
  });

  it("accepts the latest ready draft with unchanged inputs", () => {
    const result = resolvePreparedDraft({ jobs: [prepared], currentFingerprint: fingerprint });
    expect(result.ok && result.preparedJob.id).toBe("prep");
  });

  it("accepts a draft recorded on the declaration page", () => {
    const reviewUrl =
      "https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-123/reviewAndSubmit/declaration";
    const onDeclaration: PreparedDraftJob = {
      ...prepared,
      resultData: {
        ...(prepared.resultData as Record<string, unknown>),
        preparedDraft: { version: 1, preparedAt: 1, inputFingerprint: fingerprint, reviewUrl, portalReference: null },
      },
    };
    const result = resolvePreparedDraft({ jobs: [onDeclaration], currentFingerprint: fingerprint });
    expect(result.ok && result.draft.reviewUrl).toBe(reviewUrl);
  });

  it("refuses when inputs changed after preparation", () => {
    const result = resolvePreparedDraft({ jobs: [prepared], currentFingerprint: "fp-2" });
    expect(!result.ok && result.blocker).toContain("changed after the draft was prepared");
  });

  it("refuses when a later run could have changed the draft", () => {
    for (const job of [
      later({ resultData: { submissionMode: "prepare_only" } }),
      later({ resultData: { submissionMode: "submit_and_capture_pdf" } }),
      later({ status: "completed", resultData: { submissionMode: "submit_and_capture_pdf", filingOperation: "submit_prepared", preparedJobId: "prep" } }),
      later({ resultData: { submissionMode: "submit_and_capture_pdf", filingOperation: "submit_prepared", preparedJobId: "older" } }),
    ]) {
      const result = resolvePreparedDraft({ jobs: [prepared, job], currentFingerprint: fingerprint });
      expect(result.ok).toBe(false);
    }
  });

  it("allows retrying a failed or cancelled submit of the same draft that never reached the browser", () => {
    const retry = later({
      status: "cancelled",
      resultData: { submissionMode: "submit_and_capture_pdf", filingOperation: "submit_prepared", preparedJobId: "prep" },
    });
    const result = resolvePreparedDraft({ jobs: [retry, prepared], currentFingerprint: fingerprint });
    expect(result.ok).toBe(true);
  });

  it("does not lock the draft after a submit run that reached the browser without a receipt", () => {
    const dispatched = (status: string, extra: Record<string, unknown> = {}) =>
      later({
        status,
        resultData: {
          submissionMode: "submit_and_capture_pdf",
          filingOperation: "submit_prepared",
          preparedJobId: "prep",
          [SUBMIT_PREPARED_DISPATCHED_KEY]: 123,
          ...extra,
        },
      });
    // Cancelled, timed out / errored, lost worker (marked stale -> failed),
    // and an agent that said it did not submit (Pudleston: paused on a
    // question, timed out, case still "Pending"): the same draft may be
    // submitted again. The new run checks the portal first.
    for (const job of [
      dispatched("cancelled"),
      dispatched("failed", { staleFailureReason: "worker lost" }),
      dispatched("failed", { output: "REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED: name differs" }),
      dispatched("failed", { pauseExpiredReason: "Timed out waiting for user intervention" }),
    ]) {
      const result = resolvePreparedDraft({ jobs: [job, prepared], currentFingerprint: fingerprint });
      expect(result.ok && result.preparedJob.id).toBe("prep");
    }
    // A dispatched run that has not ended (or completed) still means the
    // draft may have changed; an active run is refused before this anyway.
    for (const status of ["paused", "running", "completed"]) {
      expect(resolvePreparedDraft({ jobs: [dispatched(status), prepared], currentFingerprint: fingerprint }).ok).toBe(false);
    }
    // A newer Prepare only run is the draft to submit.
    const reprepared = { ...prepared, id: "prep-2", createdAt: "2026-11-22T10:00:00Z" };
    const result = resolvePreparedDraft({ jobs: [reprepared, dispatched("failed"), prepared], currentFingerprint: fingerprint });
    expect(result.ok && result.preparedJob.id).toBe("prep-2");
  });

  it("refuses drafts without a specific identity", () => {
    const withDraft = (draft: Record<string, unknown>): PreparedDraftJob => ({
      ...prepared,
      resultData: {
        ...(prepared.resultData as object),
        preparedDraft: { version: 1, preparedAt: 1, inputFingerprint: fingerprint, ...draft },
      },
    });
    for (const draft of [
      { reviewUrl: null, portalReference: null },
      { reviewUrl: "https://my.gov.gg/revenue", portalReference: null },
      { reviewUrl: "https://my.gov.gg/revenue", portalReference: "NONE" },
    ]) {
      const result = resolvePreparedDraft({ jobs: [withDraft(draft)], currentFingerprint: fingerprint });
      expect(!result.ok && result.blocker).toContain("cannot be confirmed");
    }
    const byReference = resolvePreparedDraft({
      jobs: [withDraft({ reviewUrl: "https://my.gov.gg/revenue", portalReference: "ESR-42" })],
      currentFingerprint: fingerprint,
    });
    expect(byReference.ok && byReference.draft).toMatchObject({ reviewUrl: null, portalReference: "ESR-42" });
    expect(
      parsePreparedDraftRecord({ version: 1, preparedAt: 1, inputFingerprint: "f", reviewUrl: "https://gov.gg", portalReference: "x".repeat(200) + "1" }),
    ).toMatchObject({ reviewUrl: null, portalReference: null });
  });

  it("ignores the submit job itself and checks the enqueued draft id", () => {
    const self = later({
      id: "self",
      status: "starting",
      resultData: { submissionMode: "submit_and_capture_pdf", filingOperation: "submit_prepared", preparedJobId: "prep" },
    });
    expect(
      resolvePreparedDraft({ jobs: [prepared, self], currentFingerprint: fingerprint, excludeJobId: "self", expectedPreparedJobId: "prep" }).ok,
    ).toBe(true);
    expect(
      resolvePreparedDraft({ jobs: [prepared, self], currentFingerprint: fingerprint, excludeJobId: "self", expectedPreparedJobId: "other" }).ok,
    ).toBe(false);
  });

  it("refuses drafts that did not reach review, breached, or predate tracking", () => {
    const variants: PreparedDraftJob[] = [
      { ...prepared, status: "failed" },
      { ...prepared, resultData: { ...(prepared.resultData as object), prepareOnlyReadyAt: undefined } },
      { ...prepared, resultData: { ...(prepared.resultData as object), prepareOnlyLikelySubmitted: true } },
      { ...prepared, resultData: { ...(prepared.resultData as object), preparedDraft: undefined } },
    ];
    for (const job of variants) {
      expect(resolvePreparedDraft({ jobs: [job], currentFingerprint: fingerprint }).ok).toBe(false);
    }
    expect(resolvePreparedDraft({ jobs: [], currentFingerprint: fingerprint }).ok).toBe(false);
  });

  it("refuses a draft whose Net Book Value is unconfirmed, allows a confirmed one", () => {
    const withNbv = (status: string): PreparedDraftJob => ({
      ...prepared,
      resultData: {
        ...(prepared.resultData as object),
        portalNetBookValue: { status },
      },
    });
    const unresolved = resolvePreparedDraft({ jobs: [withNbv("unresolved")], currentFingerprint: fingerprint });
    expect(!unresolved.ok && unresolved.blocker).toContain("Net Book Value for a reviewer to confirm");
    const zeroed = resolvePreparedDraft({ jobs: [withNbv("zero_unconfirmed")], currentFingerprint: fingerprint });
    expect(!zeroed.ok && zeroed.blocker).toContain("as 0 in place of a negative figure");
    const legacy = resolvePreparedDraft({
      jobs: [prepared],
      currentFingerprint: fingerprint,
      requireNetBookValueReview: true,
    });
    expect(!legacy.ok && legacy.blocker).toContain("before the tangible-asset Net Book Value check");
    for (const status of ["reviewer_confirmed", "as_saved", "missing"]) {
      expect(resolvePreparedDraft({
        jobs: [withNbv(status)],
        currentFingerprint: fingerprint,
        requireNetBookValueReview: true,
      }).ok).toBe(true);
    }
  });
});

describe("earlier submit runs without a receipt (caution, not a lock)", () => {
  const job = (
    id: string,
    overrides: Partial<PreparedDraftJob> & { jobNumber?: number | null } = {},
    extra: Record<string, unknown> = {},
  ) => ({
    id,
    status: "failed",
    createdAt: "2026-11-24T22:49:00Z",
    jobNumber: 2,
    ...overrides,
    resultData: {
      submissionMode: "submit_and_capture_pdf",
      filingOperation: "submit_prepared",
      preparedJobId: "prep",
      [SUBMIT_PREPARED_DISPATCHED_KEY]: Date.parse("2026-11-24T22:50:00Z"),
      ...extra,
    },
  });

  it("lists dispatched submit_prepared runs with no saved receipt, oldest first", () => {
    const pudleston = job("submit-3", { jobNumber: 3, createdAt: "2026-11-25T10:00:00Z" }, {
      output: "REQUIRES_ATTENTION: which answer? Case status: Pending",
    });
    const older = job("submit-2", { jobNumber: 2, status: "cancelled" });
    const listed = getEarlierUnreceiptedSubmitJobs({ jobs: [pudleston, older] });
    expect(listed.map((j) => j.id)).toEqual(["submit-2", "submit-3"]);
  });

  it("ignores the run being started, undispatched runs, prepare runs and runs that saved a receipt", () => {
    const notDispatched = job("a", {}, { [SUBMIT_PREPARED_DISPATCHED_KEY]: undefined });
    const prepare = job("b", {}, { submissionMode: "prepare_only", filingOperation: undefined });
    const withReceipt = job("c", {}, { completionPdf: { status: "uploaded" } });
    const self = job("self", { status: "starting" });
    expect(
      getEarlierUnreceiptedSubmitJobs({ jobs: [notDispatched, prepare, withReceipt, self], excludeJobId: "self" }),
    ).toEqual([]);
    // A receipt capture that failed is still no receipt.
    expect(getEarlierUnreceiptedSubmitJobs({ jobs: [job("d", {}, { completionPdf: { status: "missing" } })] })).toHaveLength(1);
  });

  it("still lists a run an older version of the app recorded as confirmed not filed", () => {
    // Existing rows may carry submitNotFiledConfirmation / submitBrowserStop
    // records: they are ignored, and never break anything.
    const confirmed = job("e", {}, {
      submitNotFiledConfirmation: { version: 1, confirmedNotFiledAt: "2026-11-25T00:00:00Z", note: "draft" },
      submitBrowserStop: { version: 1, stoppedAt: 1 },
    });
    expect(getEarlierUnreceiptedSubmitJobs({ jobs: [confirmed] })).toHaveLength(1);
  });

  it("names the runs in one caution line", () => {
    expect(getEarlierUnreceiptedSubmitCaution([])).toBeNull();
    expect(getEarlierUnreceiptedSubmitCaution([{ jobNumber: 3 }])).toBe(
      "Run #3 reached the portal and saved no receipt. This run first checks the portal shows the return as not yet submitted.",
    );
    expect(getEarlierUnreceiptedSubmitCaution([{ jobNumber: 2 }, { jobNumber: 5 }])).toMatch(/^Runs #2 and #5 reached the portal/);
    expect(getEarlierUnreceiptedSubmitCaution([{ jobNumber: null }])).toMatch(/^An earlier submit run reached/);
    expect(getEarlierUnreceiptedSubmitCaution([{ jobNumber: null }, {}])).toMatch(/^Earlier submit runs reached/);
    expect(formatRunNumbers([{ jobNumber: 1 }, { jobNumber: 2 }, { jobNumber: 4 }])).toBe("Runs #1, #2 and #4");
    expect(formatRunNumbers([{ jobNumber: 1 }, {}])).toBeNull();
    // Two runs with the same number cannot be told apart by number alone.
    expect(formatRunNumbers([{ jobNumber: 3 }, { jobNumber: 3 }])).toBeNull();
  });

  it("lists full-submit runs that reached the portal without a receipt", () => {
    const fullSubmit = {
      id: "full-2",
      status: "failed",
      createdAt: "2026-11-24T22:49:00Z",
      resultData: { submissionMode: "submit_and_capture_pdf", [SUBMIT_DISPATCHED_KEY]: 1_000 },
    };
    const fullNotDispatched = { ...fullSubmit, id: "full-1", resultData: { submissionMode: "submit_and_capture_pdf" } };
    expect(getEarlierUnreceiptedSubmitJobs({ jobs: [fullSubmit, fullNotDispatched] }).map((j) => j.id)).toEqual(["full-2"]);
    expect(getSubmitDispatchedAt(fullSubmit.resultData)).toBe(1_000);
    // Older Submit prepared return rows only carry the original key.
    expect(getSubmitDispatchedAt(job("x").resultData)).toBe(Date.parse("2026-11-24T22:50:00Z"));
    expect(hasSubmitDispatch(job("y", {}, { [SUBMIT_PREPARED_DISPATCHED_KEY]: undefined }).resultData)).toBe(false);
    expect(hasSubmitDispatch(null)).toBe(false);
  });
});

describe("describeEarlierSubmitRuns (run numbers count per task)", () => {
  const current = { taskId: "task-b", taskName: "Acme 2025 (rerun)" };

  it("names runs on the current task by number only", () => {
    expect(describeEarlierSubmitRuns([{ jobNumber: 2, taskId: "task-b", taskName: "Acme 2025 (rerun)" }], current)).toBe("Run #2");
    expect(
      describeEarlierSubmitRuns(
        [
          { jobNumber: 2, taskId: "task-b" },
          { jobNumber: 3, taskId: "task-b" },
        ],
        current,
      ),
    ).toBe("Runs #2 and #3");
  });

  it("names runs on another task with that task's name", () => {
    expect(describeEarlierSubmitRuns([{ jobNumber: 2, taskId: "task-a", taskName: "Acme 2025" }], current)).toBe(
      "Run #2 of task \u201cAcme 2025\u201d",
    );
    // Both tasks hold a Run #3: still unambiguous.
    expect(
      describeEarlierSubmitRuns(
        [
          { jobNumber: 3, taskId: "task-a", taskName: "Acme 2025" },
          { jobNumber: 3, taskId: "task-b", taskName: "Acme 2025 (rerun)" },
        ],
        current,
      ),
    ).toBe("Run #3 of task \u201cAcme 2025\u201d and Run #3");
    expect(
      getEarlierUnreceiptedSubmitCaution([{ jobNumber: 2, taskId: "task-a", taskName: "Acme 2025" }], current),
    ).toMatch(/^Run #2 of task \u201cAcme 2025\u201d reached the portal/);
  });

  it("falls back to generic wording when runs cannot be told apart", () => {
    // Another task with the current task's name.
    expect(describeEarlierSubmitRuns([{ jobNumber: 2, taskId: "task-a", taskName: "acme 2025 (RERUN)" }], current)).toBeNull();
    // Two other tasks with the same name.
    expect(
      describeEarlierSubmitRuns(
        [
          { jobNumber: 2, taskId: "task-a", taskName: "Acme" },
          { jobNumber: 4, taskId: "task-c", taskName: "Acme" },
        ],
        current,
      ),
    ).toBeNull();
    // Another task with no name, a missing number, or mixed task knowledge.
    expect(describeEarlierSubmitRuns([{ jobNumber: 2, taskId: "task-a", taskName: " " }], current)).toBeNull();
    expect(describeEarlierSubmitRuns([{ jobNumber: null, taskId: "task-b" }], current)).toBeNull();
    expect(describeEarlierSubmitRuns([{ jobNumber: 2, taskId: "task-b" }, { jobNumber: 3 }], current)).toBeNull();
    // No task recorded at all: numbers, unless they collide.
    expect(describeEarlierSubmitRuns([{ jobNumber: 3 }, { jobNumber: 3 }])).toBeNull();
    expect(getEarlierUnreceiptedSubmitCaution([{ jobNumber: 3 }, { jobNumber: 3 }])).toMatch(/^Earlier submit runs reached/);
    expect(describeEarlierSubmitRuns([])).toBeNull();
  });
});

describe("planEarlierSubmitBrowserCheck (before a new submit run starts)", () => {
  const now = Date.parse("2026-11-27T12:00:00Z");
  const run = (
    status: string,
    data: Record<string, unknown>,
    completedAt: Date | null = new Date(now - 60 * 60_000),
  ) => ({
    id: "earlier",
    status,
    createdAt: new Date(now - 2 * 60 * 60_000),
    completedAt,
    resultData: { submissionMode: "submit_and_capture_pdf", [SUBMIT_DISPATCHED_KEY]: now - 90 * 60_000, ...data },
  });

  it("stops the session of an ended dispatched run", () => {
    for (const status of ["failed", "cancelled", "completed"]) {
      expect(planEarlierSubmitBrowserCheck(run(status, { browserUseSessionId: "s-1" }), now)).toEqual({
        kind: "stop_session",
        sessionId: "s-1",
      });
    }
    // Legacy key and the plain sessionId key.
    expect(
      planEarlierSubmitBrowserCheck(
        {
          ...run("failed", {}),
          resultData: { filingOperation: "submit_prepared", [SUBMIT_PREPARED_DISPATCHED_KEY]: now - 60_000, sessionId: "s-2" },
        },
        now,
      ),
    ).toEqual({ kind: "stop_session", sessionId: "s-2" });
  });

  it("never touches a run that is still active (the active-run guard blocks instead)", () => {
    for (const status of ["pending", "queued", "starting", "running", "paused"]) {
      expect(planEarlierSubmitBrowserCheck(run(status, { browserUseSessionId: "s-1" }), now)).toEqual({ kind: "none" });
    }
  });

  it("ignores runs that never reached the portal, and long-quiet sessions", () => {
    expect(
      planEarlierSubmitBrowserCheck({ ...run("failed", {}), resultData: { submissionMode: "submit_and_capture_pdf", browserUseSessionId: "s" } }, now),
    ).toEqual({ kind: "none" });
    const old = new Date(now - EARLIER_SUBMIT_BROWSER_CHECK_WINDOW_MS - 60_000);
    expect(
      planEarlierSubmitBrowserCheck(
        {
          ...run("failed", { browserUseSessionId: "s-1", lastHeartbeatAt: old.getTime() }, old),
          resultData: { [SUBMIT_DISPATCHED_KEY]: old.getTime() - 1, browserUseSessionId: "s-1", lastHeartbeatAt: old.getTime() },
        },
        now,
      ),
    ).toEqual({ kind: "none" });
  });

  it("waits a quiet period for a run that recorded no session", () => {
    const justEnded = new Date(now - 30_000);
    expect(planEarlierSubmitBrowserCheck(run("failed", {}, justEnded), now)).toEqual({ kind: "wait" });
    // A recent heartbeat counts as activity even with an older end time.
    expect(planEarlierSubmitBrowserCheck(run("failed", { lastHeartbeatAt: now - 10_000 }), now)).toEqual({ kind: "wait" });
    expect(
      planEarlierSubmitBrowserCheck(run("failed", {}, new Date(now - EARLIER_SUBMIT_QUIET_PERIOD_MS - 1)), now),
    ).toEqual({ kind: "none" });
  });
});

describe("earlier submit runs (traceability key)", () => {

  it("uses stable resultData keys", () => {
    expect(SUBMIT_DISPATCHED_KEY).toBe("submitDispatchedAt");
    expect(SUBMIT_PREPARED_DISPATCHED_KEY).toBe("submitPreparedDispatchedAt");
    expect(EARLIER_UNRECEIPTED_SUBMIT_JOBS_KEY).toBe("earlierUnreceiptedSubmitJobIds");
  });
});
