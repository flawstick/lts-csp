import { env } from "@/env";
import { TRPCError } from "@trpc/server";
import type { User } from "@supabase/supabase-js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import * as XLSX from "xlsx";

import {
  accounts,
  createEmptyJerseyCompanyReturnFormData,
  getJerseyCompanyReturnMissingFields,
  isDemoModeClientVisible,
  isJerseyCompanyReturnComplete,
  jerseyCompanyReturnForms,
  jurisdictions,
  orgSettings,
  organisations,
  parseOrgDemoModeSettings,
  portalMemberships,
  substanceForms,
  tasks,
  taxReturns,
  taxReturnFileCategories,
  taxReturnFileRoles,
} from "@repo/database";
import {
  buildSubstanceAutofillGroupKey,
  getLatestSubstanceAutofillTaxYear,
  getMergedSubstanceAutofillPreviewFields,
  mergeSubstanceAutofillValues,
  normalizeSubstanceAutofillEntityName,
  pickSubstanceAutofillValues,
  type SubstanceAutofillPreviewField,
  type SubstanceAutofillValues,
} from "@repo/database/substance-autofill";
import {
  buildGuernseyCertificateTwoDefaults,
  detectGuernseyCertificateTypeFromDocuments,
  hasMeaningfulGuernseyFormData,
  type GuernseyCertificateType,
  type GuernseyCertificateTypeResolution,
  resolveGuernseyCertificateType,
  setGuernseyCertificateTypeMetadata,
  validateGuernseySourceDocuments,
} from "@repo/database/guernsey-filing";
import {
  CIGA_BY_ACTIVITY,
  getMissingFields,
  relevantActivityEnum,
  substanceFormSchema,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import {
  jerseyCompanyReturnFormSchema,
  sanitizeJerseyCompanyReturnData,
} from "@/lib/schemas/jersey-company-return";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { TRPCContext } from "@/server/api/trpc";

const portalFileSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().min(1),
  category: z.enum(taxReturnFileCategories).optional(),
  role: z.enum(taxReturnFileRoles).optional(),
});

const DEFAULT_CERTIFICATE_TYPE = "Certificate 3";

const RELEVANT_ACTIVITY_OPTIONS = relevantActivityEnum.options;
type RelevantActivityOption = (typeof RELEVANT_ACTIVITY_OPTIONS)[number];
type ExtractionContextSource =
  | {
      entityActivity?: string | null;
      relevantActivity?: string | null;
      economicClassificationCode?: string | null;
      cigaPerformed?: string | null;
      cigaDetails?: string | null;
      activityGrossIncome?: string | null;
      adequacyExpenditureDetails?: string | null;
    }
  | null
  | undefined;
type ValidationIssue = ReturnType<typeof validateGuernseySourceDocuments>[number];

const ECONOMIC_CLASSIFICATION_CODE_PATTERN = /\b\d{1,3}(?:\.\d{1,3})+\b/;
const ECONOMIC_CLASSIFICATION_CODE_CONTEXT_PATTERN =
  /\b\d{1,3}(?:\.\d{1,3}){2,}\b/;
const FIRECRAWL_PDF_MAX_PAGES = 50;
const FIRECRAWL_PDF_MAX_CHARS = 120_000;

function truncateFirecrawlMarkdown(markdown: string) {
  if (markdown.length <= FIRECRAWL_PDF_MAX_CHARS) {
    return markdown;
  }

  return `${markdown.slice(0, FIRECRAWL_PDF_MAX_CHARS)}\n\n[Truncated after ${FIRECRAWL_PDF_MAX_CHARS.toLocaleString()} characters]`;
}

async function scrapePdfMarkdownWithFirecrawl(url: string) {
  const apiKey = env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    return null;
  }

  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        parsers: [
          {
            type: "pdf",
            mode: "auto",
            maxPages: FIRECRAWL_PDF_MAX_PAGES,
          },
        ],
        timeout: 30_000,
        maxAge: 0,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as
      | {
          success?: boolean;
          data?: {
            markdown?: string | null;
          };
          markdown?: string | null;
        }
      | undefined;

    const markdown = payload?.data?.markdown ?? payload?.markdown ?? null;
    if (!markdown || markdown.trim().length === 0) {
      return null;
    }

    return truncateFirecrawlMarkdown(markdown);
  } catch {
    return null;
  }
}

function normalizeTaxReferenceNumber(input: {
  taxReferenceNumber?: string | null;
  externalId?: string | null;
  taxYear?: number | string | null;
}) {
  const { taxReferenceNumber, externalId, taxYear } = input;
  const normalizedExternalId = externalId?.trim().toUpperCase() ?? "";
  const yearSuffix = taxYear ? `-${String(taxYear).trim()}` : "";

  if (normalizedExternalId) {
    if (yearSuffix && normalizedExternalId.endsWith(yearSuffix)) {
      return normalizedExternalId.slice(0, -yearSuffix.length);
    }

    return normalizedExternalId.replace(/-\d{4}$/, "");
  }

  const normalizedTaxReference = taxReferenceNumber
    ?.trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9/-]/g, "");

  return normalizedTaxReference ?? undefined;
}

const RELEVANT_ACTIVITY_CONTEXT_RULES: Array<{
  activity: RelevantActivityOption;
  patterns: RegExp[];
}> = [
  {
    activity: "Self-managed fund",
    patterns: [
      /\bself[- ]managed fund\b/i,
      /\bself managed collective investment\b/i,
    ],
  },
  {
    activity: "Fund management",
    patterns: [
      /\bfund management\b/i,
      /\binvestment management\b/i,
      /\bportfolio management\b/i,
    ],
  },
  {
    activity: "Intellectual Property Holding Company",
    patterns: [
      /\bintellectual property\b/i,
      /\broyalt(?:y|ies)\b/i,
      /\blicen[cs](?:e|ing)\b/i,
      /\bpatent\b/i,
      /\btrademark\b/i,
    ],
  },
  {
    activity: "Pure Equity Holding Company",
    patterns: [
      /\bpure equity\b/i,
      /\bequity holding\b/i,
      /\bshareholding\b/i,
      /\bdividend income\b/i,
      /\bshares in subsidiaries\b/i,
    ],
  },
  {
    activity: "Banking",
    patterns: [
      /\bbanking\b/i,
      /\bdeposit(?: |-)?taking\b/i,
      /\bcredit institution\b/i,
      /\bloan book\b/i,
    ],
  },
  {
    activity: "Insurance",
    patterns: [/\binsurance\b/i, /\breinsurance\b/i, /\bund(er)?writing\b/i],
  },
  {
    activity: "Financing and leasing",
    patterns: [
      /\bfinancing\b/i,
      /\bleasing\b/i,
      /\blease agreements?\b/i,
      /\blending\b/i,
      /\bcredit facilities?\b/i,
    ],
  },
  {
    activity: "Distribution and Service Centre",
    patterns: [
      /\bdistribution and service centre\b/i,
      /\bservice centre\b/i,
      /\bdistribution centre\b/i,
      /\bprocurement services\b/i,
      /\badministrative services to group\b/i,
    ],
  },
  {
    activity: "Headquarters",
    patterns: [
      /\bheadquarters\b/i,
      /\bhead office\b/i,
      /\bgroup headquarters\b/i,
    ],
  },
  {
    activity: "Shipping",
    patterns: [/\bshipping\b/i, /\bmaritime\b/i, /\bvessel\b/i, /\bcharter\b/i],
  },
];

function normalizeEconomicClassificationCode(value?: string | null) {
  if (!value) return undefined;
  const match = ECONOMIC_CLASSIFICATION_CODE_PATTERN.exec(value);
  return match?.[0];
}

function findEconomicClassificationCodeFromContext(
  ...contexts: Array<string | null | undefined>
) {
  const combined = contexts
    .filter(
      (context): context is string => !!context && context.trim().length > 0,
    )
    .join("\n");

  if (!combined) {
    return undefined;
  }

  const labeledMatch =
    /(?:economic classification code|company activity code|activity code|classification code|economic code)[^0-9]{0,50}(\d{1,3}(?:\.\d{1,3})+\b)/i.exec(
      combined,
    );

  if (labeledMatch?.[1]) {
    return labeledMatch[1];
  }

  return ECONOMIC_CLASSIFICATION_CODE_CONTEXT_PATTERN.exec(combined)?.[0];
}

function inferRelevantActivityFromContext(
  ...contexts: Array<string | null | undefined>
): RelevantActivityOption | undefined {
  const snippets = contexts.filter(
    (context): context is string =>
      typeof context === "string" && context.trim().length > 0,
  );

  for (const snippet of snippets) {
    const exact = RELEVANT_ACTIVITY_OPTIONS.find(
      (option) => snippet.trim().toLowerCase() === option.toLowerCase(),
    );
    if (exact) {
      return exact;
    }
  }

  const combined = snippets.join("\n");
  if (!combined) {
    return undefined;
  }

  for (const rule of RELEVANT_ACTIVITY_CONTEXT_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(combined))) {
      return rule.activity;
    }
  }

  return undefined;
}

function buildExistingExtractionContext(form: ExtractionContextSource) {
  if (!form) {
    return "";
  }

  const lines = [
    form.entityActivity
      ? `- Existing entityActivity: ${form.entityActivity}`
      : null,
    form.relevantActivity
      ? `- Existing relevantActivity: ${form.relevantActivity}`
      : null,
    form.economicClassificationCode
      ? `- Existing economicClassificationCode: ${form.economicClassificationCode}`
      : null,
    form.cigaPerformed
      ? `- Existing cigaPerformed: ${form.cigaPerformed}`
      : null,
    form.cigaDetails ? `- Existing cigaDetails: ${form.cigaDetails}` : null,
    form.activityGrossIncome
      ? `- Existing activityGrossIncome: ${form.activityGrossIncome}`
      : null,
    form.adequacyExpenditureDetails
      ? `- Existing activityOperatingExpenditure: ${form.adequacyExpenditureDetails}`
      : null,
  ].filter(Boolean);

  if (!lines.length) {
    return "";
  }

  return `Use this saved form context as prior context when the new files are ambiguous or incomplete:\n${lines.join("\n")}`;
}

function getTaxReturnMetadata(
  metadata: unknown,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }

  return metadata as Record<string, unknown>;
}

export function getGuernseyCertificateResolution(input: {
  taxReturn: {
    metadata?: Record<string, unknown> | null;
  };
  form?: {
    certificateType?: string | null;
  } | null;
}) {
  return resolveGuernseyCertificateType({
    metadata: input.taxReturn.metadata ?? undefined,
    savedCertificateType: input.form?.certificateType ?? null,
  });
}

async function persistGuernseyCertificateResolution(params: {
  db: TRPCContext["db"];
  taxReturnId: string;
  metadata: Record<string, unknown> | undefined;
  resolution: GuernseyCertificateTypeResolution;
}) {
  if (params.resolution.unresolved) {
    return;
  }

  const nextMetadata = setGuernseyCertificateTypeMetadata(params.metadata, {
    certificateType: params.resolution.certificateType,
    source: params.resolution.source,
    confidence: params.resolution.confidence,
    overridden: params.resolution.overridden,
  });

  await params.db
    .update(taxReturns)
    .set({
      metadata: nextMetadata,
      updatedAt: new Date(),
    })
    .where(eq(taxReturns.id, params.taxReturnId));
}

function formatValidationIssues(issues: ValidationIssue[]) {
  return issues.map((issue) => issue.message).join(" ");
}

function sanitizeConstituentEntityAnswer(input: {
  existingValue?: "Yes" | "No" | null;
  nextValue?: "Yes" | "No" | null;
  textContexts: string[];
}) {
  if (input.nextValue !== "Yes") {
    return input.nextValue ?? input.existingValue ?? undefined;
  }

  const combinedText = input.textContexts.join("\n").toLowerCase();
  const explicitYes =
    /constituent entity[^.\n]{0,120}\byes\b/.test(combinedText) ||
    /\byes\b[^.\n]{0,120}constituent entity/.test(combinedText);
  const explicitNo =
    /constituent entity[^.\n]{0,120}\bno\b/.test(combinedText) ||
    /\bno\b[^.\n]{0,120}constituent entity/.test(combinedText);

  if (explicitNo && !explicitYes) {
    return "No";
  }

  if (!explicitYes && input.existingValue === "No") {
    return "No";
  }

  return explicitYes ? "Yes" : input.existingValue ?? undefined;
}

export async function findPreviousSubstanceAutofillSource(
  db: TRPCContext["db"],
  taxReturn: {
    id: string;
    orgId: string;
    jurisdictionId: string;
    entityName: string;
    taxYear: number;
  },
) {
  const candidates = await db.query.taxReturns.findMany({
    where: (table, { and, eq, lt }) =>
      and(
        eq(table.orgId, taxReturn.orgId),
        eq(table.jurisdictionId, taxReturn.jurisdictionId),
        eq(table.returnType, "economic_substance"),
        lt(table.taxYear, taxReturn.taxYear),
      ),
    orderBy: (table, { desc }) => [desc(table.taxYear), desc(table.updatedAt)],
    with: {
      substanceForm: true,
    },
  });

  const normalizedEntityName = normalizeSubstanceAutofillEntityName(
    taxReturn.entityName,
  );

  const matchingSources: Array<{
    taxYear: number;
    values: typeof candidates[number]["substanceForm"];
  }> = [];

  for (const candidate of candidates) {
    if (candidate.id === taxReturn.id) {
      continue;
    }

    if (
      normalizeSubstanceAutofillEntityName(candidate.entityName) !==
      normalizedEntityName
    ) {
      continue;
    }

    if (!candidate.substanceForm) {
      continue;
    }

    if (
      Object.keys(pickSubstanceAutofillValues(candidate.substanceForm)).length ===
      0
    ) {
      continue;
    }

    matchingSources.push({
      taxYear: candidate.taxYear,
      values: candidate.substanceForm,
    });
  }

  const merged = mergeSubstanceAutofillValues(matchingSources);
  return Object.keys(merged).length > 0 ? merged : null;
}

export function buildInitializedSubstanceFormValues(input: {
  taxReturnId: string;
  taxYear: number;
  entityName: string;
  externalId?: string | null;
  lastEditedBy?: string | null;
  sourceForm?: Partial<SubstanceAutofillValues> | null;
  certificateResolution: GuernseyCertificateTypeResolution;
}) {
  const shouldAutofillFromPreviousReturn =
    !input.certificateResolution.unresolved &&
    input.certificateResolution.certificateType === DEFAULT_CERTIFICATE_TYPE;
  const rawAutofillValues = shouldAutofillFromPreviousReturn
    ? pickSubstanceAutofillValues(input.sourceForm ?? null)
    : {};
  const autofillValues = Object.fromEntries(
    Object.entries(rawAutofillValues).filter(([, value]) => value != null),
  ) as Partial<SubstanceFormData>;
  const certificateType = input.certificateResolution.unresolved
    ? undefined
    : input.certificateResolution.certificateType;
  const certificateTwoDefaults =
    certificateType === "Certificate 2"
      ? (buildGuernseyCertificateTwoDefaults(
          input.taxYear,
        ) as Partial<SubstanceFormData>)
      : ({} as Partial<SubstanceFormData>);
  const values = {
    ...autofillValues,
    ...certificateTwoDefaults,
    taxReturnId: input.taxReturnId,
    entityName: input.entityName,
    taxReferenceNumber: normalizeTaxReferenceNumber({
      externalId: input.externalId,
      taxYear: input.taxYear,
    }),
    certificateType,
    profitAllocation:
      certificateType === DEFAULT_CERTIFICATE_TYPE
        ? (autofillValues.profitAllocation ?? "Investment")
        : undefined,
    isGuernseyFiFatca:
      certificateType === DEFAULT_CERTIFICATE_TYPE
        ? (autofillValues.isGuernseyFiFatca ?? "No")
        : certificateTwoDefaults.isGuernseyFiFatca,
    isGuernseyFiCrs:
      certificateType === DEFAULT_CERTIFICATE_TYPE
        ? (autofillValues.isGuernseyFiCrs ?? "No")
        : certificateTwoDefaults.isGuernseyFiCrs,
    isRegisteredOnIgor:
      certificateType === DEFAULT_CERTIFICATE_TYPE
        ? (autofillValues.isRegisteredOnIgor ?? "No")
        : certificateTwoDefaults.isRegisteredOnIgor,
    isConstituentEntity:
      certificateType === DEFAULT_CERTIFICATE_TYPE
        ? ("No" as const)
        : certificateTwoDefaults.isConstituentEntity,
    lastEditedBy: input.lastEditedBy ?? undefined,
  };

  return {
    ...values,
    missingFields: getMissingFields(values),
  };
}

async function setManualGuernseyCertificateType(params: {
  db: TRPCContext["db"];
  accountId: string;
  taxReturn: {
    id: string;
    orgId: string;
    jurisdictionId: string;
    entityName: string;
    taxYear: number;
    externalId?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  existingForm:
    | (typeof substanceForms.$inferSelect)
    | null
    | undefined;
  certificateType: GuernseyCertificateType;
  overwriteExisting: boolean;
}) {
  const metadata = setGuernseyCertificateTypeMetadata(
    getTaxReturnMetadata(params.taxReturn.metadata),
    {
      certificateType: params.certificateType,
      source: "manual_override",
      confidence: 1,
      overridden: true,
    },
  );

  await params.db
    .update(taxReturns)
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(taxReturns.id, params.taxReturn.id));

  const certificateResolution = resolveGuernseyCertificateType({
    metadata,
    savedCertificateType: params.existingForm?.certificateType ?? null,
  });
  const previousForm = await findPreviousSubstanceAutofillSource(
    params.db,
    params.taxReturn,
  );
  const nextValues = buildInitializedSubstanceFormValues({
    taxReturnId: params.taxReturn.id,
    taxYear: params.taxReturn.taxYear,
    entityName: params.taxReturn.entityName,
    externalId: params.taxReturn.externalId,
    lastEditedBy: params.accountId,
    sourceForm: previousForm,
    certificateResolution,
  });

  if (!params.existingForm) {
    const [created] = await params.db
      .insert(substanceForms)
      .values(nextValues)
      .returning();

    return created ?? null;
  }

  const isChangingType =
    params.existingForm.certificateType !== params.certificateType;
  if (
    isChangingType &&
    !params.overwriteExisting &&
    hasMeaningfulGuernseyFormData(params.existingForm)
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Changing the certificate type will replace the existing Guernsey form answers. Confirm again to overwrite the current form.",
    });
  }

  const currentFormValues = substanceFormSchema
    .partial()
    .parse(params.existingForm);
  const mergedValues = {
    ...currentFormValues,
    ...nextValues,
  };

  const [updated] = await params.db
    .update(substanceForms)
    .set({
      ...mergedValues,
      lastEditedAt: new Date(),
      lastEditedBy: params.accountId,
    })
    .where(eq(substanceForms.taxReturnId, params.taxReturn.id))
    .returning();

  return updated ?? null;
}

const aiExtractionSchema = z.object({
  entityName: z.string().nullable(),
  entityType: z.enum(["Company", "Partnership"]).nullable(),
  accountingPeriodStart: z.string().nullable(),
  accountingPeriodEnd: z.string().nullable(),
  isCollectiveInvestmentVehicle: z.enum(["Yes", "No"]).nullable(),
  companyNumber: z.string().nullable(),
  registeredAddress: z.string().nullable(),
  principalPlaceOfBusiness: z.string().nullable(),
  isIncorporatedInGuernsey: z.enum(["Yes", "No"]).nullable(),
  economicClassificationCode: z
    .string()
    .nullable()
    .describe(
      'REQUIRED for 2025 returns — Company Activity Code dropdown. It usually looks like a dotted numeric code such as "10.5.4". Return only the dotted code.',
    ),
  entityActivity: z
    .string()
    .nullable()
    .describe(
      "Nature of the entity's business activity (e.g., 'Property Holdings') — extract from Directors Report",
    ),
  partnershipName: z.string().nullable(),
  partnershipNumber: z.string().nullable(),
  areFinancialStatementsConsolidated: z.enum(["Yes", "No"]).nullable(),
  accountsPreparerName: z
    .string()
    .nullable()
    .describe(
      "Name of the ACCOUNTANT/AUDITOR who prepared the financial accounts, NOT the ESR form preparer",
    ),
  accountsPreparerQualification: z
    .string()
    .nullable()
    .describe(
      "Qualification of the accounts preparer/auditor (ACCA, ICAEW, etc.)",
    ),
  netBookValue: z
    .string()
    .nullable()
    .describe("Net book value from Balance Sheet — if negative, return '0'"),
  totalProfit: z
    .string()
    .nullable()
    .describe("Total profit from P&L — if negative (a loss), return '0'"),
  profitAllocation: z
    .enum(["Investment", "Business"])
    .nullable()
    .describe("Profit before tax allocation — REQUIRED, always pick one"),
  isGuernseyFiFatca: z.enum(["Yes", "No"]).nullable(),
  isGuernseyFiCrs: z.enum(["Yes", "No"]).nullable(),
  isRegisteredOnIgor: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Is registered on IGOR — must be Yes if FATCA is Yes"),
  relevantActivity: z
    .enum([
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
    ])
    .nullable()
    .describe(
      "Primary relevant activity from the dropdown options. Use existing form context and the entity activity/business description if the documents are ambiguous.",
    ),
  hasMultipleRelevantActivities: z.enum(["Yes", "No"]).nullable(),
  hasIntellectualPropertyHolding: z.enum(["Yes", "No"]).nullable(),
  isHighRiskIpEntity: z.enum(["Yes", "No"]).nullable(),
  wantsToRebutHighRiskStatus: z.enum(["Yes", "No"]).nullable(),
  highRiskRebuttalNarrative: z.string().nullable(),
  ipIncomeType: z.string().nullable(),
  activityGrossIncome: z
    .string()
    .nullable()
    .describe(
      "Turnover or gross income generated from the relevant activity. Return the numeric amount only when clearly stated.",
    ),
  hasAdequatePhysicalPresence: z.enum(["Yes", "No", "N/A"]).nullable(),
  adequacyExpenditureDetails: z
    .string()
    .nullable()
    .describe(
      "Operating expenditure relating to the relevant activity. Return the numeric amount only when clearly stated.",
    ),
  adequacyPhysicalPresenceDetails: z.string().nullable(),
  cigaPerformed: z.string().nullable(),
  cigaDetails: z.string().nullable(),
  employees: z
    .array(
      z.object({
        name: z.string().nullable(),
        qualifiedForReporting: z.boolean().nullable(),
        unitsOnCompany: z.number().nullable(),
        totalUnits: z.number().nullable(),
        fteFraction: z.number().nullable(),
        qualifiedFteFraction: z.number().nullable(),
      }),
    )
    .nullable(),
  totalFte: z.number().nullable(),
  totalQualifiedFte: z.number().nullable(),
  hasCigaOutsourcing: z.enum(["Yes", "No", "N/A"]).nullable(),
  outsourcingDetails: z.string().nullable(),
  immediateParents: z
    .array(
      z.object({
        name: z.string().nullable(),
        countryOfTaxResidence: z.string().nullable(),
        tin: z.string().nullable(),
        tinCountry: z.string().nullable(),
        registeredAddress: z.string().nullable(),
      }),
    )
    .nullable(),
  ultimateParents: z
    .array(
      z.object({
        name: z.string().nullable(),
        countryOfTaxResidence: z.string().nullable(),
        tin: z.string().nullable(),
        tinCountry: z.string().nullable(),
        registeredAddress: z.string().nullable(),
      }),
    )
    .nullable(),
  ultimateBeneficialOwners: z
    .array(
      z.object({
        name: z.string().nullable(),
        dateOfBirth: z.string().nullable(),
        placeOfBirth: z.string().nullable(),
        nationality: z.string().nullable(),
        countryOfTaxResidence: z.string().nullable(),
        tin: z.string().nullable(),
        tinCountry: z.string().nullable(),
        address: z.string().nullable(),
      }),
    )
    .nullable(),
  allBoardMeetingsInGuernsey: z.enum(["Yes", "No"]).nullable(),
  totalBoardMeetings: z.number().nullable(),
  boardMeetingsInGuernsey: z.number().nullable(),
  adequateMeetingFrequency: z.enum(["Yes", "No", "N/A"]).nullable(),
  enoughDirectorsPresent: z.enum(["Yes", "No", "N/A"]).nullable(),
  directorsHaveExpertise: z.enum(["Yes", "No", "N/A"]).nullable(),
  strategicDecisionsMadeInGuernsey: z.enum(["Yes", "No", "N/A"]).nullable(),
  recordsMaintainedInGuernsey: z.enum(["Yes", "No", "N/A"]).nullable(),
  boardMeetingLocation: z.string().nullable(),
  directors: z
    .array(
      z.object({
        name: z.string().nullable(),
        initials: z.string().nullable(),
      }),
    )
    .nullable(),
  boardMeetings: z
    .array(
      z.object({
        date: z.string().nullable(),
        attendees: z.string().nullable(),
        allPresentInGuernsey: z.boolean().nullable(),
        agendaPoints: z.string().nullable(),
      }),
    )
    .nullable(),
  managerSignOff: z.string().nullable(),
  managerSignOffDate: z.string().nullable(),
  isConstituentEntity: z.enum(["Yes", "No"]).nullable(),
  hasC42Association: z.enum(["Yes", "No"]).nullable(),
  c42AssociatedCompanies: z.string().nullable(),
  contractInformation: z.string().nullable(),
});

function stripNullishStructuredValue(value: unknown): unknown {
  if (value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    const normalizedItems: unknown[] = [];

    for (const item of value) {
      const normalizedItem = stripNullishStructuredValue(item);
      if (normalizedItem !== undefined) {
        normalizedItems.push(normalizedItem);
      }
    }

    return normalizedItems;
  }

  if (typeof value === "object" && value !== null) {
    const normalizedEntries: Array<[string, unknown]> = [];

    for (const [key, entry] of Object.entries(value)) {
      const normalizedEntry = stripNullishStructuredValue(entry);
      if (normalizedEntry !== undefined) {
        normalizedEntries.push([key, normalizedEntry]);
      }
    }

    return Object.fromEntries(normalizedEntries);
  }

  return value;
}

type RecentReturnMeta = {
  id: string;
  orgId: string;
  at: string;
};

function parseRecentReturnMetadata(user: User, orgId: string): string[] {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = metadata.portal_recent_returns;

  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: RecentReturnMeta[] = raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.orgId !== "string") {
        return null;
      }

      return {
        id: row.id,
        orgId: row.orgId,
        at: typeof row.at === "string" ? row.at : "",
      };
    })
    .filter((item): item is RecentReturnMeta => item !== null)
    .filter((item) => item.orgId === orgId);

  parsed.sort((a, b) => {
    const aTime = Number.isFinite(Date.parse(a.at)) ? Date.parse(a.at) : 0;
    const bTime = Number.isFinite(Date.parse(b.at)) ? Date.parse(b.at) : 0;
    return bTime - aTime;
  });

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const item of parsed) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    ordered.push(item.id);
  }

  return ordered;
}

async function ensurePortalAccount(ctx: { db: TRPCContext["db"]; user: User }) {
  let account = await ctx.db.query.accounts.findFirst({
    where: eq(accounts.userId, ctx.user.id),
  });

  if (!account) {
    const metadata = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
    const avatarUrl =
      typeof metadata.avatar_url === "string"
        ? metadata.avatar_url
        : typeof metadata.picture === "string"
          ? metadata.picture
          : null;

    const [created] = await ctx.db
      .insert(accounts)
      .values({
        userId: ctx.user.id,
        fullName,
        avatarUrl,
        accountType: "portal",
      })
      .returning();
    account = created ?? undefined;
  }

  if (!account) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load account",
    });
  }

  return account;
}

async function assertActiveMembership(ctx: {
  db: TRPCContext["db"];
  accountId: string;
  orgId: string;
}) {
  const membership = await ctx.db.query.portalMemberships.findFirst({
    where: and(
      eq(portalMemberships.accountId, ctx.accountId),
      eq(portalMemberships.orgId, ctx.orgId),
      eq(portalMemberships.status, "active"),
    ),
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have active access to this organization.",
    });
  }

  return membership;
}

type PortalDemoModeMap = Map<
  string,
  ReturnType<typeof parseOrgDemoModeSettings>
>;

async function getPortalDemoModeMap(
  db: TRPCContext["db"],
  orgIds: string[],
): Promise<PortalDemoModeMap> {
  if (orgIds.length === 0) {
    return new Map();
  }

  const rows = await db.query.orgSettings.findMany({
    where: inArray(orgSettings.orgId, orgIds),
    columns: {
      orgId: true,
      settings: true,
    },
  });

  return new Map(
    rows.map((row) => [row.orgId, parseOrgDemoModeSettings(row.settings)]),
  );
}

function isPortalDemoVisible(
  demoModeMap: PortalDemoModeMap,
  orgId: string,
  entityName: string | null | undefined,
) {
  const demoMode = demoModeMap.get(orgId);
  if (!demoMode) {
    return true;
  }

  return isDemoModeClientVisible(demoMode, entityName);
}

function filterPortalDemoRows<T extends { orgId: string; entityName: string }>(
  rows: T[],
  demoModeMap: PortalDemoModeMap,
) {
  return rows.filter((row) =>
    isPortalDemoVisible(demoModeMap, row.orgId, row.entityName),
  );
}

async function getPortalReturnForOrg(ctx: {
  db: TRPCContext["db"];
  orgId: string;
  taxReturnId: string;
}) {
  const returnRecord = await ctx.db.query.taxReturns.findFirst({
    where: and(
      eq(taxReturns.id, ctx.taxReturnId),
      eq(taxReturns.orgId, ctx.orgId),
    ),
    with: {
      jurisdiction: true,
    },
  });

  if (!returnRecord) {
    return null;
  }

  const demoModeMap = await getPortalDemoModeMap(ctx.db, [ctx.orgId]);
  if (!isPortalDemoVisible(demoModeMap, ctx.orgId, returnRecord.entityName)) {
    return null;
  }

  return returnRecord;
}

export function assertGuernseyPortalReturnUnlocked(
  returnRecord:
    | {
        status: string;
        returnType: string | null;
        jurisdiction?: { code: string } | null;
      }
    | null
    | undefined,
) {
  if (
    returnRecord?.jurisdiction?.code === "GG" &&
    returnRecord.returnType === "economic_substance" &&
    returnRecord.status === "completed"
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "This Guernsey ESR is locked because the return is already completed in the Guernsey Tax Portal.",
    });
  }
}

export async function extractSubstanceFormFromFilesInternal(input: {
  db: TRPCContext["db"];
  orgId: string;
  taxReturnId: string;
  fileUrls: string[];
  returnRecord: {
    id: string;
    orgId: string;
    jurisdictionId: string;
    entityName: string;
    taxYear: number;
    externalId?: string | null;
    status: string;
    returnType: string | null;
    files?: Array<{ url?: string; name?: string }> | null;
    metadata?: Record<string, unknown> | null;
    jurisdiction?: { code: string } | null;
  };
  actorAccountId?: string | null;
}) {
  assertGuernseyPortalReturnUnlocked(input.returnRecord);

  const apiKey = env.AI_GATEWAY_API_KEY;
  if (!apiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "AI gateway key is not configured.",
    });
  }

  let form = await input.db.query.substanceForms.findFirst({
    where: eq(substanceForms.taxReturnId, input.taxReturnId),
  });

  type FileContent = { type: "file"; data: string; mediaType: string };
  type TextContent = { type: "text"; text: string };

  const fileContents: FileContent[] = [];
  const textContents: TextContent[] = [];
  const taxReturnFiles = Array.isArray(input.returnRecord.files)
    ? input.returnRecord.files
    : [];
  const sourceFileNames = input.fileUrls.map((url) => {
    const matchedFile = taxReturnFiles.find((file) => file?.url === url);
    if (matchedFile && typeof matchedFile.name === "string") {
      return matchedFile.name;
    }

    try {
      return new URL(url).pathname.split("/").pop() ?? url;
    } catch {
      return url;
    }
  });

  const supportedFileTypes = [
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/gif",
  ];
  const excelTypes = [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
  ];

  for (const url of input.fileUrls) {
    const response = await fetch(url);
    if (!response.ok) {
      continue;
    }

    const mediaType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const normalizedMedia = mediaType.toLowerCase();
    const isCsv =
      normalizedMedia.includes("text/csv") ||
      url.toLowerCase().endsWith(".csv");
    const isExcel =
      excelTypes.some((type) => normalizedMedia.includes(type)) ||
      normalizedMedia.includes("spreadsheet") ||
      normalizedMedia.includes("excel");

    if (isCsv) {
      const csvText = await response.text();
      if (csvText.trim().length > 0) {
        textContents.push({
          type: "text",
          text: `[CSV File Content]\n${csvText}`,
        });
      }
      continue;
    }

    const buffer = await response.arrayBuffer();

    if (isExcel) {
      try {
        const workbook = XLSX.read(buffer, { type: "array" });
        const csvParts: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          if (!sheet) {
            continue;
          }
          const csv = XLSX.utils.sheet_to_csv(sheet);
          csvParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
        }

        const allCsv = csvParts.join("\n\n");
        if (allCsv.trim().length > 0) {
          textContents.push({
            type: "text",
            text: `[Excel File Content]\n${allCsv}`,
          });
        }
      } catch {
        // Ignore malformed spreadsheets and continue processing valid files.
      }
      continue;
    }

    if (
      supportedFileTypes.some(
        (type) =>
          normalizedMedia === type ||
          normalizedMedia.startsWith(type.split("/")[0]!),
      )
    ) {
      if (
        normalizedMedia.includes("application/pdf") ||
        url.toLowerCase().endsWith(".pdf")
      ) {
        const firecrawlMarkdown = await scrapePdfMarkdownWithFirecrawl(url);
        if (firecrawlMarkdown) {
          textContents.push({
            type: "text",
            text: `[Firecrawl PDF Parse]\n${firecrawlMarkdown}`,
          });
        }
      }

      fileContents.push({
        type: "file",
        data: Buffer.from(buffer).toString("base64"),
        mediaType,
      });
    }
  }

  if (fileContents.length === 0 && textContents.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "No supported files to extract from. Use PDF, image, CSV, or Excel.",
    });
  }

  const extractedTextContext = textContents.map((content) => content.text);
  const metadataResolution = getGuernseyCertificateResolution({
    taxReturn: input.returnRecord,
    form,
  });
  const documentResolution = detectGuernseyCertificateTypeFromDocuments({
    fileNames: sourceFileNames,
    texts: extractedTextContext,
  });
  const certificateResolution = metadataResolution.unresolved
    ? documentResolution
    : metadataResolution;

  const validationIssues = validateGuernseySourceDocuments({
    entityName: input.returnRecord.entityName,
    taxYear: input.returnRecord.taxYear,
    accountingPeriodStart: form?.accountingPeriodStart,
    accountingPeriodEnd: form?.accountingPeriodEnd,
    fileNames: sourceFileNames,
    texts: extractedTextContext,
  });
  const blockingValidationIssues = validationIssues.filter(
    (issue) => issue.severity === "error",
  );

  if (blockingValidationIssues.length > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: formatValidationIssues(blockingValidationIssues),
    });
  }

  if (certificateResolution.unresolved) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Certificate type could not be determined from the existing return metadata or the uploaded documents. Confirm whether this is Certificate 2 or Certificate 3 before initializing or extracting the form.",
    });
  }

  await persistGuernseyCertificateResolution({
    db: input.db,
    taxReturnId: input.returnRecord.id,
    metadata: getTaxReturnMetadata(input.returnRecord.metadata),
    resolution: certificateResolution,
  });

  if (!form) {
    const previousForm = await findPreviousSubstanceAutofillSource(
      input.db,
      input.returnRecord,
    );
    const [created] = await input.db
      .insert(substanceForms)
      .values(
        buildInitializedSubstanceFormValues({
          taxReturnId: input.taxReturnId,
          taxYear: input.returnRecord.taxYear,
          entityName: input.returnRecord.entityName,
          externalId: input.returnRecord.externalId,
          lastEditedBy: input.actorAccountId ?? undefined,
          sourceForm: previousForm,
          certificateResolution,
        }),
      )
      .returning();

    form = created ?? undefined;
  }

  if (!form) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to initialize the Guernsey substance form.",
    });
  }

  if (certificateResolution.certificateType === "Certificate 2") {
    const certificateTwoDefaults = buildGuernseyCertificateTwoDefaults(
      input.returnRecord.taxYear,
    );
    const merged = {
      ...form,
      ...certificateTwoDefaults,
      certificateType: "Certificate 2" as const,
      taxReferenceNumber: normalizeTaxReferenceNumber({
        externalId: input.returnRecord.externalId,
        taxYear: input.returnRecord.taxYear,
      }),
    } as Partial<SubstanceFormData>;
    const missingFields = getMissingFields(merged);

    const [updated] = await input.db
      .update(substanceForms)
      .set({
        ...certificateTwoDefaults,
        certificateType: "Certificate 2",
        taxReferenceNumber: normalizeTaxReferenceNumber({
          externalId: input.returnRecord.externalId,
          taxYear: input.returnRecord.taxYear,
        }),
        missingFields,
        isComplete: missingFields.length === 0,
        aiExtractedAt: new Date(),
        lastEditedAt: new Date(),
        lastEditedBy: input.actorAccountId ?? undefined,
      })
      .where(eq(substanceForms.taxReturnId, input.taxReturnId))
      .returning();

    return {
      form: updated ?? null,
      extractedFields: Object.keys(certificateTwoDefaults),
      warnings: validationIssues
        .filter((issue) => issue.severity === "warning")
        .map((issue) => issue.message),
    };
  }

  const gateway = createGateway({
    apiKey,
    baseURL: "https://ai-gateway.vercel.sh/v3/ai",
  });
  const model = gateway("openai/gpt-5.4");

  const cigaOptionsText = Object.entries(CIGA_BY_ACTIVITY)
    .map(
      ([activity, options]) => `${activity}:\n  - ${options.join("\n  - ")}`,
    )
    .join("\n\n");
  const existingContextText = buildExistingExtractionContext(form);

  const prompt = `You are extracting data for a Guernsey Economic Substance Register form for Certificate 3 filings.

Read all attached files and return values only when they are explicitly stated or clearly inferable.
If a value is unknown, leave it empty.
Some attached PDFs may also include a Firecrawl OCR/text parse. Use that parsed text as additional extraction support, but prioritize the source documents when they are clearer.

${existingContextText ? `=== EXISTING FORM CONTEXT ===\n${existingContextText}\n` : ""}

Use these strict output rules:
- Dates: YYYY-MM-DD
- Yes/No fields: "Yes" or "No"
- Yes/No/N/A fields: "Yes", "No", or "N/A"
- relevantActivity: pick exactly one allowed option from the enum.
- If total profit is negative (a loss), return "0". The portal does not accept negative values.
- If net book value is negative, return "0".
- profitAllocation is REQUIRED — always pick "Investment" or "Business".
- accountingPeriodStart and accountingPeriodEnd are the entity's actual accounting period dates, not the Guernsey tax year. Extract them only if the documents clearly state them. If they are not stated, leave them empty.
- economicClassificationCode is REQUIRED for 2025 returns. It usually looks like a dotted numeric code such as "10.5.4". Look specifically for dot-separated numeric codes near labels like "Economic Classification Code" or "Company Activity Code", and return only the dotted code.
- isConstituentEntity (CbCR) is REQUIRED for 2025 returns — default to "No" if not stated.
- accountsPreparerName is the ACCOUNTANT who prepared the financial accounts, NOT "LTS Tax Limited".
- entityActivity: always try to extract the nature of the entity's activity (e.g., "Property Holdings").
- relevantActivity is REQUIRED — pick the single most applicable option. Use the saved form context plus the entity activity/business description if the new documents are ambiguous. If the existing saved form already identifies the relevant activity and the new files do not clearly contradict it, keep that activity.
- allBoardMeetingsInGuernsey, totalBoardMeetings, boardMeetingsInGuernsey are helpful but not required. Extract them when the documents state them, otherwise leave them empty.
- activityGrossIncome should be the turnover or gross income from the relevant activity when the documents clearly state it. Leave it empty if it is not identifiable.
- adequacyExpenditureDetails should be the operating expenditure relating to the relevant activity when the documents clearly state it. Leave it empty if it is not identifiable.
- If the entity has no relevant activity ("None of the above"), leave adequacy, CIGA, employees, outsourcing, and beneficial ownership sections empty.

For CIGA, use these activity mappings:
${cigaOptionsText}
`;

  const messageContent: Array<TextContent | FileContent> = [
    { type: "text", text: prompt },
    ...fileContents,
    ...textContents,
  ];

  const MAX_RETRIES = 2;
  let result: Awaited<
    ReturnType<typeof generateObject<typeof aiExtractionSchema>>
  >;
  for (let attempt = 0; ; attempt++) {
    try {
      result = await generateObject({
        model,
        output: "object",
        schema: aiExtractionSchema,
        schemaName: "PortalGuernseySubstanceForm",
        schemaDescription:
          "Guernsey Economic Substance Register form extraction for portal clients",
        messages: [
          {
            role: "user",
            content: messageContent,
          },
        ],
      });
      break;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isTransient =
        message.includes("input stream") ||
        message.includes("ECONNRESET") ||
        message.includes("socket hang up");
      if (!isTransient || attempt >= MAX_RETRIES) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
    }
  }

  const extractedData = stripNullishStructuredValue(
    result.object,
  ) as Partial<SubstanceFormData>;

  extractedData.certificateType = certificateResolution.certificateType;
  extractedData.taxReferenceNumber = normalizeTaxReferenceNumber({
    externalId: input.returnRecord.externalId,
    taxYear: input.returnRecord.taxYear,
  });

  if (extractedData.totalProfit) {
    const num = parseFloat(extractedData.totalProfit.replace(/[^0-9.-]/g, ""));
    if (!isNaN(num) && num < 0) extractedData.totalProfit = "0";
  }
  if (extractedData.netBookValue) {
    const num = parseFloat(extractedData.netBookValue.replace(/[^0-9.-]/g, ""));
    if (!isNaN(num) && num < 0) extractedData.netBookValue = "0";
  }

  extractedData.profitAllocation ??= "Investment";
  extractedData.isGuernseyFiFatca ??= "No";
  extractedData.isGuernseyFiCrs ??= "No";

  if (!extractedData.isRegisteredOnIgor) {
    if (
      extractedData.isGuernseyFiFatca === "Yes" ||
      extractedData.isGuernseyFiCrs === "Yes"
    ) {
      extractedData.isRegisteredOnIgor = "Yes";
    } else {
      extractedData.isRegisteredOnIgor = "No";
    }
  }

  extractedData.isConstituentEntity = sanitizeConstituentEntityAnswer({
    existingValue:
      form.isConstituentEntity === "Yes" || form.isConstituentEntity === "No"
        ? form.isConstituentEntity
        : null,
    nextValue:
      extractedData.isConstituentEntity === "Yes" ||
      extractedData.isConstituentEntity === "No"
        ? extractedData.isConstituentEntity
        : null,
    textContexts: extractedTextContext,
  }) ?? "No";

  extractedData.economicClassificationCode =
    normalizeEconomicClassificationCode(
      extractedData.economicClassificationCode,
    ) ??
    findEconomicClassificationCodeFromContext(
      extractedData.entityActivity,
      form.entityActivity,
      ...extractedTextContext,
    ) ??
    normalizeEconomicClassificationCode(form.economicClassificationCode);

  const contextualRelevantActivity = inferRelevantActivityFromContext(
    extractedData.relevantActivity,
    form.relevantActivity,
    extractedData.entityActivity,
    form.entityActivity,
    extractedData.cigaPerformed,
    extractedData.cigaDetails,
    form.cigaPerformed,
    form.cigaDetails,
    ...extractedTextContext,
  );

  if (
    !extractedData.relevantActivity ||
    (extractedData.relevantActivity === "None of the above" &&
      contextualRelevantActivity &&
      contextualRelevantActivity !== "None of the above")
  ) {
    extractedData.relevantActivity = contextualRelevantActivity;
  }

  const merged = { ...form, ...extractedData } as SubstanceFormData;
  const missingFields = getMissingFields(merged);

  const [updated] = await input.db
    .update(substanceForms)
    .set({
      ...extractedData,
      missingFields,
      isComplete: missingFields.length === 0,
      aiExtractedAt: new Date(),
      lastEditedAt: new Date(),
      lastEditedBy: input.actorAccountId ?? undefined,
    })
    .where(eq(substanceForms.taxReturnId, input.taxReturnId))
    .returning();

  const extractedFields = Object.keys(extractedData).filter(
    (field) =>
      extractedData[field as keyof typeof extractedData] !== undefined,
  );

  return {
    form: updated ?? null,
    extractedFields,
    warnings: validationIssues
      .filter((issue) => issue.severity === "warning")
      .map((issue) => issue.message),
  };
}

export const portalReturnsRouter = createTRPCRouter({
  sidebarJurisdictions: protectedProcedure
    .input(
      z
        .object({
          orgId: z.string().uuid().optional(),
          focusReturnId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      const memberships = await ctx.db
        .select({
          orgId: portalMemberships.orgId,
          orgName: organisations.name,
          orgSlug: organisations.slug,
        })
        .from(portalMemberships)
        .innerJoin(organisations, eq(portalMemberships.orgId, organisations.id))
        .where(
          and(
            eq(portalMemberships.accountId, account.id),
            eq(portalMemberships.status, "active"),
          ),
        );

      if (!memberships.length) {
        return {
          orgId: null,
          orgName: null,
          orgSlug: null,
          jurisdictions: [],
        };
      }

      const selectedOrg =
        (input?.orgId
          ? memberships.find((row) => row.orgId === input.orgId)
          : undefined) ?? memberships[0]!;

      const rows = await ctx.db
        .select({
          id: taxReturns.id,
          orgId: taxReturns.orgId,
          entityName: taxReturns.entityName,
          taxYear: taxReturns.taxYear,
          status: taxReturns.status,
          updatedAt: taxReturns.updatedAt,
          createdAt: taxReturns.createdAt,
          jurisdictionId: jurisdictions.id,
          jurisdictionCode: jurisdictions.code,
          jurisdictionName: jurisdictions.name,
        })
        .from(taxReturns)
        .innerJoin(
          jurisdictions,
          eq(taxReturns.jurisdictionId, jurisdictions.id),
        )
        .where(eq(taxReturns.orgId, selectedOrg.orgId))
        .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt));

      const demoModeMap = await getPortalDemoModeMap(ctx.db, [selectedOrg.orgId]);
      const visibleRows = filterPortalDemoRows(rows, demoModeMap);

      const recentReturnIds = parseRecentReturnMetadata(
        ctx.user,
        selectedOrg.orgId,
      );

      const grouped = new Map<
        string,
        {
          jurisdictionId: string;
          code: string;
          name: string;
          rows: typeof rows;
        }
      >();

      for (const row of visibleRows) {
        const entry = grouped.get(row.jurisdictionId);
        if (entry) {
          entry.rows.push(row);
        } else {
          grouped.set(row.jurisdictionId, {
            jurisdictionId: row.jurisdictionId,
            code: row.jurisdictionCode,
            name: row.jurisdictionName,
            rows: [row],
          });
        }
      }

      const jurisdictionsList = Array.from(grouped.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((jurisdictionGroup) => {
          const focusRow = input?.focusReturnId
            ? jurisdictionGroup.rows.find(
                (row) => row.id === input.focusReturnId,
              )
            : undefined;

          const recentRows = recentReturnIds
            .map((id) => jurisdictionGroup.rows.find((row) => row.id === id))
            .filter((row): row is NonNullable<typeof row> => !!row);

          const selectedIds = new Set([
            ...recentRows.map((row) => row.id),
            ...(focusRow ? [focusRow.id] : []),
          ]);
          const latestRows = jurisdictionGroup.rows.filter(
            (row) => !selectedIds.has(row.id),
          );
          const pinned = [
            ...(focusRow ? [focusRow] : []),
            ...recentRows.filter((row) => row.id !== focusRow?.id),
            ...latestRows,
          ].slice(0, 3);

          return {
            jurisdictionId: jurisdictionGroup.jurisdictionId,
            code: jurisdictionGroup.code,
            name: jurisdictionGroup.name,
            hasFocusReturn: !!focusRow,
            returns: pinned.map((row) => ({
              id: row.id,
              entityName: row.entityName,
              taxYear: row.taxYear,
              status: row.status,
              updatedAt: row.updatedAt ?? row.createdAt,
            })),
            totalReturns: jurisdictionGroup.rows.length,
          };
        });

      return {
        orgId: selectedOrg.orgId,
        orgName: selectedOrg.orgName,
        orgSlug: selectedOrg.orgSlug,
        jurisdictions: jurisdictionsList,
      };
    }),

  listMyReturns: protectedProcedure.query(async ({ ctx }) => {
    const account = await ensurePortalAccount(ctx);
    const memberships = await ctx.db
      .select({
        orgId: portalMemberships.orgId,
      })
      .from(portalMemberships)
      .where(
        and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.status, "active"),
        ),
      );

    if (memberships.length === 0) {
      return [];
    }

    const orgIds = memberships.map((m) => m.orgId);
    const rows = await ctx.db
      .select({
        id: taxReturns.id,
        orgId: taxReturns.orgId,
        jurisdictionId: taxReturns.jurisdictionId,
        entityName: taxReturns.entityName,
        taxYear: taxReturns.taxYear,
        status: taxReturns.status,
        returnType: taxReturns.returnType,
        externalId: taxReturns.externalId,
        files: taxReturns.files,
        updatedAt: taxReturns.updatedAt,
        orgName: organisations.name,
        orgSlug: organisations.slug,
        jurisdictionCode: jurisdictions.code,
        jurisdictionName: jurisdictions.name,
      })
      .from(taxReturns)
      .innerJoin(organisations, eq(taxReturns.orgId, organisations.id))
      .innerJoin(jurisdictions, eq(taxReturns.jurisdictionId, jurisdictions.id))
      .where(inArray(taxReturns.orgId, orgIds))
      .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt));
    const demoModeMap = await getPortalDemoModeMap(ctx.db, orgIds);
    const visibleRows = filterPortalDemoRows(rows, demoModeMap);

    const autofillCandidates = await ctx.db.query.taxReturns.findMany({
      where: and(
        inArray(taxReturns.orgId, orgIds),
        eq(taxReturns.returnType, "economic_substance"),
      ),
      columns: {
        id: true,
        orgId: true,
        jurisdictionId: true,
        entityName: true,
        taxYear: true,
      },
      with: {
        substanceForm: {
          columns: {
            entityType: true,
            companyNumber: true,
            registeredAddress: true,
            principalPlaceOfBusiness: true,
            isIncorporatedInGuernsey: true,
            economicClassificationCode: true,
            entityActivity: true,
            areFinancialStatementsConsolidated: true,
            accountsPreparerName: true,
            accountsPreparerQualification: true,
            profitAllocation: true,
            isGuernseyFiFatca: true,
            isGuernseyFiCrs: true,
            isRegisteredOnIgor: true,
            relevantActivity: true,
            hasMultipleRelevantActivities: true,
            hasIntellectualPropertyHolding: true,
            isHighRiskIpEntity: true,
            wantsToRebutHighRiskStatus: true,
            ipIncomeType: true,
            cigaPerformed: true,
            cigaDetails: true,
            hasAdequatePhysicalPresence: true,
            hasCigaOutsourcing: true,
            outsourcingDetails: true,
          },
        },
      },
    });

    const groupedAutofillSources = new Map<
      string,
      Array<{
        returnId: string;
        taxYear: number;
        values: typeof autofillCandidates[number]["substanceForm"];
      }>
    >();

    for (const candidate of autofillCandidates) {
      if (!candidate.substanceForm) {
        continue;
      }

      if (
        Object.keys(pickSubstanceAutofillValues(candidate.substanceForm)).length ===
        0
      ) {
        continue;
      }

      const key = buildSubstanceAutofillGroupKey({
        orgId: candidate.orgId,
        jurisdictionId: candidate.jurisdictionId,
        entityName: candidate.entityName,
      });
      const existing = groupedAutofillSources.get(key) ?? [];
      existing.push({
        returnId: candidate.id,
        taxYear: candidate.taxYear,
        values: candidate.substanceForm,
      });
      groupedAutofillSources.set(key, existing);
    }

    for (const sources of groupedAutofillSources.values()) {
      sources.sort((a, b) => b.taxYear - a.taxYear);
    }

    return visibleRows.map((row) => {
      if (row.returnType !== "economic_substance") {
        return {
          ...row,
          autofillSourceReturnId: null,
          autofillSourceTaxYear: null,
          autofillFields: [] as SubstanceAutofillPreviewField[],
          autofillFieldCount: 0,
        };
      }

      const key = buildSubstanceAutofillGroupKey({
        orgId: row.orgId,
        jurisdictionId: row.jurisdictionId,
        entityName: row.entityName,
      });
      const priorSources =
        groupedAutofillSources
          .get(key)
          ?.filter((candidate) => candidate.taxYear < row.taxYear) ?? [];
      const previewFields = getMergedSubstanceAutofillPreviewFields(priorSources);

      return {
        ...row,
        autofillSourceReturnId: priorSources[0]?.returnId ?? null,
        autofillSourceTaxYear: getLatestSubstanceAutofillTaxYear(priorSources),
        autofillFields: previewFields,
        autofillFieldCount: previewFields.length,
      };
    });
  }),

  searchMyReturns: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1),
        limit: z.number().min(1).max(50).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      const memberships = await ctx.db
        .select({
          orgId: portalMemberships.orgId,
        })
        .from(portalMemberships)
        .where(
          and(
            eq(portalMemberships.accountId, account.id),
            eq(portalMemberships.status, "active"),
          ),
        );

      if (memberships.length === 0) {
        return [];
      }

      const orgIds = memberships.map((m) => m.orgId);
      const searchPattern = `%${input.query}%`;

      const rows = await ctx.db
        .select({
          id: taxReturns.id,
          orgId: taxReturns.orgId,
          entityName: taxReturns.entityName,
          taxYear: taxReturns.taxYear,
          status: taxReturns.status,
          externalId: taxReturns.externalId,
          updatedAt: taxReturns.updatedAt,
          orgName: organisations.name,
          jurisdictionCode: jurisdictions.code,
          jurisdictionName: jurisdictions.name,
        })
        .from(taxReturns)
        .innerJoin(organisations, eq(taxReturns.orgId, organisations.id))
        .innerJoin(
          jurisdictions,
          eq(taxReturns.jurisdictionId, jurisdictions.id),
        )
        .where(
          and(
            inArray(taxReturns.orgId, orgIds),
            sql`(
              ${taxReturns.entityName} ILIKE ${searchPattern}
              OR COALESCE(${taxReturns.externalId}, '') ILIKE ${searchPattern}
              OR ${organisations.name} ILIKE ${searchPattern}
              OR ${jurisdictions.code} ILIKE ${searchPattern}
              OR CAST(${taxReturns.taxYear} AS TEXT) ILIKE ${searchPattern}
            )`,
          ),
        )
        .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt))
        .limit(input.limit);
      const demoModeMap = await getPortalDemoModeMap(ctx.db, orgIds);

      return filterPortalDemoRows(rows, demoModeMap);
    }),

  listByOrg: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const rows = await ctx.db
        .select({
          id: taxReturns.id,
          orgId: taxReturns.orgId,
          entityName: taxReturns.entityName,
          taxYear: taxReturns.taxYear,
          status: taxReturns.status,
          returnType: taxReturns.returnType,
          externalId: taxReturns.externalId,
          link: taxReturns.link,
          pdfUrl: taxReturns.pdfUrl,
          files: taxReturns.files,
          metadata: taxReturns.metadata,
          updatedAt: taxReturns.updatedAt,
          jurisdictionCode: jurisdictions.code,
          jurisdictionName: jurisdictions.name,
          substanceId: substanceForms.id,
          substanceCertificateType: substanceForms.certificateType,
          jerseyFormId: jerseyCompanyReturnForms.id,
          isSubstanceComplete: sql<boolean | null>`
            CASE
              WHEN ${taxReturns.returnType} = 'economic_substance' THEN ${substanceForms.isComplete}
              ELSE ${jerseyCompanyReturnForms.isComplete}
            END
          `,
          missingSubstanceFields: sql<unknown>`
            CASE
              WHEN ${taxReturns.returnType} = 'economic_substance' THEN ${substanceForms.missingFields}
              ELSE ${jerseyCompanyReturnForms.missingFields}
            END
          `,
        })
        .from(taxReturns)
        .innerJoin(
          jurisdictions,
          eq(taxReturns.jurisdictionId, jurisdictions.id),
        )
        .leftJoin(substanceForms, eq(substanceForms.taxReturnId, taxReturns.id))
        .leftJoin(
          jerseyCompanyReturnForms,
          eq(jerseyCompanyReturnForms.taxReturnId, taxReturns.id),
        )
        .where(eq(taxReturns.orgId, input.orgId))
        .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt));
      const demoModeMap = await getPortalDemoModeMap(ctx.db, [input.orgId]);

      return filterPortalDemoRows(rows, demoModeMap);
    }),

  listByOrgSummary: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const rows = await ctx.db
        .select({
          id: taxReturns.id,
          orgId: taxReturns.orgId,
          entityName: taxReturns.entityName,
          taxYear: taxReturns.taxYear,
          status: taxReturns.status,
          jurisdictionCode: jurisdictions.code,
          jurisdictionName: jurisdictions.name,
          updatedAt: taxReturns.updatedAt,
          isSubstanceComplete: sql<boolean | null>`
            CASE
              WHEN ${taxReturns.returnType} = 'economic_substance' THEN ${substanceForms.isComplete}
              ELSE ${jerseyCompanyReturnForms.isComplete}
            END
          `,
          fileCount: sql<number>`coalesce(jsonb_array_length(${taxReturns.files}), 0)`,
        })
        .from(taxReturns)
        .innerJoin(
          jurisdictions,
          eq(taxReturns.jurisdictionId, jurisdictions.id),
        )
        .leftJoin(substanceForms, eq(substanceForms.taxReturnId, taxReturns.id))
        .leftJoin(
          jerseyCompanyReturnForms,
          eq(jerseyCompanyReturnForms.taxReturnId, taxReturns.id),
        )
        .where(eq(taxReturns.orgId, input.orgId))
        .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt));
      const demoModeMap = await getPortalDemoModeMap(ctx.db, [input.orgId]);

      return filterPortalDemoRows(rows, demoModeMap);
    }),

  getSubstanceForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      return form ?? null;
    }),

  createSubstanceForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (existing) {
        return existing;
      }
      const previousForm = await findPreviousSubstanceAutofillSource(
        ctx.db,
        returnRecord,
      );
      const certificateResolution = getGuernseyCertificateResolution({
        taxReturn: returnRecord,
        form: existing,
      });

      if (certificateResolution.unresolved) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Certificate type is unresolved for this Guernsey return. Confirm Certificate 2 or Certificate 3 before initializing the form.",
        });
      }

      const [created] = await ctx.db
        .insert(substanceForms)
        .values(
          buildInitializedSubstanceFormValues({
            taxReturnId: input.taxReturnId,
            taxYear: returnRecord.taxYear,
            entityName: returnRecord.entityName,
            externalId: returnRecord.externalId,
            lastEditedBy: account.id,
            sourceForm: previousForm,
            certificateResolution,
          }),
        )
        .returning();

      return created ?? null;
    }),

  setSubstanceFormCertificateType: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        certificateType: z.enum(["Certificate 2", "Certificate 3"]),
        overwriteExisting: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      return setManualGuernseyCertificateType({
        db: ctx.db,
        accountId: account.id,
        taxReturn: returnRecord,
        existingForm: existing,
        certificateType: input.certificateType,
        overwriteExisting: input.overwriteExisting,
      });
    }),

  updateSubstanceForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        data: substanceFormSchema.partial(),
        clearForm: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Substance form has not been initialized for this return.",
        });
      }

      const updateData = input.clearForm
        ? Object.fromEntries(
            Object.keys(substanceFormSchema.shape).map((key) => [key, null]),
          )
        : input.data;

      const merged = input.clearForm
        ? ({} as SubstanceFormData)
        : ({ ...existing, ...input.data } as SubstanceFormData);
      const missingFields = getMissingFields(merged);

      const [updated] = await ctx.db
        .update(substanceForms)
        .set({
          ...updateData,
          missingFields,
          isComplete: missingFields.length === 0,
          lastEditedAt: new Date(),
          lastEditedBy: account.id,
        })
        .where(eq(substanceForms.taxReturnId, input.taxReturnId))
        .returning();

      return updated ?? null;
    }),

  getJerseyCompanyReturnForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      if (
        returnRecord.jurisdiction?.code !== "JE" ||
        returnRecord.returnType !== "company"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Jersey company form is only available for Jersey company returns.",
        });
      }

      const form = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId),
      });

      return form ?? null;
    }),

  createJerseyCompanyReturnForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      if (
        returnRecord.jurisdiction?.code !== "JE" ||
        returnRecord.returnType !== "company"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Jersey company form is only available for Jersey company returns.",
        });
      }

      const existing = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId),
      });

      if (existing) {
        return existing;
      }

      const initialData = createEmptyJerseyCompanyReturnFormData();
      const missingFields = getJerseyCompanyReturnMissingFields(initialData);

      const [created] = await ctx.db
        .insert(jerseyCompanyReturnForms)
        .values({
          taxReturnId: input.taxReturnId,
          section1: initialData.section1,
          scheduleA: initialData.scheduleA,
          distributions: initialData.distributions,
          compliance: initialData.compliance,
          economicSubstance: initialData.economicSubstance,
          additionalInfo: initialData.additionalInfo,
          missingFields,
          isComplete: missingFields.length === 0,
          lastEditedBy: account.id,
        })
        .returning();

      return created ?? null;
    }),

  updateJerseyCompanyReturnForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        data: jerseyCompanyReturnFormSchema.partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      if (
        returnRecord.jurisdiction?.code !== "JE" ||
        returnRecord.returnType !== "company"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Jersey company form is only available for Jersey company returns.",
        });
      }

      const existing = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Jersey company return form has not been initialized for this return.",
        });
      }

      const merged = sanitizeJerseyCompanyReturnData({
        section1: {
          ...(existing.section1 ?? {}),
          ...(input.data.section1 ?? {}),
        },
        scheduleA: {
          ...(existing.scheduleA ?? {}),
          ...(input.data.scheduleA ?? {}),
        },
        distributions: {
          ...(existing.distributions ?? {}),
          ...(input.data.distributions ?? {}),
        },
        compliance: {
          ...(existing.compliance ?? {}),
          ...(input.data.compliance ?? {}),
        },
        economicSubstance: {
          ...(existing.economicSubstance ?? {}),
          ...(input.data.economicSubstance ?? {}),
          relevantActivities:
            input.data.economicSubstance?.relevantActivities ??
            existing.economicSubstance?.relevantActivities ??
            [],
        },
        additionalInfo: {
          ...(existing.additionalInfo ?? {}),
          ...(input.data.additionalInfo ?? {}),
        },
      });

      const missingFields = getJerseyCompanyReturnMissingFields(merged);

      const [updated] = await ctx.db
        .update(jerseyCompanyReturnForms)
        .set({
          section1: merged.section1,
          scheduleA: merged.scheduleA,
          distributions: merged.distributions,
          compliance: merged.compliance,
          economicSubstance: merged.economicSubstance,
          additionalInfo: merged.additionalInfo,
          missingFields,
          isComplete: isJerseyCompanyReturnComplete(merged),
          lastEditedAt: new Date(),
          lastEditedBy: account.id,
        })
        .where(eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId))
        .returning();

      return updated ?? null;
    }),

  addReturnDocuments: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        documents: z.array(portalFileSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.documents.some((doc) => doc.role === "filed_return_pdf")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Filed return PDFs are system-managed and cannot be uploaded manually.",
        });
      }

      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existingFiles = returnRecord.files ?? [];
      const uploadedAt = new Date().toISOString();
      const incomingFinancialStatements = input.documents.find(
        (doc) => doc.role === "financial_statements",
      );
      const baseFiles = incomingFinancialStatements
        ? existingFiles.map((file) =>
            file.role === "financial_statements"
              ? { ...file, role: undefined }
              : file,
          )
        : existingFiles;
      const mergedFiles = [
        ...baseFiles,
        ...input.documents.map((doc) => ({ ...doc, uploadedAt })),
      ];

      await ctx.db
        .update(taxReturns)
        .set({
          files: mergedFiles,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true, files: mergedFiles };
    }),

  assignReturnDocumentRole: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        fileUrl: z.string().url(),
        role: z.enum(taxReturnFileRoles).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.role === "filed_return_pdf") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Filed return PDFs are system-managed and cannot be assigned manually.",
        });
      }

      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existingFiles = returnRecord.files ?? [];
      const hasTargetFile = existingFiles.some(
        (file) => file.url === input.fileUrl,
      );

      if (!hasTargetFile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found on this return.",
        });
      }

      const updatedFiles = existingFiles.map((file) => {
        if (file.url === input.fileUrl) {
          return {
            ...file,
            role: input.role ?? undefined,
          };
        }

        if (
          input.role === "financial_statements" &&
          file.role === "financial_statements"
        ) {
          return {
            ...file,
            role: undefined,
          };
        }

        return file;
      });

      await ctx.db
        .update(taxReturns)
        .set({
          files: updatedFiles,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true, files: updatedFiles };
    }),

  removeReturnDocument: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        fileUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existingFiles = returnRecord.files ?? [];
      const updatedFiles = existingFiles.filter(
        (file) => file.url !== input.fileUrl,
      );

      if (updatedFiles.length === existingFiles.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found on this return.",
        });
      }

      await ctx.db
        .update(taxReturns)
        .set({
          files: updatedFiles,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true };
    }),

  saveReturnIntake: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        intake: z.object({
          contactEmail: z.string().email().optional(),
          notes: z.string().max(5000).optional(),
          esrSource: z.enum(["manual", "xlsx"]).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existingMetadata: Record<string, unknown> =
        returnRecord.metadata && typeof returnRecord.metadata === "object"
          ? returnRecord.metadata
          : {};
      const nextMetadata = {
        ...existingMetadata,
        portalIntake: {
          ...((existingMetadata.portalIntake as
            | Record<string, unknown>
            | undefined) ?? {}),
          ...input.intake,
          updatedAt: new Date().toISOString(),
          updatedByAccountId: account.id,
        },
      };

      await ctx.db
        .update(taxReturns)
        .set({
          metadata: nextMetadata,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true };
    }),

  extractSubstanceFormFromFiles: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        fileUrls: z.array(z.string().url()).min(1).max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }
      return extractSubstanceFormFromFilesInternal({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
        fileUrls: input.fileUrls,
        returnRecord,
        actorAccountId: account.id,
      });
    }),

  requestEsrAnalysis: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        esrDocument: portalFileSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const [createdTask] = await ctx.db
        .insert(tasks)
        .values({
          orgId: input.orgId,
          jurisdictionId: returnRecord.jurisdictionId,
          taxReturnId: returnRecord.id,
          taskType: "validation",
          status: "pending",
          name: `Portal ESR Analysis - ${returnRecord.entityName} (${returnRecord.taxYear})`,
          description: "Requested by portal client upload flow",
          metadata: {
            source: "portal",
            flow: "esr-analysis",
            document: input.esrDocument,
            requestedAt: new Date().toISOString(),
          },
          createdBy: account.id,
        })
        .returning({ id: tasks.id, status: tasks.status });

      const existingFiles = returnRecord.files ?? [];
      const uploadedAt = new Date().toISOString();
      await ctx.db
        .update(taxReturns)
        .set({
          files: [...existingFiles, { ...input.esrDocument, uploadedAt }],
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return {
        success: true,
        task: createdTask ?? null,
      };
    }),

  dismissReturn: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      if (returnRecord.status === "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot dismiss a completed return.",
        });
      }

      await ctx.db
        .update(taxReturns)
        .set({ status: "dismissed", updatedAt: new Date() })
        .where(eq(taxReturns.id, input.taxReturnId));

      return { success: true };
    }),

  undismissReturn: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await getPortalReturnForOrg({
        db: ctx.db,
        orgId: input.orgId,
        taxReturnId: input.taxReturnId,
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      await ctx.db
        .update(taxReturns)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(taxReturns.id, input.taxReturnId));

      return { success: true };
    }),
});
