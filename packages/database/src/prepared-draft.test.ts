import { describe, expect, it } from "vitest";

import {
  fingerprintPreparedInputs,
  getGuernseyReviewDraftId,
  getUnconfirmedSubmitBlocker,
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
});
