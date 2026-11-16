/**
 * Whether a return's portal-generated filed-return receipt is saved, so staff
 * can see completed/filed returns whose receipt never reached the client.
 */

export type FiledReturnReceiptState =
  | { state: "attached"; fileUrl: string; fileName: string }
  | {
      state: "missing";
      /** Why the receipt is expected. */
      reason: "return_completed" | "capture_recorded_gap";
      /** Last worker capture outcome, if any (from metadata.filedReturnPdf). */
      captureStatus: string | null;
      captureError: string | null;
      receiptGate: string | null;
      browserUseSessionId: string | null;
      browserUseBrowserIds: string[];
      workspaceRetained: boolean | null;
    }
  | { state: "not_expected" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const str = (value: unknown) => (typeof value === "string" ? value : null);

export function getFiledReturnReceiptState(taxReturn: {
  status: string;
  files: unknown;
  metadata: unknown;
}): FiledReturnReceiptState {
  const files = Array.isArray(taxReturn.files) ? taxReturn.files : [];
  const receipt = files.find(
    (file) =>
      isRecord(file) &&
      file.role === "filed_return_pdf" &&
      typeof file.url === "string",
  ) as Record<string, unknown> | undefined;
  if (receipt) {
    return {
      state: "attached",
      fileUrl: receipt.url as string,
      fileName: str(receipt.name) ?? "Filed return PDF",
    };
  }

  const capture = isRecord(taxReturn.metadata)
    ? taxReturn.metadata.filedReturnPdf
    : undefined;
  const captureRecord = isRecord(capture) ? capture : null;
  const recordedGap =
    captureRecord !== null && captureRecord.status !== "uploaded";

  if (taxReturn.status !== "completed" && !recordedGap) {
    return { state: "not_expected" };
  }

  return {
    state: "missing",
    reason: taxReturn.status === "completed" ? "return_completed" : "capture_recorded_gap",
    captureStatus: str(captureRecord?.status),
    captureError: str(captureRecord?.error),
    receiptGate: str(captureRecord?.receiptGate),
    browserUseSessionId: str(captureRecord?.browserUseSessionId),
    browserUseBrowserIds: Array.isArray(captureRecord?.browserUseBrowserIds)
      ? (captureRecord.browserUseBrowserIds as unknown[]).filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    workspaceRetained:
      typeof captureRecord?.workspaceRetained === "boolean"
        ? captureRecord.workspaceRetained
        : null,
  };
}
