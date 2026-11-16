import { describe, expect, it } from "vitest";
import { buildResumePrompt, buildSubstanceFormPrompt } from "./prompt-builder";

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
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
      contactPhone: "+44 1481 000000",
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
    expect(preparePrompt).toContain("# TASK: Prepare Guernsey return reached from case flow");
    expect(preparePrompt).toContain("Go to tax return");
    expect(preparePrompt).toContain("Entity Information");
    expect(preparePrompt).toContain("Corporate Substance");
    expect(preparePrompt).toContain("These are not bad links");
    expect(preparePrompt).toContain("Do not skip fields merely because they are already populated");
    expect(preparePrompt).not.toContain("# TASK: Complete Guernsey Economic Substance Register Form");
    expect(submitPrompt).toContain("# TASK: Complete Guernsey Economic Substance Register Form");
    expect(submitPrompt).not.toContain("PREPARE-ONLY REDIRECT / REFILL RULE");
    expect(submitPrompt).not.toContain("These are not bad links");
    expect(submitPrompt).not.toContain("Do not skip fields merely because they are already populated");
  });

  it("files with the organisation's configured contact and replaces pre-filled details", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        entityName: "Franove Limited",
        relevantActivity: "None of the above",
      } as any,
      portalUrl: "https://my.gov.gg",
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
      contactPhone: null,
    });

    expect(prompt).toContain("use: NSM Filings Team");
    expect(prompt).toContain("use: filings@nsm.example");
    expect(prompt).toContain("telephone number, use: [MISSING - STOP if required]");
    expect(prompt).toContain("REPLACE any pre-filled contact");
    expect(prompt).toContain("organisation's configured filing contact");
    expect(prompt).not.toContain("filing agent (LTS Tax)");
    expect(prompt).not.toContain("lts-tax.com");
  });

  it("does not let the agent infer Guernsey incorporation", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        entityName: "Eaton Place Properties Limited",
        registeredAddress: "PO Box 1, St Peter Port, Guernsey",
        relevantActivity: "None of the above",
      } as any,
      portalUrl: "https://my.gov.gg",
    });

    expect(prompt).toContain("Do NOT infer it from the registered address");
    expect(prompt).not.toContain("leave the portal default unchanged");
  });

  describe("filing contact not configured", () => {
    const certificate3Form = {
      certificateType: "Certificate 3",
      entityName: "Riversong Limited",
      relevantActivity: "None of the above",
    } as any;

    function build(
      overrides: Partial<Parameters<typeof buildSubstanceFormPrompt>[0]> = {},
    ) {
      return buildSubstanceFormPrompt({
        taxReturn: { ...baseTaxReturn, entityName: "Riversong Limited" },
        substanceForm: certificate3Form,
        portalUrl: "https://my.gov.gg",
        submissionMode: "prepare_only",
        ...overrides,
      });
    }

    it("always renders a contact section that leaves contact fields untouched and stops at the contact step", () => {
      const prompt = build();

      expect(prompt).toContain("FILING CONTACT INFORMATION — NOT CONFIGURED");
      expect(prompt).toContain(
        "leave every contact name, email and telephone field exactly as the portal shows it",
      );
      expect(prompt).toContain("Do NOT invent a contact");
      expect(prompt).toContain("authorised signatory, the logged-in user");
      expect(prompt).toContain("STOP on the contact step");
      expect(prompt).toContain(
        "Your final output MUST start with exactly: **REQUIRES_ATTENTION: NEEDS_FILING_CONTACT:**",
      );
      // The normal prepare-only READY completion and the replace rule must not
      // appear: they would contradict "leave the contact fields untouched".
      expect(prompt).not.toContain(
        "Your final output MUST start with exactly: **READY_FOR_MANUAL_SUBMISSION:**",
      );
      expect(prompt).not.toContain("REPLACE any pre-filled contact");
      expect(prompt).not.toContain("contact telephone number, use:");
      // Never the LTS default contact or a personal fallback.
      expect(prompt).not.toContain("lts-tax.com");
      expect(prompt).not.toContain("Jonny Woodgate");
      // Still prepare-only: never a submit instruction.
      expect(prompt).not.toContain("Click the final submit/confirm action");
    });

    it("treats a partial contact as not configured and never passes the partial value", () => {
      const nameOnly = build({ contactName: "NSM Filings Team", contactEmail: "  " });
      const emailOnly = build({ contactEmail: "filings@nsm.example" });

      for (const prompt of [nameOnly, emailOnly]) {
        expect(prompt).toContain("FILING CONTACT INFORMATION — NOT CONFIGURED");
        expect(prompt).not.toContain("NSM Filings Team");
        expect(prompt).not.toContain("filings@nsm.example");
      }
    });

    it("never tells a submit-mode prompt to file without a contact", () => {
      const prompt = build({ submissionMode: "submit_and_capture_pdf" });

      expect(prompt).toContain("This run must NOT file the return");
      expect(prompt).not.toContain("Click the final submit/confirm action");
      expect(prompt).toContain("REQUIRES_ATTENTION: NEEDS_FILING_CONTACT:");
    });

    it("keeps the configured-contact flow unchanged when a contact is configured", () => {
      const prompt = build({
        contactName: "NSM Filings Team",
        contactEmail: "filings@nsm.example",
      });

      expect(prompt).not.toContain("NOT CONFIGURED");
      expect(prompt).not.toContain("NEEDS_FILING_CONTACT");
      expect(prompt).toContain("REPLACE any pre-filled contact");
      expect(prompt).toContain(
        "Your final output MUST start with exactly: **READY_FOR_MANUAL_SUBMISSION:**",
      );
    });
  });
});

describe("buildResumePrompt", () => {
  it("continues past a contact step the person handled, without touching it or submitting", () => {
    const resume = buildResumePrompt("ORIGINAL TASK", {
      afterFilingContactStop: true,
    });

    expect(resume).toContain(
      "Do NOT type into, clear, edit or replace any contact name, email or telephone field",
    );
    expect(resume).toContain("override the FILING CONTACT and COMPLETION sections");
    expect(resume).toContain("READY_FOR_MANUAL_SUBMISSION:");
    expect(resume).toContain("REQUIRES_ATTENTION: NEEDS_FILING_CONTACT:");
    expect(resume).toContain("Do **NOT** click Submit, Confirm, Print, Download");
    expect(resume).toContain("ORIGINAL TASK");
  });

  it("keeps the generic resume prompt for other pauses", () => {
    const resume = buildResumePrompt("ORIGINAL TASK", {
      afterFilingContactStop: false,
    });

    expect(resume).toContain("The user has completed the login/authentication");
    expect(resume).not.toContain("contact");
    expect(resume).toContain("ORIGINAL TASK");
  });
});
