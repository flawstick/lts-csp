/**
 * Pure selection logic for the portal-generated filed-return receipt. Kept out
 * of the worker entrypoint so it can be unit tested without a database.
 */

export type BrowserFileSource = "session" | "workspace";

export type CandidateFile = {
  path: string;
  size: number;
  lastModified: string;
  url?: string | null;
};

export type ExcludedInputFile = {
  sessionFileName: string;
  sessionFilePath: string;
};

export type CompletionPdfCandidate = {
  path: string;
  name: string;
  size: number;
  lastModified: string;
  url: string;
  source: BrowserFileSource;
  keywordMatches: string[];
};

export const FILED_RETURN_PDF_KEYWORDS = [
  "submitted",
  "submission",
  "receipt",
  "confirmation",
  "return",
  "print",
  "download",
] as const;

export function toTimestamp(value: string | null | undefined): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

export function getPathBaseName(path: string): string {
  const normalized = path.split("?")[0] ?? path;
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function getBrowserFileBaselineKey(
  source: BrowserFileSource,
  path: string,
): string {
  return `${source}:${path}`;
}

/** Judge by the file path only: signed URLs can contain "pdf" anywhere. */
export function isPdfPath(path: string): boolean {
  return getPathBaseName(path).toLowerCase().endsWith(".pdf");
}

function isExcludedInput(
  file: CandidateFile,
  source: BrowserFileSource,
  excluded: ExcludedInputFile[],
): boolean {
  const name = getPathBaseName(file.path).toLowerCase();
  return excluded.some(
    (input) =>
      (source === "workspace" && file.path === input.sessionFilePath) ||
      name === input.sessionFileName.toLowerCase(),
  );
}

/**
 * New PDFs produced during the run, best first. Files that existed before the
 * run (the uploaded sources) are never receipt candidates, whatever their
 * name, so a financial statements PDF cannot be attached as the filed return.
 * Browser downloads rank above workspace files, then keyword matches, then
 * recency.
 */
export function selectCompletionPdfCandidates(params: {
  sessionFiles: CandidateFile[];
  workspaceFiles: CandidateFile[];
  baselineKeys: Set<string>;
  excludedInputs: ExcludedInputFile[];
}): CompletionPdfCandidate[] {
  const candidates: CompletionPdfCandidate[] = [];
  const sources: Array<[BrowserFileSource, CandidateFile[]]> = [
    ["session", params.sessionFiles],
    ["workspace", params.workspaceFiles],
  ];

  for (const [source, files] of sources) {
    for (const file of files) {
      if (!file.url || !isPdfPath(file.path)) continue;
      if (params.baselineKeys.has(getBrowserFileBaselineKey(source, file.path)))
        continue;
      if (isExcludedInput(file, source, params.excludedInputs)) continue;
      if (file.size <= 0) continue;

      const name = getPathBaseName(file.path);
      const haystack = file.path.toLowerCase();
      candidates.push({
        path: file.path,
        name,
        size: file.size,
        lastModified: file.lastModified,
        url: file.url,
        source,
        keywordMatches: FILED_RETURN_PDF_KEYWORDS.filter((token) =>
          haystack.includes(token),
        ),
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      Number(right.source === "session") - Number(left.source === "session") ||
      right.keywordMatches.length - left.keywordMatches.length ||
      toTimestamp(right.lastModified) - toTimestamp(left.lastModified) ||
      left.path.localeCompare(right.path),
  );
}

/** A downloaded receipt must be a real PDF, not an HTML error/login page. */
export function looksLikePdf(buffer: Uint8Array): boolean {
  if (buffer.length < 5) return false;
  return (
    buffer[0] === 0x25 && // %
    buffer[1] === 0x50 && // P
    buffer[2] === 0x44 && // D
    buffer[3] === 0x46 && // F
    buffer[4] === 0x2d // -
  );
}
