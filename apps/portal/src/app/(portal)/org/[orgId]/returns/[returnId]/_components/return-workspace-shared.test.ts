import { describe, expect, it } from "vitest";

import { MANAGER_SIGNOFF_REQUIRED_MESSAGE } from "@repo/database/return-readiness";

import {
  describeChangedFields,
  getApprovalBlocker,
  getSectionCompletion,
  isFieldRequired,
} from "./return-workspace-shared";

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

describe("getApprovalBlocker", () => {
  // A complete Certificate 3 ESR, manager signed off, accounts attached:
  // the state of a return whose signoff was revoked by an edit and now
  // needs the signatory to approve it again.
  const ready = {
    isFormComplete: true,
    isManagerSignedOff: true,
    requiresFinancialStatements: true,
    hasFinancialStatements: true,
    pendingGbpConversionMessage: null,
  };

  it("lets the signatory re-approve a complete, manager-signed return with accounts", () => {
    expect(getApprovalBlocker(ready)).toBeNull();
  });

  it("explains each reason approval is unavailable, in order", () => {
    expect(getApprovalBlocker({ ...ready, isFormComplete: false })).toMatch(
      /required field/,
    );
    expect(getApprovalBlocker({ ...ready, isManagerSignedOff: false })).toBe(
      MANAGER_SIGNOFF_REQUIRED_MESSAGE,
    );
    expect(
      getApprovalBlocker({ ...ready, hasFinancialStatements: false }),
    ).toMatch(/financial statements/);
    expect(
      getApprovalBlocker({
        ...ready,
        pendingGbpConversionMessage: "Enter the GBP figures.",
      }),
    ).toBe("Enter the GBP figures.");
  });

  it("does not require accounts for Certificate 2", () => {
    expect(
      getApprovalBlocker({
        ...ready,
        requiresFinancialStatements: false,
        hasFinancialStatements: false,
      }),
    ).toBeNull();
  });
});

describe("describeChangedFields", () => {
  it("names changed fields by their form labels", () => {
    expect(
      describeChangedFields(["adequacyExpenditureDetails", "hasAdequateEmployees"]),
    ).toBe(
      "Operating Expenditure Relating to the Activity, Adequate Number of Employees?",
    );
  });

  it("summarises long lists", () => {
    expect(describeChangedFields(["a", "b", "c", "d", "e", "f"], 4)).toBe(
      "a, b, c, d and 2 more",
    );
  });
});
