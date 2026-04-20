import { describe, expect, it } from "vitest";

import {
  FIELD_LABELS,
  FORM_SECTIONS,
  getMissingFields,
} from "./substance-form";

describe("portal Guernsey substance form schema", () => {
  it("removes deprecated guided-finish fields from visible sections", () => {
    const fields = FORM_SECTIONS.flatMap((section) => section.fields);

    expect(fields).not.toContain("hasRegisteredWithGrs");
    expect(fields).not.toContain("taxReferenceNumber");
    expect(fields).not.toContain("beneficialMemberCategories");
    expect(fields).not.toContain("hasPostBalanceSheetEvent");
    expect(fields).not.toContain("postBalanceSheetEventDetails");
    expect(fields).not.toContain("preparedBy");
    expect(fields).not.toContain("preparedDate");
  });

  it("uses the updated CbCR label", () => {
    expect(FIELD_LABELS.isConstituentEntity).toBe(
      "Is the entity a constituent entity (CbCR)?",
    );
  });

  it("requires total board meetings only for in-scope certificate 3 returns", () => {
    expect(
      getMissingFields({
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
      }),
    ).toContain("totalBoardMeetings");

    expect(
      getMissingFields({
        certificateType: "Certificate 3",
        relevantActivity: "None of the above",
      }),
    ).not.toContain("totalBoardMeetings");

    expect(
      getMissingFields({
        certificateType: "Certificate 2",
      }),
    ).not.toContain("totalBoardMeetings");
  });

  it("hides certificate 3-only sections for certificate 2 filings", () => {
    const visibleSectionIds = FORM_SECTIONS.filter((section) =>
      !("conditional" in section) || !section.conditional
        ? true
        : section.conditional({ certificateType: "Certificate 2" }),
    ).map((section) => section.id);

    expect(visibleSectionIds).not.toContain("financialStatements");
    expect(visibleSectionIds).not.toContain("economicSubstance");
    expect(visibleSectionIds).not.toContain("beneficialOwnership");
  });
});
