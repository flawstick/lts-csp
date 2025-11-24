import { z } from "zod";

// ============================================================================
// ENUMS - Based on actual Guernsey form dropdown options
// ============================================================================

export const entityTypeEnum = z.enum(["Company", "Partnership"]);

export const yesNoEnum = z.enum(["Yes", "No"]);

export const yesNoNaEnum = z.enum(["Yes", "No", "N/A"]);

export const relevantActivityEnum = z.enum([
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
]);

// ============================================================================
// SUB-SCHEMAS - Matching actual form structure
// ============================================================================

// Immediate/Ultimate Parent entity
export const parentEntitySchema = z.object({
  name: z.string().optional(),
  countryOfTaxResidence: z.string().optional(),
  tin: z.string().optional(),
  tinCountry: z.string().optional(),
  registeredAddress: z.string().optional(),
});

// Ultimate Beneficial Owner (individual)
export const uboSchema = z.object({
  name: z.string().optional(),
  dateOfBirth: z.string().optional(),
  placeOfBirth: z.string().optional(),
  nationality: z.string().optional(),
  countryOfTaxResidence: z.string().optional(),
  tin: z.string().optional(),
  tinCountry: z.string().optional(),
  address: z.string().optional(),
});

// Employee for FTE Calculation
export const employeeFteSchema = z.object({
  name: z.string().optional(),
  qualifiedForReporting: z.boolean().optional(),
  unitsOnCompany: z.number().optional(), // Units spent on this company
  totalUnits: z.number().optional(), // Total chargeable units
  fteFraction: z.number().optional(), // Calculated: unitsOnCompany / totalUnits
  qualifiedFteFraction: z.number().optional(), // If qualified, same as fteFraction
});

// Director
export const directorSchema = z.object({
  name: z.string().optional(),
  initials: z.string().optional(),
});

// Board Meeting
export const boardMeetingSchema = z.object({
  date: z.string().optional(),
  attendees: z.string().optional(),
  allPresentInGuernsey: z.boolean().optional(),
  agendaPoints: z.string().optional(),
});

// ============================================================================
// MAIN SUBSTANCE FORM SCHEMA - Matching Guernsey Economic Substance Register
// ============================================================================

export const substanceFormSchema = z.object({
  // =========================================================================
  // SECTION 1: BACKGROUND
  // =========================================================================
  entityName: z.string().optional(),
  entityType: entityTypeEnum.optional(),
  accountingPeriodStart: z.string().optional(), // Date as string YYYY-MM-DD
  accountingPeriodEnd: z.string().optional(),
  isCollectiveInvestmentVehicle: yesNoEnum.optional(),

  // =========================================================================
  // SECTION 2: COMPANY INFORMATION
  // =========================================================================
  companyNumber: z.string().optional(),
  taxReferenceNumber: z.string().optional(),
  registeredAddress: z.string().optional(),
  principalPlaceOfBusiness: z.string().optional(),

  // =========================================================================
  // SECTION 3: PARTNERSHIP INFORMATION (if applicable)
  // =========================================================================
  partnershipName: z.string().optional(),
  partnershipNumber: z.string().optional(),

  // =========================================================================
  // SECTION 4: FINANCIAL STATEMENTS
  // =========================================================================
  areFinancialStatementsConsolidated: yesNoEnum.optional(),
  accountsPreparerName: z.string().optional(),
  accountsPreparerQualification: z.string().optional(), // e.g. ACCA, ICAEW

  // =========================================================================
  // SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
  // =========================================================================
  isGuernseyFiFatca: yesNoEnum.optional(), // Is Guernsey Financial Institution under FATCA?
  isGuernseyFiCrs: yesNoEnum.optional(), // Is Financial Institution under CRS?

  // =========================================================================
  // SECTION 6: RELEVANT ACTIVITIES
  // =========================================================================
  relevantActivity: relevantActivityEnum.optional(),
  hasMultipleRelevantActivities: yesNoEnum.optional(),

  // =========================================================================
  // SECTION 7: CORE INCOME GENERATING ACTIVITIES (CIGA)
  // =========================================================================
  cigaPerformed: z.string().optional(), // Description of CIGA performed
  cigaDetails: z.string().optional(), // Extra CIGA information from board minutes

  // =========================================================================
  // SECTION 8: EMPLOYEES (FTE Calculation)
  // =========================================================================
  employees: z.array(employeeFteSchema).optional(),
  totalFte: z.number().optional(),
  totalQualifiedFte: z.number().optional(),

  // =========================================================================
  // SECTION 9: OUTSOURCING
  // =========================================================================
  hasCigaOutsourcing: yesNoNaEnum.optional(),
  outsourcingDetails: z.string().optional(),

  // =========================================================================
  // SECTION 10: BENEFICIAL OWNERSHIP
  // =========================================================================
  immediateParents: z.array(parentEntitySchema).optional(),
  ultimateParents: z.array(parentEntitySchema).optional(),
  ultimateBeneficialOwners: z.array(uboSchema).optional(),

  // =========================================================================
  // SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
  // =========================================================================
  allBoardMeetingsInGuernsey: yesNoEnum.optional(),
  totalBoardMeetings: z.number().optional(),
  boardMeetingsInGuernsey: z.number().optional(),
  adequateMeetingFrequency: yesNoNaEnum.optional(),
  enoughDirectorsPresent: yesNoNaEnum.optional(),
  directorsHaveExpertise: yesNoNaEnum.optional(),
  strategicDecisionsMadeInGuernsey: yesNoNaEnum.optional(),
  recordsMaintainedInGuernsey: yesNoNaEnum.optional(),

  // Board Meeting Details (from summary sheet)
  boardMeetingLocation: z.string().optional(),
  directors: z.array(directorSchema).optional(),
  boardMeetings: z.array(boardMeetingSchema).optional(),

  // =========================================================================
  // SECTION 12: DECLARATION
  // =========================================================================
  preparedBy: z.string().optional(),
  preparedDate: z.string().optional(),
  managerSignOff: z.string().optional(),
  managerSignOffDate: z.string().optional(),
});

export type SubstanceFormData = z.infer<typeof substanceFormSchema>;

// ============================================================================
// REQUIRED FIELDS FOR COMPLETION
// ============================================================================

export const REQUIRED_FIELDS: (keyof SubstanceFormData)[] = [
  "entityName",
  "entityType",
  "accountingPeriodStart",
  "accountingPeriodEnd",
  "relevantActivity",
  "allBoardMeetingsInGuernsey",
  "totalBoardMeetings",
  "boardMeetingsInGuernsey",
  "preparedBy",
  "preparedDate",
];

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

export function getMissingFields(data: Partial<SubstanceFormData>): string[] {
  const missing: string[] = [];

  for (const field of REQUIRED_FIELDS) {
    const value = data[field];
    if (value === undefined || value === null || value === "") {
      missing.push(field);
    }
  }

  // Conditional requirements
  if (data.entityType === "Partnership") {
    if (!data.partnershipName) missing.push("partnershipName");
  }

  if (data.hasCigaOutsourcing === "Yes" && !data.outsourcingDetails) {
    missing.push("outsourcingDetails");
  }

  return missing;
}

export function isFormComplete(data: Partial<SubstanceFormData>): boolean {
  return getMissingFields(data).length === 0;
}

// ============================================================================
// FIELD LABELS (for UI display)
// ============================================================================

export const FIELD_LABELS: Record<string, string> = {
  // Background
  entityName: "Entity Name",
  entityType: "Company or Partnership",
  accountingPeriodStart: "Accounting Period Start",
  accountingPeriodEnd: "Accounting Period End",
  isCollectiveInvestmentVehicle: "Is Collective Investment Vehicle?",

  // Company Information
  companyNumber: "Company Number",
  taxReferenceNumber: "Tax Reference Number",
  registeredAddress: "Registered Address",
  principalPlaceOfBusiness: "Principal Place of Business",

  // Partnership Information
  partnershipName: "Partnership Name",
  partnershipNumber: "Partnership Number",

  // Financial Statements
  areFinancialStatementsConsolidated: "Are Financial Statements Consolidated?",
  accountsPreparerName: "Accounts Preparer Name",
  accountsPreparerQualification: "Preparer Qualification (e.g. ACCA, ICAEW)",

  // Financial Institutions
  isGuernseyFiFatca: "Is Guernsey FI under FATCA?",
  isGuernseyFiCrs: "Is Guernsey FI under CRS?",

  // Relevant Activities
  relevantActivity: "Relevant Activity",
  hasMultipleRelevantActivities: "Has Multiple Relevant Activities?",

  // CIGA
  cigaPerformed: "CIGA Performed",
  cigaDetails: "CIGA Details from Board Minutes",

  // Employees
  employees: "Employees (FTE)",
  totalFte: "Total FTE",
  totalQualifiedFte: "Total Qualified FTE",

  // Outsourcing
  hasCigaOutsourcing: "Any CIGA Outsourcing?",
  outsourcingDetails: "Outsourcing Details",

  // Beneficial Ownership
  immediateParents: "Immediate Parents",
  ultimateParents: "Ultimate Parents",
  ultimateBeneficialOwners: "Ultimate Beneficial Owners",

  // Directed and Managed
  allBoardMeetingsInGuernsey: "All Board Meetings in Guernsey?",
  totalBoardMeetings: "Total Board Meetings",
  boardMeetingsInGuernsey: "Board Meetings Held in Guernsey",
  adequateMeetingFrequency: "Adequate Meeting Frequency?",
  enoughDirectorsPresent: "Enough Directors Present?",
  directorsHaveExpertise: "Directors Have Necessary Expertise?",
  strategicDecisionsMadeInGuernsey: "Strategic Decisions Made in Guernsey?",
  recordsMaintainedInGuernsey: "Records Maintained in Guernsey?",
  boardMeetingLocation: "Board Meeting Location",
  directors: "Directors",
  boardMeetings: "Board Meetings",

  // Declaration
  preparedBy: "Prepared By",
  preparedDate: "Prepared Date",
  managerSignOff: "Manager Sign Off",
  managerSignOffDate: "Manager Sign Off Date",
};

// ============================================================================
// SECTION DEFINITIONS (for UI organization)
// ============================================================================

export const FORM_SECTIONS = [
  {
    id: "background",
    title: "Background",
    description: "Basic entity information and accounting period",
    fields: [
      "entityName",
      "entityType",
      "accountingPeriodStart",
      "accountingPeriodEnd",
      "isCollectiveInvestmentVehicle",
    ],
  },
  {
    id: "company",
    title: "Company Information",
    description: "Company registration and address details",
    fields: [
      "companyNumber",
      "taxReferenceNumber",
      "registeredAddress",
      "principalPlaceOfBusiness",
    ],
  },
  {
    id: "partnership",
    title: "Partnership Information",
    description: "Required if entity is a partnership",
    fields: ["partnershipName", "partnershipNumber"],
    conditional: (data: Partial<SubstanceFormData>) => data.entityType === "Partnership",
  },
  {
    id: "financialStatements",
    title: "Financial Statements",
    description: "Details about the entity's financial statements",
    fields: [
      "areFinancialStatementsConsolidated",
      "accountsPreparerName",
      "accountsPreparerQualification",
    ],
  },
  {
    id: "financialInstitutions",
    title: "Financial Institutions (FATCA/CRS)",
    description: "Financial institution status for tax reporting",
    fields: ["isGuernseyFiFatca", "isGuernseyFiCrs"],
  },
  {
    id: "relevantActivities",
    title: "Relevant Activities",
    description: "Income-generating activities performed by the entity",
    fields: ["relevantActivity", "hasMultipleRelevantActivities"],
  },
  {
    id: "ciga",
    title: "Core Income Generating Activities (CIGA)",
    description: "Details of CIGA performed for the relevant activity",
    fields: ["cigaPerformed", "cigaDetails"],
  },
  {
    id: "employees",
    title: "Employees (FTE Calculation)",
    description: "Full-time equivalent employee calculations",
    fields: ["employees", "totalFte", "totalQualifiedFte"],
  },
  {
    id: "outsourcing",
    title: "Outsourcing",
    description: "Details of any outsourced CIGA",
    fields: ["hasCigaOutsourcing", "outsourcingDetails"],
  },
  {
    id: "beneficialOwnership",
    title: "Beneficial Ownership",
    description: "Parent entities and ultimate beneficial owners",
    fields: ["immediateParents", "ultimateParents", "ultimateBeneficialOwners"],
  },
  {
    id: "directedManaged",
    title: "Directed and Managed in Guernsey",
    description: "Board meetings and decision-making in Guernsey",
    fields: [
      "allBoardMeetingsInGuernsey",
      "totalBoardMeetings",
      "boardMeetingsInGuernsey",
      "adequateMeetingFrequency",
      "enoughDirectorsPresent",
      "directorsHaveExpertise",
      "strategicDecisionsMadeInGuernsey",
      "recordsMaintainedInGuernsey",
      "boardMeetingLocation",
      "directors",
      "boardMeetings",
    ],
  },
  {
    id: "declaration",
    title: "Declaration",
    description: "Sign-off by preparer and manager",
    fields: ["preparedBy", "preparedDate", "managerSignOff", "managerSignOffDate"],
  },
] as const;

// ============================================================================
// CIGA OPTIONS BY RELEVANT ACTIVITY (from dropdown options sheet)
// ============================================================================

export const CIGA_BY_ACTIVITY: Record<string, string[]> = {
  Banking: [
    "Raising funds, managing risk including credit, currency and interest risk",
    "Taking hedging positions",
    "Providing loans, credit or other financial services to customers",
    "Managing capital and preparing reports and returns for bodies of investors",
  ],
  "Financing and leasing": [
    "Agreeing funding terms",
    "Identifying and acquiring assets to be leased",
    "Setting the terms and duration of any financing or leasing",
    "Monitoring and revising any agreements",
    "Managing risk",
  ],
  "Fund management": [
    "Taking decisions on the holding and selling of investments",
    "Calculating risk and reserves",
    "Taking decisions on currency or interest fluctuations and hedging positions",
    "Preparing reports and returns to investors and the relevant bodies",
  ],
  Insurance: [
    "Predicting and calculating risk",
    "Insuring or re-insuring against risk",
    "Providing client services",
  ],
  "Distribution and Service Centre": [
    "Transporting and storing goods, components and materials",
    "Managing stocks",
    "Taking orders",
    "Providing consulting or other administrative services",
  ],
  Headquarters: [
    "Taking relevant management decisions",
    "Incurring expenditures on behalf of group entities",
    "Co-ordinating group activities",
  ],
  Shipping: [
    "Managing crew",
    "Hauling and maintaining ships",
    "Overseeing and tracking deliveries",
    "Determining what goods to order and when to deliver them",
    "Organising and overseeing voyages",
  ],
  "Intellectual Property Holding Company": [
    "Refer to LTS Tax for further information",
  ],
};
