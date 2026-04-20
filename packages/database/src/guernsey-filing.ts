export const GUERNSEY_CERTIFICATE_TYPES = [
  "Certificate 2",
  "Certificate 3",
] as const;

export type GuernseyCertificateType =
  (typeof GUERNSEY_CERTIFICATE_TYPES)[number];

export type GuernseyCertificateTypeSource =
  | "manual_override"
  | "saved_form"
  | "synced_metadata"
  | "document_detection";

export type GuernseyCertificateTypeMetadata = {
  certificateTypeHint?: GuernseyCertificateType | null;
  certificateTypeSource?: GuernseyCertificateTypeSource | null;
  certificateTypeConfidence?: number | null;
  certificateTypeOverridden?: boolean;
};

export type GuernseyCertificateTypeResolution =
  | {
      certificateType: GuernseyCertificateType;
      source: GuernseyCertificateTypeSource;
      confidence: number;
      overridden: boolean;
      unresolved: false;
    }
  | {
      certificateType: null;
      source: null;
      confidence: null;
      overridden: boolean;
      unresolved: true;
    };

export type GuernseySubstanceScopeInput = {
  certificateType?: string | null;
  relevantActivity?: string | null;
};

export type GuernseyDocumentValidationIssue = {
  code:
    | "entity_name_mismatch"
    | "tax_year_mismatch"
    | "accounting_period_mismatch";
  severity: "warning" | "error";
  message: string;
};

export const GUERNSEY_GUIDED_FINISH_DEPRECATED_FIELDS = [
  "hasRegisteredWithGrs",
  "taxReferenceNumber",
  "beneficialMemberCategories",
  "hasPostBalanceSheetEvent",
  "postBalanceSheetEventDetails",
  "preparedBy",
  "preparedDate",
] as const;

export const GUERNSEY_CONSTITUENT_ENTITY_LABEL =
  "Is the entity a constituent entity";

export const GUERNSEY_CERTIFICATE_TYPE_AUTO_CONFIDENCE_THRESHOLD = 0.85;

export const GUERNSEY_CERTIFICATE_TWO_DEFAULTS = {
  accountingPeriodStart: "01-01",
  accountingPeriodEnd: "12-31",
  entityActivity: "Dormant",
  relevantActivity: "None of the above",
  hasMultipleRelevantActivities: "No",
  hasIntellectualPropertyHolding: "No",
  isGuernseyFiFatca: "No",
  isGuernseyFiCrs: "No",
  isRegisteredOnIgor: "No",
  isConstituentEntity: "No",
} as const;

const CERTIFICATE_2_PATTERNS = [
  /\bcertificate(?:\s+|-)?2\b/i,
  /\bcert(?:ificate)?\s*2\b/i,
  /\bcertificate two\b/i,
];

const CERTIFICATE_3_PATTERNS = [
  /\bcertificate(?:\s+|-)?3\b/i,
  /\bcert(?:ificate)?\s*3\b/i,
  /\bcertificate three\b/i,
];

const YEAR_PATTERN = /\b20\d{2}\b/g;
const DATE_RANGE_PATTERN =
  /(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})\s*(?:to|-)\s*(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/gi;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function isGuernseyCertificateType(
  value: unknown,
): value is GuernseyCertificateType {
  return (
    typeof value === "string" &&
    GUERNSEY_CERTIFICATE_TYPES.includes(value as GuernseyCertificateType)
  );
}

export function parseGuernseyCertificateTypeMetadata(
  metadata: unknown,
): GuernseyCertificateTypeMetadata {
  if (!isRecord(metadata)) {
    return {};
  }

  const source = metadata.certificateTypeSource;

  return {
    certificateTypeHint: isGuernseyCertificateType(metadata.certificateTypeHint)
      ? metadata.certificateTypeHint
      : null,
    certificateTypeSource:
      source === "manual_override" ||
      source === "saved_form" ||
      source === "synced_metadata" ||
      source === "document_detection"
        ? source
        : null,
    certificateTypeConfidence:
      typeof metadata.certificateTypeConfidence === "number"
        ? metadata.certificateTypeConfidence
        : null,
    certificateTypeOverridden: metadata.certificateTypeOverridden === true,
  };
}

export function resolveGuernseyCertificateType(input: {
  metadata?: unknown;
  savedCertificateType?: string | null;
}): GuernseyCertificateTypeResolution {
  const parsedMetadata = parseGuernseyCertificateTypeMetadata(input.metadata);

  if (
    parsedMetadata.certificateTypeOverridden &&
    parsedMetadata.certificateTypeHint
  ) {
    return {
      certificateType: parsedMetadata.certificateTypeHint,
      source: "manual_override",
      confidence: parsedMetadata.certificateTypeConfidence ?? 1,
      overridden: true,
      unresolved: false,
    };
  }

  if (isGuernseyCertificateType(input.savedCertificateType)) {
    return {
      certificateType: input.savedCertificateType,
      source: "saved_form",
      confidence: 1,
      overridden: false,
      unresolved: false,
    };
  }

  if (
    parsedMetadata.certificateTypeHint &&
    (parsedMetadata.certificateTypeConfidence ?? 0) >=
      GUERNSEY_CERTIFICATE_TYPE_AUTO_CONFIDENCE_THRESHOLD
  ) {
    return {
      certificateType: parsedMetadata.certificateTypeHint,
      source: parsedMetadata.certificateTypeSource ?? "document_detection",
      confidence: parsedMetadata.certificateTypeConfidence ?? 1,
      overridden: false,
      unresolved: false,
    };
  }

  return {
    certificateType: null,
    source: null,
    confidence: null,
    overridden: parsedMetadata.certificateTypeOverridden === true,
    unresolved: true,
  };
}

export function setGuernseyCertificateTypeMetadata(
  metadata: unknown,
  input: {
    certificateType: GuernseyCertificateType | null;
    source: GuernseyCertificateTypeSource | null;
    confidence: number | null;
    overridden?: boolean;
  },
) {
  const nextMetadata = isRecord(metadata) ? { ...metadata } : {};

  if (input.certificateType) {
    nextMetadata.certificateTypeHint = input.certificateType;
  } else {
    delete nextMetadata.certificateTypeHint;
  }

  if (input.source) {
    nextMetadata.certificateTypeSource = input.source;
  } else {
    delete nextMetadata.certificateTypeSource;
  }

  if (typeof input.confidence === "number") {
    nextMetadata.certificateTypeConfidence = input.confidence;
  } else {
    delete nextMetadata.certificateTypeConfidence;
  }

  if (typeof input.overridden === "boolean") {
    nextMetadata.certificateTypeOverridden = input.overridden;
  } else if (input.source === "manual_override") {
    nextMetadata.certificateTypeOverridden = true;
  } else if (input.source) {
    nextMetadata.certificateTypeOverridden = false;
  }

  return nextMetadata;
}

export function isGuernseySubstanceInScope(
  form: GuernseySubstanceScopeInput | null | undefined,
) {
  if (!form || form.certificateType !== "Certificate 3") {
    return false;
  }

  const relevantActivity = form.relevantActivity?.trim();
  if (!relevantActivity) {
    return false;
  }

  return relevantActivity !== "None of the above";
}

export function buildGuernseyCertificateTwoDefaults(taxYear: number) {
  return {
    certificateType: "Certificate 2" as const,
    accountingPeriodStart: `${taxYear}-${GUERNSEY_CERTIFICATE_TWO_DEFAULTS.accountingPeriodStart}`,
    accountingPeriodEnd: `${taxYear}-${GUERNSEY_CERTIFICATE_TWO_DEFAULTS.accountingPeriodEnd}`,
    entityActivity: GUERNSEY_CERTIFICATE_TWO_DEFAULTS.entityActivity,
    relevantActivity: GUERNSEY_CERTIFICATE_TWO_DEFAULTS.relevantActivity,
    hasMultipleRelevantActivities:
      GUERNSEY_CERTIFICATE_TWO_DEFAULTS.hasMultipleRelevantActivities,
    hasIntellectualPropertyHolding:
      GUERNSEY_CERTIFICATE_TWO_DEFAULTS.hasIntellectualPropertyHolding,
    isGuernseyFiFatca: GUERNSEY_CERTIFICATE_TWO_DEFAULTS.isGuernseyFiFatca,
    isGuernseyFiCrs: GUERNSEY_CERTIFICATE_TWO_DEFAULTS.isGuernseyFiCrs,
    isRegisteredOnIgor: GUERNSEY_CERTIFICATE_TWO_DEFAULTS.isRegisteredOnIgor,
    isConstituentEntity: GUERNSEY_CERTIFICATE_TWO_DEFAULTS.isConstituentEntity,
  };
}

function normalizeEntityName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(limited|ltd|company|co|inc|corp|holdings?)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeNormalizedValue(value: string) {
  return value
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function stripDocumentNoise(value: string) {
  return value
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\b(guernsey|submitted|tax|return|esr|economic|substance|accounts|financial|statements|statement|draft|portal|pdf|xlsx|xls|csv)\b/gi, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\b20\d{2}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenOverlapRatio(left: string, right: string) {
  const leftTokens = new Set(tokenizeNormalizedValue(normalizeEntityName(left)));
  const rightTokens = new Set(
    tokenizeNormalizedValue(normalizeEntityName(stripDocumentNoise(right))),
  );

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftTokens.size, rightTokens.size);
}

function normalizeDmyDate(value: string) {
  const match = value.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) {
    return null;
  }

  const day = match[1]!.padStart(2, "0");
  const month = match[2]!.padStart(2, "0");
  const yearRaw = match[3]!;
  const year = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw;

  return `${year}-${month}-${day}`;
}

function extractYearSignals(inputs: string[]) {
  const years = new Set<number>();

  for (const input of inputs) {
    for (const match of input.matchAll(YEAR_PATTERN)) {
      const year = Number.parseInt(match[0], 10);
      if (Number.isFinite(year)) {
        years.add(year);
      }
    }
  }

  return [...years].sort((left, right) => left - right);
}

function extractAccountingPeriods(texts: string[]) {
  const periods: Array<{ start: string; end: string }> = [];

  for (const text of texts) {
    for (const match of text.matchAll(DATE_RANGE_PATTERN)) {
      const start = normalizeDmyDate(match[1] ?? "");
      const end = normalizeDmyDate(match[2] ?? "");

      if (start && end) {
        periods.push({ start, end });
      }
    }
  }

  return periods;
}

export function detectGuernseyCertificateTypeFromDocuments(input: {
  fileNames?: string[];
  texts?: string[];
}): GuernseyCertificateTypeResolution {
  const sources = [...(input.fileNames ?? []), ...(input.texts ?? [])];
  const combined = sources.join("\n");

  const cert2 = CERTIFICATE_2_PATTERNS.some((pattern) => pattern.test(combined));
  const cert3 = CERTIFICATE_3_PATTERNS.some((pattern) => pattern.test(combined));

  if (cert2 && !cert3) {
    return {
      certificateType: "Certificate 2",
      source: "document_detection",
      confidence: 0.95,
      overridden: false,
      unresolved: false,
    };
  }

  if (cert3 && !cert2) {
    return {
      certificateType: "Certificate 3",
      source: "document_detection",
      confidence: 0.95,
      overridden: false,
      unresolved: false,
    };
  }

  return {
    certificateType: null,
    source: null,
    confidence: null,
    overridden: false,
    unresolved: true,
  };
}

export function validateGuernseySourceDocuments(input: {
  entityName: string;
  taxYear: number;
  accountingPeriodStart?: string | null;
  accountingPeriodEnd?: string | null;
  fileNames?: string[];
  texts?: string[];
}): GuernseyDocumentValidationIssue[] {
  const issues: GuernseyDocumentValidationIssue[] = [];
  const fileNames = input.fileNames ?? [];
  const texts = input.texts ?? [];

  const suspiciousFileName = fileNames.find(
    (fileName) => tokenOverlapRatio(input.entityName, fileName) > 0 &&
      tokenOverlapRatio(input.entityName, fileName) < 0.5,
  );

  if (suspiciousFileName) {
    issues.push({
      code: "entity_name_mismatch",
      severity: "warning",
      message: `One of the uploaded documents looks like it belongs to a different entity: "${suspiciousFileName}".`,
    });
  }

  const years = extractYearSignals(fileNames);
  if (
    years.length > 0 &&
    !years.includes(input.taxYear) &&
    years.every((year) => year !== input.taxYear)
  ) {
    issues.push({
      code: "tax_year_mismatch",
      severity: "error",
      message: `The uploaded documents look like they refer to tax year ${years.join(", ")}, but this return is for ${input.taxYear}.`,
    });
  }

  if (input.accountingPeriodStart && input.accountingPeriodEnd) {
    const periods = extractAccountingPeriods(texts);
    const conflictingPeriod = periods.find(
      (period) =>
        period.start !== input.accountingPeriodStart ||
        period.end !== input.accountingPeriodEnd,
    );

    if (conflictingPeriod) {
      issues.push({
        code: "accounting_period_mismatch",
        severity: "warning",
        message: `The uploaded documents reference accounting period ${conflictingPeriod.start} to ${conflictingPeriod.end}, which does not match the current form period ${input.accountingPeriodStart} to ${input.accountingPeriodEnd}.`,
      });
    }
  }

  return issues;
}

const NON_MEANINGFUL_GUERNSEY_FORM_KEYS = new Set([
  "id",
  "taxReturnId",
  "entityName",
  "taxReferenceNumber",
  "certificateType",
  "missingFields",
  "isComplete",
  "aiExtractedAt",
  "lastEditedAt",
  "lastEditedBy",
  "createdAt",
  "updatedAt",
]);

export function hasMeaningfulGuernseyFormData(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).some(([key, entry]) => {
    if (NON_MEANINGFUL_GUERNSEY_FORM_KEYS.has(key)) {
      return false;
    }

    if (entry === null || entry === undefined) {
      return false;
    }

    if (typeof entry === "string") {
      return entry.trim().length > 0;
    }

    if (Array.isArray(entry)) {
      return entry.length > 0;
    }

    return true;
  });
}
