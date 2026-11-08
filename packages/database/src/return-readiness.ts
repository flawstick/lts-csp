/**
 * Shared rules for deciding whether a return may move forward to filing:
 * client signoff, signoff revocation after edits, and GBP financial figures.
 */

export const GUERNSEY_FILING_CURRENCY = "GBP";

const FINANCIAL_FIGURES_METADATA_KEY = "financialFigures";
const SIGNOFF_REVOCATION_METADATA_KEY = "submissionSignoffRevoked";
const SUBMISSION_SIGNOFF_METADATA_KEY = "submissionSignoff";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// ============================================================================
// Submission signoff
// ============================================================================

export function hasSubmissionSignoff(input: {
  status?: string | null;
  readyForSubmissionAt?: Date | string | null;
}) {
  return Boolean(input.readyForSubmissionAt) || input.status === "completed";
}

// ============================================================================
// Manager sign-off (Guernsey ESR "Finalising the Return")
// ============================================================================

/**
 * Form fields that record the CSP manager's internal sign-off. They are an
 * approval, so only a person may set them (never AI extraction).
 */
export const MANAGER_SIGNOFF_FIELDS = [
  "managerSignOff",
  "managerSignOffDate",
] as const;

/** Only the Guernsey ESR form records a manager sign-off. */
export function requiresManagerSignoff(input: { returnType?: string | null }) {
  return input.returnType === "economic_substance";
}

/** The manager's name and sign-off date are both recorded on the form. */
export function hasManagerSignoff(
  form:
    | { managerSignOff?: string | null; managerSignOffDate?: string | null }
    | null
    | undefined,
) {
  return Boolean(form?.managerSignOff?.trim() && form?.managerSignOffDate?.trim());
}

export const MANAGER_SIGNOFF_REQUIRED_MESSAGE =
  "The manager has not signed off this return. Record the manager's name and sign-off date under Finalising the Return before it is marked ready for submission.";

/** Removes manager sign-off values from AI-extracted data. */
export function stripManagerSignoffFields<T extends Record<string, unknown>>(
  data: T,
): T {
  for (const field of MANAGER_SIGNOFF_FIELDS) delete data[field];
  return data;
}

/**
 * Approval stages, in order:
 * - needs_form / missing_fields: draft, required filing data is incomplete;
 * - awaiting_manager_signoff: complete, but the CSP manager has not signed
 *   off (Guernsey ESR only);
 * - awaiting_signoff: awaiting the client admin / authorised signatory to mark
 *   it ready for submission in the client portal;
 * - signed_off: approved for submission (or already filed).
 */
export const RETURN_READINESS_STATES = [
  "signed_off",
  "awaiting_signoff",
  "awaiting_manager_signoff",
  "missing_fields",
  "needs_form",
] as const;

export type ReturnReadinessState = (typeof RETURN_READINESS_STATES)[number];

export const RETURN_READINESS_LABELS: Record<ReturnReadinessState, string> = {
  signed_off: "Signed off",
  awaiting_signoff: "Awaiting client signoff",
  awaiting_manager_signoff: "Awaiting manager signoff",
  missing_fields: "Missing fields",
  needs_form: "Needs form",
};

export function getReturnReadinessState(input: {
  status?: string | null;
  readyForSubmissionAt?: Date | string | null;
  isFormComplete?: boolean | null;
  missingFieldCount?: number | null;
  /** Whether this return type records a manager sign-off. */
  requiresManagerSignoff?: boolean;
  hasManagerSignoff?: boolean | null;
}): ReturnReadinessState {
  if (input.status === "completed") return "signed_off";
  const managerSignoffMissing =
    Boolean(input.requiresManagerSignoff) && !input.hasManagerSignoff;
  if (input.readyForSubmissionAt && !managerSignoffMissing) return "signed_off";
  if (input.isFormComplete) {
    return managerSignoffMissing ? "awaiting_manager_signoff" : "awaiting_signoff";
  }
  if ((input.missingFieldCount ?? 0) > 0) return "missing_fields";
  return "needs_form";
}

// ============================================================================
// Return status as shown in LTS
// ============================================================================

/**
 * Status values shown in the LTS returns list. A pending return that is
 * signed off is waiting for the filing automation, so it is shown (and
 * filtered) as "awaiting_automation" rather than "pending".
 */
export const RETURN_DISPLAY_STATUSES = [
  "awaiting_automation",
  "pending",
  "in_progress",
  "review_required",
  "completed",
  "failed",
  "dismissed",
] as const;

export type ReturnDisplayStatus = (typeof RETURN_DISPLAY_STATUSES)[number];

export function getReturnDisplayStatus(input: {
  status: string;
  readiness: ReturnReadinessState;
}): string {
  if (input.status === "pending" && input.readiness === "signed_off") {
    return "awaiting_automation";
  }
  return input.status;
}

// ============================================================================
// Client signoff permission (authorised signatories)
// ============================================================================

export type FilingApprovalCapacity = "admin" | "authorised_signatory";

/**
 * Who may record the client signoff (mark a return ready for filing) in the
 * client portal: an active org admin, or an active member an admin has
 * explicitly marked as an authorised signatory.
 */
export function getFilingApprovalCapacity(
  membership:
    | {
        role?: string | null;
        status?: string | null;
        canApproveFilings?: boolean | null;
      }
    | null
    | undefined,
): FilingApprovalCapacity | null {
  if (!membership || membership.status !== "active") return null;
  if (membership.role === "admin") return "admin";
  if (membership.canApproveFilings) return "authorised_signatory";
  return null;
}

export const FILING_APPROVER_REQUIRED_MESSAGE =
  "Only an org admin or a team member marked as an authorised signatory can approve returns for filing. Ask an org admin to mark you as an authorised signatory on the Team page.";

/** Records who gave the client signoff, and in what capacity, on the return. */
export function withSubmissionSignoffMetadata(
  metadata: unknown,
  signoff: { at: Date; accountId: string; capacity: FilingApprovalCapacity },
): Record<string, unknown> {
  return {
    ...(isRecord(metadata) ? metadata : {}),
    [SUBMISSION_SIGNOFF_METADATA_KEY]: {
      at: signoff.at.toISOString(),
      accountId: signoff.accountId,
      capacity: signoff.capacity,
    },
  };
}

function normalizeComparableValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return "";
  return JSON.stringify(value);
}

/** Field names in `patch` whose value differs from `existing`. */
export function getChangedFormFields(
  existing: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown>,
): string[] {
  return Object.keys(patch).filter(
    (key) =>
      normalizeComparableValue(existing?.[key]) !==
      normalizeComparableValue(patch[key]),
  );
}

/**
 * Filing data changed after the client signed off, so the signoff no longer
 * covers what will be filed. Returns the tax return patch that clears the
 * signoff and records why, or null when there is no signoff to revoke.
 */
export function buildSubmissionSignoffRevocation(input: {
  taxReturn: {
    status?: string | null;
    metadata?: unknown;
    readyForSubmissionAt?: Date | string | null;
    readyForSubmissionBy?: string | null;
  };
  changedFields: string[];
  actor: { source: "portal" | "web" | "ai_extraction"; accountId?: string | null };
  now?: Date;
}) {
  if (
    !input.taxReturn.readyForSubmissionAt ||
    input.taxReturn.status === "completed" ||
    input.changedFields.length === 0
  ) {
    return null;
  }

  const now = input.now ?? new Date();
  const previousSignoffAt = input.taxReturn.readyForSubmissionAt;
  const {
    [SUBMISSION_SIGNOFF_METADATA_KEY]: previousSignoff,
    ...metadata
  } = isRecord(input.taxReturn.metadata) ? input.taxReturn.metadata : {};

  return {
    readyForSubmissionAt: null,
    readyForSubmissionBy: null,
    updatedAt: now,
    metadata: {
      ...metadata,
      [SIGNOFF_REVOCATION_METADATA_KEY]: {
        at: now.toISOString(),
        source: input.actor.source,
        accountId: input.actor.accountId ?? null,
        changedFields: input.changedFields.slice(0, 50),
        previousSignoffAt:
          previousSignoffAt instanceof Date
            ? previousSignoffAt.toISOString()
            : previousSignoffAt,
        previousSignoffBy: input.taxReturn.readyForSubmissionBy ?? null,
        previousSignoffCapacity:
          isRecord(previousSignoff) && typeof previousSignoff.capacity === "string"
            ? previousSignoff.capacity
            : null,
      },
    },
  };
}

// ============================================================================
// Financial statement currency
// ============================================================================

const CURRENCY_ALIASES: Array<[RegExp, string]> = [
  [/^(gbp|£|stg|sterling|pounds?(\s+sterling)?|british pounds?)$/i, "GBP"],
  [/^(usd|us\$|us dollars?|united states dollars?)$/i, "USD"],
  [/^(eur|€|euros?)$/i, "EUR"],
  [/^(chf|swiss francs?)$/i, "CHF"],
];

/**
 * Normalise a currency label to an ISO code where recognised. Unrecognised
 * labels are kept (not dropped) so they are still treated as non-GBP.
 */
export function normalizeCurrencyCode(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  for (const [pattern, code] of CURRENCY_ALIASES) {
    if (pattern.test(trimmed)) return code;
  }

  return /^[a-z]{3}$/i.test(trimmed) ? trimmed.toUpperCase() : trimmed.slice(0, 32);
}

export type FinancialFiguresMetadata = {
  /** Presentation currency of the financial statements. */
  currency: string | null;
  /** True when GBP figures were explicitly stated in the source documents. */
  gbpStated: boolean;
  sourceTotalProfit: string | null;
  sourceNetBookValue: string | null;
  extractedAt: string | null;
  /** Set when a person saved the profit / net book value figures. */
  gbpConfirmedAt: string | null;
};

export function parseFinancialFiguresMetadata(
  metadata: unknown,
): FinancialFiguresMetadata | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[FINANCIAL_FIGURES_METADATA_KEY];
  if (!isRecord(value)) return null;

  const str = (key: string) =>
    typeof value[key] === "string" ? (value[key] as string) : null;

  return {
    currency: normalizeCurrencyCode(str("currency")),
    gbpStated: value.gbpStated === true,
    sourceTotalProfit: str("sourceTotalProfit"),
    sourceNetBookValue: str("sourceNetBookValue"),
    extractedAt: str("extractedAt"),
    gbpConfirmedAt: str("gbpConfirmedAt"),
  };
}

export function withFinancialFiguresMetadata(
  metadata: unknown,
  figures: FinancialFiguresMetadata,
): Record<string, unknown> {
  return {
    ...(isRecord(metadata) ? metadata : {}),
    [FINANCIAL_FIGURES_METADATA_KEY]: figures,
  };
}

/**
 * Records that a person entered the profit / net book value figures, which
 * clears a pending GBP conversion. Returns null when there is nothing to record.
 */
export function confirmFinancialFiguresMetadata(
  metadata: unknown,
  changedFields: string[],
  now = new Date(),
): Record<string, unknown> | null {
  if (
    !changedFields.includes("totalProfit") &&
    !changedFields.includes("netBookValue")
  ) {
    return null;
  }

  const existing = parseFinancialFiguresMetadata(metadata);
  if (!existing) return null;

  return withFinancialFiguresMetadata(metadata, {
    ...existing,
    gbpConfirmedAt: now.toISOString(),
  });
}

export function isPendingGbpConversion(metadata: unknown) {
  const figures = parseFinancialFiguresMetadata(metadata);
  return Boolean(
    figures &&
      figures.currency &&
      figures.currency !== GUERNSEY_FILING_CURRENCY &&
      !figures.gbpStated &&
      !figures.gbpConfirmedAt,
  );
}

export function getPendingGbpConversionMessage(metadata: unknown) {
  if (!isPendingGbpConversion(metadata)) return null;
  const figures = parseFinancialFiguresMetadata(metadata);
  return `The financial statements are presented in ${figures?.currency}. Enter the profit before tax and net book value in GBP before this return is signed off or filed.`;
}

function toComparableNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number.parseFloat(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sameAmount(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  const a = toComparableNumber(left);
  const b = toComparableNumber(right);
  return a !== null && b !== null && a === b;
}

/**
 * Decide which profit / net book value figures AI extraction may write.
 *
 * The Guernsey ESR is filed in GBP. Figures from accounts presented in another
 * currency are never written as if they were GBP: only GBP amounts explicitly
 * stated in the documents are used, and stale foreign-currency values from an
 * earlier extraction are cleared so a person must enter the GBP figures.
 *
 * For each figure: `undefined` = leave the saved value, `null` = clear it.
 */
export function resolveExtractedFinancialFigures(input: {
  currency?: string | null;
  totalProfit?: string | null;
  netBookValue?: string | null;
  totalProfitGbp?: string | null;
  netBookValueGbp?: string | null;
  existing: { totalProfit?: string | null; netBookValue?: string | null };
  previousMetadata?: unknown;
  now?: Date;
}) {
  const currency = normalizeCurrencyCode(input.currency);
  const previous = parseFinancialFiguresMetadata(input.previousMetadata);
  const isForeign = Boolean(currency && currency !== GUERNSEY_FILING_CURRENCY);
  const gbpStated = Boolean(input.totalProfitGbp || input.netBookValueGbp);

  const resolveFigure = (
    sourceValue: string | null | undefined,
    gbpValue: string | null | undefined,
    existingValue: string | null | undefined,
    previousSourceValue: string | null | undefined,
  ): string | null | undefined => {
    if (gbpValue) return gbpValue;
    if (!isForeign) return sourceValue ?? undefined;

    const existingIsForeignCopy =
      sameAmount(existingValue, sourceValue) ||
      sameAmount(existingValue, previousSourceValue);
    return existingIsForeignCopy ? null : undefined;
  };

  const metadata: FinancialFiguresMetadata = {
    currency,
    gbpStated,
    sourceTotalProfit: input.totalProfit ?? null,
    sourceNetBookValue: input.netBookValue ?? null,
    extractedAt: (input.now ?? new Date()).toISOString(),
    gbpConfirmedAt: null,
  };

  return {
    totalProfit: resolveFigure(
      input.totalProfit,
      input.totalProfitGbp,
      input.existing.totalProfit,
      previous?.sourceTotalProfit,
    ),
    netBookValue: resolveFigure(
      input.netBookValue,
      input.netBookValueGbp,
      input.existing.netBookValue,
      previous?.sourceNetBookValue,
    ),
    metadata,
    warning:
      isForeign && !gbpStated
        ? `The financial statements are presented in ${currency}. Profit before tax and net book value were not filled because the Guernsey ESR must be filed in GBP. Enter the GBP figures manually.`
        : null,
  };
}
