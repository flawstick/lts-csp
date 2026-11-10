import { describe, expect, it } from "vitest";

import { getSectionCompletion, isFieldRequired } from "./return-workspace-shared";

describe("isFieldRequired: operating expenditure", () => {
  const field = "adequacyExpenditureDetails";

  it("shows the required indicator only within scope of economic substance", () => {
    expect(
      isFieldRequired(field, {
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
      }),
    ).toBe(true);
    expect(
      isFieldRequired(field, {
        certificateType: "Certificate 3",
        relevantActivity: "None of the above",
      }),
    ).toBe(false);
    expect(isFieldRequired(field, { certificateType: "Certificate 2" })).toBe(
      false,
    );
    expect(isFieldRequired(field, {})).toBe(false);
  });

  it("counts a missing value, but not zero, in section completion", () => {
    const fields = ["activityGrossIncome", field] as const;
    const inScope = {
      certificateType: "Certificate 3",
      relevantActivity: "Banking",
    } as const;

    expect(getSectionCompletion(fields, inScope).missingRequired).toBe(1);
    expect(
      getSectionCompletion(fields, {
        ...inScope,
        adequacyExpenditureDetails: "0",
      }).missingRequired,
    ).toBe(0);
    expect(
      getSectionCompletion(fields, {
        ...inScope,
        relevantActivity: "None of the above",
      }).missingRequired,
    ).toBe(0);
  });
});
