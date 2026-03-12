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

// Outsourcer (structured - matches MS Form)
export const outsourcerSchema = z.object({
  name: z.string().optional(),
  fteProvided: z.number().optional(),
  totalExpense: z.string().optional(),
  companyRegistrationNumber: z.string().optional(),
  isExclusivelyGuernsey: yesNoEnum.optional(),
  country: z.string().optional(),
  hasAdequateSupervision: yesNoEnum.optional(),
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

  // Entity Structure
  isIncorporatedInGuernsey: yesNoEnum.optional(),
  economicClassificationCode: z.string().optional(), // Company Activity Code
  certificateType: z.string().optional(), // Certificate 1, 2, or 3
  entityActivity: z.string().optional(), // From Directors Report
  isGuernseyTaxResident: yesNoEnum.optional(),
  hasRegisteredWithGrs: yesNoEnum.optional(),
  beneficialMemberCategories: z.array(z.string()).optional(), // Tick-box categories

  // =========================================================================
  // SECTION 3: PARTNERSHIP INFORMATION (if applicable)
  // =========================================================================
  partnershipName: z.string().optional(),
  partnershipNumber: z.string().optional(),
  isSolelyGuernseyPartners: yesNoEnum.optional(),
  partnershipActivitiesWhollyInGuernsey: yesNoEnum.optional(),
  partnershipPoeMOutsideGuernsey: yesNoEnum.optional(),

  // =========================================================================
  // SECTION 4: FINANCIAL STATEMENTS
  // =========================================================================
  areFinancialStatementsConsolidated: yesNoEnum.optional(),
  accountsPreparerName: z.string().optional(),
  accountsPreparerQualification: z.string().optional(), // e.g. ACCA, ICAEW
  netBookValue: z.string().optional(), // From Balance Sheet
  totalProfit: z.string().optional(), // From P&L Account
  profitAllocation: z.enum(["Investment", "Business"]).optional(), // Profit before tax allocation

  // =========================================================================
  // SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
  // =========================================================================
  isGuernseyFiFatca: yesNoEnum.optional(), // Is Guernsey Financial Institution under FATCA?
  isRegisteredWithIgor: yesNoEnum.optional(), // IGOR - Information Gateway Online Reporter
  igorNotRegisteredReason: z.string().optional(),
  isGuernseyFiCrs: yesNoEnum.optional(), // Is Financial Institution under CRS?

  // =========================================================================
  // SECTION 6: RELEVANT ACTIVITIES
  // =========================================================================
  relevantActivity: relevantActivityEnum.optional(),
  cigaCheckboxes: z.array(z.string()).optional(), // CIGA tick-boxes for the relevant activity
  hasMultipleRelevantActivities: yesNoEnum.optional(),
  secondRelevantActivity: relevantActivityEnum.optional(),
  secondCigaCheckboxes: z.array(z.string()).optional(),
  hasIntellectualPropertyHolding: yesNoEnum.optional(), // Does entity have IP?

  // =========================================================================
  // SECTION 6A: INTELLECTUAL PROPERTY (if IP Holding Company)
  // =========================================================================
  isHighRiskIpEntity: yesNoEnum.optional(),
  wantsToRebutHighRiskStatus: yesNoEnum.optional(),
  highRiskRebuttalNarrative: z.string().optional(),
  ipIncomeType: z.string().optional(),

  // =========================================================================
  // SECTION 6B: ADEQUACY ASSESSMENT
  // =========================================================================
  hasAdequateExpenditure: yesNoNaEnum.optional(),
  hasAdequatePhysicalPresence: yesNoNaEnum.optional(),
  adequacyExpenditureDetails: z.string().optional(),
  adequacyPhysicalPresenceDetails: z.string().optional(),

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
  hasAdequateEmployees: yesNoNaEnum.optional(),

  // =========================================================================
  // SECTION 9: OUTSOURCING
  // =========================================================================
  hasCigaOutsourcing: yesNoNaEnum.optional(),
  outsourcingDetails: z.string().optional(),
  outsourcerCount: z.number().optional(),
  outsourcers: z.array(outsourcerSchema).optional(),

  // =========================================================================
  // SECTION 10: BENEFICIAL OWNERSHIP
  // =========================================================================
  hasFailedEconomicSubstance: yesNoEnum.optional(),
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

  // =========================================================================
  // SECTION 13: COUNTRY BY COUNTRY REPORTING (CbCR)
  // =========================================================================
  isConstituentEntity: yesNoEnum.optional(),
  mneReportingEntityName: z.string().optional(),
  mneReportingEntityCountry: z.string().optional(),
  mneAccountingPeriodStart: z.string().optional(),
  mneAccountingPeriodEnd: z.string().optional(),
  isPillar2InScope: yesNoEnum.optional(),
  upeName: z.string().optional(),
  upeLocation: z.string().optional(),
  expectConstituentEntityNextPeriod: yesNoEnum.optional(),

  // =========================================================================
  // SECTION 14: ADDITIONAL INFORMATION
  // =========================================================================
  hasPostBalanceSheetEvent: yesNoEnum.optional(),
  postBalanceSheetEventDetails: z.string().optional(),
  hasC42Association: yesNoEnum.optional(), // Statement of Practice C42
  c42SubmissionDate: z.string().optional(),
  c42AssociatedCompanies: z.string().optional(),
  contractInformation: z.string().optional(), // CSP standard contract info
  additionalInformation: z.string().optional(), // "Would you like to add any further information?"
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
  "economicClassificationCode",
  "profitAllocation",
  "isConstituentEntity",
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
  const hasRelevantActivity =
    data.relevantActivity !== undefined &&
    data.relevantActivity !== null &&
    data.relevantActivity !== "None of the above";

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

  // Only require substance-related fields when entity has a relevant activity
  if (hasRelevantActivity) {
    if (data.hasCigaOutsourcing === "Yes" && !data.outsourcingDetails) {
      missing.push("outsourcingDetails");
    }
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
  isIncorporatedInGuernsey: "Is Entity Incorporated in Guernsey?",
  economicClassificationCode: "Company Activity Code",
  certificateType: "Certificate Type",
  entityActivity: "Entity Activity",
  isGuernseyTaxResident: "Is the Company Guernsey Tax Resident?",
  hasRegisteredWithGrs: "Has Registered with the GRS?",
  beneficialMemberCategories: "Beneficial Member Categories",

  // Partnership Information
  partnershipName: "Partnership Name",
  partnershipNumber: "Partnership Number",
  isSolelyGuernseyPartners: "Solely Guernsey Individual Partners?",
  partnershipActivitiesWhollyInGuernsey: "Activities Wholly in Guernsey?",
  partnershipPoeMOutsideGuernsey: "Place of Effective Management Outside Guernsey?",

  // Financial Statements
  areFinancialStatementsConsolidated: "Are Financial Statements Consolidated?",
  accountsPreparerName: "Accounts Preparer Name",
  accountsPreparerQualification: "Preparer Qualification (e.g. ACCA, ICAEW)",
  netBookValue: "Net Book Value",
  totalProfit: "Total Profit",
  profitAllocation: "Profit Before Tax Allocation",

  // Financial Institutions
  isGuernseyFiFatca: "Is Guernsey FI under FATCA?",
  isRegisteredWithIgor: "Is Registered with IGOR?",
  igorNotRegisteredReason: "Reason Not Registered with IGOR",
  isGuernseyFiCrs: "Is Guernsey FI under CRS?",

  // Relevant Activities
  relevantActivity: "Relevant Activity",
  cigaCheckboxes: "CIGA Performed (Checkboxes)",
  hasMultipleRelevantActivities: "Has Multiple Relevant Activities?",
  secondRelevantActivity: "Second Relevant Activity",
  secondCigaCheckboxes: "Second Activity CIGA (Checkboxes)",
  hasIntellectualPropertyHolding: "Does Entity Have IP Holding?",

  // Intellectual Property
  isHighRiskIpEntity: "Is High Risk IP Entity?",
  wantsToRebutHighRiskStatus: "Wants to Rebut High Risk Status?",
  highRiskRebuttalNarrative: "High Risk Rebuttal Narrative",
  ipIncomeType: "IP Income Type",

  // Adequacy Assessment
  hasAdequateExpenditure: "Has Adequate Expenditure?",
  hasAdequatePhysicalPresence: "Has Adequate Physical Presence?",
  adequacyExpenditureDetails: "Adequacy Expenditure Details",
  adequacyPhysicalPresenceDetails: "Adequacy Physical Presence Details",

  // CIGA
  cigaPerformed: "CIGA Performed",
  cigaDetails: "CIGA Details from Board Minutes",

  // Employees
  employees: "Employees (FTE)",
  totalFte: "Total FTE",
  totalQualifiedFte: "Total Qualified FTE",
  hasAdequateEmployees: "Adequate Number of Employees?",

  // Outsourcing
  hasCigaOutsourcing: "Any CIGA Outsourcing?",
  outsourcingDetails: "Outsourcing Details",
  outsourcerCount: "Number of Outsourcers",
  outsourcers: "Outsourcers",

  // Beneficial Ownership
  hasFailedEconomicSubstance: "Failed Economic Substance Declaration?",
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

  // Country by Country Reporting
  isConstituentEntity: "Is Constituent Entity (CbCR)?",
  mneReportingEntityName: "MNE Reporting Entity Name",
  mneReportingEntityCountry: "MNE Reporting Entity Country",
  mneAccountingPeriodStart: "MNE Accounting Period Start",
  mneAccountingPeriodEnd: "MNE Accounting Period End",
  isPillar2InScope: "In-scope of Pillar 2 Global Minimum Tax?",
  upeName: "Ultimate Parent Entity (UPE) Name",
  upeLocation: "Ultimate Parent Entity (UPE) Location",
  expectConstituentEntityNextPeriod: "Expected Constituent Entity Next Period?",

  // Additional Information
  hasPostBalanceSheetEvent: "Has Post Balance Sheet Event?",
  postBalanceSheetEventDetails: "Post Balance Sheet Event Details",
  hasC42Association: "Has C42 Application?",
  c42SubmissionDate: "C42 Application Submission Date",
  c42AssociatedCompanies: "C42 Associated Companies",
  contractInformation: "Contract Information (CSP)",
  additionalInformation: "Additional Information",
};

// ============================================================================
// SECTION DEFINITIONS (for UI organization)
// ============================================================================

export const FORM_SECTIONS = [
  // ── General Information ──────────────────────────────────────────────
  {
    id: "generalInfo",
    title: "General Information",
    description: "Entity name, accounting period, and entity type",
    fields: [
      "entityName",
      "accountingPeriodStart",
      "accountingPeriodEnd",
      "isCollectiveInvestmentVehicle",
      "entityType",
    ],
  },
  {
    id: "companyInfo",
    title: "Company Information",
    description: "Company activity code, tax residency, and GRS registration",
    fields: [
      "economicClassificationCode",
      "isGuernseyTaxResident",
      "hasRegisteredWithGrs",
      "taxReferenceNumber",
      "beneficialMemberCategories",
    ],
    conditional: (data: Partial<SubstanceFormData>) => data.entityType === "Company",
  },
  {
    id: "partnershipInfo",
    title: "Partnership Information",
    description: "Partnership registration and Guernsey status",
    fields: [
      "partnershipName",
      "partnershipNumber",
      "hasRegisteredWithGrs",
      "isSolelyGuernseyPartners",
      "partnershipActivitiesWhollyInGuernsey",
      "partnershipPoeMOutsideGuernsey",
    ],
    conditional: (data: Partial<SubstanceFormData>) => data.entityType === "Partnership",
  },
  {
    id: "financialStatements",
    title: "Financial Statements",
    description: "Consolidation, preparer details, and key financial figures",
    fields: [
      "areFinancialStatementsConsolidated",
      "accountsPreparerName",
      "accountsPreparerQualification",
      "netBookValue",
      "totalProfit",
      "profitAllocation",
    ],
  },
  {
    id: "financialInstitutions",
    title: "Financial Institutions (FATCA/CRS)",
    description: "FATCA, IGOR, and CRS registration status",
    fields: [
      "isGuernseyFiFatca",
      "isRegisteredWithIgor",
      "igorNotRegisteredReason",
      "isGuernseyFiCrs",
    ],
  },
  {
    id: "cbcr",
    title: "Country by Country Reporting",
    description: "Constituent entity status, MNE details, and Pillar 2",
    fields: [
      "isConstituentEntity",
      "mneReportingEntityName",
      "mneReportingEntityCountry",
      "mneAccountingPeriodStart",
      "mneAccountingPeriodEnd",
      "isPillar2InScope",
      "upeName",
      "upeLocation",
      "expectConstituentEntityNextPeriod",
    ],
  },
  {
    id: "c42",
    title: "Statement of Practice C42",
    description: "C42 application status",
    fields: [
      "hasC42Association",
      "c42SubmissionDate",
      "c42AssociatedCompanies",
    ],
  },

  // ── Economic Substance ───────────────────────────────────────────────
  {
    id: "economicSubstance",
    title: "Economic Substance",
    description: "Relevant activities and core income generating activities (CIGA)",
    fields: [
      "relevantActivity",
      "cigaCheckboxes",
      "cigaPerformed",
      "cigaDetails",
    ],
  },
  {
    id: "substanceRequirements",
    title: "Economic Substance Requirements",
    description: "FTE employees, physical presence, and outsourcing",
    fields: [
      "totalFte",
      "totalQualifiedFte",
      "employees",
      "hasAdequateEmployees",
      "hasAdequatePhysicalPresence",
      "hasAdequateExpenditure",
      "hasCigaOutsourcing",
      "outsourcerCount",
      "outsourcers",
      "outsourcingDetails",
    ],
    conditional: (data: Partial<SubstanceFormData>) =>
      data.relevantActivity !== undefined && data.relevantActivity !== "None of the above",
  },
  {
    id: "economicSubstance2",
    title: "Economic Substance 2",
    description: "Additional relevant activity if income from more than one",
    fields: [
      "hasMultipleRelevantActivities",
      "secondRelevantActivity",
      "secondCigaCheckboxes",
    ],
    conditional: (data: Partial<SubstanceFormData>) =>
      data.relevantActivity !== undefined && data.relevantActivity !== "None of the above",
  },
  {
    id: "intellectualProperty",
    title: "Intellectual Property",
    description: "IP holding company details and high-risk status",
    fields: [
      "hasIntellectualPropertyHolding",
      "isHighRiskIpEntity",
      "wantsToRebutHighRiskStatus",
      "highRiskRebuttalNarrative",
      "ipIncomeType",
    ],
    conditional: (data: Partial<SubstanceFormData>) =>
      data.relevantActivity === "Intellectual Property Holding Company" || data.hasIntellectualPropertyHolding === "Yes",
  },

  // ── Ownership & Governance ───────────────────────────────────────────
  {
    id: "beneficialOwnership",
    title: "Beneficial Ownership",
    description: "Parent entities and ultimate beneficial owners",
    fields: [
      "hasFailedEconomicSubstance",
      "immediateParents",
      "ultimateParents",
      "ultimateBeneficialOwners",
    ],
    conditional: (data: Partial<SubstanceFormData>) =>
      data.relevantActivity !== undefined && data.relevantActivity !== "None of the above",
  },
  {
    id: "directedManaged",
    title: "Directed and Managed in Guernsey",
    description: "Board meetings, directors, and decision-making in Guernsey",
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

  // ── Finalising ───────────────────────────────────────────────────────
  {
    id: "finalising",
    title: "Finalising the Return",
    description: "Additional information, declaration, and sign-off",
    fields: [
      "additionalInformation",
      "hasPostBalanceSheetEvent",
      "postBalanceSheetEventDetails",
      "preparedBy",
      "preparedDate",
      "managerSignOff",
      "managerSignOffDate",
    ],
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
