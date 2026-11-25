import { describe, expect, it } from "vitest";

import {
  fingerprintPreparedInputs,
  getGuernseyReviewDraftId,
  getSubmitBrowserStopRefusal,
  getSubmitNotFiledConfirmationRefusal,
  getSubmitRunAgentReport,
  isBrowserSessionStoppedStatus,
  parseSubmitBrowserStop,
  planSubmitBrowserStop,
  SUBMIT_BROWSER_STOP_KEY,
  SUBMIT_NOT_FILED_UNVERIFIED_QUIET_PERIOD_MS,
  getUnconfirmedSubmitBlocker,
  getUnconfirmedSubmitJobs,
  isGuernseyPortalUrl,
  isSubmitConfirmedNotFiled,
  parseSubmitNotFiledConfirmation,
  planSubmitNotFiledConfirmation,
  SUBMIT_NOT_FILED_CONFIRMATION_KEY,
  SUBMIT_NOT_FILED_QUIET_PERIOD_MS,
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

  it("refuses any new submission once a submit run reached the browser without a receipt", () => {
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
    // paused after an error, and an agent that said it did not submit.
    for (const job of [
      dispatched("cancelled"),
      dispatched("failed", { staleFailureReason: "worker lost" }),
      dispatched("paused"),
      dispatched("failed", { output: "REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED: name differs" }),
    ]) {
      const result = resolvePreparedDraft({ jobs: [job, prepared], currentFingerprint: fingerprint });
      expect(!result.ok && result.blocker).toContain("may have accepted the filing");
      // Also blocks a full submit run on the same return.
      expect(getUnconfirmedSubmitBlocker({ jobs: [prepared, job] })).not.toBeNull();
    }
    // Even after a newer Prepare only run on the same return.
    const reprepared = { ...prepared, id: "prep-2", createdAt: "2026-11-22T10:00:00Z" };
    expect(
      resolvePreparedDraft({ jobs: [reprepared, dispatched("failed"), prepared], currentFingerprint: fingerprint }).ok,
    ).toBe(false);
    // The worker ignores the run being started; prepare-only jobs never carry it.
    expect(getUnconfirmedSubmitBlocker({ jobs: [dispatched("starting")], excludeJobId: "later" })).toBeNull();
    expect(
      getUnconfirmedSubmitBlocker({
        jobs: [later({ resultData: { submissionMode: "prepare_only", [SUBMIT_PREPARED_DISPATCHED_KEY]: 1 } })],
      }),
    ).toBeNull();
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

describe("staff confirmation that a dispatched submit did not file", () => {
  const fingerprint = "fp-1";
  const NOW = Date.parse("2026-11-25T12:00:00Z");
  const DISPATCHED_AT = Date.parse("2026-11-24T22:50:00Z");
  const prepared: PreparedDraftJob = {
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
        reviewUrl: "https://revenueservice.gov.gg/company-tax-ui/x/reviewAndSubmit/summary",
        portalReference: null,
      },
    },
  };
  const ENDED_AT = Date.parse("2026-11-24T23:10:00Z");
  const STOPPED_AT = ENDED_AT;
  const SESSION = "sess-1";
  const stopRecord = (overrides: Record<string, unknown> = {}) => ({
    version: 1,
    stoppedAt: STOPPED_AT,
    stoppedBy: "acct-1",
    stoppedByName: "Reviewer One",
    dispatchedAt: DISPATCHED_AT,
    sessionId: SESSION,
    statusBefore: "stopped",
    statusAfter: "stopped",
    verified: true,
    ...overrides,
  });
  const AGENT_OUTPUT =
    "REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED: the declaration page asks 'Please indicate if you wish to receive a notice of assessment'. I did not click Submit.";
  const dispatched = (
    overrides: Partial<PreparedDraftJob> & {
      completedAt?: string | null;
      updatedAt?: string | null;
      errorMessage?: string | null;
    } = {},
    extra: Record<string, unknown> = {},
  ) => ({
    id: "submit-1",
    status: "failed",
    createdAt: "2026-11-24T22:49:00Z",
    completedAt: "2026-11-24T23:10:00Z",
    errorMessage: "Timed out waiting for user intervention",
    ...overrides,
    resultData: {
      submissionMode: "submit_and_capture_pdf",
      filingOperation: "submit_prepared",
      preparedJobId: "prep",
      [SUBMIT_PREPARED_DISPATCHED_KEY]: DISPATCHED_AT,
      lastHeartbeatAt: Date.parse("2026-11-24T23:10:00Z"),
      output: AGENT_OUTPUT,
      browserUseSessionId: SESSION,
      [SUBMIT_BROWSER_STOP_KEY]: stopRecord(),
      ...extra,
    },
  });
  const openReturn = { status: "review_required", files: [], metadata: {} };
  const staff = { id: "acct-1", name: "Reviewer One" };
  const NOTE = "Portal shows the 2025 return still as a draft, not submitted.";

  const confirm = (job: ReturnType<typeof dispatched>) => {
    const plan = planSubmitNotFiledConfirmation({
      job,
      taxReturn: openReturn,
      hasActiveJob: false,
      browserSessionStatus: "stopped",
      checkedAfterBrowserStoppedAt: STOPPED_AT,
      actor: staff,
      note: NOTE,
      now: NOW,
    });
    if (!plan.ok) throw new Error(plan.message);
    return {
      ...job,
      resultData: { ...job.resultData, [SUBMIT_NOT_FILED_CONFIRMATION_KEY]: plan.confirmation },
    };
  };

  it("the agent's own PREPARED_DRAFT_NOT_VERIFIED report never lifts the lock", () => {
    const job = dispatched();
    expect(getUnconfirmedSubmitBlocker({ jobs: [prepared, job] })).toContain("may have accepted the filing");
    expect(isSubmitConfirmedNotFiled(job)).toBe(false);
    // Fields an agent or worker could plausibly write are not a confirmation.
    for (const extra of [
      { confirmedNotFiledAt: "2026-11-25T00:00:00Z", confirmedNotFiledBy: "agent" },
      { [SUBMIT_NOT_FILED_CONFIRMATION_KEY]: true },
      { [SUBMIT_NOT_FILED_CONFIRMATION_KEY]: { version: 1, confirmedNotFiledAt: "2026-11-25T00:00:00Z" } },
    ]) {
      expect(getUnconfirmedSubmitBlocker({ jobs: [prepared, dispatched({}, extra)] })).not.toBeNull();
    }
  });

  it("records who confirmed, when, what they saw and which dispatch it answers", () => {
    const plan = planSubmitNotFiledConfirmation({
      job: dispatched(),
      taxReturn: openReturn,
      hasActiveJob: false,
      browserSessionStatus: "stopped",
      checkedAfterBrowserStoppedAt: STOPPED_AT,
      actor: staff,
      note: `  ${NOTE}  `,
      now: NOW,
    });
    expect(plan).toEqual({
      ok: true,
      confirmation: {
        version: 1,
        confirmedNotFiledAt: "2026-11-25T12:00:00.000Z",
        confirmedNotFiledBy: "acct-1",
        confirmedNotFiledByName: "Reviewer One",
        note: NOTE,
        dispatchedAt: DISPATCHED_AT,
        browserSessionStatus: "stopped",
        browserStoppedAt: STOPPED_AT,
        browserStopVerified: true,
      },
    });
  });

  it("a confirmed job no longer blocks a full submit, but Submit prepared return needs a fresh Prepare only", () => {
    const confirmed = confirm(dispatched());
    expect(isSubmitConfirmedNotFiled(confirmed)).toBe(true);
    expect(getUnconfirmedSubmitBlocker({ jobs: [prepared, confirmed] })).toBeNull();
    expect(getUnconfirmedSubmitJobs({ jobs: [prepared, confirmed] })).toEqual([]);
    // The confirmed run had the old draft open in the browser.
    const sameDraft = resolvePreparedDraft({ jobs: [confirmed, prepared], currentFingerprint: fingerprint });
    expect(!sameDraft.ok && sameDraft.blocker).toContain("Run Prepare only again");
    // A newer prepared draft can be submitted.
    const reprepared = { ...prepared, id: "prep-2", createdAt: "2026-11-25T11:00:00Z" };
    const next = resolvePreparedDraft({ jobs: [reprepared, confirmed, prepared], currentFingerprint: fingerprint });
    expect(next.ok && next.preparedJob.id).toBe("prep-2");
  });

  it("each dispatched run needs its own confirmation", () => {
    const confirmed = confirm(dispatched());
    const second = dispatched({ id: "submit-2", createdAt: "2026-11-25T09:00:00Z" });
    expect(getUnconfirmedSubmitBlocker({ jobs: [prepared, confirmed, second] })).not.toBeNull();
    expect(getUnconfirmedSubmitJobs({ jobs: [prepared, confirmed, second] }).map((job) => job.id)).toEqual([
      "submit-2",
    ]);
  });

  it("a confirmation only counts on an ended run and for the dispatch it answers", () => {
    const confirmed = confirm(dispatched());
    for (const status of ["paused", "running", "queued", "starting", "completed"]) {
      expect(getUnconfirmedSubmitBlocker({ jobs: [{ ...confirmed, status }] })).not.toBeNull();
    }
    const redispatched = {
      ...confirmed,
      resultData: { ...confirmed.resultData, [SUBMIT_PREPARED_DISPATCHED_KEY]: DISPATCHED_AT + 1 },
    };
    expect(parseSubmitNotFiledConfirmation(redispatched.resultData)).toBeNull();
    expect(getUnconfirmedSubmitBlocker({ jobs: [redispatched] })).not.toBeNull();
    // A worker write that drops the key brings the lock back.
    const { [SUBMIT_NOT_FILED_CONFIRMATION_KEY]: _dropped, ...rewritten } = confirmed.resultData as Record<string, unknown>;
    expect(getUnconfirmedSubmitBlocker({ jobs: [{ ...confirmed, resultData: rewritten }] })).not.toBeNull();
  });

  it("is only allowed on failed or cancelled dispatched runs", () => {
    const refusal = (job: ReturnType<typeof dispatched>) =>
      getSubmitNotFiledConfirmationRefusal({ job, taxReturn: openReturn, hasActiveJob: false, now: NOW });
    expect(refusal(dispatched())).toBeNull();
    expect(refusal(dispatched({ status: "cancelled" }))).toBeNull();
    for (const status of ["queued", "starting", "running", "paused", "completed"]) {
      expect(refusal(dispatched({ status }))).not.toBeNull();
    }
    // Never reached the browser: nothing to confirm (and it does not block).
    const notDispatched = dispatched({}, { [SUBMIT_PREPARED_DISPATCHED_KEY]: undefined });
    expect(refusal(notDispatched)).toContain("reached the portal");
    expect(refusal(dispatched({}, { filingOperation: undefined }))).toContain("reached the portal");
    expect(refusal(confirm(dispatched()))).toContain("already confirmed");
  });

  it("is refused while another run is active or the run was active recently", () => {
    expect(
      getSubmitNotFiledConfirmationRefusal({ job: dispatched(), taxReturn: openReturn, hasActiveJob: true, now: NOW }),
    ).toContain("Another run is active");
    const ended = Date.parse("2026-11-24T23:10:00Z");
    const recent = (now: number, extra: Record<string, unknown> = {}) =>
      getSubmitNotFiledConfirmationRefusal({
        job: dispatched({}, extra),
        taxReturn: openReturn,
        hasActiveJob: false,
        now,
      });
    expect(recent(ended + SUBMIT_NOT_FILED_QUIET_PERIOD_MS - 1)).toContain("quiet");
    expect(recent(ended + SUBMIT_NOT_FILED_QUIET_PERIOD_MS)).toBeNull();
    // A heartbeat after the end time (worker still winding down) counts.
    expect(recent(NOW, { lastHeartbeatAt: NOW - 1000 })).toContain("quiet");
    // No end time recorded: the last row update is used.
    expect(
      getSubmitNotFiledConfirmationRefusal({
        job: dispatched({ completedAt: null, updatedAt: new Date(NOW - 60_000).toISOString() }, { lastHeartbeatAt: undefined }),
        taxReturn: openReturn,
        hasActiveJob: false,
        now: NOW,
      }),
    ).toContain("quiet");
  });

  it("is refused when there is any receipt evidence", () => {
    const refusal = (taxReturn: Record<string, unknown> & { status: string }, extra: Record<string, unknown> = {}) =>
      getSubmitNotFiledConfirmationRefusal({ job: dispatched({}, extra), taxReturn, hasActiveJob: false, now: NOW });
    expect(refusal({ ...openReturn, status: "completed" })).toContain("already completed");
    expect(
      refusal({ ...openReturn, files: [{ url: "https://blob/r.pdf", role: "filed_return_pdf" }] }),
    ).toContain("receipt is attached");
    expect(
      refusal({
        ...openReturn,
        files: [{ url: "https://blob/r.pdf", metadata: { kind: "filed_return_pdf", jobId: "submit-1" } }],
      }),
    ).toContain("saved a filed-return receipt");
    expect(
      refusal({ ...openReturn, metadata: { filedReturnPdf: { jobId: "submit-1", status: "uploaded" } } }),
    ).toContain("captured a filed-return receipt");
    expect(refusal(openReturn, { completionPdf: { status: "uploaded" } })).toContain("receipt evidence");
    expect(refusal(openReturn, { receiptGate: "receipt_from_unsuccessful_run" })).toContain("receipt evidence");
    // A recorded failed capture for this run is not a receipt.
    expect(
      refusal({ ...openReturn, metadata: { filedReturnPdf: { jobId: "submit-1", status: "missing" } } }),
    ).toBeNull();
  });

  it("requires a note and refuses a browser session that is still running", () => {
    const plan = (overrides: Partial<Parameters<typeof planSubmitNotFiledConfirmation>[0]>) =>
      planSubmitNotFiledConfirmation({
        job: dispatched(),
        taxReturn: openReturn,
        hasActiveJob: false,
        browserSessionStatus: "stopped",
        checkedAfterBrowserStoppedAt: STOPPED_AT,
        actor: staff,
        note: NOTE,
        now: NOW,
        ...overrides,
      });
    expect(plan({ note: "   ok    " })).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    expect(plan({ note: "x".repeat(1001) })).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    expect(plan({ browserSessionStatus: "running" })).toMatchObject({ ok: false, code: "PRECONDITION_FAILED" });
    // Not readable now: the browser stop cannot be re-verified, so the long wait applies.
    expect(plan({ browserSessionStatus: null })).toMatchObject({ ok: false, code: "PRECONDITION_FAILED" });
    expect(plan({ hasActiveJob: true })).toMatchObject({ ok: false, code: "PRECONDITION_FAILED" });
    expect(plan({ actor: { id: " " } })).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });

  describe("the run's browser must be stopped before the portal check", () => {
    const plan = (
      job: ReturnType<typeof dispatched>,
      overrides: Partial<Parameters<typeof planSubmitNotFiledConfirmation>[0]> = {},
    ) =>
      planSubmitNotFiledConfirmation({
        job,
        taxReturn: openReturn,
        hasActiveJob: false,
        browserSessionStatus: "stopped",
        checkedAfterBrowserStoppedAt: STOPPED_AT,
        actor: staff,
        note: NOTE,
        now: NOW,
        ...overrides,
      });

    it("knows which Browser Use statuses mean the agent can no longer act", () => {
      for (const status of ["idle", "stopped", "error", "timed_out"]) {
        expect(isBrowserSessionStoppedStatus(status)).toBe(true);
      }
      for (const status of ["running", "queued", "dispatching", "created", "", null, undefined]) {
        expect(isBrowserSessionStoppedStatus(status)).toBe(false);
      }
    });

    it("refuses until staff stopped the browser from the task page", () => {
      const job = dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: undefined });
      expect(plan(job, { checkedAfterBrowserStoppedAt: null })).toMatchObject({
        ok: false,
        message: expect.stringContaining("Stop this run's browser first"),
      });
    });

    it("lost worker: a browser still active when stopped needs the quiet period after the stop, not after the stale failure", () => {
      // Job was marked failed (stale heartbeat) hours ago, but the Browser Use
      // agent was still driving the portal until staff stopped it just now.
      const stoppedNow = NOW - 60_000;
      const job = dispatched(
        {},
        {
          staleFailureAt: ENDED_AT,
          [SUBMIT_BROWSER_STOP_KEY]: stopRecord({ stoppedAt: stoppedNow, statusBefore: "running" }),
        },
      );
      expect(plan(job, { checkedAfterBrowserStoppedAt: stoppedNow })).toMatchObject({
        ok: false,
        message: expect.stringContaining("stopped less than 5 minutes ago"),
      });
      const later = plan(job, {
        checkedAfterBrowserStoppedAt: stoppedNow,
        now: stoppedNow + SUBMIT_NOT_FILED_QUIET_PERIOD_MS,
      });
      expect(later.ok && later.confirmation).toMatchObject({
        browserStoppedAt: stoppedNow,
        browserStopVerified: true,
      });
    });

    it("refuses when Browser Use reports the browser active at confirmation, even after an earlier stop", () => {
      for (const status of ["running", "created", "queued"]) {
        expect(plan(dispatched(), { browserSessionStatus: status })).toMatchObject({
          ok: false,
          message: expect.stringContaining("may still be acting on the portal"),
        });
      }
      for (const status of ["idle", "error", "timed_out"]) {
        expect(plan(dispatched(), { browserSessionStatus: status }).ok).toBe(true);
      }
    });

    it("the person must have been shown the latest stop", () => {
      expect(plan(dispatched(), { checkedAfterBrowserStoppedAt: STOPPED_AT - 1 })).toMatchObject({
        ok: false,
        message: expect.stringContaining("stop changed"),
      });
      expect(plan(dispatched(), { checkedAfterBrowserStoppedAt: null }).ok).toBe(false);
    });

    it("unverifiable browser (no session id, unreadable status, unverified stop) waits 24 hours with no activity", () => {
      const lastActivity = ENDED_AT;
      const cases: Array<[ReturnType<typeof dispatched>, string | null, number | null]> = [
        // Worker crashed between dispatch and recording the session id.
        [dispatched({}, { browserUseSessionId: undefined, [SUBMIT_BROWSER_STOP_KEY]: undefined }), null, null],
        // Browser Use returns 404 / no API key now.
        [dispatched(), null, STOPPED_AT],
        // Stop could not be verified at the time.
        [dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: stopRecord({ statusAfter: null, verified: false }) }), "stopped", STOPPED_AT],
      ];
      for (const [job, status, stoppedAt] of cases) {
        const early = plan(job, {
          browserSessionStatus: status,
          checkedAfterBrowserStoppedAt: stoppedAt,
          now: lastActivity + SUBMIT_NOT_FILED_UNVERIFIED_QUIET_PERIOD_MS - 1,
        });
        expect(early).toMatchObject({ ok: false, message: expect.stringContaining("24 hours") });
        const late = plan(job, {
          browserSessionStatus: status,
          checkedAfterBrowserStoppedAt: stoppedAt,
          now: lastActivity + SUBMIT_NOT_FILED_UNVERIFIED_QUIET_PERIOD_MS,
        });
        expect(late.ok && late.confirmation.browserStopVerified).toBe(false);
      }
    });

    it("ignores a stop record for another session or dispatch, and a verified flag without a stopped status", () => {
      const otherSession = dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: stopRecord({ sessionId: "sess-other" }) });
      expect(plan(otherSession, { checkedAfterBrowserStoppedAt: null })).toMatchObject({
        ok: false,
        message: expect.stringContaining("Stop this run's browser first"),
      });
      const otherDispatch = dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: stopRecord({ dispatchedAt: DISPATCHED_AT - 1 }) });
      expect(parseSubmitBrowserStop(otherDispatch.resultData)).toBeNull();
      expect(plan(otherDispatch, { checkedAfterBrowserStoppedAt: null }).ok).toBe(false);
      const forged = dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: stopRecord({ statusAfter: "running", verified: true }) });
      expect(parseSubmitBrowserStop(forged.resultData)?.verified).toBe(false);
      expect(plan(forged).ok).toBe(false);
    });

    it("the display refusal (status not read) shows the stop step and its wait", () => {
      const refusal = (job: ReturnType<typeof dispatched>, now = NOW) =>
        getSubmitNotFiledConfirmationRefusal({ job, taxReturn: openReturn, hasActiveJob: false, now });
      expect(refusal(dispatched())).toBeNull();
      expect(refusal(dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: undefined }))).toContain("Stop this run's browser first");
      expect(
        refusal(dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: stopRecord({ stoppedAt: NOW - 1000 }) })),
      ).toContain("stopped less than");
    });

    it("plans the browser stop record from the statuses read before and after", () => {
      const job = dispatched({}, { [SUBMIT_BROWSER_STOP_KEY]: undefined });
      const stop = planSubmitBrowserStop({ job, statusBefore: "running", statusAfter: "stopped", actor: staff, now: NOW });
      expect(stop).toEqual({
        ok: true,
        wasActive: true,
        record: {
          version: 1,
          stoppedAt: NOW,
          stoppedBy: "acct-1",
          stoppedByName: "Reviewer One",
          dispatchedAt: DISPATCHED_AT,
          sessionId: SESSION,
          statusBefore: "running",
          statusAfter: "stopped",
          verified: true,
        },
      });
      const idle = planSubmitBrowserStop({ job, statusBefore: "idle", statusAfter: "idle", actor: staff, now: NOW });
      expect(idle.ok && idle.wasActive).toBe(false);
      // Unreadable after the stop: recorded, but not verified.
      const unreadable = planSubmitBrowserStop({ job, statusBefore: null, statusAfter: null, actor: staff, now: NOW });
      expect(unreadable.ok && unreadable.record.verified).toBe(false);
      expect(unreadable.ok && unreadable.wasActive).toBe(true);
      // Still running after the stop: nothing recorded.
      expect(
        planSubmitBrowserStop({ job, statusBefore: "running", statusAfter: "running", actor: staff, now: NOW }),
      ).toMatchObject({ ok: false, code: "PRECONDITION_FAILED" });
      expect(planSubmitBrowserStop({ job, statusBefore: "stopped", statusAfter: "stopped", actor: { id: " " }, now: NOW })).toMatchObject({
        ok: false,
        code: "BAD_REQUEST",
      });
    });

    it("only stops the browser of an ended, dispatched, unconfirmed run with a session", () => {
      expect(getSubmitBrowserStopRefusal(dispatched())).toBeNull();
      expect(getSubmitBrowserStopRefusal(dispatched({ status: "cancelled" }))).toBeNull();
      for (const status of ["queued", "starting", "running", "paused", "completed"]) {
        expect(getSubmitBrowserStopRefusal(dispatched({ status }))).toContain("has not ended");
      }
      expect(getSubmitBrowserStopRefusal(dispatched({}, { browserUseSessionId: undefined }))).toContain(
        "no browser session",
      );
      expect(getSubmitBrowserStopRefusal(dispatched({}, { [SUBMIT_PREPARED_DISPATCHED_KEY]: undefined }))).toContain(
        "reached the portal",
      );
      expect(getSubmitBrowserStopRefusal(confirm(dispatched()))).toContain("already confirmed");
    });
  });

  it("shows the reviewer what the agent itself reported", () => {
    expect(getSubmitRunAgentReport(dispatched())).toEqual({
      output: AGENT_OUTPUT,
      question: null,
      error: "Timed out waiting for user intervention",
    });
    const paused = getSubmitRunAgentReport(
      dispatched({ errorMessage: null }, { output: undefined, pauseReason: "long recap", pendingQuestion: { text: "Which answer?" } }),
    );
    expect(paused).toEqual({ output: "long recap", question: "Which answer?", error: null });
    expect(getSubmitRunAgentReport({ resultData: { output: "x".repeat(7000) } }).output?.length).toBe(6001);
  });
});
