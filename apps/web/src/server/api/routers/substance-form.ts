import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import type { Database } from "@repo/database";
import { substanceForms, taxReturns } from "@repo/database";
import {
  mergeSubstanceAutofillValues,
  normalizeSubstanceAutofillEntityName,
  pickSubstanceAutofillValues,
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
import { eq } from "drizzle-orm";
import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { trackServer } from "@/lib/analytics";
import * as XLSX from "xlsx";
import { env } from "@/env";
import {
  substanceFormSchema,
  getMissingFields,
  type SubstanceFormData,
  CIGA_BY_ACTIVITY,
  relevantActivityEnum,
} from "@/lib/schemas/substance-form";

const DEFAULT_CERTIFICATE_TYPE = "Certificate 3";

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

function getGuernseyCertificateResolution(input: {
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
  db: Database;
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

async function findPreviousSubstanceAutofillSource(
  db: Database,
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

function buildInitializedSubstanceFormValues(input: {
  taxReturnId: string;
  taxYear: number;
  entityName: string;
  externalId?: string | null;
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
  };

  return {
    ...values,
    missingFields: getMissingFields(values),
  };
}

async function setManualGuernseyCertificateType(params: {
  db: Database;
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
    throw new Error(
      "Changing the certificate type will replace the existing Guernsey form answers. Confirm again to overwrite the current form.",
    );
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
    })
    .where(eq(substanceForms.taxReturnId, params.taxReturn.id))
    .returning();

  return updated ?? null;
}

// AI Extraction Schema - Uses inline enums to avoid Zod v4 JSON schema conversion issues
const aiExtractionSchema = z.object({
  // SECTION 1: BACKGROUND
  entityName: z.string().nullable().describe("Name of the entity/company"),
  entityType: z
    .enum(["Company", "Partnership"])
    .nullable()
    .describe("Company or Partnership"),
  accountingPeriodStart: z
    .string()
    .nullable()
    .describe("Start date of accounting period (YYYY-MM-DD)"),
  accountingPeriodEnd: z
    .string()
    .nullable()
    .describe("End date of accounting period (YYYY-MM-DD)"),
  isCollectiveInvestmentVehicle: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Is this entity a Collective Investment Vehicle?"),

  // SECTION 2: COMPANY INFORMATION
  companyNumber: z.string().nullable().describe("Company registration number"),
  registeredAddress: z
    .string()
    .nullable()
    .describe("Registered office address"),
  principalPlaceOfBusiness: z
    .string()
    .nullable()
    .describe("Principal place of business address"),
  isIncorporatedInGuernsey: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Is the entity incorporated in Guernsey?"),
  economicClassificationCode: z
    .string()
    .nullable()
    .describe(
      'Economic classification code / Company Activity Code — REQUIRED for 2025 returns. It usually looks like a dotted numeric code such as "10.5.4". Return only the dotted code.',
    ),
  entityActivity: z
    .string()
    .nullable()
    .describe(
      "Nature of the entity's business activity (e.g., 'Property Holdings', 'Investment Holding') — extract from Directors Report or company description",
    ),

  // SECTION 3: PARTNERSHIP INFORMATION
  partnershipName: z
    .string()
    .nullable()
    .describe("Partnership name if applicable"),
  partnershipNumber: z
    .string()
    .nullable()
    .describe("Partnership registration number"),

  // SECTION 4: FINANCIAL STATEMENTS
  areFinancialStatementsConsolidated: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Are financial statements consolidated?"),
  accountsPreparerName: z
    .string()
    .nullable()
    .describe(
      "Name of the firm/person who prepared the FINANCIAL ACCOUNTS (the accountant/auditor, NOT the ESR form preparer — do NOT use 'LTS Tax Limited' here)",
    ),
  accountsPreparerQualification: z
    .string()
    .nullable()
    .describe(
      "Qualification of the accounts preparer/auditor (ACCA, ICAEW, etc.) — this is the accountant's qualification, not LTS",
    ),
  netBookValue: z
    .string()
    .nullable()
    .describe("Net book value from Balance Sheet — if negative, return '0'"),
  totalProfit: z
    .string()
    .nullable()
    .describe(
      "Total profit from Profit & Loss Account — if negative (a loss), return '0'",
    ),
  profitAllocation: z
    .enum(["Investment", "Business"])
    .nullable()
    .describe("Profit before tax allocation - Investment or Business"),

  // SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
  isGuernseyFiFatca: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Is Guernsey Financial Institution under FATCA?"),
  isGuernseyFiCrs: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Is Financial Institution under CRS?"),
  isRegisteredOnIgor: z
    .enum(["Yes", "No"])
    .nullable()
    .describe(
      "Is registered on IGOR (Information Gateway Online Reporter) for FATCA/CRS reporting?",
    ),

  // SECTION 6: RELEVANT ACTIVITIES
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
  hasMultipleRelevantActivities: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Does entity have multiple relevant activities?"),
  hasIntellectualPropertyHolding: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Does the entity have any intellectual property holding?"),

  // SECTION 6A: INTELLECTUAL PROPERTY
  isHighRiskIpEntity: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Is the entity a High Risk IP Entity as defined in legislation?"),
  wantsToRebutHighRiskStatus: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Does the entity want to rebut High Risk IP status?"),
  highRiskRebuttalNarrative: z
    .string()
    .nullable()
    .describe("Narrative explaining the rebuttal of high risk status"),
  ipIncomeType: z.string().nullable().describe("Type of IP income received"),

  // SECTION 6B: ADEQUACY ASSESSMENT
  activityGrossIncome: z
    .string()
    .nullable()
    .describe(
      "Turnover or gross income generated from the relevant activity. Return the numeric amount only when clearly stated.",
    ),
  hasAdequatePhysicalPresence: z
    .enum(["Yes", "No", "N/A"])
    .nullable()
    .describe("Does the entity have adequate physical presence?"),
  adequacyExpenditureDetails: z
    .string()
    .nullable()
    .describe(
      "Operating expenditure relating to the relevant activity. Return the numeric amount only when clearly stated.",
    ),
  adequacyPhysicalPresenceDetails: z
    .string()
    .nullable()
    .describe("Details about adequacy of physical presence"),

  // SECTION 7: CIGA
  cigaPerformed: z
    .string()
    .nullable()
    .describe("Description of Core Income Generating Activities performed"),
  cigaDetails: z
    .string()
    .nullable()
    .describe("Additional CIGA details from board minutes or other sources"),

  // SECTION 8: EMPLOYEES (FTE Calculation)
  employees: z
    .array(
      z.object({
        name: z.string().nullable(),
        qualifiedForReporting: z
          .boolean()
          .nullable()
          .describe("Is this employee qualified for reporting purposes?"),
        unitsOnCompany: z
          .number()
          .nullable()
          .describe("Chargeable units spent on this company"),
        totalUnits: z.number().nullable().describe("Total chargeable units"),
        fteFraction: z
          .number()
          .nullable()
          .describe("FTE fraction (unitsOnCompany / totalUnits)"),
        qualifiedFteFraction: z
          .number()
          .nullable()
          .describe("Qualified FTE fraction if qualified"),
      }),
    )
    .nullable(),
  totalFte: z
    .number()
    .nullable()
    .describe("Total Full-Time Equivalent employees"),
  totalQualifiedFte: z.number().nullable().describe("Total Qualified FTE"),

  // SECTION 9: OUTSOURCING
  hasCigaOutsourcing: z
    .enum(["Yes", "No", "N/A"])
    .nullable()
    .describe("Are any CIGA activities outsourced?"),
  outsourcingDetails: z
    .string()
    .nullable()
    .describe("Details of outsourcing arrangements"),

  // SECTION 10: BENEFICIAL OWNERSHIP
  immediateParents: z
    .array(
      z.object({
        name: z.string().nullable(),
        countryOfTaxResidence: z.string().nullable(),
        tin: z.string().nullable().describe("Tax Identification Number"),
        tinCountry: z
          .string()
          .nullable()
          .describe("Country that issued the TIN"),
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
        dateOfBirth: z
          .string()
          .nullable()
          .describe("Date of birth (YYYY-MM-DD)"),
        placeOfBirth: z.string().nullable(),
        nationality: z.string().nullable(),
        countryOfTaxResidence: z.string().nullable(),
        tin: z.string().nullable(),
        tinCountry: z.string().nullable(),
        address: z.string().nullable(),
      }),
    )
    .nullable(),

  // SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
  allBoardMeetingsInGuernsey: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Were all board meetings held in Guernsey?"),
  totalBoardMeetings: z
    .number()
    .nullable()
    .describe("Total number of board meetings in the period"),
  boardMeetingsInGuernsey: z
    .number()
    .nullable()
    .describe("Number of board meetings held in Guernsey"),
  adequateMeetingFrequency: z
    .enum(["Yes", "No", "N/A"])
    .nullable()
    .describe("Is the meeting frequency adequate?"),
  enoughDirectorsPresent: z
    .enum(["Yes", "No", "N/A"])
    .nullable()
    .describe("Were enough directors present at meetings?"),
  directorsHaveExpertise: z
    .enum(["Yes", "No", "N/A"])
    .nullable()
    .describe("Do directors have necessary expertise?"),
  strategicDecisionsMadeInGuernsey: z
    .enum(["Yes", "No", "N/A"])
    .nullable()
    .describe("Were strategic decisions made in Guernsey?"),
  recordsMaintainedInGuernsey: z
    .enum(["Yes", "No", "N/A"])
    .nullable()
    .describe("Are records maintained in Guernsey?"),
  boardMeetingLocation: z
    .string()
    .nullable()
    .describe("Location where board meetings are held"),
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
        date: z.string().nullable().describe("Meeting date (YYYY-MM-DD)"),
        attendees: z
          .string()
          .nullable()
          .describe("Names/initials of attendees"),
        allPresentInGuernsey: z.boolean().nullable(),
        agendaPoints: z
          .string()
          .nullable()
          .describe("Key agenda points discussed"),
      }),
    )
    .nullable(),

  // SECTION 12: DECLARATION
  managerSignOff: z.string().nullable().describe("Manager who signed off"),
  managerSignOffDate: z
    .string()
    .nullable()
    .describe("Sign off date (YYYY-MM-DD)"),

  // SECTION 13: COUNTRY BY COUNTRY REPORTING
  isConstituentEntity: z
    .enum(["Yes", "No"])
    .nullable()
    .describe("Is the entity a Constituent Entity for CbCR purposes?"),

  // SECTION 14: ADDITIONAL INFORMATION
  hasC42Association: z
    .enum(["Yes", "No"])
    .nullable()
    .describe(
      "Does the entity have a C42 association (Statement of Practice C42)?",
    ),
  c42AssociatedCompanies: z
    .string()
    .nullable()
    .describe("Names of C42 associated companies"),
  contractInformation: z
    .string()
    .nullable()
    .describe("Contract information (CSP standard)"),
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

export const substanceFormRouter = createTRPCRouter({
  // Get form for a tax return
  getByTaxReturnId: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });
      return form ?? null;
    }),

  // Create or get form for a tax return
  createForTaxReturn: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Check if tax return exists
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      // Check if form already exists
      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (existing) {
        return existing;
      }

      const previousForm = await findPreviousSubstanceAutofillSource(
        ctx.db,
        taxReturn,
      );
      const certificateResolution = getGuernseyCertificateResolution({
        taxReturn,
        form: existing,
      });

      if (certificateResolution.unresolved) {
        throw new Error(
          "Certificate type is unresolved for this Guernsey return. Confirm Certificate 2 or Certificate 3 before initializing the form.",
        );
      }

      // Create new form with basic info from tax return
      const [form] = await ctx.db
        .insert(substanceForms)
        .values(
          buildInitializedSubstanceFormValues({
            taxReturnId: input.taxReturnId,
            taxYear: taxReturn.taxYear,
            entityName: taxReturn.entityName,
            externalId: taxReturn.externalId,
            sourceForm: previousForm,
            certificateResolution,
          }),
        )
        .returning();

      return form;
    }),

  setCertificateType: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        certificateType: z.enum(["Certificate 2", "Certificate 3"]),
        overwriteExisting: z.boolean().optional().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      return setManualGuernseyCertificateType({
        db: ctx.db,
        taxReturn,
        existingForm: existing,
        certificateType: input.certificateType,
        overwriteExisting: input.overwriteExisting,
      });
    }),

  // Update form data
  update: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        data: substanceFormSchema.partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!existing) {
        throw new Error("Form not found");
      }

      // Calculate missing fields
      const currentData = { ...existing, ...input.data } as SubstanceFormData;
      const missingFields = getMissingFields(currentData);
      const isComplete = missingFields.length === 0;

      const [updated] = await ctx.db
        .update(substanceForms)
        .set({
          ...input.data,
          missingFields,
          isComplete,
          lastEditedAt: new Date(),
        })
        .where(eq(substanceForms.taxReturnId, input.taxReturnId))
        .returning();

      return updated;
    }),

  // Extract data from uploaded files using AI
  extractFromFiles: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        fileUrls: z.array(z.string().url()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.AI_GATEWAY_API_KEY;
      if (!apiKey) {
        throw new Error("AI_GATEWAY_API_KEY not configured");
      }

      console.log(
        "[AI Extraction] Starting with",
        input.fileUrls.length,
        "files",
      );

      // Get tax return for context
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      // Get existing form if present. If it is missing, initialization happens
      // only after certificate type and source-document checks have run.
      let form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      // Track AI extraction start
      const extractionStartTime = Date.now();
      await trackServer({
        name: "ai_extraction_started",
        data: {
          taxReturnId: input.taxReturnId,
          documentCount: input.fileUrls.length,
          documentTypes: input.fileUrls.map(() => "pdf"), // Could be enhanced to detect actual types
        },
      });

      // Build file content for AI
      const supportedFileTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ];
      const excelTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls
      ];

      type FileContent = { type: "file"; data: string; mediaType: string };
      type TextContent = { type: "text"; text: string };
      const fileContents: FileContent[] = [];
      const textContents: TextContent[] = [];
      const taxReturnFiles = Array.isArray(taxReturn.files)
        ? taxReturn.files
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

      for (const url of input.fileUrls) {
        const response = await fetch(url);
        const mediaType =
          response.headers.get("content-type") ?? "application/pdf";
        const buffer = await response.arrayBuffer();

        // Handle Excel files - convert to CSV
        if (
          excelTypes.some(
            (t) =>
              mediaType.includes(t) ||
              mediaType.includes("spreadsheet") ||
              mediaType.includes("excel"),
          )
        ) {
          console.log(
            `[AI Extraction] Converting Excel file to CSV: ${mediaType}`,
          );
          try {
            const workbook = XLSX.read(buffer, { type: "array" });
            const csvParts: string[] = [];

            // Convert each sheet to CSV
            for (const sheetName of workbook.SheetNames) {
              const sheet = workbook.Sheets[sheetName];
              if (sheet) {
                const csv = XLSX.utils.sheet_to_csv(sheet);
                csvParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
              }
            }

            const fullCsv = csvParts.join("\n\n");
            console.log(
              `[AI Extraction] Converted Excel to CSV: ${fullCsv.length} chars, ${workbook.SheetNames.length} sheets`,
            );
            textContents.push({
              type: "text" as const,
              text: `[Excel File Content]\n${fullCsv}`,
            });
          } catch (err) {
            console.error(
              `[AI Extraction] Failed to convert Excel to CSV:`,
              err,
            );
          }
          continue;
        }

        // Handle supported file types (PDF, images)
        if (
          supportedFileTypes.some(
            (t) => mediaType.startsWith(t.split("/")[0]!) || mediaType === t,
          )
        ) {
          if (
            mediaType.includes("application/pdf") ||
            url.toLowerCase().endsWith(".pdf")
          ) {
            const firecrawlMarkdown = await scrapePdfMarkdownWithFirecrawl(url);
            if (firecrawlMarkdown) {
              textContents.push({
                type: "text" as const,
                text: `[Firecrawl PDF Parse]\n${firecrawlMarkdown}`,
              });
            }
          }

          const base64 = Buffer.from(buffer).toString("base64");
          fileContents.push({
            type: "file" as const,
            data: base64,
            mediaType,
          });
          continue;
        }

        console.log(
          `[AI Extraction] Skipping unsupported file type: ${mediaType}`,
        );
      }

      if (fileContents.length === 0 && textContents.length === 0) {
        throw new Error(
          "No supported files to extract from. Supported: PDF, images, Excel (.xlsx/.xls).",
        );
      }

      const extractedTextContext = textContents.map((content) => content.text);
      const metadataResolution = getGuernseyCertificateResolution({
        taxReturn,
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
        entityName: taxReturn.entityName,
        taxYear: taxReturn.taxYear,
        accountingPeriodStart: form?.accountingPeriodStart,
        accountingPeriodEnd: form?.accountingPeriodEnd,
        fileNames: sourceFileNames,
        texts: extractedTextContext,
      });

      const blockingValidationIssues = validationIssues.filter(
        (issue) => issue.severity === "error",
      );
      if (blockingValidationIssues.length > 0) {
        throw new Error(formatValidationIssues(blockingValidationIssues));
      }

      if (certificateResolution.unresolved) {
        throw new Error(
          "Certificate type could not be determined from the existing return metadata or the uploaded documents. Confirm whether this is Certificate 2 or Certificate 3 before initializing or extracting the form.",
        );
      }

      await persistGuernseyCertificateResolution({
        db: ctx.db,
        taxReturnId: taxReturn.id,
        metadata: getTaxReturnMetadata(taxReturn.metadata),
        resolution: certificateResolution,
      });

      if (!form) {
        const previousForm = await findPreviousSubstanceAutofillSource(
          ctx.db,
          taxReturn,
        );
        const [newForm] = await ctx.db
          .insert(substanceForms)
          .values(
            buildInitializedSubstanceFormValues({
              taxReturnId: input.taxReturnId,
              taxYear: taxReturn.taxYear,
              entityName: taxReturn.entityName,
              externalId: taxReturn.externalId,
              sourceForm: previousForm,
              certificateResolution,
            }),
          )
          .returning();
        if (!newForm) {
          throw new Error("Failed to create substance form");
        }
        form = newForm;
      }

      const certificateTwoDefaults =
        certificateResolution.certificateType === "Certificate 2"
          ? buildGuernseyCertificateTwoDefaults(taxReturn.taxYear)
          : null;

      // Use Vercel AI Gateway with GPT-5.4
      const gateway = createGateway({
        apiKey,
        baseURL: "https://ai-gateway.vercel.sh/v3/ai",
      });
      const model = gateway("openai/gpt-5.4");

      console.log(
        "[AI Extraction] Gateway configured, model: openai/gpt-5.4",
      );

      // Build CIGA options string for the prompt
      const cigaOptionsText = Object.entries(CIGA_BY_ACTIVITY)
        .map(
          ([activity, options]) =>
            `${activity}:\n  - ${options.join("\n  - ")}`,
        )
        .join("\n\n");
      const extractionContextForm = certificateTwoDefaults
        ? ({ ...form, ...certificateTwoDefaults } as typeof form)
        : form;
      const existingContextText =
        buildExistingExtractionContext(extractionContextForm);

      const prompt = `You are an expert at extracting information from financial and corporate documents for Guernsey ${certificateResolution.certificateType} Economic Substance Register reporting.

Analyze the provided document(s) and extract all relevant information to fill out a Guernsey Economic Substance Register form.

${existingContextText ? `=== EXISTING FORM CONTEXT ===\n${existingContextText}\n` : ""}

=== FORM STRUCTURE ===

SECTION 1: BACKGROUND
- Entity name, type (Company or Partnership)
- Accounting period start and end dates
- Is it a Collective Investment Vehicle?

SECTION 2: COMPANY INFORMATION
- Company number
- Registered address, principal place of business
- Is entity incorporated in Guernsey? (Yes/No)
- Economic classification code / Company Activity Code — REQUIRED for 2025 returns
- Entity activity / Nature of the entity's business activity (e.g., "Property Holdings") — extract from Directors Report or company description. Always try to fill this.

SECTION 3: PARTNERSHIP INFORMATION (if applicable)
- Partnership name and number

SECTION 4: FINANCIAL STATEMENTS
- Are statements consolidated?
- Accounts preparer name and qualification — this is the ACCOUNTANT/AUDITOR who prepared the financial accounts, NOT "LTS Tax Limited" (LTS prepares the ESR form, not the accounts)
- Net book value (from Balance Sheet) — if negative, return "0"
- Total profit (from Profit & Loss Account) — if negative (a loss), return "0"
- Profit allocation — REQUIRED, always pick "Investment" or "Business"

SECTION 5: FINANCIAL INSTITUTIONS
- FATCA and CRS status — default to "No" if entity is not a financial institution
- IMPORTANT: If FATCA is "Yes", the entity MUST be registered on IGOR — "No" for IGOR with "Yes" for FATCA is a red flag

SECTION 6: RELEVANT ACTIVITIES
Choose ONE from: Banking, Insurance, Fund management, Financing and leasing, Distribution and Service Centre, Headquarters, Shipping, Self-managed fund, Intellectual Property Holding Company, Pure Equity Holding Company, None of the above
- Does entity have any intellectual property holding? (Yes/No)

SECTION 6A: INTELLECTUAL PROPERTY (if IP Holding Company)
- Is the entity a High Risk IP Entity as defined in legislation? (Yes/No)
- Does the entity want to rebut High Risk IP status? (Yes/No)
- Rebuttal narrative if applicable
- Type of IP income received

SECTION 6B: ADEQUACY ASSESSMENT
- Turnover / gross income from the relevant activity
- Operating expenditure relating to the relevant activity
- Has adequate physical presence? (Yes/No/N/A)
- Details about physical presence adequacy

SECTION 7: CIGA (Core Income Generating Activities)
Based on the relevant activity, CIGA options are:
${cigaOptionsText}

SECTION 8: EMPLOYEES
- Employee names, FTE calculations, qualified status

SECTION 9: OUTSOURCING
- Any outsourced CIGA? Details?

SECTION 10: BENEFICIAL OWNERSHIP
- Immediate parents (name, country of tax residence, TIN, address)
- Ultimate parents (same fields)
- Ultimate beneficial owners (name, DOB, place of birth, nationality, tax residence, TIN, address)

SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
- Board meetings: total count, how many in Guernsey
- All meetings in Guernsey? Yes/No
- Adequate frequency? Enough directors present? Directors have expertise?
- Strategic decisions made in Guernsey? Records maintained in Guernsey?
- Directors list (name, initials)
- Board meeting details (date, attendees, location, agenda points)

SECTION 12: DECLARATION
- Manager sign off, date

SECTION 13: COUNTRY BY COUNTRY REPORTING (CbCR)
- Is the entity a constituent entity for CbCR purposes? (Yes/No) — REQUIRED for 2025 returns, default to "No" if not specified

SECTION 14: ADDITIONAL INFORMATION
- Does entity have C42 association (Statement of Practice C42)? (Yes/No)
- Names of C42 associated companies
- Contract information (CSP standard)

=== INSTRUCTIONS ===

For dates, extract as ISO 8601 strings (YYYY-MM-DD).
For Yes/No questions, use exactly "Yes", "No", or "N/A" where applicable.
For the relevant activity, pick the single most applicable option from the dropdown list.
Only extract information that is explicitly stated or can be clearly inferred.
Do not make up or guess values - leave fields empty if information is not available.
Some attached PDFs may also include a Firecrawl OCR/text parse. Use that parsed text as additional extraction support, but prioritize the source documents when they are clearer.

IMPORTANT RULES:
- accountingPeriodStart and accountingPeriodEnd are the entity's actual accounting period dates, not the Guernsey tax year. Extract them only if the documents clearly state them. If they are not stated, leave them empty.
- If total profit is negative (a loss), return "0". The portal does not accept negative values.
- If net book value is negative, return "0".
- profitAllocation is REQUIRED — always pick "Investment" or "Business" based on the entity's income type.
- economicClassificationCode is REQUIRED for 2025 returns. It usually looks like a dotted numeric code such as "10.5.4". Look specifically for dot-separated numeric codes near labels like "Economic Classification Code" or "Company Activity Code", and return only the dotted code.
- isConstituentEntity (CbCR) is REQUIRED for 2025 returns — default to "No" if not stated.
- accountsPreparerName is the ACCOUNTANT who prepared the financial accounts, NOT "LTS Tax Limited".
- relevantActivity is REQUIRED — pick the single most applicable option. Use the saved form context plus the entity activity/business description if the new documents are ambiguous. If the existing saved form already identifies the relevant activity and the new files do not clearly contradict it, keep that activity.
- allBoardMeetingsInGuernsey, totalBoardMeetings, boardMeetingsInGuernsey are helpful but not required. Extract them when the documents state them, otherwise leave them empty.
- activityGrossIncome should be the turnover or gross income from the relevant activity when the documents clearly state it. Leave it empty if it is not identifiable.
- adequacyExpenditureDetails should be the operating expenditure relating to the relevant activity when the documents clearly state it. Leave it empty if it is not identifiable.
- If the entity has no relevant activity ("None of the above"), leave sections 6B, 7, 8, 9, and 10 empty.
${certificateTwoDefaults ? `

IMPORTANT CERTIFICATE 2 RULES:
- Certificate 2 filings do not require financial statements upload or financial-statement extraction.
- Keep the static Certificate 2 defaults: accounting period 01-01 to 31-12 for the tax year, entity activity "Dormant", relevant activity "None of the above", no multiple relevant activities, no intellectual property holding, FATCA/CRS/IGOR "No", and CbCR constituent entity "No".
- Still extract any useful non-financial details you can from the uploaded supporting documents, such as entity name, entity type, addresses, company number, and Guernsey incorporation status.
` : ""}`;

      console.log(
        "[AI Extraction] Calling generateObject with",
        fileContents.length,
        "file(s) and",
        textContents.length,
        "text content(s)",
      );

      let result;
      try {
        // Build message content: prompt + file contents + text contents (CSV from Excel)
        const messageContent: (TextContent | FileContent)[] = [
          { type: "text" as const, text: prompt },
          ...fileContents,
          ...textContents,
        ];

        result = await generateObject({
          model,
          output: "object",
          schema: aiExtractionSchema,
          schemaName: "GuernseySubstanceForm",
          schemaDescription:
            "Guernsey Economic Substance Register form data extracted from corporate documents",
          messages: [
            {
              role: "user",
              content: messageContent,
            },
          ],
        });
      } catch (error) {
        console.error("[AI Extraction] generateObject failed:", error);
        console.error(
          "[AI Extraction] Error details:",
          JSON.stringify(error, Object.getOwnPropertyNames(error), 2),
        );
        throw error;
      }

      console.log(
        "[AI Extraction] Success! Extracted fields:",
        Object.keys(result.object).length,
      );
      const extractedData = stripNullishStructuredValue(
        result.object,
      ) as Partial<SubstanceFormData>;

      extractedData.certificateType = certificateResolution.certificateType;
      extractedData.taxReferenceNumber = normalizeTaxReferenceNumber({
        externalId: taxReturn.externalId,
        taxYear: taxReturn.taxYear,
      });

      if (certificateTwoDefaults) {
        Object.assign(extractedData, certificateTwoDefaults);
      }

      // Default profitAllocation to "Investment" if not extracted
      if (!certificateTwoDefaults) {
        extractedData.profitAllocation ??= "Investment";
      }

      // Clamp negative financial values to "0" — portal does not accept negatives
      if (extractedData.totalProfit) {
        const numericProfit = parseFloat(
          extractedData.totalProfit.replace(/[^0-9.-]/g, ""),
        );
        if (!isNaN(numericProfit) && numericProfit < 0) {
          extractedData.totalProfit = "0";
        }
      }
      if (extractedData.netBookValue) {
        const numericNbv = parseFloat(
          extractedData.netBookValue.replace(/[^0-9.-]/g, ""),
        );
        if (!isNaN(numericNbv) && numericNbv < 0) {
          extractedData.netBookValue = "0";
        }
      }

      // FATCA/CRS defaults — "No" when not a financial institution
      extractedData.isGuernseyFiFatca ??= "No";
      extractedData.isGuernseyFiCrs ??= "No";

      // IGOR: "Yes" if FI under FATCA or CRS, "No" otherwise
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

      // CbCR — default to "No" for 2025 returns
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

      if (!certificateTwoDefaults) {
        const contextualRelevantActivity = inferRelevantActivityFromContext(
          extractedData.relevantActivity,
          form.relevantActivity,
          extractedData.entityActivity,
          form.entityActivity,
          extractedData.cigaPerformed,
          extractedData.cigaDetails,
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
      }

      // Merge with existing data (AI data fills in gaps)
      const mergedData = { ...form, ...extractedData };
      const missingFields = getMissingFields(mergedData as SubstanceFormData);
      const isComplete = missingFields.length === 0;

      // Update form with extracted data
      const [updated] = await ctx.db
        .update(substanceForms)
        .set({
          ...extractedData,
          missingFields,
          isComplete,
          aiExtractedAt: new Date(),
          lastEditedAt: new Date(),
        })
        .where(eq(substanceForms.taxReturnId, input.taxReturnId))
        .returning();

      const extractedFieldsCount = Object.keys(extractedData).filter(
        (k) => extractedData[k as keyof typeof extractedData] !== undefined,
      ).length;

      // Track AI extraction completion
      await trackServer({
        name: "ai_extraction_completed",
        data: {
          taxReturnId: input.taxReturnId,
          success: true,
          fieldsExtracted: extractedFieldsCount,
          extractionTimeMs: Date.now() - extractionStartTime,
          model: "openai/gpt-5.4",
        },
      });

      return {
        form: updated,
        extractedFields: Object.keys(extractedData).filter(
          (k) => extractedData[k as keyof typeof extractedData] !== undefined,
        ),
        warnings: validationIssues
          .filter((issue) => issue.severity === "warning")
          .map((issue) => issue.message),
      };
    }),

  // Check if form is complete
  checkComplete: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!form) {
        return {
          exists: false,
          isComplete: false,
          missingFields: [],
        };
      }

      return {
        exists: true,
        isComplete: form.isComplete ?? false,
        missingFields: Array.isArray(form.missingFields)
          ? form.missingFields
          : [],
      };
    }),

  // Get CIGA options for a specific activity
  getCigaOptions: publicProcedure
    .input(z.object({ activity: z.string() }))
    .query(({ input }) => {
      return CIGA_BY_ACTIVITY[input.activity] ?? [];
    }),
});
