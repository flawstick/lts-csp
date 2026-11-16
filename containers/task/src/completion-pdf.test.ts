import { describe, expect, it } from "vitest";

import {
  getBrowserFileBaselineKey,
  isPdfPath,
  looksLikePdf,
  selectCompletionPdfCandidates,
} from "./completion-pdf";

const fs = {
  sessionFileName: "financial-statements.pdf",
  sessionFilePath: "uploads/financial-statements.pdf",
};

describe("selectCompletionPdfCandidates", () => {
  it("never offers the uploaded financial statements as the receipt", () => {
    // Mirrors the retained workspaces where only the source PDF exists.
    const candidates = selectCompletionPdfCandidates({
      sessionFiles: [],
      workspaceFiles: [
        {
          path: "uploads/financial-statements.pdf",
          size: 5000,
          lastModified: "2026-03-01T10:00:00Z",
          url: "https://files.example/fs.pdf",
        },
      ],
      baselineKeys: new Set([
        getBrowserFileBaselineKey("workspace", "uploads/financial-statements.pdf"),
      ]),
      excludedInputs: [fs],
    });
    expect(candidates).toEqual([]);
  });

  it("excludes baseline files even when they look like a receipt and are newer", () => {
    const candidates = selectCompletionPdfCandidates({
      sessionFiles: [],
      workspaceFiles: [
        {
          path: "old/submission-receipt.pdf",
          size: 900,
          lastModified: "2026-12-01T10:00:00Z",
          url: "https://files.example/old.pdf",
        },
        {
          path: "downloads/notes.pdf",
          size: 900,
          lastModified: "2026-01-01T10:00:00Z",
          url: "https://files.example/new.pdf",
        },
      ],
      baselineKeys: new Set([
        getBrowserFileBaselineKey("workspace", "old/submission-receipt.pdf"),
      ]),
      excludedInputs: [],
    });
    expect(candidates.map((c) => c.path)).toEqual(["downloads/notes.pdf"]);
  });

  it("prefers the browser download (company-tax-submitted.pdf) over workspace files", () => {
    const candidates = selectCompletionPdfCandidates({
      sessionFiles: [
        {
          path: "company-tax-submitted.pdf",
          size: 207448,
          lastModified: "2026-03-01T10:00:00Z",
          url: "https://files.example/receipt.pdf",
        },
      ],
      workspaceFiles: [
        {
          path: "downloads/return-confirmation-print.pdf",
          size: 1000,
          lastModified: "2026-03-01T11:00:00Z",
          url: "https://files.example/ws.pdf",
        },
      ],
      baselineKeys: new Set(),
      excludedInputs: [fs],
    });
    expect(candidates[0]).toMatchObject({
      path: "company-tax-submitted.pdf",
      source: "session",
    });
    expect(candidates[0]!.keywordMatches).toContain("submitted");
  });

  it("ranks keyword matches above recency within a source", () => {
    const candidates = selectCompletionPdfCandidates({
      sessionFiles: [
        {
          path: "random.pdf",
          size: 10,
          lastModified: "2026-03-02T10:00:00Z",
          url: "https://files.example/a.pdf",
        },
        {
          path: "submission-receipt.pdf",
          size: 10,
          lastModified: "2026-03-01T10:00:00Z",
          url: "https://files.example/b.pdf",
        },
      ],
      workspaceFiles: [],
      baselineKeys: new Set(),
      excludedInputs: [],
    });
    expect(candidates.map((c) => c.path)).toEqual([
      "submission-receipt.pdf",
      "random.pdf",
    ]);
  });

  it("ignores non-PDFs whose signed URL merely contains 'pdf', empty files and files without URLs", () => {
    const candidates = selectCompletionPdfCandidates({
      sessionFiles: [
        {
          path: "page.html",
          size: 10,
          lastModified: "",
          url: "https://files.example/pdf/page.html?sig=pdf",
        },
        { path: "empty.pdf", size: 0, lastModified: "", url: "https://x/e.pdf" },
        { path: "nourl.pdf", size: 10, lastModified: "", url: null },
      ],
      workspaceFiles: [],
      baselineKeys: new Set(),
      excludedInputs: [],
    });
    expect(candidates).toEqual([]);
  });
});

describe("isPdfPath / looksLikePdf", () => {
  it("detects PDFs by path and magic bytes", () => {
    expect(isPdfPath("a/b/Receipt.PDF?x=1")).toBe(true);
    expect(isPdfPath("a/pdf/receipt.html")).toBe(false);
    expect(looksLikePdf(Buffer.from("%PDF-1.7\n..."))).toBe(true);
    expect(looksLikePdf(Buffer.from("<!doctype html>"))).toBe(false);
    expect(looksLikePdf(Buffer.from("%PD"))).toBe(false);
  });
});
