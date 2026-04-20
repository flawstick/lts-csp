import {
  buildGuernseyCertificateTwoDefaults,
  detectGuernseyCertificateTypeFromDocuments,
  hasMeaningfulGuernseyFormData,
  isGuernseySubstanceInScope,
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
});
