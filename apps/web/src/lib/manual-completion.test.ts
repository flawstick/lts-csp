import { describe, expect, it } from "vitest";
import { getFiledReturnReceiptState } from "@repo/database/filed-return-receipt";
import { getFilingStartBlocker, getPossibleFilingEvidence } from "./filing-start-guard";
import {
  getManualCompletionCandidates,
  MANUAL_COMPLETION_REVERTED_GATE,
  planManualCompletion,
  planManualCompletionRevert,
} from "./manual-completion";

const now = new Date("2026-11-19T10:00:00.000Z");
const filedPdf = {
  url: "https://blob.example/filed-return.pdf",
  name: "ESR 2025 submitted.pdf",
  size: 1000,
  type: "application/pdf",
  uploadedAt: "2026-11-18T09:00:00.000Z",
  category: "supporting",
};
const financials = {
  url: "https://blob.example/fs.pdf",
  name: "Financial statements.pdf",
  size: 1000,
  type: "application/pdf",
  uploadedAt: "2026-11-01T09:00:00.000Z",
  role: "financial_statements",
};
const spreadsheet = {
  url: "https://blob.example/tb.xlsx",
  name: "Trial balance.xlsx",
  size: 1000,
  type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  uploadedAt: "2026-11-01T09:00:00.000Z",
};

const pendingReturn = {
  status: "pending",
  files: [financials, spreadsheet, filedPdf],
  metadata: { financialCurrency: "GBP" },
};

function complete(overrides: Partial<Parameters<typeof planManualCompletion>[0]> = {}) {
  return planManualCompletion({
    taxReturn: pendingReturn,
    fileUrl: filedPdf.url,
    expectedStatus: "pending",
    actorAccountId: "staff-1",
    hasActiveJob: false,
    now,
    ...overrides,
  });
}

describe("getManualCompletionCandidates", () => {
  it("offers unassigned PDFs, never the financial statements or non-PDFs", () => {
    expect(getManualCompletionCandidates(pendingReturn.files).map((f) => f.url)).toEqual([
      filedPdf.url,
    ]);
  });

  it("offers only an already-attached receipt when one exists", () => {
    const receipt = { ...filedPdf, url: "https://blob.example/r.pdf", role: "filed_return_pdf" };
    expect(getManualCompletionCandidates([filedPdf, receipt])).toEqual([receipt]);
  });
});

describe("planManualCompletion", () => {
  it("links the PDF as the filed return and completes the return", () => {
    const plan = complete({ note: " Filed by client " });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.status).toBe("completed");
    const linked = plan.files.find((f) => f.url === filedPdf.url);
    expect(linked?.role).toBe("filed_return_pdf");
    expect(linked?.metadata).toMatchObject({
      kind: "filed_return_pdf",
      source: "staff_manual_link",
    });
    expect(plan.files.find((f) => f.url === financials.url)?.role).toBe(
      "financial_statements",
    );
    expect(plan.metadata.financialCurrency).toBe("GBP");
    expect(plan.metadata.filedReturnPdf).toMatchObject({ status: "uploaded" });
    expect(plan.metadata.manualCompletion).toMatchObject({
      fileUrl: filedPdf.url,
      previousStatus: "pending",
      completedByAccountId: "staff-1",
      note: "Filed by client",
    });
    expect(
      getFiledReturnReceiptState(plan).state,
    ).toBe("attached");
  });

  it("rejects stale, dismissed, active-run and ineligible-file requests", () => {
    expect(complete({ expectedStatus: "review_required" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect(
      complete({
        taxReturn: { ...pendingReturn, status: "dismissed" },
        expectedStatus: "dismissed",
      }),
    ).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    expect(complete({ hasActiveJob: true })).toMatchObject({
      ok: false,
      code: "PRECONDITION_FAILED",
    });
    expect(complete({ fileUrl: financials.url })).toMatchObject({ ok: false });
    expect(complete({ fileUrl: spreadsheet.url })).toMatchObject({ ok: false });
    expect(complete({ fileUrl: "https://blob.example/unknown.pdf" })).toMatchObject({
      ok: false,
    });
  });

  it("links a missing receipt on a completed return without replacing an attached one", () => {
    const completedReturn = { ...pendingReturn, status: "completed" };
    const plan = complete({ taxReturn: completedReturn, expectedStatus: "completed" });
    expect(plan).toMatchObject({ ok: true, status: "completed" });

    const withReceipt = {
      ...completedReturn,
      files: [{ ...filedPdf, role: "filed_return_pdf" }],
    };
    expect(
      complete({ taxReturn: withReceipt, expectedStatus: "completed" }),
    ).toMatchObject({ ok: false, code: "BAD_REQUEST" });
  });

  it("re-links a superseded filed PDF as current", () => {
    const superseded = {
      ...filedPdf,
      metadata: { kind: "filed_return_pdf", supersededAt: "2026-11-01T00:00:00.000Z" },
    };
    const plan = complete({ taxReturn: { ...pendingReturn, files: [superseded] } });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.files[0]?.metadata?.supersededAt).toBeUndefined();
    expect(plan.files[0]?.role).toBe("filed_return_pdf");
  });
});

describe("planManualCompletionRevert", () => {
  const completed = complete();
  if (!completed.ok) throw new Error("setup failed");
  const completedReturn = {
    status: completed.status,
    files: completed.files,
    metadata: completed.metadata,
  };

  function revert(overrides: Partial<Parameters<typeof planManualCompletionRevert>[0]> = {}) {
    return planManualCompletionRevert({
      taxReturn: completedReturn,
      expectedFileUrl: filedPdf.url,
      expectedCompletedAt: now.toISOString(),
      actorAccountId: "staff-2",
      reason: "Wrong PDF linked",
      now,
      ...overrides,
    });
  }

  it("restores the previous status, keeps the PDF as superseded, and keeps filing blocked", () => {
    const plan = revert();
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.status).toBe("pending");
    const file = plan.files.find((f) => f.url === filedPdf.url);
    expect(file?.role).toBeUndefined();
    expect(file?.metadata).toMatchObject({
      kind: "filed_return_pdf",
      supersededReason: MANUAL_COMPLETION_REVERTED_GATE,
    });
    expect(plan.metadata.manualCompletion).toBeUndefined();
    expect(plan.metadata.manualCompletionHistory).toHaveLength(2);

    expect(getPossibleFilingEvidence(plan)).toBe(MANUAL_COMPLETION_REVERTED_GATE);
    expect(
      getFilingStartBlocker({
        taxReturn: {
          status: plan.status,
          returnType: "economic_substance",
          jurisdiction: { code: "GG" },
          files: plan.files,
          metadata: plan.metadata,
        },
        submissionMode: "submit_and_capture_pdf",
      }),
    ).toContain("may already have filed");
    expect(getFiledReturnReceiptState(plan).state).toBe(
      "missing",
    );
  });

  it("never restores an automation in_progress status", () => {
    const fromRun = complete({
      taxReturn: { ...pendingReturn, status: "in_progress" },
      expectedStatus: "in_progress",
    });
    if (!fromRun.ok) throw new Error("setup failed");
    expect(
      revert({
        taxReturn: { status: fromRun.status, files: fromRun.files, metadata: fromRun.metadata },
      }),
    ).toMatchObject({ ok: true, status: "review_required" });
  });

  it("only reverts a staff-recorded completion that still matches", () => {
    expect(revert({ expectedFileUrl: "https://blob.example/other.pdf" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect(revert({ reason: " no " })).toMatchObject({ ok: false });
    expect(revert({ expectedCompletedAt: "2026-11-18T10:00:00.000Z" })).toMatchObject({
      ok: false,
      code: "CONFLICT",
    });
    expect(
      revert({
        taxReturn: {
          status: "completed",
          files: [{ ...filedPdf, role: "filed_return_pdf" }],
          metadata: { filedReturnPdf: { status: "uploaded" } },
        },
      }),
    ).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    expect(
      revert({
        taxReturn: {
          ...completedReturn,
          files: completedReturn.files.map((f) => ({ ...f, role: undefined })),
        },
      }),
    ).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("preserves a receipt that was already attached before the completion", () => {
    const receipt = { ...filedPdf, role: "filed_return_pdf" };
    const capture = { status: "uploaded", source: "browser_use_download" };
    const plan = complete({
      taxReturn: {
        ...pendingReturn,
        files: [receipt],
        metadata: { filedReturnPdf: capture },
      },
    });
    if (!plan.ok) throw new Error("setup failed");
    expect(revert({
      taxReturn: { status: plan.status, files: plan.files, metadata: plan.metadata },
    })).toMatchObject({
      ok: true,
      status: "pending",
      files: [receipt],
      metadata: { filedReturnPdf: capture },
    });
  });
});
