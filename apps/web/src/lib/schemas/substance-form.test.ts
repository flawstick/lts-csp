import { describe, expect, it } from "vitest";

import {
  FIELD_LABELS,
  FORM_SECTIONS,
  getMissingFields,
  isFormComplete,
  type SubstanceFormData,
} from "./substance-form";

describe("web Guernsey substance form schema", () => {
  it("does not treat removed fields as required", () => {
    const missingFields = getMissingFields({
      certificateType: "Certificate 3",
      relevantActivity: "Banking",
    });

    expect(missingFields).not.toContain("preparedBy");
    expect(missingFields).not.toContain("preparedDate");
    expect(missingFields).not.toContain("hasPostBalanceSheetEvent");
    expect(missingFields).not.toContain("postBalanceSheetEventDetails");
    expect(missingFields).not.toContain("taxReferenceNumber");
  });

  it("uses the updated constituent-entity wording and reduced certificate 2 flow", () => {
    expect(FIELD_LABELS.isConstituentEntity).toBe(
      "Is the entity a constituent entity (CbCR)?",
    );

    const visibleSectionIds = FORM_SECTIONS.filter((section) =>
      !("conditional" in section) || !section.conditional
        ? true
        : section.conditional({ certificateType: "Certificate 2" }),
    ).map((section) => section.id);

    expect(visibleSectionIds).not.toContain("financialStatements");
    expect(visibleSectionIds).not.toContain("relevantActivities");
    expect(visibleSectionIds).not.toContain("beneficialOwnership");
  });

  it("requires Guernsey incorporation for companies but not partnerships", () => {
    expect(
      getMissingFields({
        certificateType: "Certificate 3",
        entityType: "Company",
      }),
    ).toContain("isIncorporatedInGuernsey");

    expect(
      getMissingFields({
        certificateType: "Certificate 3",
        entityType: "Company",
        isIncorporatedInGuernsey: "No",
      }),
    ).not.toContain("isIncorporatedInGuernsey");

    expect(
      getMissingFields({
        certificateType: "Certificate 3",
        entityType: "Partnership",
      }),
    ).not.toContain("isIncorporatedInGuernsey");
  });

  describe("operating expenditure relating to the activity", () => {
    // Every other completion requirement satisfied, so only the field under
    // test can make the form incomplete.
    const completeInScope = {
      entityName: "Example Ltd",
      entityType: "Company",
      isIncorporatedInGuernsey: "Yes",
      accountingPeriodStart: "2025-01-01",
      accountingPeriodEnd: "2025-12-31",
      economicClassificationCode: "64",
      profitAllocation: "Business",
      isConstituentEntity: "No",
      certificateType: "Certificate 3",
      relevantActivity: "Banking",
      totalBoardMeetings: 4,
      adequacyExpenditureDetails: "46508",
    } as const;

    it("is complete with a positive amount when in scope", () => {
      expect(getMissingFields(completeInScope)).toEqual([]);
      expect(isFormComplete(completeInScope)).toBe(true);
    });

    it("treats zero as a supplied value when in scope", () => {
      expect(
        getMissingFields({ ...completeInScope, adequacyExpenditureDetails: "0" }),
      ).toEqual([]);
    });

    it("blocks completion when blank, null or undefined in scope", () => {
      for (const adequacyExpenditureDetails of [undefined, null, "", "   "]) {
        const data = {
          ...completeInScope,
          adequacyExpenditureDetails,
        } as unknown as Partial<SubstanceFormData>;
        expect(getMissingFields(data)).toEqual(["adequacyExpenditureDetails"]);
        expect(isFormComplete(data)).toBe(false);
      }
    });

    it("is not required when out of scope", () => {
      expect(
        getMissingFields({
          ...completeInScope,
          relevantActivity: "None of the above",
          adequacyExpenditureDetails: undefined,
        }),
      ).toEqual([]);
      expect(
        getMissingFields({
          certificateType: "Certificate 2",
          entityName: "Dormant Ltd",
          entityType: "Company",
          isIncorporatedInGuernsey: "Yes",
          accountingPeriodStart: "2025-01-01",
          accountingPeriodEnd: "2025-12-31",
          isConstituentEntity: "No",
        }),
      ).toEqual([]);
    });

    it("re-evaluates when scope is toggled", () => {
      const outOfScope = {
        ...completeInScope,
        relevantActivity: "None of the above",
        adequacyExpenditureDetails: undefined,
      } as const;
      expect(getMissingFields(outOfScope)).not.toContain("adequacyExpenditureDetails");
      expect(
        getMissingFields({ ...outOfScope, relevantActivity: "Fund management" }),
      ).toContain("adequacyExpenditureDetails");
    });

    it("keeps existing completeness checks alongside it", () => {
      const missing = getMissingFields({
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
      });
      expect(missing).toEqual(
        expect.arrayContaining([
          "entityName",
          "totalBoardMeetings",
          "adequacyExpenditureDetails",
        ]),
      );
    });

    it("has a label for missing-field lists", () => {
      expect(FIELD_LABELS.adequacyExpenditureDetails).toBe(
        "Operating Expenditure Relating to the Activity",
      );
    });
  });
});
