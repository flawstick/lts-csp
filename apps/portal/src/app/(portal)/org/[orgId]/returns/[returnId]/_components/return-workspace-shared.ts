import {
  FIELD_LABELS,
  FORM_SECTIONS,
  REQUIRED_FIELDS,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import type { RouterOutputs } from "@/trpc/react";

export type PortalReturnRecord =
  RouterOutputs["portalReturns"]["listByOrg"][number];
export type PortalSubstanceForm =
  RouterOutputs["portalReturns"]["getSubstanceForm"];

export type ReturnStatusTone =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "review_required";

export type WorkspaceTab = "form" | "files";
export type SectionId = (typeof FORM_SECTIONS)[number]["id"];
export type FormSection = (typeof FORM_SECTIONS)[number];
export type PendingFiles = Record<string, File[]>;

export type VaultFile = {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt?: string;
  category?: "esr" | "financial" | "supporting" | "misc";
  role?: "financial_statements";
};

export const STATUS_LABEL: Record<ReturnStatusTone, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
  review_required: "Review Required",
};

export const STATUS_CLASS: Record<ReturnStatusTone, string> = {
  pending: "bg-amber-500/15 text-amber-700 ring-amber-500/30",
  in_progress: "bg-blue-500/15 text-blue-700 ring-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-700 ring-rose-500/30",
  review_required: "bg-violet-500/15 text-violet-700 ring-violet-500/30",
};

const SUBSTANCE_FORM_KEYS = new Set<keyof SubstanceFormData>(
  Object.keys(FIELD_LABELS) as Array<keyof SubstanceFormData>,
);

const RELEVANT_ACTIVITIES = [
  "Banking",
  "Insurance",
  "Fund management",
  "Financing and leasing",
  "Distribution and Service Centre",
  "Headquarters",
  "Shipping",
  "Self-managed fund",
  "Intellectual Property Holding Company",
  "Pure Equity Holding Company",
  "None of the above",
] as const;

export function normalizeStatus(status: string): ReturnStatusTone {
  if (status === "pending") return "pending";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "review_required";
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(2)}MB`;
}

export function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return true;
  return Boolean(value);
}

export function previewValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value))
    return value.length ? `${value.length} entries` : null;
  return null;
}

export function asVaultFiles(files: unknown): VaultFile[] {
  if (!Array.isArray(files)) return [];

  const parsed: VaultFile[] = [];
  for (const entry of files) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.url !== "string" || typeof row.name !== "string") continue;
    parsed.push({
      url: row.url,
      name: row.name,
      size: typeof row.size === "number" ? row.size : 0,
      type:
        typeof row.type === "string" ? row.type : "application/octet-stream",
      uploadedAt:
        typeof row.uploadedAt === "string" ? row.uploadedAt : undefined,
      category:
        row.category === "esr" ||
        row.category === "financial" ||
        row.category === "supporting" ||
        row.category === "misc"
          ? row.category
          : undefined,
      role:
        row.role === "financial_statements"
          ? "financial_statements"
          : undefined,
    });
  }

  return parsed;
}

export function isFieldRequired(
  field: string,
  data: Partial<SubstanceFormData>,
): boolean {
  if (REQUIRED_FIELDS.includes(field as keyof SubstanceFormData)) {
    return true;
  }

  if (field === "partnershipName" && data.entityType === "Partnership") {
    return true;
  }

  if (field === "outsourcingDetails" && data.hasCigaOutsourcing === "Yes") {
    return true;
  }

  return false;
}

export function getSectionCompletion(
  fields: readonly string[],
  data: Partial<SubstanceFormData>,
) {
  const filled = fields.filter((field) =>
    isFilled(data[field as keyof SubstanceFormData]),
  ).length;
  const required = fields.filter((field) =>
    isFieldRequired(field, data),
  ).length;
  const missingRequired = fields.filter(
    (field) =>
      isFieldRequired(field, data) &&
      !isFilled(data[field as keyof SubstanceFormData]),
  ).length;

  return {
    filled,
    total: fields.length,
    required,
    missingRequired,
  };
}

export function isPdfLike(
  input: {
    name?: string;
    type?: string;
  } | null,
): boolean {
  if (!input) return false;
  if (typeof input.type === "string" && input.type.includes("pdf")) {
    return true;
  }

  if (typeof input.name === "string") {
    return input.name.toLowerCase().endsWith(".pdf");
  }

  return false;
}

export function sanitizeFormData(form: unknown): Partial<SubstanceFormData> {
  if (!form || typeof form !== "object") {
    return {};
  }

  const source = form as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!SUBSTANCE_FORM_KEYS.has(key as keyof SubstanceFormData)) {
      continue;
    }

    if (value === null) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized as Partial<SubstanceFormData>;
}

export function normalizeEntityType(
  value: string,
): SubstanceFormData["entityType"] | undefined {
  if (value === "Company") return "Company";
  if (value === "Partnership") return "Partnership";
  return undefined;
}

export function normalizeRelevantActivity(
  value: string,
): SubstanceFormData["relevantActivity"] | undefined {
  if (
    RELEVANT_ACTIVITIES.includes(value as (typeof RELEVANT_ACTIVITIES)[number])
  ) {
    return value as SubstanceFormData["relevantActivity"];
  }
  return undefined;
}
