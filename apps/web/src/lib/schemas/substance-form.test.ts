import { describe, expect, it } from "vitest";

import {
  FIELD_LABELS,
  FORM_SECTIONS,
  getMissingFields,
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
});
