/**
 * Staff action: mark a return Completed because it was already filed outside
 * LTS, using an official filed-return PDF that is already attached to the
 * return, and undo that if it was entered in error.
 *
 * This never files anything. It only records that a filing already happened.
 * The filed-return PDF role stays system-managed: this is the only manual way
 * to set it, it requires an explicit confirmation, and it is checked here and
 * again under a row lock on the server.
 *
 * Undoing a manual completion never re-enables a portal submission: the return
 * keeps a receipt gate (see `getPossibleFilingEvidence`) because staff said it
 * had been filed, so it must be checked on the portal and its receipt
 * recovered instead of being submitted again.
 */

export const MANUAL_COMPLETION_SOURCE = "staff_manual_link";
export const MANUAL_COMPLETION_REVERTED_GATE = "manual_completion_reverted";

/**
 * Statuses a return may be manually marked Completed from. "completed" is
 * allowed only to link a missing receipt; its status does not change.
 */
export const MANUAL_COMPLETION_FROM_STATUSES = [
  "pending",
  "in_progress",
  "failed",
  "review_required",
  "completed",
] as const;

/**
 * Statuses a mistaken manual completion may be put back to. "in_progress"
 * means an automation run, which this action never resumes.
 */
const REVERTIBLE_PREVIOUS_STATUSES = [
  "pending",
  "failed",
  "review_required",
  "completed",
] as const;
type RevertibleStatus = (typeof REVERTIBLE_PREVIOUS_STATUSES)[number];

/** Job statuses that mean an automation run may still act on the portal. */
export const ACTIVE_JOB_STATUSES = [
  "pending",
  "queued",
  "starting",
  "running",
  "paused",
] as const;

export type ManualCompletionFile = {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  category?: string;
  role?: string;
  metadata?: Record<string, unknown>;
};

type ReturnState = {
  status: string;
  files: unknown;
  metadata: unknown;
};

type Plan =
  | {
      ok: true;
      status: "completed" | "pending" | "failed" | "review_required";
      files: ManualCompletionFile[];
      metadata: Record<string, unknown>;
    }
  | { ok: false; code: "BAD_REQUEST" | "CONFLICT" | "PRECONDITION_FAILED"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readFiles(files: unknown): ManualCompletionFile[] {
  return Array.isArray(files)
    ? (files.filter(
        (file) => isRecord(file) && typeof file.url === "string",
      ) as ManualCompletionFile[])
    : [];
}

function readMetadata(metadata: unknown): Record<string, unknown> {
  return isRecord(metadata) ? metadata : {};
}

export function isPdfFile(file: Pick<ManualCompletionFile, "name" | "type" | "url">) {
  if (file.type?.toLowerCase() === "application/pdf") return true;
  const name = file.name?.toLowerCase() ?? "";
  const path = (() => {
    try {
      return new URL(file.url).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  return name.endsWith(".pdf") || path.endsWith(".pdf");
}

/**
 * Attached files staff may link as the filed-return PDF: the receipt already
 * attached (if any), otherwise any PDF that is not the financial statements.
 * An already-attached receipt is never replaced by this action.
 */
export function getManualCompletionCandidates(
  files: unknown,
): ManualCompletionFile[] {
  const all = readFiles(files);
  const attachedReceipt = all.find((file) => file.role === "filed_return_pdf");
  if (attachedReceipt) return [attachedReceipt];
  return all.filter((file) => !file.role && isPdfFile(file));
}

/** Status a reverted manual completion returns to. */
export function getRevertTargetStatus(previousStatus: string): RevertibleStatus {
  return (REVERTIBLE_PREVIOUS_STATUSES as readonly string[]).includes(
    previousStatus,
  )
    ? (previousStatus as RevertibleStatus)
    : "review_required";
}

export type ManualCompletionRecord = {
  completedAt: string;
  completedByAccountId: string;
  fileUrl: string;
  fileName: string;
  previousStatus: string;
  /** Set when the linked PDF was not already the attached receipt. */
  linkedFile: boolean;
  previousFiledReturnPdf: unknown;
  note: string | null;
};

export function getManualCompletionRecord(
  metadata: unknown,
): ManualCompletionRecord | null {
  const record = readMetadata(metadata).manualCompletion;
  if (
    isRecord(record) &&
    typeof record.fileUrl === "string" &&
    typeof record.completedAt === "string"
  ) {
    return record as unknown as ManualCompletionRecord;
  }
  return null;
}

function appendHistory(
  metadata: Record<string, unknown>,
  entry: Record<string, unknown>,
) {
  const history = Array.isArray(metadata.manualCompletionHistory)
    ? metadata.manualCompletionHistory
    : [];
  return [...history, entry];
}

export function planManualCompletion(input: {
  taxReturn: ReturnState;
  fileUrl: string;
  expectedStatus: string;
  actorAccountId: string;
  hasActiveJob: boolean;
  note?: string | null;
  now: Date;
}): Plan {
  const { taxReturn } = input;

  if (taxReturn.status !== input.expectedStatus) {
    return {
      ok: false,
      code: "CONFLICT",
      message: `This return changed to "${taxReturn.status}" since you opened it. Reload and check it before marking it completed.`,
    };
  }
  const hasAttachedReceipt = readFiles(taxReturn.files).some(
    (file) => file.role === "filed_return_pdf",
  );
  if (taxReturn.status === "completed" && hasAttachedReceipt) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "This return is already completed with a filed-return PDF.",
    };
  }
  if (
    !(MANUAL_COMPLETION_FROM_STATUSES as readonly string[]).includes(
      taxReturn.status,
    )
  ) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message:
        taxReturn.status === "dismissed"
          ? "Restore this dismissed return before marking it completed."
          : `A return in "${taxReturn.status}" cannot be marked completed.`,
    };
  }
  if (input.hasActiveJob) {
    return {
      ok: false,
      code: "PRECONDITION_FAILED",
      message:
        "An automation run is still active for this return. Stop or finish it before marking the return completed, so it cannot act on the portal afterwards.",
    };
  }

  const files = readFiles(taxReturn.files);
  const candidate = getManualCompletionCandidates(files).find(
    (file) => file.url === input.fileUrl,
  );
  if (!candidate) {
    const hasReceipt = files.some((file) => file.role === "filed_return_pdf");
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: hasReceipt
        ? "This return already has a filed-return PDF. Mark it completed using that PDF."
        : "Choose a PDF already attached to this return (not the financial statements).",
    };
  }

  const at = input.now.toISOString();
  const linkedFile = candidate.role !== "filed_return_pdf";
  const nextFiles = files.map((file) => {
    if (file.url !== candidate.url || !linkedFile) return file;
    const {
      supersededAt: _supersededAt,
      supersededByJobId: _supersededByJobId,
      supersededReason: _supersededReason,
      ...rest
    } = file.metadata ?? {};
    return {
      ...file,
      role: "filed_return_pdf",
      metadata: {
        ...rest,
        kind: "filed_return_pdf",
        source: MANUAL_COMPLETION_SOURCE,
        linkedAt: at,
      },
    };
  });

  const metadata = readMetadata(taxReturn.metadata);
  const note = input.note?.trim() ? input.note.trim() : null;
  const manualCompletion: ManualCompletionRecord = {
    completedAt: at,
    completedByAccountId: input.actorAccountId,
    fileUrl: candidate.url,
    fileName: candidate.name,
    previousStatus: taxReturn.status,
    linkedFile,
    previousFiledReturnPdf: metadata.filedReturnPdf ?? null,
    note,
  };

  return {
    ok: true,
    status: "completed",
    files: nextFiles,
    metadata: {
      ...metadata,
      filedReturnPdf: {
        status: "uploaded",
        source: MANUAL_COMPLETION_SOURCE,
        error: null,
        receiptGate: null,
        fileUrl: candidate.url,
        recordedAt: at,
      },
      manualCompletion,
      manualCompletionHistory: appendHistory(metadata, {
        action: "marked_completed",
        at,
        byAccountId: input.actorAccountId,
        fileUrl: candidate.url,
        previousStatus: taxReturn.status,
        note,
      }),
    },
  };
}

export function planManualCompletionRevert(input: {
  taxReturn: ReturnState;
  expectedFileUrl: string;
  expectedCompletedAt: string;
  actorAccountId: string;
  reason: string;
  now: Date;
}): Plan {
  const { taxReturn } = input;
  const record = getManualCompletionRecord(taxReturn.metadata);

  if (taxReturn.status !== "completed" || !record) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message:
        "Only a completion recorded by staff on this page can be reverted here.",
    };
  }
  if (
    record.fileUrl !== input.expectedFileUrl ||
    record.completedAt !== input.expectedCompletedAt
  ) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "This return's completion changed since you opened it. Reload and check it.",
    };
  }

  const files = readFiles(taxReturn.files);
  const receipt = files.find((file) => file.role === "filed_return_pdf");
  if (!receipt || receipt.url !== record.fileUrl) {
    return {
      ok: false,
      code: "CONFLICT",
      message:
        "The filed-return PDF on this return is not the one linked by staff, so it was not reverted. Check the return's files.",
    };
  }
  const reason = input.reason.trim();
  if (reason.length < 5) {
    return {
      ok: false,
      code: "BAD_REQUEST",
      message: "Give a reason for reverting the completion.",
    };
  }

  const at = input.now.toISOString();
  // The file is kept (never deleted) and shown as a superseded filed PDF,
  // which the dashboard treats as system-managed.
  const nextFiles = files.map((file) =>
    record.linkedFile && file.url === receipt.url
      ? {
          ...file,
          role: undefined,
          metadata: {
            ...(file.metadata ?? {}),
            kind: "filed_return_pdf",
            supersededAt: at,
            supersededReason: MANUAL_COMPLETION_REVERTED_GATE,
          },
        }
      : file,
  );

  const metadata = readMetadata(taxReturn.metadata);
  const { manualCompletion: _manualCompletion, ...rest } = metadata;
  const nextStatus = getRevertTargetStatus(record.previousStatus);

  return {
    ok: true,
    status: nextStatus,
    files: nextFiles,
    metadata: {
      ...rest,
      // A receipt gate, not a clean slate: staff reported this return as
      // filed, so a portal submission stays blocked until the receipt is
      // recovered or the filing is confirmed not to exist.
      filedReturnPdf: record.linkedFile ? {
        status: "reverted",
        source: MANUAL_COMPLETION_SOURCE,
        error: `Manual completion reverted: ${reason}`,
        receiptGate: MANUAL_COMPLETION_REVERTED_GATE,
        fileUrl: null,
        revertedFileUrl: receipt.url,
        previousFiledReturnPdf: record.previousFiledReturnPdf ?? null,
        recordedAt: at,
      } : record.previousFiledReturnPdf,
      manualCompletionHistory: appendHistory(metadata, {
        action: "reverted",
        at,
        byAccountId: input.actorAccountId,
        fileUrl: receipt.url,
        restoredStatus: nextStatus,
        reason,
      }),
    },
  };
}
