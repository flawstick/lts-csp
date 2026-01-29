import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { substanceForms, taxReturns } from "@repo/database";
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

// AI Extraction Schema - Uses inline enums to avoid Zod v4 JSON schema conversion issues
const aiExtractionSchema = z.object({
  // SECTION 1: BACKGROUND
  entityName: z.string().optional().describe("Name of the entity/company"),
  entityType: z.enum(["Company", "Partnership"]).optional().describe("Company or Partnership"),
  accountingPeriodStart: z.string().optional().describe("Start date of accounting period (YYYY-MM-DD)"),
  accountingPeriodEnd: z.string().optional().describe("End date of accounting period (YYYY-MM-DD)"),
  isCollectiveInvestmentVehicle: z.enum(["Yes", "No"]).optional().describe("Is this entity a Collective Investment Vehicle?"),

  // SECTION 2: COMPANY INFORMATION
  companyNumber: z.string().optional().describe("Company registration number"),
  taxReferenceNumber: z.string().optional().describe("Tax reference number"),
  registeredAddress: z.string().optional().describe("Registered office address"),
  principalPlaceOfBusiness: z.string().optional().describe("Principal place of business address"),
  isIncorporatedInGuernsey: z.enum(["Yes", "No"]).optional().describe("Is the entity incorporated in Guernsey?"),
  economicClassificationCode: z.string().optional().describe("Economic classification code / Company Activity Code"),
  certificateType: z.string().optional().describe("Certificate type (Certificate 1, 2, or 3)"),
  entityActivity: z.string().optional().describe("Entity activity from Directors Report"),

  // SECTION 3: PARTNERSHIP INFORMATION
  partnershipName: z.string().optional().describe("Partnership name if applicable"),
  partnershipNumber: z.string().optional().describe("Partnership registration number"),

  // SECTION 4: FINANCIAL STATEMENTS
  areFinancialStatementsConsolidated: z.enum(["Yes", "No"]).optional().describe("Are financial statements consolidated?"),
  accountsPreparerName: z.string().optional().describe("Name of accounts preparer"),
  accountsPreparerQualification: z.string().optional().describe("Qualification of preparer (ACCA, ICAEW, etc.)"),
  netBookValue: z.string().optional().describe("Net book value from Balance Sheet"),
  totalProfit: z.string().optional().describe("Total profit from Profit & Loss Account"),
  profitAllocation: z.enum(["Investment", "Business"]).optional().describe("Profit before tax allocation - Investment or Business"),

  // SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
  isGuernseyFiFatca: z.enum(["Yes", "No"]).optional().describe("Is Guernsey Financial Institution under FATCA?"),
  isGuernseyFiCrs: z.enum(["Yes", "No"]).optional().describe("Is Financial Institution under CRS?"),
  isRegisteredOnIgor: z.enum(["Yes", "No"]).optional().describe("Is registered on IGOR (Information Gateway Online Reporter) for FATCA/CRS reporting?"),

  // SECTION 6: RELEVANT ACTIVITIES
  relevantActivity: z.enum([
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
  ]).optional().describe("Primary relevant activity from the dropdown options"),
  hasMultipleRelevantActivities: z.enum(["Yes", "No"]).optional().describe("Does entity have multiple relevant activities?"),
  hasIntellectualPropertyHolding: z.enum(["Yes", "No"]).optional().describe("Does the entity have any intellectual property holding?"),

  // SECTION 6A: INTELLECTUAL PROPERTY
  isHighRiskIpEntity: z.enum(["Yes", "No"]).optional().describe("Is the entity a High Risk IP Entity as defined in legislation?"),
  wantsToRebutHighRiskStatus: z.enum(["Yes", "No"]).optional().describe("Does the entity want to rebut High Risk IP status?"),
  highRiskRebuttalNarrative: z.string().optional().describe("Narrative explaining the rebuttal of high risk status"),
  ipIncomeType: z.string().optional().describe("Type of IP income received"),

  // SECTION 6B: ADEQUACY ASSESSMENT
  hasAdequateExpenditure: z.enum(["Yes", "No", "N/A"]).optional().describe("Does the entity have adequate expenditure for substance?"),
  hasAdequatePhysicalPresence: z.enum(["Yes", "No", "N/A"]).optional().describe("Does the entity have adequate physical presence?"),
  adequacyExpenditureDetails: z.string().optional().describe("Details about adequacy of expenditure"),
  adequacyPhysicalPresenceDetails: z.string().optional().describe("Details about adequacy of physical presence"),

  // SECTION 7: CIGA
  cigaPerformed: z.string().optional().describe("Description of Core Income Generating Activities performed"),
  cigaDetails: z.string().optional().describe("Additional CIGA details from board minutes or other sources"),

  // SECTION 8: EMPLOYEES (FTE Calculation)
  employees: z.array(z.object({
    name: z.string().optional(),
    qualifiedForReporting: z.boolean().optional().describe("Is this employee qualified for reporting purposes?"),
    unitsOnCompany: z.number().optional().describe("Chargeable units spent on this company"),
    totalUnits: z.number().optional().describe("Total chargeable units"),
    fteFraction: z.number().optional().describe("FTE fraction (unitsOnCompany / totalUnits)"),
    qualifiedFteFraction: z.number().optional().describe("Qualified FTE fraction if qualified"),
  })).optional(),
  totalFte: z.number().optional().describe("Total Full-Time Equivalent employees"),
  totalQualifiedFte: z.number().optional().describe("Total Qualified FTE"),

  // SECTION 9: OUTSOURCING
  hasCigaOutsourcing: z.enum(["Yes", "No", "N/A"]).optional().describe("Are any CIGA activities outsourced?"),
  outsourcingDetails: z.string().optional().describe("Details of outsourcing arrangements"),

  // SECTION 10: BENEFICIAL OWNERSHIP
  immediateParents: z.array(z.object({
    name: z.string().optional(),
    countryOfTaxResidence: z.string().optional(),
    tin: z.string().optional().describe("Tax Identification Number"),
    tinCountry: z.string().optional().describe("Country that issued the TIN"),
    registeredAddress: z.string().optional(),
  })).optional(),
  ultimateParents: z.array(z.object({
    name: z.string().optional(),
    countryOfTaxResidence: z.string().optional(),
    tin: z.string().optional(),
    tinCountry: z.string().optional(),
    registeredAddress: z.string().optional(),
  })).optional(),
  ultimateBeneficialOwners: z.array(z.object({
    name: z.string().optional(),
    dateOfBirth: z.string().optional().describe("Date of birth (YYYY-MM-DD)"),
    placeOfBirth: z.string().optional(),
    nationality: z.string().optional(),
    countryOfTaxResidence: z.string().optional(),
    tin: z.string().optional(),
    tinCountry: z.string().optional(),
    address: z.string().optional(),
  })).optional(),

  // SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
  allBoardMeetingsInGuernsey: z.enum(["Yes", "No"]).optional().describe("Were all board meetings held in Guernsey?"),
  totalBoardMeetings: z.number().optional().describe("Total number of board meetings in the period"),
  boardMeetingsInGuernsey: z.number().optional().describe("Number of board meetings held in Guernsey"),
  adequateMeetingFrequency: z.enum(["Yes", "No", "N/A"]).optional().describe("Is the meeting frequency adequate?"),
  enoughDirectorsPresent: z.enum(["Yes", "No", "N/A"]).optional().describe("Were enough directors present at meetings?"),
  directorsHaveExpertise: z.enum(["Yes", "No", "N/A"]).optional().describe("Do directors have necessary expertise?"),
  strategicDecisionsMadeInGuernsey: z.enum(["Yes", "No", "N/A"]).optional().describe("Were strategic decisions made in Guernsey?"),
  recordsMaintainedInGuernsey: z.enum(["Yes", "No", "N/A"]).optional().describe("Are records maintained in Guernsey?"),
  boardMeetingLocation: z.string().optional().describe("Location where board meetings are held"),
  directors: z.array(z.object({
    name: z.string().optional(),
    initials: z.string().optional(),
  })).optional(),
  boardMeetings: z.array(z.object({
    date: z.string().optional().describe("Meeting date (YYYY-MM-DD)"),
    attendees: z.string().optional().describe("Names/initials of attendees"),
    allPresentInGuernsey: z.boolean().optional(),
    agendaPoints: z.string().optional().describe("Key agenda points discussed"),
  })).optional(),

  // SECTION 12: DECLARATION
  preparedBy: z.string().optional().describe("Name of person who prepared the form"),
  preparedDate: z.string().optional().describe("Date prepared (YYYY-MM-DD)"),
  managerSignOff: z.string().optional().describe("Manager who signed off"),
  managerSignOffDate: z.string().optional().describe("Sign off date (YYYY-MM-DD)"),

  // SECTION 13: COUNTRY BY COUNTRY REPORTING
  isConstituentEntity: z.enum(["Yes", "No"]).optional().describe("Is the entity a Constituent Entity for CbCR purposes?"),

  // SECTION 14: ADDITIONAL INFORMATION
  hasPostBalanceSheetEvent: z.enum(["Yes", "No"]).optional().describe("Has there been a post balance sheet event?"),
  postBalanceSheetEventDetails: z.string().optional().describe("Details of post balance sheet event"),
  hasC42Association: z.enum(["Yes", "No"]).optional().describe("Does the entity have a C42 association (Statement of Practice C42)?"),
  c42AssociatedCompanies: z.string().optional().describe("Names of C42 associated companies"),
  contractInformation: z.string().optional().describe("Contract information (CSP standard)"),
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
          taxReferenceNumber: taxReturn.externalId ?? undefined,
          // Calculate accounting period from tax year
          accountingPeriodStart: `${taxReturn.taxYear}-01-01`,
          accountingPeriodEnd: `${taxReturn.taxYear}-12-31`,
          // Set defaults
          preparedBy: "LTS Tax Limited",
          profitAllocation: "Investment",
          missingFields: getMissingFields({ preparedBy: "LTS Tax Limited" }),
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
      })
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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const apiKey = process.env.AI_GATEWAY_API_KEY;
      if (!apiKey) {
        throw new Error("AI_GATEWAY_API_KEY not configured");
      }

      console.log("[AI Extraction] Starting with", input.fileUrls.length, "files");

      // Get tax return for context
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

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
            accountingPeriodStart: `${taxReturn.taxYear}-01-01`,
            accountingPeriodEnd: `${taxReturn.taxYear}-12-31`,
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
      const supportedFileTypes = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"];
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
        const mediaType = response.headers.get("content-type") || "application/pdf";
        const buffer = await response.arrayBuffer();

        // Handle Excel files - convert to CSV
        if (excelTypes.some(t => mediaType.includes(t) || mediaType.includes("spreadsheet") || mediaType.includes("excel"))) {
          console.log(`[AI Extraction] Converting Excel file to CSV: ${mediaType}`);
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
            console.log(`[AI Extraction] Converted Excel to CSV: ${fullCsv.length} chars, ${workbook.SheetNames.length} sheets`);
            textContents.push({
              type: "text" as const,
              text: `[Excel File Content]\n${fullCsv}`,
            });
          } catch (err) {
            console.error(`[AI Extraction] Failed to convert Excel to CSV:`, err);
          }
          continue;
        }

        // Handle supported file types (PDF, images)
        if (supportedFileTypes.some(t => mediaType.startsWith(t.split("/")[0]!) || mediaType === t)) {
          const base64 = Buffer.from(buffer).toString("base64");
          fileContents.push({
            type: "file" as const,
            data: base64,
            mediaType,
          });
          continue;
        }

        console.log(`[AI Extraction] Skipping unsupported file type: ${mediaType}`);
      }

      if (fileContents.length === 0 && textContents.length === 0) {
        throw new Error("No supported files to extract from. Supported: PDF, images, Excel (.xlsx/.xls).");
      }

      // Use Vercel AI Gateway with Gemini
      const gateway = createGateway({
        apiKey,
        baseURL: "https://ai-gateway.vercel.sh/v3/ai",
      });
      const model = gateway("google/gemini-3-pro-preview");

      console.log("[AI Extraction] Gateway configured, model: google/gemini-3-pro-preview");

      // Build CIGA options string for the prompt
      const cigaOptionsText = Object.entries(CIGA_BY_ACTIVITY)
        .map(([activity, options]) => `${activity}:\n  - ${options.join("\n  - ")}`)
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
- Economic classification code / Company Activity Code
- Certificate type (Certificate 1, 2, or 3)
- Entity activity from Directors Report

SECTION 3: PARTNERSHIP INFORMATION (if applicable)
- Partnership name and number

SECTION 4: FINANCIAL STATEMENTS
- Are statements consolidated?
- Accounts preparer name and qualification
- Net book value (from Balance Sheet)
- Total profit (from Profit & Loss Account)

SECTION 5: FINANCIAL INSTITUTIONS
- FATCA and CRS status

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
- Is the entity a Constituent Entity for CbCR purposes? (Yes/No)

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
Do not make up or guess values - leave fields empty if information is not available.`;

      console.log("[AI Extraction] Calling generateObject with", fileContents.length, "file(s) and", textContents.length, "text content(s)");

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
          schemaDescription: "Guernsey Economic Substance Register form data extracted from corporate documents",
          messages: [
            {
              role: "user",
              content: messageContent,
            },
          ],
        });
      } catch (error) {
        console.error("[AI Extraction] generateObject failed:", error);
        console.error("[AI Extraction] Error details:", JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
        throw error;
      }

      console.log("[AI Extraction] Success! Extracted fields:", Object.keys(result.object).length);
      const extractedData = result.object;

      // Apply defaults for fields that should have default values
      // Default preparedBy to "LTS Tax Limited" if not extracted
      if (!extractedData.preparedBy) {
        extractedData.preparedBy = "LTS Tax Limited";
      }

      // Default profitAllocation to "Investment" if not extracted
      if (!extractedData.profitAllocation) {
        extractedData.profitAllocation = "Investment";
      }

      // Default isRegisteredOnIgor to "Yes" if entity is a financial institution (FATCA or CRS)
      if (!extractedData.isRegisteredOnIgor) {
        if (extractedData.isGuernseyFiFatca === "Yes" || extractedData.isGuernseyFiCrs === "Yes") {
          extractedData.isRegisteredOnIgor = "Yes";
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
        (k) => extractedData[k as keyof typeof extractedData] !== undefined
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
          (k) => extractedData[k as keyof typeof extractedData] !== undefined
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
