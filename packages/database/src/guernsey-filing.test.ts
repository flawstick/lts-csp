import {
  buildGuernseyCertificateTwoDefaults,
  detectGuernseyCertificateTypeFromDocuments,
  getGuernseyScopedMissingFields,
  getGuernseyScopedRequirementBlocker,
  GUERNSEY_OPERATING_EXPENDITURE_REQUIRED_MESSAGE,
  hasMeaningfulGuernseyFormData,
  isGuernseyFormValueSupplied,
  isGuernseyOperatingExpenditureRequired,
  isGuernseySubstanceInScope,
  reconcileGuernseyFormCompletion,
  withGuernseyScopedCompletion,
  resolveGuernseyCertificateType,
  validateGuernseySourceDocuments,
} from "./guernsey-filing";

describe("guernsey-filing", () => {
  it("resolves saved and metadata-backed certificate types without defaulting unresolved returns", () => {
    expect(
      resolveGuernseyCertificateType({
        metadata: null,
        savedCertificateType: null,
      }),
    ).toMatchObject({
      certificateType: null,
      unresolved: true,
    });

    expect(
      resolveGuernseyCertificateType({
        metadata: null,
        savedCertificateType: "Certificate 3",
      }),
    ).toMatchObject({
      certificateType: "Certificate 3",
      source: "saved_form",
      unresolved: false,
    });

    expect(
      resolveGuernseyCertificateType({
        metadata: {
          certificateTypeHint: "Certificate 2",
          certificateTypeSource: "synced_metadata",
          certificateTypeConfidence: 0.99,
        },
        savedCertificateType: null,
      }),
    ).toMatchObject({
      certificateType: "Certificate 2",
      source: "synced_metadata",
      unresolved: false,
    });
  });

  it("applies scope rules only to certificate 3 filings with a real relevant activity", () => {
    expect(
      isGuernseySubstanceInScope({
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
      }),
    ).toBe(true);

    expect(
      isGuernseySubstanceInScope({
        certificateType: "Certificate 3",
        relevantActivity: "None of the above",
      }),
    ).toBe(false);

    expect(
      isGuernseySubstanceInScope({
        certificateType: "Certificate 2",
        relevantActivity: "Banking",
      }),
    ).toBe(false);
  });

  it("builds static certificate 2 defaults", () => {
    expect(buildGuernseyCertificateTwoDefaults(2025)).toMatchObject({
      certificateType: "Certificate 2",
      accountingPeriodStart: "2025-01-01",
      accountingPeriodEnd: "2025-12-31",
      entityActivity: "Dormant",
      relevantActivity: "None of the above",
      isGuernseyFiFatca: "No",
      isGuernseyFiCrs: "No",
      isRegisteredOnIgor: "No",
      isConstituentEntity: "No",
    });
  });

  it("detects certificate type only from explicit document signals", () => {
    expect(
      detectGuernseyCertificateTypeFromDocuments({
        fileNames: ["Porte Des Granges Limited - Certificate 2 return.pdf"],
      }),
    ).toMatchObject({
      certificateType: "Certificate 2",
      unresolved: false,
    });

    expect(
      detectGuernseyCertificateTypeFromDocuments({
        fileNames: ["random-esr.pdf"],
        texts: ["Dormant company with no other explicit certificate reference"],
      }),
    ).toMatchObject({
      certificateType: null,
      unresolved: true,
    });
  });

  it("flags wrong-year and mismatched source documents before initialization", () => {
    const issues = validateGuernseySourceDocuments({
      entityName: "Porte Des Granges Limited",
      taxYear: 2025,
      accountingPeriodStart: "2025-01-01",
      accountingPeriodEnd: "2025-12-31",
      fileNames: ["Porte Des Granges Holdings 2024 ESR.pdf"],
      texts: ["Accounting period 01/01/2024 to 31/12/2024"],
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "tax_year_mismatch",
        "accounting_period_mismatch",
      ]),
    );
  });

  it("detects meaningful saved form data before allowing certificate overrides", () => {
    expect(
      hasMeaningfulGuernseyFormData({
        certificateType: "Certificate 3",
        taxReferenceNumber: "12345",
      }),
    ).toBe(false);

    expect(
      hasMeaningfulGuernseyFormData({
        certificateType: "Certificate 3",
        entityActivity: "Property Holdings",
      }),
    ).toBe(true);
  });

  describe("operating expenditure (in-scope only)", () => {
    const inScope = {
      certificateType: "Certificate 3",
      relevantActivity: "Banking",
    } as const;
    const outOfScopeForms = [
      { certificateType: "Certificate 3", relevantActivity: "None of the above" },
      { certificateType: "Certificate 3", relevantActivity: null },
      { certificateType: "Certificate 3", relevantActivity: "  " },
      { certificateType: "Certificate 2", relevantActivity: "Banking" },
      { certificateType: null, relevantActivity: "Banking" },
    ];

    it("treats blank, null and undefined as missing but zero as supplied", () => {
      expect(isGuernseyFormValueSupplied(undefined)).toBe(false);
      expect(isGuernseyFormValueSupplied(null)).toBe(false);
      expect(isGuernseyFormValueSupplied("")).toBe(false);
      expect(isGuernseyFormValueSupplied("   ")).toBe(false);
      expect(isGuernseyFormValueSupplied(Number.NaN)).toBe(false);
      expect(isGuernseyFormValueSupplied("0")).toBe(true);
      expect(isGuernseyFormValueSupplied(0)).toBe(true);
      expect(isGuernseyFormValueSupplied("0.00")).toBe(true);
      expect(isGuernseyFormValueSupplied("12,500")).toBe(true);
    });

    it("requires operating expenditure only within scope of economic substance", () => {
      expect(isGuernseyOperatingExpenditureRequired(inScope)).toBe(true);
      for (const form of outOfScopeForms) {
        expect(isGuernseyOperatingExpenditureRequired(form)).toBe(false);
      }
      expect(isGuernseyOperatingExpenditureRequired(null)).toBe(false);
    });

    it("reports a missing value for in-scope entities", () => {
      for (const adequacyExpenditureDetails of [undefined, null, "", "  "]) {
        expect(
          getGuernseyScopedMissingFields({ ...inScope, adequacyExpenditureDetails }),
        ).toEqual(["adequacyExpenditureDetails"]);
      }
    });

    it("accepts zero and positive values for in-scope entities", () => {
      for (const adequacyExpenditureDetails of ["0", 0, "0.00", "46508", 1250]) {
        expect(
          getGuernseyScopedMissingFields({ ...inScope, adequacyExpenditureDetails }),
        ).toEqual([]);
      }
    });

    it("never requires it for out-of-scope entities", () => {
      for (const form of outOfScopeForms) {
        expect(
          getGuernseyScopedMissingFields({ ...form, adequacyExpenditureDetails: null }),
        ).toEqual([]);
      }
    });

    it("follows scope changes on the same form", () => {
      const form = { ...inScope, adequacyExpenditureDetails: null };
      expect(getGuernseyScopedMissingFields(form)).toHaveLength(1);
      expect(
        getGuernseyScopedMissingFields({ ...form, relevantActivity: "None of the above" }),
      ).toEqual([]);
      expect(
        getGuernseyScopedMissingFields({ ...form, certificateType: "Certificate 2" }),
      ).toEqual([]);
    });

    it("gives an actionable blocker message", () => {
      expect(
        getGuernseyScopedRequirementBlocker({ ...inScope, adequacyExpenditureDetails: "" }),
      ).toBe(GUERNSEY_OPERATING_EXPENDITURE_REQUIRED_MESSAGE);
      expect(GUERNSEY_OPERATING_EXPENDITURE_REQUIRED_MESSAGE).toContain("enter 0");
      expect(
        getGuernseyScopedRequirementBlocker({ ...inScope, adequacyExpenditureDetails: "0" }),
      ).toBeNull();
    });

    it("downgrades a stale stored completion flag using current data", () => {
      expect(
        reconcileGuernseyFormCompletion({
          isComplete: true,
          missingFields: [],
          form: { ...inScope, adequacyExpenditureDetails: null },
        }),
      ).toEqual({ isComplete: false, missingFields: ["adequacyExpenditureDetails"] });

      // No duplicate when the stored list already has it.
      expect(
        reconcileGuernseyFormCompletion({
          isComplete: false,
          missingFields: ["entityName", "adequacyExpenditureDetails"],
          form: { ...inScope, adequacyExpenditureDetails: null },
        }).missingFields,
      ).toEqual(["entityName", "adequacyExpenditureDetails"]);
    });

    it("leaves existing completion untouched when the value is supplied or out of scope", () => {
      expect(
        reconcileGuernseyFormCompletion({
          isComplete: true,
          missingFields: [],
          form: { ...inScope, adequacyExpenditureDetails: "0" },
        }),
      ).toEqual({ isComplete: true, missingFields: [] });
      expect(
        reconcileGuernseyFormCompletion({
          isComplete: true,
          missingFields: null,
          form: {
            certificateType: "Certificate 2",
            relevantActivity: "None of the above",
            adequacyExpenditureDetails: null,
          },
        }),
      ).toEqual({ isComplete: true, missingFields: [] });
      expect(
        reconcileGuernseyFormCompletion({
          isComplete: false,
          missingFields: ["entityName"],
          form: { ...inScope, adequacyExpenditureDetails: "100" },
        }),
      ).toEqual({ isComplete: false, missingFields: ["entityName"] });
    });

    it("applies to a whole form row", () => {
      const row = withGuernseyScopedCompletion({
        id: "form-1",
        ...inScope,
        adequacyExpenditureDetails: null,
        isComplete: true,
        missingFields: [],
      });
      expect(row).toMatchObject({
        id: "form-1",
        isComplete: false,
        missingFields: ["adequacyExpenditureDetails"],
      });
    });
  });
});
