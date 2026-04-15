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

const ECONOMIC_CLASSIFICATION_CODE_PATTERN = /\b\d{1,3}(?:\.\d{1,3})+\b/;
const ECONOMIC_CLASSIFICATION_CODE_CONTEXT_PATTERN =
  /\b\d{1,3}(?:\.\d{1,3}){2,}\b/;

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
  preparedByName: string;
  lastEditedBy?: string | null;
  sourceForm?: Partial<SubstanceAutofillValues> | null;
}) {
  const rawAutofillValues = pickSubstanceAutofillValues(input.sourceForm ?? null);
  const autofillValues = Object.fromEntries(
    Object.entries(rawAutofillValues).filter(([, value]) => value != null),
  ) as Partial<SubstanceFormData>;
  const values = {
    ...autofillValues,
    taxReturnId: input.taxReturnId,
    entityName: input.entityName,
    taxReferenceNumber: normalizeTaxReferenceNumber({
      externalId: input.externalId,
      taxYear: input.taxYear,
    }),
    accountingPeriodStart: `${Number(input.taxYear) - 1}-04-06`,
    accountingPeriodEnd: `${input.taxYear}-04-05`,
    certificateType: DEFAULT_CERTIFICATE_TYPE,
    preparedBy: input.preparedByName,
    profitAllocation: autofillValues.profitAllocation ?? "Investment",
    isGuernseyFiFatca: autofillValues.isGuernseyFiFatca ?? "No",
    isGuernseyFiCrs: autofillValues.isGuernseyFiCrs ?? "No",
    isRegisteredOnIgor: autofillValues.isRegisteredOnIgor ?? "No",
    isConstituentEntity: "No" as const,
    lastEditedBy: input.lastEditedBy ?? undefined,
  };

  return {
    ...values,
    missingFields: getMissingFields(values),
  };
}

const aiExtractionSchema = z.object({
  entityName: z.string().optional(),
  entityType: z.enum(["Company", "Partnership"]).optional(),
  accountingPeriodStart: z.string().optional(),
  accountingPeriodEnd: z.string().optional(),
  isCollectiveInvestmentVehicle: z.enum(["Yes", "No"]).optional(),
  companyNumber: z.string().optional(),
  taxReferenceNumber: z
    .string()
    .optional()
    .describe(
      "Tax reference number - preserve the exact alphanumeric format, including any leading letters such as C",
    ),
  registeredAddress: z.string().optional(),
  principalPlaceOfBusiness: z.string().optional(),
  isIncorporatedInGuernsey: z.enum(["Yes", "No"]).optional(),
  economicClassificationCode: z
    .string()
    .optional()
    .describe(
      'REQUIRED for 2025 returns — Company Activity Code dropdown. It usually looks like a dotted numeric code such as "10.5.4". Return only the dotted code.',
    ),
  certificateType: z
    .string()
    .optional()
    .describe('Certificate type - always return exactly "Certificate 3"'),
  entityActivity: z
    .string()
    .optional()
    .describe(
      "Nature of the entity's business activity (e.g., 'Property Holdings') — extract from Directors Report",
    ),
  partnershipName: z.string().optional(),
  partnershipNumber: z.string().optional(),
  areFinancialStatementsConsolidated: z.enum(["Yes", "No"]).optional(),
  accountsPreparerName: z
    .string()
    .optional()
    .describe(
      "Name of the ACCOUNTANT/AUDITOR who prepared the financial accounts, NOT the ESR form preparer",
    ),
  accountsPreparerQualification: z
    .string()
    .optional()
    .describe(
      "Qualification of the accounts preparer/auditor (ACCA, ICAEW, etc.)",
    ),
  netBookValue: z
    .string()
    .optional()
    .describe("Net book value from Balance Sheet — if negative, return '0'"),
  totalProfit: z
    .string()
    .optional()
    .describe("Total profit from P&L — if negative (a loss), return '0'"),
  profitAllocation: z
    .enum(["Investment", "Business"])
    .optional()
    .describe("Profit before tax allocation — REQUIRED, always pick one"),
  isGuernseyFiFatca: z.enum(["Yes", "No"]).optional(),
  isGuernseyFiCrs: z.enum(["Yes", "No"]).optional(),
  isRegisteredOnIgor: z
    .enum(["Yes", "No"])
    .optional()
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
    .optional()
    .describe(
      "Primary relevant activity from the dropdown options. Use existing form context and the entity activity/business description if the documents are ambiguous.",
    ),
  hasMultipleRelevantActivities: z.enum(["Yes", "No"]).optional(),
  hasIntellectualPropertyHolding: z.enum(["Yes", "No"]).optional(),
  isHighRiskIpEntity: z.enum(["Yes", "No"]).optional(),
  wantsToRebutHighRiskStatus: z.enum(["Yes", "No"]).optional(),
  highRiskRebuttalNarrative: z.string().optional(),
  ipIncomeType: z.string().optional(),
  activityGrossIncome: z
    .string()
    .optional()
    .describe(
      "Turnover or gross income generated from the relevant activity. Return the numeric amount only when clearly stated.",
    ),
  hasAdequatePhysicalPresence: z.enum(["Yes", "No", "N/A"]).optional(),
  adequacyExpenditureDetails: z
    .string()
    .optional()
    .describe(
      "Operating expenditure relating to the relevant activity. Return the numeric amount only when clearly stated.",
    ),
  adequacyPhysicalPresenceDetails: z.string().optional(),
  cigaPerformed: z.string().optional(),
  cigaDetails: z.string().optional(),
  employees: z
    .array(
      z.object({
        name: z.string().optional(),
        qualifiedForReporting: z.boolean().optional(),
        unitsOnCompany: z.number().optional(),
        totalUnits: z.number().optional(),
        fteFraction: z.number().optional(),
        qualifiedFteFraction: z.number().optional(),
      }),
    )
    .optional(),
  totalFte: z.number().optional(),
  totalQualifiedFte: z.number().optional(),
  hasCigaOutsourcing: z.enum(["Yes", "No", "N/A"]).optional(),
  outsourcingDetails: z.string().optional(),
  immediateParents: z
    .array(
      z.object({
        name: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional(),
        tinCountry: z.string().optional(),
        registeredAddress: z.string().optional(),
      }),
    )
    .optional(),
  ultimateParents: z
    .array(
      z.object({
        name: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional(),
        tinCountry: z.string().optional(),
        registeredAddress: z.string().optional(),
      }),
    )
    .optional(),
  ultimateBeneficialOwners: z
    .array(
      z.object({
        name: z.string().optional(),
        dateOfBirth: z.string().optional(),
        placeOfBirth: z.string().optional(),
        nationality: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional(),
        tinCountry: z.string().optional(),
        address: z.string().optional(),
      }),
    )
    .optional(),
  allBoardMeetingsInGuernsey: z.enum(["Yes", "No"]).optional(),
  totalBoardMeetings: z.number().optional(),
  boardMeetingsInGuernsey: z.number().optional(),
  adequateMeetingFrequency: z.enum(["Yes", "No", "N/A"]).optional(),
  enoughDirectorsPresent: z.enum(["Yes", "No", "N/A"]).optional(),
  directorsHaveExpertise: z.enum(["Yes", "No", "N/A"]).optional(),
  strategicDecisionsMadeInGuernsey: z.enum(["Yes", "No", "N/A"]).optional(),
  recordsMaintainedInGuernsey: z.enum(["Yes", "No", "N/A"]).optional(),
  boardMeetingLocation: z.string().optional(),
  directors: z
    .array(
      z.object({
        name: z.string().optional(),
        initials: z.string().optional(),
      }),
    )
    .optional(),
  boardMeetings: z
    .array(
      z.object({
        date: z.string().optional(),
        attendees: z.string().optional(),
        allPresentInGuernsey: z.boolean().optional(),
        agendaPoints: z.string().optional(),
      }),
    )
    .optional(),
  preparedBy: z.string().optional(),
  preparedDate: z.string().optional(),
  managerSignOff: z.string().optional(),
  managerSignOffDate: z.string().optional(),
  isConstituentEntity: z.enum(["Yes", "No"]).optional(),
  hasPostBalanceSheetEvent: z.enum(["Yes", "No"]).optional(),
  postBalanceSheetEventDetails: z.string().optional(),
  hasC42Association: z.enum(["Yes", "No"]).optional(),
  c42AssociatedCompanies: z.string().optional(),
  contractInformation: z.string().optional(),
});

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

  const org = await input.db.query.organisations.findFirst({
    where: eq(organisations.id, input.orgId),
  });
  const preparedByName = org?.accountName ?? org?.name ?? "LTS Tax Limited";

  let form = await input.db.query.substanceForms.findFirst({
    where: eq(substanceForms.taxReturnId, input.taxReturnId),
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
          preparedByName,
          lastEditedBy: input.actorAccountId ?? undefined,
          sourceForm: previousForm,
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

  type FileContent = { type: "file"; data: string; mediaType: string };
  type TextContent = { type: "text"; text: string };

  const fileContents: FileContent[] = [];
  const textContents: TextContent[] = [];

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

  const gateway = createGateway({
    apiKey,
    baseURL: "https://ai-gateway.vercel.sh/v3/ai",
  });
  const model = gateway("google/gemini-3-pro-preview");

  const cigaOptionsText = Object.entries(CIGA_BY_ACTIVITY)
    .map(
      ([activity, options]) => `${activity}:\n  - ${options.join("\n  - ")}`,
    )
    .join("\n\n");
  const existingContextText = buildExistingExtractionContext(form);

  const prompt = `You are extracting data for a Guernsey Economic Substance Register form.

Read all attached files and return values only when they are explicitly stated or clearly inferable.
If a value is unknown, leave it empty.

${existingContextText ? `=== EXISTING FORM CONTEXT ===\n${existingContextText}\n` : ""}

Use these strict output rules:
- Dates: YYYY-MM-DD
- Yes/No fields: "Yes" or "No"
- Yes/No/N/A fields: "Yes", "No", or "N/A"
- relevantActivity: pick exactly one allowed option from the enum.
- certificateType: always return "${DEFAULT_CERTIFICATE_TYPE}".
- taxReferenceNumber: preserve the exact source formatting. Do not strip leading letters and do not replace the letter "C" with the number "0".
- If total profit is negative (a loss), return "0". The portal does not accept negative values.
- If net book value is negative, return "0".
- profitAllocation is REQUIRED — always pick "Investment" or "Business".
- accountingPeriodStart is ALWAYS "${Number(input.returnRecord.taxYear) - 1}-04-06" and accountingPeriodEnd is ALWAYS "${input.returnRecord.taxYear}-04-05". The Guernsey tax year runs 6 April to 5 April. Do NOT extract different dates from the documents.
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

  const extractedData = result.object;
  const extractedTextContext = textContents.map((content) => content.text);

  extractedData.accountingPeriodStart = `${Number(input.returnRecord.taxYear) - 1}-04-06`;
  extractedData.accountingPeriodEnd = `${input.returnRecord.taxYear}-04-05`;
  extractedData.certificateType = DEFAULT_CERTIFICATE_TYPE;
  extractedData.taxReferenceNumber = normalizeTaxReferenceNumber({
    taxReferenceNumber: extractedData.taxReferenceNumber,
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

  extractedData.preparedBy ??= preparedByName;
  extractedData.isConstituentEntity ??= "No";

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

      // Get org for account name (used as preparedBy default)
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.orgId),
      });
      const preparedByName = org?.accountName ?? org?.name ?? "LTS Tax Limited";
      const previousForm = await findPreviousSubstanceAutofillSource(
        ctx.db,
        returnRecord,
      );

      const [created] = await ctx.db
        .insert(substanceForms)
        .values(
          buildInitializedSubstanceFormValues({
            taxReturnId: input.taxReturnId,
            taxYear: returnRecord.taxYear,
            entityName: returnRecord.entityName,
            externalId: returnRecord.externalId,
            preparedByName,
            lastEditedBy: account.id,
            sourceForm: previousForm,
          }),
        )
        .returning();

      return created ?? null;
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
