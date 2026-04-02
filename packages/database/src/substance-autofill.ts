import type { SubstanceForm } from "./schema";

export const SUBSTANCE_AUTOFILL_FIELD_LABELS = {
  entityType: "Entity Type",
  companyNumber: "Company Number",
  registeredAddress: "Registered Address",
  principalPlaceOfBusiness: "Principal Place of Business",
  isIncorporatedInGuernsey: "Incorporated in Guernsey",
  economicClassificationCode: "Company Activity Code",
  entityActivity: "Entity Activity",
  areFinancialStatementsConsolidated: "Financial Statements Consolidated",
  accountsPreparerName: "Accounts Preparer Name",
  accountsPreparerQualification: "Accounts Preparer Qualification",
  profitAllocation: "Profit Allocation",
  isGuernseyFiFatca: "FATCA Status",
  isGuernseyFiCrs: "CRS Status",
  isRegisteredOnIgor: "IGOR Registration",
  relevantActivity: "Relevant Activity",
  hasMultipleRelevantActivities: "Multiple Relevant Activities",
  hasIntellectualPropertyHolding: "Intellectual Property Holding",
  isHighRiskIpEntity: "High Risk IP Entity",
  wantsToRebutHighRiskStatus: "Rebut High Risk Status",
  ipIncomeType: "IP Income Type",
  cigaPerformed: "CIGA Performed",
  cigaDetails: "CIGA Details",
  hasAdequatePhysicalPresence: "Adequate Physical Presence",
  hasCigaOutsourcing: "CIGA Outsourcing",
  outsourcingDetails: "Outsourcing Details",
} as const;

export type SubstanceAutofillFieldKey =
  keyof typeof SUBSTANCE_AUTOFILL_FIELD_LABELS;

export const SUBSTANCE_AUTOFILL_FIELDS: SubstanceAutofillFieldKey[] = [
  "entityType",
  "companyNumber",
  "registeredAddress",
  "principalPlaceOfBusiness",
  "isIncorporatedInGuernsey",
  "economicClassificationCode",
  "entityActivity",
  "areFinancialStatementsConsolidated",
  "accountsPreparerName",
  "accountsPreparerQualification",
  "profitAllocation",
  "isGuernseyFiFatca",
  "isGuernseyFiCrs",
  "isRegisteredOnIgor",
  "relevantActivity",
  "hasMultipleRelevantActivities",
  "hasIntellectualPropertyHolding",
  "isHighRiskIpEntity",
  "wantsToRebutHighRiskStatus",
  "ipIncomeType",
  "cigaPerformed",
  "cigaDetails",
  "hasAdequatePhysicalPresence",
  "hasCigaOutsourcing",
  "outsourcingDetails",
];

export type SubstanceAutofillValues = Partial<
  Pick<SubstanceForm, SubstanceAutofillFieldKey>
>;

export type SubstanceAutofillPreviewField = {
  key: SubstanceAutofillFieldKey;
  label: string;
  value: string;
};

type SubstanceAutofillSourceInput =
  | Partial<SubstanceForm>
  | SubstanceAutofillValues
  | null
  | undefined;

type SubstanceAutofillMergeSource = {
  taxYear: number;
  values: SubstanceAutofillSourceInput;
};

export function normalizeSubstanceAutofillEntityName(
  value: string | null | undefined,
): string {
  return (value ?? "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function buildSubstanceAutofillGroupKey(input: {
  orgId: string;
  jurisdictionId: string;
  entityName: string | null | undefined;
}): string {
  return `${input.orgId}::${input.jurisdictionId}::${normalizeSubstanceAutofillEntityName(input.entityName)}`;
}

function normalizePreviewValue(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return null;
}

export function pickSubstanceAutofillValues(
  source: Partial<SubstanceForm> | null | undefined,
): SubstanceAutofillValues {
  const picked: SubstanceAutofillValues = {};

  if (!source) {
    return picked;
  }

  for (const field of SUBSTANCE_AUTOFILL_FIELDS) {
    const value = source[field];
    if (normalizePreviewValue(value) === null) {
      continue;
    }
    picked[field] = value as SubstanceAutofillValues[typeof field];
  }

  return picked;
}

export function getSubstanceAutofillPreviewFields(
  source: Partial<SubstanceForm> | null | undefined,
): SubstanceAutofillPreviewField[] {
  const preview: SubstanceAutofillPreviewField[] = [];

  if (!source) {
    return preview;
  }

  for (const field of SUBSTANCE_AUTOFILL_FIELDS) {
    const value = normalizePreviewValue(source[field]);
    if (value === null) {
      continue;
    }

    preview.push({
      key: field,
      label: SUBSTANCE_AUTOFILL_FIELD_LABELS[field],
      value,
    });
  }

  return preview;
}

export function mergeSubstanceAutofillValues(
  sources: SubstanceAutofillMergeSource[],
): SubstanceAutofillValues {
  const merged: SubstanceAutofillValues = {};
  const sortedSources = [...sources].sort((a, b) => b.taxYear - a.taxYear);

  for (const source of sortedSources) {
    const picked = pickSubstanceAutofillValues(source.values);

    for (const field of SUBSTANCE_AUTOFILL_FIELDS) {
      if (field in merged) {
        continue;
      }

      const value = picked[field];
      if (normalizePreviewValue(value) === null) {
        continue;
      }

      merged[field] = value;
    }
  }

  return merged;
}

export function getMergedSubstanceAutofillPreviewFields(
  sources: SubstanceAutofillMergeSource[],
): SubstanceAutofillPreviewField[] {
  return getSubstanceAutofillPreviewFields(mergeSubstanceAutofillValues(sources));
}

export function getLatestSubstanceAutofillTaxYear(
  sources: SubstanceAutofillMergeSource[],
): number | null {
  for (const source of [...sources].sort((a, b) => b.taxYear - a.taxYear)) {
    if (Object.keys(pickSubstanceAutofillValues(source.values)).length > 0) {
      return source.taxYear;
    }
  }

  return null;
}
