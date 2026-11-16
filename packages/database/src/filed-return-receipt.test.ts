import { describe, expect, it } from "vitest";

import { getFiledReturnReceiptState } from "./filed-return-receipt";

describe("getFiledReturnReceiptState", () => {
  it("reports an attached receipt", () => {
    expect(
      getFiledReturnReceiptState({
        status: "completed",
        files: [
          { url: "https://blob/fs.pdf", name: "fs.pdf", role: "financial_statements" },
          { url: "https://blob/r.pdf", name: "Acme-2025-filed-return.pdf", role: "filed_return_pdf" },
        ],
        metadata: { filedReturnPdf: { status: "missing" } },
      }),
    ).toEqual({
      state: "attached",
      fileUrl: "https://blob/r.pdf",
      fileName: "Acme-2025-filed-return.pdf",
    });
  });

  it("flags a completed return with no receipt (completionPdf missing pattern)", () => {
    expect(
      getFiledReturnReceiptState({
        status: "completed",
        files: [{ url: "https://blob/fs.pdf", name: "fs.pdf", role: "financial_statements" }],
        metadata: {
          filedReturnPdf: {
            status: "missing",
            error: "No new PDF",
            browserUseSessionId: "agent-session",
            browserUseBrowserIds: ["browser-1", 7],
            workspaceRetained: true,
          },
        },
      }),
    ).toEqual({
      state: "missing",
      reason: "return_completed",
      captureStatus: "missing",
      captureError: "No new PDF",
      receiptGate: null,
      browserUseSessionId: "agent-session",
      browserUseBrowserIds: ["browser-1"],
      workspaceRetained: true,
    });
  });

  it("flags a recorded capture gap on a return held for review", () => {
    expect(
      getFiledReturnReceiptState({
        status: "review_required",
        files: [],
        metadata: { filedReturnPdf: { status: "failed", receiptGate: "receipt_missing" } },
      }),
    ).toMatchObject({ state: "missing", reason: "capture_recorded_gap", receiptGate: "receipt_missing" });
  });

  it("does not expect a receipt for unfiled returns or superseded-only receipts on drafts", () => {
    expect(getFiledReturnReceiptState({ status: "review_required", files: [], metadata: null })).toEqual({
      state: "not_expected",
    });
    // A superseded receipt has no role; it does not count as the current one.
    expect(
      getFiledReturnReceiptState({
        status: "completed",
        files: [{ url: "x", name: "old.pdf", metadata: { kind: "filed_return_pdf", supersededAt: "t" } }],
        metadata: {},
      }).state,
    ).toBe("missing");
  });
});
