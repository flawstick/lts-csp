export const JERSEY_YES_NO_OPTIONS = ["Yes", "No"] as const;
export type JerseyYesNo = (typeof JERSEY_YES_NO_OPTIONS)[number];

export const JERSEY_RESIDENCE_OPTIONS = ["Jersey", "Overseas"] as const;
export type JerseyResidence = (typeof JERSEY_RESIDENCE_OPTIONS)[number];

export const JERSEY_CONSOLIDATED_REVENUE_OPTIONS = [
  "EUR 750m and below",
  "Above EUR 750m",
  "Not disclosed",
] as const;
export type JerseyConsolidatedRevenueCategory =
  (typeof JERSEY_CONSOLIDATED_REVENUE_OPTIONS)[number];

export const JERSEY_ENTITY_STATUS_OPTIONS = [
  "Financial service company",
  "Company (other) / Opaque LLC",
  "Large corporate retailer",
  "Utility company",
  "Hydro carbon importer / supplier",
  "Public CIF",
  "Unincorporated body / Association / Cooperative",
  "Private CIF",
  "ISV",
  "Exempt other",
  "Registered pension company",
  "Foundation",
  "Charity",
] as const;
export type JerseyEntityStatus = (typeof JERSEY_ENTITY_STATUS_OPTIONS)[number];

export const JERSEY_RELEVANT_ACTIVITY_OPTIONS = [
  "Banking Business",
  "Insurance Business",
  "Fund Management Business",
  "Finance & Leasing Business",
  "Headquarters Business",
  "Shipping Business",
  "Holding Company Business",
  "Distribution and Service Centre Business",
  "Intellectual Property Holding Business",
] as const;
export type JerseyRelevantActivity =
  (typeof JERSEY_RELEVANT_ACTIVITY_OPTIONS)[number];

export const JERSEY_CIGA_OPTIONS: Record<
  JerseyRelevantActivity,
  readonly string[]
> = {
  "Banking Business": [
    "Raising funds, managing risk including credit, currency and interest risk",
    "Taking hedging positions",
    "Providing loans, credit or other financial services to customers",
    "Managing capital and preparing reports and returns relating to regulation",
  ],
  "Insurance Business": [
    "Predicting and calculating risk",
    "Insuring or re-insuring against risk and providing insurance business services to clients",
  ],
  "Fund Management Business": [
    "Taking decisions on the holding and selling of investments",
    "Calculating risk and reserves",
    "Taking decisions on currency or interest fluctuations and hedging positions",
    "Preparing reports and returns relating to regulation",
  ],
  "Finance & Leasing Business": [
    "Agreeing funding terms",
    "Identifying and acquiring assets to be leased",
    "Setting the terms and duration of financing or leasing",
    "Monitoring and revising agreements",
    "Managing risks",
  ],
  "Headquarters Business": [
    "Taking relevant management decisions",
    "Incurring expenditures on behalf of group entities",
    "Co-ordinating group activities",
  ],
  "Shipping Business": [
    "Managing crew, including hiring, paying and overseeing crew members",
    "Overhauling and maintaining ships",
    "Overseeing and tracking deliveries",
    "Determining what goods to order and when to deliver them, organising and overseeing voyages",
  ],
  "Holding Company Business": [],
  "Distribution and Service Centre Business": [
    "Transporting and storing goods, components and materials",
    "Managing stocks",
    "Taking orders",
    "Providing consulting or other administrative services",
  ],
  "Intellectual Property Holding Business": [
    "Taking strategic decisions and managing the principal risks related to development and exploitation of the intangible asset",
    "Taking strategic decisions and managing the principal risks relating to acquisition by third parties and subsequent exploitation and protection of the intangible asset",
    "Carrying on the underlying trading activities through which the intangible assets are exploited",
    "Research and development, branding or distribution",
  ],
};

export interface JerseyUltimateBeneficialOwner {
  name?: string;
  address?: string;
}

export interface JerseyOutsourcingProvider {
  name?: string;
  expenditureValue?: string;
  tin?: string;
  address?: string;
  employeeFiguresIncluded?: JerseyYesNo;
  premisesProvided?: JerseyYesNo;
}

export interface JerseyRelevantActivityDetail {
  activity?: JerseyRelevantActivity;
  grossIncome?: string;
  cigaSelections?: string[];
  otherCiga?: string;
  attributableAccountingProfits?: string;
  employeeCount?: string;
  qualifiedEmployeeCount?: string;
  premisesAddresses?: string[];
  totalGrossExpenditureInJersey?: string;
  outsourcingGrossExpenditureInJersey?: string;
  hasCigaBeenOutsourced?: JerseyYesNo;
  outsourcingProviderCount?: string;
  outsourcingProviders?: JerseyOutsourcingProvider[];
  meetsSubstanceTest?: JerseyYesNo;
  highRiskIpCompany?: JerseyYesNo;
  immediateParentName?: string;
  immediateParentAddress?: string;
  ultimateParentName?: string;
  ultimateParentAddress?: string;
  ultimateBeneficialOwners?: JerseyUltimateBeneficialOwner[];
  tangibleAssetsNetBookValue?: string;
  evidenceAttached?: JerseyYesNo;
}

export interface JerseyCompanyReturnSection1Data {
  residence?: JerseyResidence;
  hasJerseyBranchOrPermanentEstablishment?: JerseyYesNo;
  entityStatuses?: JerseyEntityStatus[];
  accountingDateEndsInYearOfAssessment?: JerseyYesNo;
  areSignedFinancialStatementsAttached?: JerseyYesNo;
  areBranchFinancialStatementsAttached?: JerseyYesNo;
  activityDescription?: string;
  sicCode?: string;
  grossTurnover?: string;
  accountingProfitOrLoss?: string;
  receivesScheduleAIncome?: JerseyYesNo;
  jerseyResidentIndividualOwnsOverTwoPercent?: JerseyYesNo;
}

export interface JerseyCompanyReturnScheduleAData {
  areScheduleAFinancialStatementsAttached?: JerseyYesNo;
  grossIncomeOrPremiums?: string;
}

export interface JerseyDistributionShareholder {
  name?: string;
  tin?: string;
  address?: string;
  amount?: string;
}

export interface JerseyCompanyReturnDistributionsData {
  hasDistributionsToJerseyResidentShareholders?: JerseyYesNo;
  totalDistributionsAmount?: string;
  shareholders?: JerseyDistributionShareholder[];
}

export interface JerseyConnectedPersonDeduction {
  countryOfResidence?: string;
  name?: string;
  amount?: string;
  address?: string;
}

export interface JerseyCompanyReturnComplianceData {
  hasUltimateParentCompany?: JerseyYesNo;
  ultimateParentCountry?: string;
  ultimateParentName?: string;
  ultimateParentAddress?: string;
  grossProfit?: string;
  employmentCosts?: string;
  directorsRemuneration?: string;
  financeCosts?: string;
  hasConnectedPersonDeductionsAboveThreshold?: JerseyYesNo;
  connectedPersonDeductions?: JerseyConnectedPersonDeduction[];
  stockValue?: string;
  landValue?: string;
  fixedAssetsOtherThanLandValue?: string;
  intangibleAssetsValue?: string;
  financeAssetsValue?: string;
  financeLiabilitiesValue?: string;
  tradeDebtorsValue?: string;
  tradeCreditorsValue?: string;
  fundValue?: string;
}

export interface JerseyEconomicSubstanceData {
  partOfMultiNationalGroup?: JerseyYesNo;
  consolidatedRevenueCategory?: JerseyConsolidatedRevenueCategory;
  financialPeriodsStartAfter2018?: JerseyYesNo;
  noRelevantActivities?: JerseyYesNo;
  relevantActivities?: JerseyRelevantActivityDetail[];
  adequateFrequencyBoardMeetings?: JerseyYesNo;
  boardMeetingCount?: string;
  strategicDecisionsMadeAtMeetings?: JerseyYesNo;
  boardMinutesKeptInJersey?: JerseyYesNo;
  boardHasSufficientExpertiseAndKnowledge?: JerseyYesNo;
}

export interface JerseyCompanyReturnAdditionalInfoData {
  notes?: string;
  evidenceNotes?: string;
}

export interface JerseyCompanyReturnFormData {
  section1: JerseyCompanyReturnSection1Data;
  scheduleA: JerseyCompanyReturnScheduleAData;
  distributions: JerseyCompanyReturnDistributionsData;
  compliance: JerseyCompanyReturnComplianceData;
  economicSubstance: JerseyEconomicSubstanceData;
  additionalInfo: JerseyCompanyReturnAdditionalInfoData;
}

const JERSEY_STATUS_EXEMPT_FROM_FINANCIAL_FIELDS = new Set<
  JerseyEntityStatus
>(["Public CIF", "Charity", "Foundation", "Registered pension company"]);

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((entry) => isFilled(entry));
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

function normalizeNumberString(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[^0-9.-]/g, "");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiresSection1FinancialFields(
  statuses: JerseyEntityStatus[] | undefined,
): boolean {
  if (!statuses || statuses.length === 0) {
    return true;
  }

  return !statuses.every((status) =>
    JERSEY_STATUS_EXEMPT_FROM_FINANCIAL_FIELDS.has(status),
  );
}

function hasPositiveGrossIncome(activity: JerseyRelevantActivityDetail): boolean {
  const value = normalizeNumberString(activity.grossIncome);
  return value !== null && value > 0;
}

export function createEmptyJerseyCompanyReturnFormData(): JerseyCompanyReturnFormData {
  return {
    section1: {},
    scheduleA: {},
    distributions: {},
    compliance: {},
    economicSubstance: {
      relevantActivities: [],
    },
    additionalInfo: {},
  };
}

export function getJerseyCompanyReturnMissingFields(
  input: Partial<JerseyCompanyReturnFormData> | null | undefined,
): string[] {
  const data = {
    ...createEmptyJerseyCompanyReturnFormData(),
    ...(input ?? {}),
    section1: {
      ...createEmptyJerseyCompanyReturnFormData().section1,
      ...(input?.section1 ?? {}),
    },
    scheduleA: {
      ...createEmptyJerseyCompanyReturnFormData().scheduleA,
      ...(input?.scheduleA ?? {}),
    },
    distributions: {
      ...createEmptyJerseyCompanyReturnFormData().distributions,
      ...(input?.distributions ?? {}),
    },
    compliance: {
      ...createEmptyJerseyCompanyReturnFormData().compliance,
      ...(input?.compliance ?? {}),
    },
    economicSubstance: {
      ...createEmptyJerseyCompanyReturnFormData().economicSubstance,
      ...(input?.economicSubstance ?? {}),
      relevantActivities: input?.economicSubstance?.relevantActivities ?? [],
    },
    additionalInfo: {
      ...createEmptyJerseyCompanyReturnFormData().additionalInfo,
      ...(input?.additionalInfo ?? {}),
    },
  };

  const missing: string[] = [];
  const { section1, scheduleA, economicSubstance } = data;

  if (!isFilled(section1.residence)) {
    missing.push("section1.residence");
  }

  if (
    section1.residence === "Overseas" &&
    !isFilled(section1.hasJerseyBranchOrPermanentEstablishment)
  ) {
    missing.push("section1.hasJerseyBranchOrPermanentEstablishment");
  }

  if (!isFilled(section1.entityStatuses)) {
    missing.push("section1.entityStatuses");
  }

  if (!isFilled(section1.accountingDateEndsInYearOfAssessment)) {
    missing.push("section1.accountingDateEndsInYearOfAssessment");
  }

  const needsFinancialFields =
    section1.accountingDateEndsInYearOfAssessment === "Yes" &&
    (section1.residence === "Jersey" ||
      section1.hasJerseyBranchOrPermanentEstablishment === "Yes");

  if (needsFinancialFields) {
    if (
      section1.residence === "Jersey" &&
      !isFilled(section1.areSignedFinancialStatementsAttached)
    ) {
      missing.push("section1.areSignedFinancialStatementsAttached");
    }

    if (
      section1.residence === "Overseas" &&
      section1.hasJerseyBranchOrPermanentEstablishment === "Yes" &&
      !isFilled(section1.areBranchFinancialStatementsAttached)
    ) {
      missing.push("section1.areBranchFinancialStatementsAttached");
    }

    if (requiresSection1FinancialFields(section1.entityStatuses)) {
      if (!isFilled(section1.activityDescription)) {
        missing.push("section1.activityDescription");
      }
      if (!isFilled(section1.sicCode)) {
        missing.push("section1.sicCode");
      }
      if (!isFilled(section1.grossTurnover)) {
        missing.push("section1.grossTurnover");
      }
      if (!isFilled(section1.accountingProfitOrLoss)) {
        missing.push("section1.accountingProfitOrLoss");
      }
    }
  }

  if (!isFilled(section1.receivesScheduleAIncome)) {
    missing.push("section1.receivesScheduleAIncome");
  }

  if (
    section1.receivesScheduleAIncome === "Yes" &&
    !isFilled(scheduleA.grossIncomeOrPremiums)
  ) {
    missing.push("scheduleA.grossIncomeOrPremiums");
  }

  if (
    section1.residence === "Jersey" &&
    !isFilled(section1.jerseyResidentIndividualOwnsOverTwoPercent)
  ) {
    missing.push("section1.jerseyResidentIndividualOwnsOverTwoPercent");
  }

  if (!isFilled(economicSubstance.partOfMultiNationalGroup)) {
    missing.push("economicSubstance.partOfMultiNationalGroup");
  }

  if (
    economicSubstance.partOfMultiNationalGroup === "Yes" &&
    !isFilled(economicSubstance.consolidatedRevenueCategory)
  ) {
    missing.push("economicSubstance.consolidatedRevenueCategory");
  }

  if (!isFilled(economicSubstance.financialPeriodsStartAfter2018)) {
    missing.push("economicSubstance.financialPeriodsStartAfter2018");
  }

  if (economicSubstance.financialPeriodsStartAfter2018 === "Yes") {
    const relevantActivities = economicSubstance.relevantActivities ?? [];

    if (
      economicSubstance.noRelevantActivities !== "Yes" &&
      relevantActivities.length === 0
    ) {
      missing.push("economicSubstance.relevantActivities");
    }

    relevantActivities.forEach((activity, index) => {
      const prefix = `economicSubstance.relevantActivities[${index}]`;

      if (!isFilled(activity.activity)) {
        missing.push(`${prefix}.activity`);
      }

      if (!isFilled(activity.grossIncome)) {
        missing.push(`${prefix}.grossIncome`);
      }

      if (
        activity.activity !== "Holding Company Business" &&
        !isFilled(activity.cigaSelections) &&
        !isFilled(activity.otherCiga)
      ) {
        missing.push(`${prefix}.cigaSelections`);
      }

      if (!isFilled(activity.attributableAccountingProfits)) {
        missing.push(`${prefix}.attributableAccountingProfits`);
      }

      if (!isFilled(activity.employeeCount)) {
        missing.push(`${prefix}.employeeCount`);
      }

      if (!isFilled(activity.qualifiedEmployeeCount)) {
        missing.push(`${prefix}.qualifiedEmployeeCount`);
      }

      if (!isFilled(activity.premisesAddresses)) {
        missing.push(`${prefix}.premisesAddresses`);
      }

      if (!isFilled(activity.totalGrossExpenditureInJersey)) {
        missing.push(`${prefix}.totalGrossExpenditureInJersey`);
      }

      if (!isFilled(activity.outsourcingGrossExpenditureInJersey)) {
        missing.push(`${prefix}.outsourcingGrossExpenditureInJersey`);
      }

      if (!isFilled(activity.meetsSubstanceTest)) {
        missing.push(`${prefix}.meetsSubstanceTest`);
      }

      if (!isFilled(activity.hasCigaBeenOutsourced)) {
        missing.push(`${prefix}.hasCigaBeenOutsourced`);
      }

      if (activity.hasCigaBeenOutsourced === "Yes") {
        if (!isFilled(activity.outsourcingProviderCount)) {
          missing.push(`${prefix}.outsourcingProviderCount`);
        }

        if (!isFilled(activity.outsourcingProviders)) {
          missing.push(`${prefix}.outsourcingProviders`);
        } else {
          (activity.outsourcingProviders ?? []).forEach((provider, providerIndex) => {
            const providerPrefix = `${prefix}.outsourcingProviders[${providerIndex}]`;

            if (!isFilled(provider.name)) {
              missing.push(`${providerPrefix}.name`);
            }

            if (!isFilled(provider.expenditureValue)) {
              missing.push(`${providerPrefix}.expenditureValue`);
            }

            if (!isFilled(provider.tin) && !isFilled(provider.address)) {
              missing.push(`${providerPrefix}.tinOrAddress`);
            }

            if (!isFilled(provider.employeeFiguresIncluded)) {
              missing.push(`${providerPrefix}.employeeFiguresIncluded`);
            }

            if (!isFilled(provider.premisesProvided)) {
              missing.push(`${providerPrefix}.premisesProvided`);
            }
          });
        }
      }

      if (activity.activity === "Intellectual Property Holding Business") {
        if (!isFilled(activity.highRiskIpCompany)) {
          missing.push(`${prefix}.highRiskIpCompany`);
        }

        if (activity.highRiskIpCompany === "Yes") {
          if (!isFilled(activity.immediateParentName)) {
            missing.push(`${prefix}.immediateParentName`);
          }
          if (!isFilled(activity.immediateParentAddress)) {
            missing.push(`${prefix}.immediateParentAddress`);
          }
          if (!isFilled(activity.ultimateParentName)) {
            missing.push(`${prefix}.ultimateParentName`);
          }
          if (!isFilled(activity.ultimateParentAddress)) {
            missing.push(`${prefix}.ultimateParentAddress`);
          }
          if (!isFilled(activity.tangibleAssetsNetBookValue)) {
            missing.push(`${prefix}.tangibleAssetsNetBookValue`);
          }
          if (!isFilled(activity.evidenceAttached)) {
            missing.push(`${prefix}.evidenceAttached`);
          }
        }
      }
    });

    const hasRelevantActivityWithIncome = relevantActivities.some(
      (activity) => hasPositiveGrossIncome(activity),
    );

    if (hasRelevantActivityWithIncome) {
      if (!isFilled(economicSubstance.adequateFrequencyBoardMeetings)) {
        missing.push("economicSubstance.adequateFrequencyBoardMeetings");
      }
      if (!isFilled(economicSubstance.boardMeetingCount)) {
        missing.push("economicSubstance.boardMeetingCount");
      }
      if (!isFilled(economicSubstance.strategicDecisionsMadeAtMeetings)) {
        missing.push("economicSubstance.strategicDecisionsMadeAtMeetings");
      }
      if (!isFilled(economicSubstance.boardMinutesKeptInJersey)) {
        missing.push("economicSubstance.boardMinutesKeptInJersey");
      }
      if (
        !isFilled(economicSubstance.boardHasSufficientExpertiseAndKnowledge)
      ) {
        missing.push(
          "economicSubstance.boardHasSufficientExpertiseAndKnowledge",
        );
      }
    }
  }

  return Array.from(new Set(missing));
}

export function isJerseyCompanyReturnComplete(
  input: Partial<JerseyCompanyReturnFormData> | null | undefined,
): boolean {
  return getJerseyCompanyReturnMissingFields(input).length === 0;
}
