import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { organisations, substanceForms, taxReturns } from "@repo/database";
import { eq } from "drizzle-orm";
import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import { trackServer } from "@/lib/analytics";
import * as XLSX from "xlsx";
import {
  substanceFormSchema,
  getMissingFields,
  type SubstanceFormData,
  CIGA_BY_ACTIVITY,
} from "@/lib/schemas/substance-form";

const DEFAULT_CERTIFICATE_TYPE = "Certificate 3";

function normalizeTaxReferenceNumber(input: {
  taxReferenceNumber?: string | null;
  externalId?: string | null;
  taxYear?: number | string | null;
}) {
  const { taxReferenceNumber, externalId, taxYear } = input;
  const normalizedExternalId = externalId?.trim().toUpperCase() || "";
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

  return normalizedTaxReference || undefined;
}

// AI Extraction Schema - Uses inline enums to avoid Zod v4 JSON schema conversion issues
const aiExtractionSchema = z.object({
  // SECTION 1: BACKGROUND
  entityName: z.string().optional().describe("Name of the entity/company"),
  entityType: z
    .enum(["Company", "Partnership"])
    .optional()
    .describe("Company or Partnership"),
  accountingPeriodStart: z
    .string()
    .optional()
    .describe("Start date of accounting period (YYYY-MM-DD)"),
  accountingPeriodEnd: z
    .string()
    .optional()
    .describe("End date of accounting period (YYYY-MM-DD)"),
  isCollectiveInvestmentVehicle: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Is this entity a Collective Investment Vehicle?"),

  // SECTION 2: COMPANY INFORMATION
  companyNumber: z.string().optional().describe("Company registration number"),
  taxReferenceNumber: z
    .string()
    .optional()
    .describe(
      "Tax reference number - preserve the exact alphanumeric format, including any leading letters such as C",
    ),
  registeredAddress: z
    .string()
    .optional()
    .describe("Registered office address"),
  principalPlaceOfBusiness: z
    .string()
    .optional()
    .describe("Principal place of business address"),
  isIncorporatedInGuernsey: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Is the entity incorporated in Guernsey?"),
  economicClassificationCode: z
    .string()
    .optional()
    .describe(
      "Economic classification code / Company Activity Code — REQUIRED for 2025 returns, this is a dropdown on the portal",
    ),
  certificateType: z
    .string()
    .optional()
    .describe('Certificate type - always return exactly "Certificate 3"'),
  entityActivity: z
    .string()
    .optional()
    .describe(
      "Nature of the entity's business activity (e.g., 'Property Holdings', 'Investment Holding') — extract from Directors Report or company description",
    ),

  // SECTION 3: PARTNERSHIP INFORMATION
  partnershipName: z
    .string()
    .optional()
    .describe("Partnership name if applicable"),
  partnershipNumber: z
    .string()
    .optional()
    .describe("Partnership registration number"),

  // SECTION 4: FINANCIAL STATEMENTS
  areFinancialStatementsConsolidated: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Are financial statements consolidated?"),
  accountsPreparerName: z
    .string()
    .optional()
    .describe(
      "Name of the firm/person who prepared the FINANCIAL ACCOUNTS (the accountant/auditor, NOT the ESR form preparer — do NOT use 'LTS Tax Limited' here)",
    ),
  accountsPreparerQualification: z
    .string()
    .optional()
    .describe(
      "Qualification of the accounts preparer/auditor (ACCA, ICAEW, etc.) — this is the accountant's qualification, not LTS",
    ),
  netBookValue: z
    .string()
    .optional()
    .describe("Net book value from Balance Sheet — if negative, return '0'"),
  totalProfit: z
    .string()
    .optional()
    .describe(
      "Total profit from Profit & Loss Account — if negative (a loss), return '0'",
    ),
  profitAllocation: z
    .enum(["Investment", "Business"])
    .optional()
    .describe("Profit before tax allocation - Investment or Business"),

  // SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
  isGuernseyFiFatca: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Is Guernsey Financial Institution under FATCA?"),
  isGuernseyFiCrs: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Is Financial Institution under CRS?"),
  isRegisteredOnIgor: z
    .enum(["Yes", "No"])
    .optional()
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
    .optional()
    .describe("Primary relevant activity from the dropdown options"),
  hasMultipleRelevantActivities: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Does entity have multiple relevant activities?"),
  hasIntellectualPropertyHolding: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Does the entity have any intellectual property holding?"),

  // SECTION 6A: INTELLECTUAL PROPERTY
  isHighRiskIpEntity: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Is the entity a High Risk IP Entity as defined in legislation?"),
  wantsToRebutHighRiskStatus: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Does the entity want to rebut High Risk IP status?"),
  highRiskRebuttalNarrative: z
    .string()
    .optional()
    .describe("Narrative explaining the rebuttal of high risk status"),
  ipIncomeType: z.string().optional().describe("Type of IP income received"),

  // SECTION 6B: ADEQUACY ASSESSMENT
  hasAdequateExpenditure: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Does the entity have adequate expenditure for substance?"),
  hasAdequatePhysicalPresence: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Does the entity have adequate physical presence?"),
  adequacyExpenditureDetails: z
    .string()
    .optional()
    .describe("Details about adequacy of expenditure"),
  adequacyPhysicalPresenceDetails: z
    .string()
    .optional()
    .describe("Details about adequacy of physical presence"),

  // SECTION 7: CIGA
  cigaPerformed: z
    .string()
    .optional()
    .describe("Description of Core Income Generating Activities performed"),
  cigaDetails: z
    .string()
    .optional()
    .describe("Additional CIGA details from board minutes or other sources"),

  // SECTION 8: EMPLOYEES (FTE Calculation)
  employees: z
    .array(
      z.object({
        name: z.string().optional(),
        qualifiedForReporting: z
          .boolean()
          .optional()
          .describe("Is this employee qualified for reporting purposes?"),
        unitsOnCompany: z
          .number()
          .optional()
          .describe("Chargeable units spent on this company"),
        totalUnits: z.number().optional().describe("Total chargeable units"),
        fteFraction: z
          .number()
          .optional()
          .describe("FTE fraction (unitsOnCompany / totalUnits)"),
        qualifiedFteFraction: z
          .number()
          .optional()
          .describe("Qualified FTE fraction if qualified"),
      }),
    )
    .optional(),
  totalFte: z
    .number()
    .optional()
    .describe("Total Full-Time Equivalent employees"),
  totalQualifiedFte: z.number().optional().describe("Total Qualified FTE"),

  // SECTION 9: OUTSOURCING
  hasCigaOutsourcing: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Are any CIGA activities outsourced?"),
  outsourcingDetails: z
    .string()
    .optional()
    .describe("Details of outsourcing arrangements"),

  // SECTION 10: BENEFICIAL OWNERSHIP
  immediateParents: z
    .array(
      z.object({
        name: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional().describe("Tax Identification Number"),
        tinCountry: z
          .string()
          .optional()
          .describe("Country that issued the TIN"),
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
        dateOfBirth: z
          .string()
          .optional()
          .describe("Date of birth (YYYY-MM-DD)"),
        placeOfBirth: z.string().optional(),
        nationality: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional(),
        tinCountry: z.string().optional(),
        address: z.string().optional(),
      }),
    )
    .optional(),

  // SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
  allBoardMeetingsInGuernsey: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Were all board meetings held in Guernsey?"),
  totalBoardMeetings: z
    .number()
    .optional()
    .describe("Total number of board meetings in the period"),
  boardMeetingsInGuernsey: z
    .number()
    .optional()
    .describe("Number of board meetings held in Guernsey"),
  adequateMeetingFrequency: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Is the meeting frequency adequate?"),
  enoughDirectorsPresent: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Were enough directors present at meetings?"),
  directorsHaveExpertise: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Do directors have necessary expertise?"),
  strategicDecisionsMadeInGuernsey: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Were strategic decisions made in Guernsey?"),
  recordsMaintainedInGuernsey: z
    .enum(["Yes", "No", "N/A"])
    .optional()
    .describe("Are records maintained in Guernsey?"),
  boardMeetingLocation: z
    .string()
    .optional()
    .describe("Location where board meetings are held"),
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
        date: z.string().optional().describe("Meeting date (YYYY-MM-DD)"),
        attendees: z
          .string()
          .optional()
          .describe("Names/initials of attendees"),
        allPresentInGuernsey: z.boolean().optional(),
        agendaPoints: z
          .string()
          .optional()
          .describe("Key agenda points discussed"),
      }),
    )
    .optional(),

  // SECTION 12: DECLARATION
  preparedBy: z
    .string()
    .optional()
    .describe("Name of person who prepared the form"),
  preparedDate: z.string().optional().describe("Date prepared (YYYY-MM-DD)"),
  managerSignOff: z.string().optional().describe("Manager who signed off"),
  managerSignOffDate: z
    .string()
    .optional()
    .describe("Sign off date (YYYY-MM-DD)"),

  // SECTION 13: COUNTRY BY COUNTRY REPORTING
  isConstituentEntity: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Is the entity a Constituent Entity for CbCR purposes?"),

  // SECTION 14: ADDITIONAL INFORMATION
  hasPostBalanceSheetEvent: z
    .enum(["Yes", "No"])
    .optional()
    .describe("Has there been a post balance sheet event?"),
  postBalanceSheetEventDetails: z
    .string()
    .optional()
    .describe("Details of post balance sheet event"),
  hasC42Association: z
    .enum(["Yes", "No"])
    .optional()
    .describe(
      "Does the entity have a C42 association (Statement of Practice C42)?",
    ),
  c42AssociatedCompanies: z
    .string()
    .optional()
    .describe("Names of C42 associated companies"),
  contractInformation: z
    .string()
    .optional()
    .describe("Contract information (CSP standard)"),
});

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

      // Get org for account name (used as preparedBy default)
      const org = taxReturn.orgId
        ? await ctx.db.query.organisations.findFirst({
            where: eq(organisations.id, taxReturn.orgId),
          })
        : null;
      const preparedByName = org?.accountName || org?.name || "LTS Tax Limited";

      // Check if form already exists
      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (existing) {
        return existing;
      }

      // Create new form with basic info from tax return
      const [form] = await ctx.db
        .insert(substanceForms)
        .values({
          taxReturnId: input.taxReturnId,
          entityName: taxReturn.entityName,
          taxReferenceNumber: normalizeTaxReferenceNumber({
            externalId: taxReturn.externalId,
            taxYear: taxReturn.taxYear,
          }),
          // Calculate accounting period from tax year
          accountingPeriodStart: `${Number(taxReturn.taxYear) - 1}-04-06`,
          accountingPeriodEnd: `${taxReturn.taxYear}-04-05`,
          // Set defaults
          certificateType: DEFAULT_CERTIFICATE_TYPE,
          preparedBy: preparedByName,
          profitAllocation: "Investment",
          isGuernseyFiFatca: "No",
          isGuernseyFiCrs: "No",
          isRegisteredOnIgor: "No",
          isConstituentEntity: "No",
          missingFields: getMissingFields({
            preparedBy: preparedByName,
            profitAllocation: "Investment",
            isConstituentEntity: "No",
          }),
        })
        .returning();

      return form;
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

      // Get org for account name (used as preparedBy default)
      const org = taxReturn.orgId
        ? await ctx.db.query.organisations.findFirst({
            where: eq(organisations.id, taxReturn.orgId),
          })
        : null;
      const preparedByName = org?.accountName || org?.name || "LTS Tax Limited";

      // Get existing form or create one
      let form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!form) {
        const [newForm] = await ctx.db
          .insert(substanceForms)
          .values({
            taxReturnId: input.taxReturnId,
            entityName: taxReturn.entityName,
            taxReferenceNumber: normalizeTaxReferenceNumber({
              externalId: taxReturn.externalId,
              taxYear: taxReturn.taxYear,
            }),
            accountingPeriodStart: `${taxReturn.taxYear}-01-01`,
            accountingPeriodEnd: `${taxReturn.taxYear}-12-31`,
            certificateType: DEFAULT_CERTIFICATE_TYPE,
            missingFields: getMissingFields({}),
          })
          .returning();
        form = newForm!;
      }

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

      for (const url of input.fileUrls) {
        const response = await fetch(url);
        const mediaType =
          response.headers.get("content-type") || "application/pdf";
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

      // Use Vercel AI Gateway with Gemini
      const gateway = createGateway({
        apiKey,
        baseURL: "https://ai-gateway.vercel.sh/v3/ai",
      });
      const model = gateway("google/gemini-3-pro-preview");

      console.log(
        "[AI Extraction] Gateway configured, model: google/gemini-3-pro-preview",
      );

      // Build CIGA options string for the prompt
      const cigaOptionsText = Object.entries(CIGA_BY_ACTIVITY)
        .map(
          ([activity, options]) =>
            `${activity}:\n  - ${options.join("\n  - ")}`,
        )
        .join("\n\n");

      const prompt = `You are an expert at extracting information from financial and corporate documents for Guernsey Economic Substance Register reporting.

Analyze the provided document(s) and extract all relevant information to fill out a Guernsey Economic Substance Register form.

=== FORM STRUCTURE ===

SECTION 1: BACKGROUND
- Entity name, type (Company or Partnership)
- Accounting period start and end dates
- Is it a Collective Investment Vehicle?

SECTION 2: COMPANY INFORMATION
- Company number, tax reference number
- Registered address, principal place of business
- Is entity incorporated in Guernsey? (Yes/No)
- Economic classification code / Company Activity Code — REQUIRED for 2025 returns
- Certificate type (always Certificate 3)
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
- Has adequate expenditure for substance? (Yes/No/N/A)
- Has adequate physical presence? (Yes/No/N/A)
- Details about expenditure adequacy
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
- Prepared by, date
- Manager sign off, date

SECTION 13: COUNTRY BY COUNTRY REPORTING (CbCR)
- Is the entity a Constituent Entity for CbCR purposes? (Yes/No) — REQUIRED for 2025 returns, default to "No" if not specified

SECTION 14: ADDITIONAL INFORMATION
- Has there been a post balance sheet event? (Yes/No)
- Post balance sheet event details
- Does entity have C42 association (Statement of Practice C42)? (Yes/No)
- Names of C42 associated companies
- Contract information (CSP standard)

=== INSTRUCTIONS ===

For dates, extract as ISO 8601 strings (YYYY-MM-DD).
For Yes/No questions, use exactly "Yes", "No", or "N/A" where applicable.
For the relevant activity, pick the single most applicable option from the dropdown list.
Only extract information that is explicitly stated or can be clearly inferred.
Do not make up or guess values - leave fields empty if information is not available.

IMPORTANT RULES:
- accountingPeriodStart is ALWAYS "${Number(taxReturn.taxYear) - 1}-04-06" and accountingPeriodEnd is ALWAYS "${taxReturn.taxYear}-04-05". The Guernsey tax year runs 6 April to 5 April. Do NOT extract different dates from the documents.
- certificateType is ALWAYS "${DEFAULT_CERTIFICATE_TYPE}". Never return Certificate 1 or Certificate 2.
- taxReferenceNumber must preserve the exact source formatting. Do not strip leading letters and do not replace the letter "C" with the number "0".
- If total profit is negative (a loss), return "0". The portal does not accept negative values.
- If net book value is negative, return "0".
- profitAllocation is REQUIRED — always pick "Investment" or "Business" based on the entity's income type.
- economicClassificationCode is REQUIRED for 2025 returns. Always try to extract this.
- isConstituentEntity (CbCR) is REQUIRED for 2025 returns — default to "No" if not stated.
- accountsPreparerName is the ACCOUNTANT who prepared the financial accounts, NOT "LTS Tax Limited".
- relevantActivity is REQUIRED — pick the single most applicable option. If none apply, use "None of the above".
- allBoardMeetingsInGuernsey, totalBoardMeetings, boardMeetingsInGuernsey — always try to extract from minutes or directors reports.
- If the entity has no relevant activity ("None of the above"), leave sections 6B, 7, 8, 9, and 10 empty.`;

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
      const extractedData = result.object;

      // Apply defaults for fields that should have default values

      // Force correct accounting period (Guernsey tax year: 6 April to 5 April)
      extractedData.accountingPeriodStart = `${Number(taxReturn.taxYear) - 1}-04-06`;
      extractedData.accountingPeriodEnd = `${taxReturn.taxYear}-04-05`;
      extractedData.certificateType = DEFAULT_CERTIFICATE_TYPE;
      extractedData.taxReferenceNumber = normalizeTaxReferenceNumber({
        taxReferenceNumber: extractedData.taxReferenceNumber,
        externalId: taxReturn.externalId,
        taxYear: taxReturn.taxYear,
      });

      // Default preparedBy to org account name if not extracted
      if (!extractedData.preparedBy) {
        extractedData.preparedBy = preparedByName;
      }

      // Default profitAllocation to "Investment" if not extracted
      if (!extractedData.profitAllocation) {
        extractedData.profitAllocation = "Investment";
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
      if (!extractedData.isGuernseyFiFatca) {
        extractedData.isGuernseyFiFatca = "No";
      }
      if (!extractedData.isGuernseyFiCrs) {
        extractedData.isGuernseyFiCrs = "No";
      }

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
      if (!extractedData.isConstituentEntity) {
        extractedData.isConstituentEntity = "No";
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
          model: "google/gemini-3-pro-preview",
        },
      });

      return {
        form: updated,
        extractedFields: Object.keys(extractedData).filter(
          (k) => extractedData[k as keyof typeof extractedData] !== undefined,
        ),
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
        missingFields: (form.missingFields as string[]) ?? [],
      };
    }),

  // Get CIGA options for a specific activity
  getCigaOptions: publicProcedure
    .input(z.object({ activity: z.string() }))
    .query(({ input }) => {
      return CIGA_BY_ACTIVITY[input.activity] ?? [];
    }),
});
