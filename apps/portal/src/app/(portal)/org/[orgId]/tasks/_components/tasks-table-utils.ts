export type ReturnStatusTone =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "review_required"
  | "dismissed";
export type TaskKind = "review" | "active" | "esr" | "documents";
export type TaskFilter = "all" | TaskKind;
export type StatusFilter = "all" | ReturnStatusTone;
export type TaxYearFilter = "all" | `${number}`;
export type SortKey = "entity" | "year" | "status" | "updated";
export type SortDirection = "asc" | "desc";
export type PaginationItem = number | "ellipsis-left" | "ellipsis-right";

export type TaskRecord = {
  id: string;
  entityName: string;
  taxYear: number;
  status: string;
  externalId: string | null;
  files: unknown;
  updatedAt: Date | string | null | undefined;
  jurisdictionCode: string;
  jurisdictionName: string;
  isSubstanceComplete: boolean | null;
  missingSubstanceFields: unknown;
};

export const PAGE_SIZE = 20;

export const STATUS_LABEL: Record<ReturnStatusTone, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
  review_required: "Review Required",
  dismissed: "Dismissed",
};

export const STATUS_CLASS: Record<ReturnStatusTone, string> = {
  pending:
    "border-black/8 bg-black/[0.03] text-foreground/80 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80",
  in_progress:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200",
  completed:
    "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
  failed:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200",
  review_required:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200",
  dismissed:
    "border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-500/20 dark:bg-zinc-500/10 dark:text-zinc-400",
};

export const TASK_LABEL: Record<TaskKind, string> = {
  review: "Needs Review",
  active: "In Progress",
  esr: "Needs ESR",
  documents: "Needs Docs",
};

export const TASK_CLASS: Record<TaskKind, string> = {
  review:
    "border-black/8 bg-black/[0.03] text-foreground/80 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80",
  active:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200",
  esr: "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200",
  documents:
    "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200",
};

export const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "failed", label: "Failed" },
  { value: "review_required", label: "Review Required" },
  { value: "dismissed", label: "Dismissed" },
];

export function normalizeStatus(status: string): ReturnStatusTone {
  if (status === "pending") return "pending";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "dismissed") return "dismissed";
  return "review_required";
}

export function fileCount(files: unknown) {
  return Array.isArray(files) ? files.length : 0;
}

export function missingFieldCount(fields: unknown) {
  return Array.isArray(fields) ? fields.length : 0;
}

export function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRelativeTime(value: Date | string | null | undefined) {
  const timestamp = toTimestamp(value);
  if (!timestamp) return "No recent update";

  const difference = Date.now() - timestamp;
  if (difference < 60_000) return "Just now";
  if (difference < 3_600_000) {
    return `${Math.max(1, Math.round(difference / 60_000))}m ago`;
  }
  if (difference < 86_400_000) {
    return `${Math.max(1, Math.round(difference / 3_600_000))}h ago`;
  }
  if (difference < 2_592_000_000) {
    return `${Math.max(1, Math.round(difference / 86_400_000))}d ago`;
  }

  return formatDateTime(value);
}

export function classifyTaskKind(row: TaskRecord): TaskKind {
  const status = normalizeStatus(row.status);

  if (status === "failed" || status === "review_required") {
    return "review";
  }

  if (status === "in_progress") {
    return "active";
  }

  if (fileCount(row.files) === 0) {
    return "documents";
  }

  if (!row.isSubstanceComplete) {
    return "esr";
  }

  return "active";
}

export function getTaskAction(row: TaskRecord) {
  const status = normalizeStatus(row.status);
  const files = fileCount(row.files);
  const missingFields = missingFieldCount(row.missingSubstanceFields);

  if (status === "failed") {
    return {
      title: "Resolve failed filing",
      detail: "Review the latest issue and retry the filing flow.",
    };
  }

  if (status === "review_required") {
    return {
      title: "Review flagged return",
      detail: "This return needs a human check before it moves forward.",
    };
  }

  if (status === "in_progress") {
    return {
      title: "Continue preparation",
      detail: "Resume the workspace and finish the current filing steps.",
    };
  }

  if (files === 0) {
    return {
      title: "Upload source documents",
      detail: "Add ESR or financial files so the return can leave intake.",
    };
  }

  if (!row.isSubstanceComplete) {
    return {
      title: "Complete ESR form",
      detail:
        missingFields > 0
          ? `${missingFields} required field${missingFields === 1 ? "" : "s"} still missing.`
          : "Finish the substance form to make this return filing-ready.",
    };
  }

  return {
    title: "Open return workspace",
    detail: "Review the packet and move the return to completion.",
  };
}

export function getPaginationItems(
  currentPage: number,
  pageCount: number,
): PaginationItem[] {
  if (pageCount <= 5) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const items: PaginationItem[] = [1];
  let start = Math.max(2, currentPage - 1);
  let end = Math.min(pageCount - 1, currentPage + 1);

  if (currentPage <= 3) {
    start = 2;
    end = 4;
  } else if (currentPage >= pageCount - 2) {
    start = pageCount - 3;
    end = pageCount - 1;
  }

  if (start > 2) {
    items.push("ellipsis-left");
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page);
  }

  if (end < pageCount - 1) {
    items.push("ellipsis-right");
  }

  items.push(pageCount);
  return items;
}
