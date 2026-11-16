import { describe, expect, it } from "vitest";

import {
  classifyExtractionSource,
  decodeCsv,
  normalizeExtractedEmployees,
  shouldKeepExistingEmployees,
} from "./extraction-sources";

const bytes = (text: string) => new TextEncoder().encode(text);

describe("classifyExtractionSource", () => {
  it("detects a PDF served as octet-stream from a signed URL", () => {
    expect(
      classifyExtractionSource({
        contentType: "application/octet-stream",
        fileName: "Accounts 2025",
        urlPath: "/uploads/abc",
        bytes: bytes("%PDF-1.7\n"),
      }),
    ).toEqual({ kind: "pdf", mediaType: "application/pdf" });
  });

  it("detects xlsx by zip signature and stored name, csv by name", () => {
    expect(
      classifyExtractionSource({
        contentType: "application/octet-stream",
        fileName: "Employees.XLSX",
        urlPath: "/u/1",
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]),
      }).kind,
    ).toBe("excel");
    expect(
      classifyExtractionSource({
        contentType: "text/plain; charset=utf-8",
        fileName: "staff.csv",
        urlPath: "/u/2",
        bytes: bytes("name,units\nA,1"),
      }),
    ).toEqual({ kind: "csv", mediaType: "text/csv" });
  });

  it("does not treat arbitrary application/* files (docx, zip) as extractable", () => {
    expect(
      classifyExtractionSource({
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        fileName: "minutes.docx",
        urlPath: "/u/3",
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      }).kind,
    ).toBe("unsupported");
  });

  it("detects images by magic bytes", () => {
    expect(
      classifyExtractionSource({
        contentType: null,
        fileName: "scan",
        urlPath: "/u/4",
        bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      }),
    ).toEqual({ kind: "image", mediaType: "image/jpeg" });
  });

  it("strips a UTF-8 BOM from CSV", () => {
    expect(decodeCsv(bytes("﻿name\nA"))).toBe("name\nA");
  });
});

describe("normalizeExtractedEmployees", () => {
  it("keeps partial rows and derives FTE from units", () => {
    const result = normalizeExtractedEmployees({
      employees: [
        { name: " Alice ", qualifiedForReporting: true, unitsOnCompany: 50, totalUnits: 200 },
        { name: "Bob" },
        {},
      ],
    });
    expect(result.employees).toEqual([
      {
        name: "Alice",
        qualifiedForReporting: true,
        unitsOnCompany: 50,
        totalUnits: 200,
        fteFraction: 0.25,
        qualifiedFteFraction: 0.25,
      },
      { name: "Bob" },
    ]);
    // Bob's FTE is unknown, so no understated total is invented.
    expect(result.totalFte).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("total FTE was not calculated");
  });

  it("sums totals only when every row is known and never overrides explicit totals", () => {
    const rows = [
      { name: "A", qualifiedForReporting: true, fteFraction: 0.5 },
      { name: "B", qualifiedForReporting: false, unitsOnCompany: 10, totalUnits: 40 },
    ];
    expect(normalizeExtractedEmployees({ employees: rows })).toMatchObject({
      totalFte: 0.75,
      totalQualifiedFte: 0.5,
    });
    expect(
      normalizeExtractedEmployees({ employees: rows, totalFte: 2, totalQualifiedFte: 1 }),
    ).toMatchObject({ totalFte: 2, totalQualifiedFte: 1 });
  });

  it("does not infer qualified FTE without an explicit flag, and ignores bad numbers", () => {
    const result = normalizeExtractedEmployees({
      employees: [{ name: "C", unitsOnCompany: 5, totalUnits: 0, fteFraction: Number.NaN }],
    });
    expect(result.employees).toEqual([{ name: "C", unitsOnCompany: 5, totalUnits: 0 }]);
    expect(result.totalQualifiedFte).toBeUndefined();
  });

  it("warns on unnamed rows and FTE above 1", () => {
    const result = normalizeExtractedEmployees({
      employees: [{ unitsOnCompany: 300, totalUnits: 100 }],
    });
    expect(result.employees).toEqual([
      { unitsOnCompany: 300, totalUnits: 100, fteFraction: 3 },
    ]);
    expect(result.warnings).toHaveLength(2);
  });

  it("passes aggregate-only totals through when no rows were extracted", () => {
    expect(
      normalizeExtractedEmployees({ employees: undefined, totalFte: 1.5 }),
    ).toMatchObject({ employees: undefined, totalFte: 1.5 });
  });
});

describe("shouldKeepExistingEmployees", () => {
  it("keeps saved employees when extraction returns none", () => {
    expect(shouldKeepExistingEmployees([], [{ name: "A" }])).toBe(true);
    expect(shouldKeepExistingEmployees([], [])).toBe(false);
    expect(shouldKeepExistingEmployees([{ name: "B" }], [{ name: "A" }])).toBe(false);
    expect(shouldKeepExistingEmployees(undefined, [{ name: "A" }])).toBe(false);
  });
});
