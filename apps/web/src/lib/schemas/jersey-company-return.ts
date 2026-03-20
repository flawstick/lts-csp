import { z } from "zod";
import {
  JERSEY_CONSOLIDATED_REVENUE_OPTIONS,
  JERSEY_CIGA_OPTIONS,
  JERSEY_ENTITY_STATUS_OPTIONS,
  JERSEY_RELEVANT_ACTIVITY_OPTIONS,
  JERSEY_RESIDENCE_OPTIONS,
  JERSEY_YES_NO_OPTIONS,
  createEmptyJerseyCompanyReturnFormData,
  getJerseyCompanyReturnMissingFields,
  isJerseyCompanyReturnComplete,
  type JerseyCompanyReturnFormData,
} from "@repo/database/jersey-company-return";

const yesNoEnum = z.enum(JERSEY_YES_NO_OPTIONS);
const residenceEnum = z.enum(JERSEY_RESIDENCE_OPTIONS);
const entityStatusEnum = z.enum(JERSEY_ENTITY_STATUS_OPTIONS);
const consolidatedRevenueEnum = z.enum(JERSEY_CONSOLIDATED_REVENUE_OPTIONS);
const relevantActivityEnum = z.enum(JERSEY_RELEVANT_ACTIVITY_OPTIONS);

export const jerseyUltimateBeneficialOwnerSchema = z.object({
  name: z.string().optional(),
  address: z.string().optional(),
});

export const jerseyOutsourcingProviderSchema = z.object({
  name: z.string().optional(),
  expenditureValue: z.string().optional(),
  tin: z.string().optional(),
  address: z.string().optional(),
  employeeFiguresIncluded: yesNoEnum.optional(),
  premisesProvided: yesNoEnum.optional(),
});

export const jerseyRelevantActivityDetailSchema = z.object({
  activity: relevantActivityEnum.optional(),
  grossIncome: z.string().optional(),
  cigaSelections: z.array(z.string()).optional(),
  otherCiga: z.string().optional(),
  attributableAccountingProfits: z.string().optional(),
  employeeCount: z.string().optional(),
  qualifiedEmployeeCount: z.string().optional(),
  premisesAddresses: z.array(z.string()).optional(),
  totalGrossExpenditureInJersey: z.string().optional(),
  outsourcingGrossExpenditureInJersey: z.string().optional(),
  hasCigaBeenOutsourced: yesNoEnum.optional(),
  outsourcingProviderCount: z.string().optional(),
  outsourcingProviders: z.array(jerseyOutsourcingProviderSchema).optional(),
  meetsSubstanceTest: yesNoEnum.optional(),
  highRiskIpCompany: yesNoEnum.optional(),
  immediateParentName: z.string().optional(),
  immediateParentAddress: z.string().optional(),
  ultimateParentName: z.string().optional(),
  ultimateParentAddress: z.string().optional(),
  ultimateBeneficialOwners: z
    .array(jerseyUltimateBeneficialOwnerSchema)
    .optional(),
  tangibleAssetsNetBookValue: z.string().optional(),
  evidenceAttached: yesNoEnum.optional(),
});

export const jerseySection1Schema = z.object({
  residence: residenceEnum.optional(),
  hasJerseyBranchOrPermanentEstablishment: yesNoEnum.optional(),
  entityStatuses: z.array(entityStatusEnum).optional(),
  accountingDateEndsInYearOfAssessment: yesNoEnum.optional(),
  areSignedFinancialStatementsAttached: yesNoEnum.optional(),
  areBranchFinancialStatementsAttached: yesNoEnum.optional(),
  activityDescription: z.string().optional(),
  sicCode: z.string().optional(),
  grossTurnover: z.string().optional(),
  accountingProfitOrLoss: z.string().optional(),
  receivesScheduleAIncome: yesNoEnum.optional(),
  jerseyResidentIndividualOwnsOverTwoPercent: yesNoEnum.optional(),
});

export const jerseyScheduleASchema = z.object({
  areScheduleAFinancialStatementsAttached: yesNoEnum.optional(),
  grossIncomeOrPremiums: z.string().optional(),
});

export const jerseyDistributionShareholderSchema = z.object({
  name: z.string().optional(),
  tin: z.string().optional(),
  address: z.string().optional(),
  amount: z.string().optional(),
});

export const jerseyDistributionsSchema = z.object({
  hasDistributionsToJerseyResidentShareholders: yesNoEnum.optional(),
  totalDistributionsAmount: z.string().optional(),
  shareholders: z.array(jerseyDistributionShareholderSchema).optional(),
});

export const jerseyConnectedPersonDeductionSchema = z.object({
  countryOfResidence: z.string().optional(),
  name: z.string().optional(),
  amount: z.string().optional(),
  address: z.string().optional(),
});

export const jerseyComplianceSchema = z.object({
  hasUltimateParentCompany: yesNoEnum.optional(),
  ultimateParentCountry: z.string().optional(),
  ultimateParentName: z.string().optional(),
  ultimateParentAddress: z.string().optional(),
  grossProfit: z.string().optional(),
  employmentCosts: z.string().optional(),
  directorsRemuneration: z.string().optional(),
  financeCosts: z.string().optional(),
  hasConnectedPersonDeductionsAboveThreshold: yesNoEnum.optional(),
  connectedPersonDeductions: z
    .array(jerseyConnectedPersonDeductionSchema)
    .optional(),
  stockValue: z.string().optional(),
  landValue: z.string().optional(),
  fixedAssetsOtherThanLandValue: z.string().optional(),
  intangibleAssetsValue: z.string().optional(),
  financeAssetsValue: z.string().optional(),
  financeLiabilitiesValue: z.string().optional(),
  tradeDebtorsValue: z.string().optional(),
  tradeCreditorsValue: z.string().optional(),
  fundValue: z.string().optional(),
});

export const jerseyEconomicSubstanceSchema = z.object({
  partOfMultiNationalGroup: yesNoEnum.optional(),
  consolidatedRevenueCategory: consolidatedRevenueEnum.optional(),
  financialPeriodsStartAfter2018: yesNoEnum.optional(),
  noRelevantActivities: yesNoEnum.optional(),
  relevantActivities: z.array(jerseyRelevantActivityDetailSchema).optional(),
  adequateFrequencyBoardMeetings: yesNoEnum.optional(),
  boardMeetingCount: z.string().optional(),
  strategicDecisionsMadeAtMeetings: yesNoEnum.optional(),
  boardMinutesKeptInJersey: yesNoEnum.optional(),
  boardHasSufficientExpertiseAndKnowledge: yesNoEnum.optional(),
});

export const jerseyAdditionalInfoSchema = z.object({
  notes: z.string().optional(),
  evidenceNotes: z.string().optional(),
});

export const jerseyCompanyReturnFormSchema = z.object({
  section1: jerseySection1Schema.optional(),
  scheduleA: jerseyScheduleASchema.optional(),
  distributions: jerseyDistributionsSchema.optional(),
  compliance: jerseyComplianceSchema.optional(),
  economicSubstance: jerseyEconomicSubstanceSchema.optional(),
  additionalInfo: jerseyAdditionalInfoSchema.optional(),
});

export type JerseyCompanyReturnFormInput = z.infer<
  typeof jerseyCompanyReturnFormSchema
>;

export const JERSEY_FORM_SECTION_LABELS = [
  {
    id: "section1",
    title: "Section 1",
    description: "Resident status, statements, activity summary, SIC, and Schedule A gating.",
  },
  {
    id: "economicSubstance",
    title: "Economic Substance",
    description: "Relevant activities, CIGA, outsourcing, and board management tests.",
  },
  {
    id: "scheduleA",
    title: "Schedule A",
    description: "Only required when Jersey Schedule A income or premiums apply.",
  },
  {
    id: "distributions",
    title: "Distributions",
    description: "Distributions to Jersey-resident shareholders.",
  },
  {
    id: "compliance",
    title: "Compliance",
    description: "Ultimate parent, connected persons, and financial statement metrics.",
  },
  {
    id: "additionalInfo",
    title: "Additional Info",
    description: "Notes and supporting evidence context.",
  },
] as const;

export function sanitizeJerseyCompanyReturnData(
  form: unknown,
): Partial<JerseyCompanyReturnFormData> {
  if (!form || typeof form !== "object") {
    return createEmptyJerseyCompanyReturnFormData();
  }

  return {
    ...createEmptyJerseyCompanyReturnFormData(),
    ...(form as Partial<JerseyCompanyReturnFormData>),
    section1: {
      ...createEmptyJerseyCompanyReturnFormData().section1,
      ...((form as Partial<JerseyCompanyReturnFormData>).section1 ?? {}),
    },
    scheduleA: {
      ...createEmptyJerseyCompanyReturnFormData().scheduleA,
      ...((form as Partial<JerseyCompanyReturnFormData>).scheduleA ?? {}),
    },
    distributions: {
      ...createEmptyJerseyCompanyReturnFormData().distributions,
      ...((form as Partial<JerseyCompanyReturnFormData>).distributions ?? {}),
    },
    compliance: {
      ...createEmptyJerseyCompanyReturnFormData().compliance,
      ...((form as Partial<JerseyCompanyReturnFormData>).compliance ?? {}),
    },
    economicSubstance: {
      ...createEmptyJerseyCompanyReturnFormData().economicSubstance,
      ...((form as Partial<JerseyCompanyReturnFormData>).economicSubstance ??
        {}),
      relevantActivities:
        (form as Partial<JerseyCompanyReturnFormData>).economicSubstance
          ?.relevantActivities ?? [],
    },
    additionalInfo: {
      ...createEmptyJerseyCompanyReturnFormData().additionalInfo,
      ...((form as Partial<JerseyCompanyReturnFormData>).additionalInfo ?? {}),
    },
  };
}

export {
  JERSEY_CIGA_OPTIONS,
  JERSEY_CONSOLIDATED_REVENUE_OPTIONS,
  JERSEY_ENTITY_STATUS_OPTIONS,
  JERSEY_RELEVANT_ACTIVITY_OPTIONS,
  JERSEY_RESIDENCE_OPTIONS,
  createEmptyJerseyCompanyReturnFormData,
  getJerseyCompanyReturnMissingFields,
  isJerseyCompanyReturnComplete,
};
