import { buildSubstanceFormPrompt } from "./prompt-builder";

const baseTaxReturn = {
  entityName: "Porte Des Granges Limited",
  taxYear: 2025,
  link: "https://my.gov.gg/revenue/case/example/process",
  jurisdiction: {
    portalUrl: "https://my.gov.gg",
  },
} as any;

describe("buildSubstanceFormPrompt", () => {
  it("builds a simplified certificate 3 prompt without deprecated declaration fields", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        entityName: "Porte Des Granges Limited",
        accountingPeriodStart: "2025-01-01",
        accountingPeriodEnd: "2025-12-31",
        relevantActivity: "Banking",
        isConstituentEntity: "No",
      } as any,
      portalUrl: "https://my.gov.gg",
      contactEmail: "taxenquiries@lts-tax.com",
      contactPhone: "+44 1481 755862",
    });

    expect(prompt).toContain('always select "Certificate 3"');
    expect(prompt).toContain("When the portal asks for a contact email");
    expect(prompt).toContain("Is the entity a constituent entity");
    expect(prompt).not.toContain("Prepared By");
    expect(prompt).not.toContain("Prepared Date");
    expect(prompt).not.toContain("Post Balance Sheet");
  });

  it("builds a dedicated certificate 2 prompt with no accounts upload flow", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 2",
        entityName: "Porte Des Granges Limited",
        accountingPeriodStart: "2025-01-01",
        accountingPeriodEnd: "2025-12-31",
        entityActivity: "Dormant",
        relevantActivity: "None of the above",
        isGuernseyFiFatca: "No",
        isGuernseyFiCrs: "No",
        isRegisteredOnIgor: "No",
        isConstituentEntity: "No",
      } as any,
      portalUrl: "https://my.gov.gg",
    });

    expect(prompt).toContain("This is a **Certificate 2** return");
    expect(prompt).toContain("Do **NOT** upload accounts or financial statements");
    expect(prompt).not.toContain("FINANCIAL STATEMENTS PDF — CRITICAL");
    expect(prompt).not.toContain("Accounts Preparer Name");
  });

  it("forces a pause for non-inferable missing fields", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        entityName: "Porte Des Granges Limited",
        missingFields: ["relevantActivity", "parentCompanyName"],
      } as any,
      portalUrl: "https://my.gov.gg",
    });

    expect(prompt).toContain("REQUIRES_ATTENTION");
    expect(prompt).toContain("parentCompanyName");
  });

  it("adds redirected-form refill instructions only for prepare-only runs", () => {
    const preparePrompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        entityName: "Porte Des Granges Limited",
        relevantActivity: "Banking",
      } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "prepare_only",
    });
    const submitPrompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        entityName: "Porte Des Granges Limited",
        relevantActivity: "Banking",
      } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "submit_and_capture_pdf",
    });

    expect(preparePrompt).toContain("PREPARE-ONLY REDIRECT / REFILL RULE");
    expect(preparePrompt).toContain("Go to tax return");
    expect(preparePrompt).toContain("Do not skip fields merely because they are already populated");
    expect(submitPrompt).not.toContain("PREPARE-ONLY REDIRECT / REFILL RULE");
    expect(submitPrompt).not.toContain("Do not skip fields merely because they are already populated");
  });
});
