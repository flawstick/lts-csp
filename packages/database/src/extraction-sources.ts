/**
 * Pure helpers for AI form extraction sources and employee post-processing.
 * Kept out of the tRPC router so the behaviour is unit tested.
 */

export type ExtractionSourceKind = "pdf" | "image" | "excel" | "csv" | "unsupported";

const EXCEL_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

function startsWithBytes(bytes: Uint8Array, signature: number[]) {
  return signature.every((byte, index) => bytes[index] === byte);
}

/**
 * Classify a source file from its content, name and declared type. Storage
 * often serves uploads as `application/octet-stream` and signed URLs carry
 * query strings, so the bytes and the stored file name take precedence over
 * the header. Anything unrecognised is "unsupported" (callers fail closed).
 */
export function classifyExtractionSource(params: {
  contentType: string | null;
  fileName: string;
  urlPath: string;
  bytes: Uint8Array;
}): { kind: ExtractionSourceKind; mediaType: string } {
  const header = (params.contentType ?? "").split(";")[0]!.trim().toLowerCase();
  const names = [params.fileName, params.urlPath].map((value) =>
    value.toLowerCase().split("?")[0]!,
  );
  const hasExtension = (...extensions: string[]) =>
    names.some((name) => extensions.some((ext) => name.endsWith(ext)));
  const bytes = params.bytes;

  if (startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return { kind: "pdf", mediaType: "application/pdf" };
  }
  if (startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47]))
    return { kind: "image", mediaType: "image/png" };
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff]))
    return { kind: "image", mediaType: "image/jpeg" };
  if (startsWithBytes(bytes, [0x47, 0x49, 0x46, 0x38]))
    return { kind: "image", mediaType: "image/gif" };
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  )
    return { kind: "image", mediaType: "image/webp" };

  const isZip = startsWithBytes(bytes, [0x50, 0x4b, 0x03, 0x04]);
  const isOle = startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0]);
  if (
    (isZip || isOle) &&
    (EXCEL_TYPES.includes(header) || hasExtension(".xlsx", ".xls", ".xlsm"))
  ) {
    return { kind: "excel", mediaType: header || EXCEL_TYPES[0]! };
  }

  if (header === "text/csv" || hasExtension(".csv")) {
    return { kind: "csv", mediaType: "text/csv" };
  }
  return { kind: "unsupported", mediaType: header || "application/octet-stream" };
}

/** Decode CSV text, dropping a UTF-8 BOM. */
export function decodeCsv(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
}

export type ExtractedEmployee = {
  name?: string;
  qualifiedForReporting?: boolean;
  unitsOnCompany?: number;
  totalUnits?: number;
  fteFraction?: number;
  qualifiedFteFraction?: number;
};

const round = (value: number) => Math.round(value * 10_000) / 10_000;

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

/**
 * Normalise AI-extracted employee rows without dropping partial rows:
 * - keeps a row that has any identifying or numeric data, dropping only
 *   entirely empty rows;
 * - derives fteFraction from units when both are present (totalUnits > 0) and
 *   no explicit fraction was given;
 * - derives qualifiedFteFraction only from an explicit qualified flag;
 * - fills totals only when every row has a known fraction (otherwise the sum
 *   would understate the FTE), never overriding explicitly extracted totals.
 */
export function normalizeExtractedEmployees(input: {
  employees: ExtractedEmployee[] | undefined;
  totalFte?: number;
  totalQualifiedFte?: number;
}): {
  employees: ExtractedEmployee[] | undefined;
  totalFte?: number;
  totalQualifiedFte?: number;
  warnings: string[];
} {
  const warnings: string[] = [];
  if (!input.employees) {
    return {
      employees: undefined,
      totalFte: input.totalFte,
      totalQualifiedFte: input.totalQualifiedFte,
      warnings,
    };
  }

  const employees: ExtractedEmployee[] = [];
  input.employees.forEach((raw, index) => {
    const row: ExtractedEmployee = {};
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    if (name) row.name = name;
    if (typeof raw.qualifiedForReporting === "boolean")
      row.qualifiedForReporting = raw.qualifiedForReporting;
    const units = finiteNonNegative(raw.unitsOnCompany);
    const total = finiteNonNegative(raw.totalUnits);
    if (units !== undefined) row.unitsOnCompany = units;
    if (total !== undefined) row.totalUnits = total;

    let fte = finiteNonNegative(raw.fteFraction);
    if (fte === undefined && units !== undefined && total !== undefined && total > 0) {
      fte = round(units / total);
    }
    if (fte !== undefined) {
      if (fte > 1) {
        warnings.push(
          `Employee ${name || `row ${index + 1}`} has an FTE above 1 (${fte}); check the units.`,
        );
      }
      row.fteFraction = fte;
    }

    const explicitQualified = finiteNonNegative(raw.qualifiedFteFraction);
    if (explicitQualified !== undefined) {
      row.qualifiedFteFraction = explicitQualified;
    } else if (row.qualifiedForReporting === true && fte !== undefined) {
      row.qualifiedFteFraction = fte;
    } else if (row.qualifiedForReporting === false && fte !== undefined) {
      row.qualifiedFteFraction = 0;
    }

    if (Object.keys(row).length === 0) return;
    if (!row.name) {
      warnings.push(`Employee row ${index + 1} has no name; please confirm it.`);
    }
    employees.push(row);
  });

  let totalFte = finiteNonNegative(input.totalFte);
  let totalQualifiedFte = finiteNonNegative(input.totalQualifiedFte);
  const allFteKnown =
    employees.length > 0 && employees.every((row) => row.fteFraction !== undefined);
  if (totalFte === undefined && allFteKnown) {
    totalFte = round(employees.reduce((sum, row) => sum + row.fteFraction!, 0));
  }
  const allQualifiedKnown =
    employees.length > 0 &&
    employees.every((row) => row.qualifiedFteFraction !== undefined);
  if (totalQualifiedFte === undefined && allQualifiedKnown) {
    totalQualifiedFte = round(
      employees.reduce((sum, row) => sum + row.qualifiedFteFraction!, 0),
    );
  }
  if (employees.length > 0 && !allFteKnown && input.totalFte === undefined) {
    warnings.push(
      "Some employees have no FTE or units in the documents; total FTE was not calculated.",
    );
  }

  return { employees, totalFte, totalQualifiedFte, warnings };
}

/**
 * Do not let an extraction that found no employee rows wipe employees that
 * are already saved on the form (absence in the documents is "unknown").
 */
export function shouldKeepExistingEmployees(
  extracted: ExtractedEmployee[] | undefined,
  existing: unknown,
): boolean {
  return (
    Array.isArray(extracted) &&
    extracted.length === 0 &&
    Array.isArray(existing) &&
    existing.length > 0
  );
}
