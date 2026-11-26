import { describe, expect, it } from "vitest";

import {
  buildSubmissionSignoffRevocation,
  confirmFinancialFiguresMetadata,
  getChangedFormFields,
  getFilingApprovalCapacity,
  getPendingGbpConversionMessage,
  getPendingReapproval,
  getReturnDisplayStatus,
  getReturnReadinessState,
  hasManagerSignoff,
  isApprovalOfStaleForm,
  isPendingGbpConversion,
  normalizeCurrencyCode,
  parseFinancialFiguresMetadata,
  requiresManagerSignoff,
  resolveExtractedFinancialFigures,
  stripManagerSignoffFields,
  withFinancialFiguresMetadata,
  withSubmissionSignoffMetadata,
} from "./return-readiness";

const now = new Date("2026-11-03T10:00:00Z");

describe("submission signoff", () => {
  it("only treats a return as ready once it is signed off", () => {
    expect(
      getReturnReadinessState({
        status: "pending",
        readyForSubmissionAt: null,
        isFormComplete: true,
      }),
    ).toBe("awaiting_signoff");
    expect(
      getReturnReadinessState({
        status: "pending",
        readyForSubmissionAt: now,
        isFormComplete: true,
      }),
    ).toBe("signed_off");
    expect(
      getReturnReadinessState({ status: "pending", missingFieldCount: 2 }),
    ).toBe("missing_fields");
    expect(getReturnReadinessState({ status: "completed" })).toBe("signed_off");
  });

  it("requires the manager's name and date for a manager signoff", () => {
    expect(hasManagerSignoff(null)).toBe(false);
    expect(hasManagerSignoff({ managerSignOff: "J Smith" })).toBe(false);
    expect(
      hasManagerSignoff({ managerSignOff: "  ", managerSignOffDate: "2026-11-01" }),
    ).toBe(false);
    expect(
      hasManagerSignoff({
        managerSignOff: "J Smith",
        managerSignOffDate: "2026-11-01",
      }),
    ).toBe(true);
    expect(requiresManagerSignoff({ returnType: "economic_substance" })).toBe(true);
    expect(requiresManagerSignoff({ returnType: "company" })).toBe(false);
  });

  it("keeps a drafted ESR awaiting manager signoff before client signoff", () => {
    const esr = { requiresManagerSignoff: true, isFormComplete: true };
    expect(
      getReturnReadinessState({ ...esr, status: "pending", hasManagerSignoff: false }),
    ).toBe("awaiting_manager_signoff");
    expect(
      getReturnReadinessState({ ...esr, status: "pending", hasManagerSignoff: true }),
    ).toBe("awaiting_signoff");
    expect(
      getReturnReadinessState({
        ...esr,
        status: "pending",
        hasManagerSignoff: true,
        readyForSubmissionAt: now,
      }),
    ).toBe("signed_off");
    // A client signoff recorded without the manager's signoff is not an approval.
    expect(
      getReturnReadinessState({
        ...esr,
        status: "pending",
        hasManagerSignoff: false,
        readyForSubmissionAt: now,
      }),
    ).toBe("awaiting_manager_signoff");
    // Incomplete drafts stay incomplete regardless of manager signoff.
    expect(
      getReturnReadinessState({
        requiresManagerSignoff: true,
        hasManagerSignoff: true,
        status: "pending",
        isFormComplete: false,
        missingFieldCount: 1,
      }),
    ).toBe("missing_fields");
    // Already filed returns stay signed off.
    expect(
      getReturnReadinessState({ ...esr, status: "completed", hasManagerSignoff: false }),
    ).toBe("signed_off");
  });

  it("never lets AI extraction record a manager signoff", () => {
    expect(
      stripManagerSignoffFields({
        entityName: "B Settlement Ltd",
        managerSignOff: "Extracted Name",
        managerSignOffDate: "2025-01-01",
        noticeOfAssessment: "Yes",
      }),
    ).toEqual({ entityName: "B Settlement Ltd" });
  });

  it("detects only fields whose value actually changed", () => {
    expect(
      getChangedFormFields(
        { isIncorporatedInGuernsey: null, totalFte: 2, entityName: "A" },
        { isIncorporatedInGuernsey: "Yes", totalFte: 2, entityName: "A" },
      ),
    ).toEqual(["isIncorporatedInGuernsey"]);
    expect(getChangedFormFields({ entityName: null }, { entityName: "" })).toEqual(
      [],
    );
  });

  it("treats the notice of assessment by its effective answer", () => {
    // Unset already means Yes: saving Yes over it is not a change.
    expect(
      getChangedFormFields({ noticeOfAssessment: null }, { noticeOfAssessment: "Yes" }),
    ).toEqual([]);
    expect(
      getChangedFormFields({ noticeOfAssessment: "Yes" }, { noticeOfAssessment: null }),
    ).toEqual([]);
    expect(
      getChangedFormFields({ noticeOfAssessment: null }, { noticeOfAssessment: "No" }),
    ).toEqual(["noticeOfAssessment"]);
    expect(
      getChangedFormFields({ noticeOfAssessment: "No" }, { noticeOfAssessment: null }),
    ).toEqual(["noticeOfAssessment"]);
  });

  it("revokes signoff when filing data changes after approval", () => {
    const patch = buildSubmissionSignoffRevocation({
      taxReturn: {
        status: "pending",
        metadata: { source: "Guernsey Tax Portal" },
        readyForSubmissionAt: new Date("2026-11-01T09:00:00Z"),
        readyForSubmissionBy: "signatory-id",
      },
      changedFields: ["isIncorporatedInGuernsey"],
      actor: { source: "web" },
      now,
    });

    expect(patch).toMatchObject({
      readyForSubmissionAt: null,
      readyForSubmissionBy: null,
      metadata: {
        source: "Guernsey Tax Portal",
        submissionSignoffRevoked: {
          source: "web",
          changedFields: ["isIncorporatedInGuernsey"],
          previousSignoffAt: "2026-11-01T09:00:00.000Z",
          previousSignoffBy: "signatory-id",
        },
      },
    });
  });

  it("leaves unsigned, unchanged or filed returns alone", () => {
    const base = {
      changedFields: ["totalFte"],
      actor: { source: "portal" as const },
    };
    expect(
      buildSubmissionSignoffRevocation({
        ...base,
        taxReturn: { status: "pending", readyForSubmissionAt: null },
      }),
    ).toBeNull();
    expect(
      buildSubmissionSignoffRevocation({
        ...base,
        changedFields: [],
        taxReturn: { status: "pending", readyForSubmissionAt: now },
      }),
    ).toBeNull();
    expect(
      buildSubmissionSignoffRevocation({
        ...base,
        taxReturn: { status: "completed", readyForSubmissionAt: now },
      }),
    ).toBeNull();
  });
});

describe("financial statement currency", () => {
  it("normalises common currency labels", () => {
    expect(normalizeCurrencyCode("£")).toBe("GBP");
    expect(normalizeCurrencyCode("Pounds Sterling")).toBe("GBP");
    expect(normalizeCurrencyCode("US Dollars")).toBe("USD");
    expect(normalizeCurrencyCode("euro")).toBe("EUR");
    expect(normalizeCurrencyCode("jpy")).toBe("JPY");
    expect(normalizeCurrencyCode("Singapore dollars")).toBe("Singapore dollars");
    expect(normalizeCurrencyCode("  ")).toBeNull();
  });

  it("writes GBP figures unchanged", () => {
    const result = resolveExtractedFinancialFigures({
      currency: "GBP",
      totalProfit: "-12500",
      netBookValue: "40000",
      existing: {},
      now,
    });

    expect(result.totalProfit).toBe("-12500");
    expect(result.netBookValue).toBe("40000");
    expect(result.warning).toBeNull();
    expect(isPendingGbpConversion(withFinancialFiguresMetadata({}, result.metadata))).toBe(false);
  });

  it("never writes USD net assets as if they were GBP", () => {
    const result = resolveExtractedFinancialFigures({
      currency: "USD",
      totalProfit: "-8200",
      netBookValue: "150000",
      existing: {},
      now,
    });

    expect(result.totalProfit).toBeUndefined();
    expect(result.netBookValue).toBeUndefined();
    expect(result.warning).toContain("USD");

    const metadata = withFinancialFiguresMetadata({}, result.metadata);
    expect(isPendingGbpConversion(metadata)).toBe(true);
    expect(getPendingGbpConversionMessage(metadata)).toContain("GBP");
  });

  it("uses GBP amounts stated in foreign-currency accounts", () => {
    const result = resolveExtractedFinancialFigures({
      currency: "EUR",
      totalProfit: "100000",
      netBookValue: "250000",
      totalProfitGbp: "85000",
      netBookValueGbp: "212500",
      existing: {},
      now,
    });

    expect(result.totalProfit).toBe("85000");
    expect(result.netBookValue).toBe("212500");
    expect(
      isPendingGbpConversion(withFinancialFiguresMetadata({}, result.metadata)),
    ).toBe(false);
  });

  it("clears stale EUR values left by an earlier extraction on rerun", () => {
    const previousMetadata = withFinancialFiguresMetadata(
      {},
      {
        currency: "EUR",
        gbpStated: false,
        sourceTotalProfit: "90000",
        sourceNetBookValue: "240000",
        extractedAt: "2026-10-01T00:00:00.000Z",
        gbpConfirmedAt: null,
      },
    );

    // Amended accounts: new EUR figures; saved form still holds the old EUR
    // profit, while net book value was already entered by a person in GBP.
    const result = resolveExtractedFinancialFigures({
      currency: "EUR",
      totalProfit: "100000",
      netBookValue: "250000",
      existing: { totalProfit: "90000", netBookValue: "201000" },
      previousMetadata,
      now,
    });

    expect(result.totalProfit).toBeNull();
    expect(result.netBookValue).toBeUndefined();
  });

  it("clears a saved value that matches the new foreign figure", () => {
    const result = resolveExtractedFinancialFigures({
      currency: "EUR",
      totalProfit: "100000",
      existing: { totalProfit: "100,000" },
      now,
    });
    expect(result.totalProfit).toBeNull();
  });

  it("treats saving profit or net book value as GBP confirmation", () => {
    const metadata = withFinancialFiguresMetadata(
      {},
      {
        currency: "USD",
        gbpStated: false,
        sourceTotalProfit: "1",
        sourceNetBookValue: "2",
        extractedAt: null,
        gbpConfirmedAt: null,
      },
    );

    expect(confirmFinancialFiguresMetadata(metadata, ["totalFte"], now)).toBeNull();
    const confirmed = confirmFinancialFiguresMetadata(
      metadata,
      ["netBookValue"],
      now,
    );
    expect(isPendingGbpConversion(confirmed)).toBe(false);
  });

  it("records a person's Net Book Value entry, and only for that field", () => {
    const extracted = withFinancialFiguresMetadata(
      {},
      {
        currency: "GBP",
        gbpStated: false,
        sourceTotalProfit: "1",
        sourceNetBookValue: "-2894",
        extractedAt: "2026-11-01T00:00:00.000Z",
        gbpConfirmedAt: null,
      },
    );
    const profitOnly = confirmFinancialFiguresMetadata(extracted, ["totalProfit"], now);
    expect(parseFinancialFiguresMetadata(profitOnly)?.netBookValueEnteredAt).toBeNull();
    const entered = confirmFinancialFiguresMetadata(extracted, ["netBookValue"], now);
    expect(parseFinancialFiguresMetadata(entered)).toMatchObject({
      sourceNetBookValue: "-2894",
      netBookValueEnteredAt: now.toISOString(),
    });

    // Without any extraction record, only a Net Book Value entry is recorded.
    expect(confirmFinancialFiguresMetadata({}, ["totalProfit"], now)).toBeNull();
    const manual = confirmFinancialFiguresMetadata({ other: 1 }, ["netBookValue"], now);
    expect(manual?.other).toBe(1);
    expect(isPendingGbpConversion(manual)).toBe(false);
    expect(parseFinancialFiguresMetadata(manual)?.netBookValueEnteredAt).toBe(now.toISOString());
  });

  it("a fresh extraction clears the person-entered Net Book Value mark", () => {
    const resolved = resolveExtractedFinancialFigures({
      currency: "GBP",
      netBookValue: "-2894",
      existing: { netBookValue: "125000" },
      previousMetadata: {
        financialFigures: { netBookValueEnteredAt: "2026-11-02T00:00:00.000Z" },
      },
      now,
    });
    expect(resolved.metadata.netBookValueEnteredAt).toBeUndefined();
  });
});

describe("client signoff permission", () => {
  it("lets active admins and explicitly authorised signatories approve", () => {
    expect(getFilingApprovalCapacity({ role: "admin", status: "active" })).toBe("admin");
    expect(
      getFilingApprovalCapacity({
        role: "editor",
        status: "active",
        canApproveFilings: true,
      }),
    ).toBe("authorised_signatory");
  });

  it("refuses ordinary members and inactive memberships", () => {
    expect(getFilingApprovalCapacity({ role: "editor", status: "active" })).toBeNull();
    expect(
      getFilingApprovalCapacity({
        role: "viewer",
        status: "active",
        canApproveFilings: false,
      }),
    ).toBeNull();
    expect(
      getFilingApprovalCapacity({
        role: "admin",
        status: "suspended",
        canApproveFilings: true,
      }),
    ).toBeNull();
    expect(getFilingApprovalCapacity(null)).toBeNull();
  });

  it("records the approver and clears it when the signoff is revoked", () => {
    const metadata = withSubmissionSignoffMetadata(
      { source: "Guernsey Tax Portal" },
      { at: now, accountId: "signatory-id", capacity: "authorised_signatory" },
    );
    expect(metadata.submissionSignoff).toEqual({
      at: now.toISOString(),
      accountId: "signatory-id",
      capacity: "authorised_signatory",
    });

    const patch = buildSubmissionSignoffRevocation({
      taxReturn: {
        status: "pending",
        metadata,
        readyForSubmissionAt: now,
        readyForSubmissionBy: "signatory-id",
      },
      changedFields: ["totalFte"],
      actor: { source: "portal" },
      now,
    });
    expect(patch?.metadata).not.toHaveProperty("submissionSignoff");
    expect(patch?.metadata.submissionSignoffRevoked).toMatchObject({
      previousSignoffBy: "signatory-id",
      previousSignoffCapacity: "authorised_signatory",
    });
  });
});

describe("return display status", () => {
  it("shows signed-off pending returns as awaiting automation", () => {
    expect(getReturnDisplayStatus({ status: "pending", readiness: "signed_off" })).toBe(
      "awaiting_automation",
    );
    expect(
      getReturnDisplayStatus({ status: "pending", readiness: "awaiting_signoff" }),
    ).toBe("pending");
    expect(
      getReturnDisplayStatus({
        status: "pending",
        readiness: "awaiting_manager_signoff",
      }),
    ).toBe("pending");
    expect(getReturnDisplayStatus({ status: "completed", readiness: "signed_off" })).toBe(
      "completed",
    );
    expect(getReturnDisplayStatus({ status: "failed", readiness: "signed_off" })).toBe(
      "failed",
    );
  });
});

describe("re-approval after signed-off data changes", () => {
  const signedOff = {
    status: "review_required",
    readyForSubmissionAt: new Date("2026-11-05T09:00:00Z"),
    readyForSubmissionBy: "signatory-1",
    metadata: withSubmissionSignoffMetadata(null, {
      at: new Date("2026-11-05T09:00:00Z"),
      accountId: "signatory-1",
      capacity: "admin",
    }),
  };

  function revokeForEdit() {
    const revocation = buildSubmissionSignoffRevocation({
      taxReturn: signedOff,
      changedFields: ["adequacyExpenditureDetails", "hasAdequateEmployees"],
      actor: { source: "web" },
      now: new Date("2026-11-12T14:00:00Z"),
    });
    expect(revocation).not.toBeNull();
    return { ...signedOff, ...revocation! };
  }

  it("moves an edited, signed-off return back to awaiting signoff and says what changed", () => {
    const edited = revokeForEdit();

    expect(
      getReturnReadinessState({
        status: edited.status,
        readyForSubmissionAt: edited.readyForSubmissionAt,
        isFormComplete: true,
        requiresManagerSignoff: true,
        hasManagerSignoff: true,
      }),
    ).toBe("awaiting_signoff");

    expect(getPendingReapproval(edited)).toEqual({
      at: "2026-11-12T14:00:00.000Z",
      source: "web",
      changedFields: ["adequacyExpenditureDetails", "hasAdequateEmployees"],
      previousSignoffAt: "2026-11-05T09:00:00.000Z",
    });
  });

  it("clears the re-approval notice once the signatory approves again", () => {
    const edited = revokeForEdit();
    const reapprovedAt = new Date("2026-11-16T10:00:00Z");
    const reapproved = {
      ...edited,
      readyForSubmissionAt: reapprovedAt,
      metadata: withSubmissionSignoffMetadata(edited.metadata, {
        at: reapprovedAt,
        accountId: "signatory-1",
        capacity: "admin",
      }),
    };

    expect(getPendingReapproval(reapproved)).toBeNull();
    expect(
      getReturnReadinessState({
        status: reapproved.status,
        readyForSubmissionAt: reapproved.readyForSubmissionAt,
        isFormComplete: true,
        requiresManagerSignoff: true,
        hasManagerSignoff: true,
      }),
    ).toBe("signed_off");
  });

  it("does not ask for re-approval of a completed return or one never signed off", () => {
    expect(getPendingReapproval({ ...revokeForEdit(), status: "completed" })).toBeNull();
    expect(
      getPendingReapproval({ status: "pending", readyForSubmissionAt: null, metadata: {} }),
    ).toBeNull();
    expect(
      getPendingReapproval({ status: "pending", readyForSubmissionAt: null, metadata: null }),
    ).toBeNull();
  });
});

describe("isApprovalOfStaleForm", () => {
  const seen = "2026-11-12T14:00:00.123Z";

  it("accepts an approval of the form version that is still current", () => {
    expect(
      isApprovalOfStaleForm({
        seenLastEditedAt: seen,
        currentLastEditedAt: new Date(seen),
      }),
    ).toBe(false);
    expect(
      isApprovalOfStaleForm({ seenLastEditedAt: null, currentLastEditedAt: null }),
    ).toBe(false);
  });

  it("refuses an approval when the form was edited after it was loaded", () => {
    expect(
      isApprovalOfStaleForm({
        seenLastEditedAt: seen,
        currentLastEditedAt: new Date("2026-11-16T09:30:00Z"),
      }),
    ).toBe(true);
    expect(
      isApprovalOfStaleForm({
        seenLastEditedAt: null,
        currentLastEditedAt: new Date("2026-11-16T09:30:00Z"),
      }),
    ).toBe(true);
  });

  it("does not check callers that report no version", () => {
    expect(
      isApprovalOfStaleForm({
        seenLastEditedAt: undefined,
        currentLastEditedAt: new Date(),
      }),
    ).toBe(false);
  });
});
