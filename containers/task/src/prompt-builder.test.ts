import { describe, expect, it } from "vitest";
import { parsePreparedDraftOutput } from "@repo/database/prepared-draft";
import {
  buildResumePrompt,
  buildSubmitPreparedReturnPrompt,
  buildSubstanceFormPrompt,
} from "./prompt-builder";

const baseTaxReturn = {
  entityName: "Porte Des Granges Limited",
  taxYear: 2025,
  link: "https://my.gov.gg/revenue/case/example/process",
  jurisdiction: {
    portalUrl: "https://my.gov.gg",
  },
} as any;

describe("buildSubstanceFormPrompt", () => {
  it.each(["prepare_only", "submit_and_capture_pdf"] as const)(
    "formats Cauvery's small positive totals before the agent sees them (%s)",
    (submissionMode) => {
      const prompt = buildSubstanceFormPrompt({
        taxReturn: baseTaxReturn,
        substanceForm: {
          certificateType: "Certificate 3",
          relevantActivity: "Financing and leasing",
          totalFte: 0.0013,
          totalQualifiedFte: 0.0013,
          employees: [{ name: "Source employee", fteFraction: 0.0013 }],
        } as any,
        portalUrl: "https://my.gov.gg",
        submissionMode,
      });
      const totals = prompt.split("\n").filter((line) => /^- Total (Qualified )?FTE:/.test(line));
      expect(totals).toEqual(['- Total FTE: "0.01"', '- Total Qualified FTE: "0.01"']);
      expect(prompt.includes("FTE=0.0013")).toBe(true);
      expect(prompt.includes("Do not round these totals to whole employees")).toBe(true);
    },
  );
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

describe("prepared draft identity", () => {
  it("asks a prepare run to report the review URL and reference in the parsed format", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: { certificateType: "Certificate 3", relevantActivity: "Banking" } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "prepare_only",
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
    });
    expect(prompt).toContain("REVIEW_PAGE_URL: <the full URL");
    expect(prompt).toContain("PORTAL_REFERENCE: <the return or case reference");
    // An agent following those lines produces output the worker can parse.
    expect(
      parsePreparedDraftOutput(
        "READY_FOR_MANUAL_SUBMISSION: click Submit\nREVIEW_PAGE_URL: https://revenueservice.gov.gg/company-tax-ui/a/reviewAndSubmit/summary\nPORTAL_REFERENCE: NONE",
      ).reviewUrl,
    ).toBe("https://revenueservice.gov.gg/company-tax-ui/a/reviewAndSubmit/summary");
  });

  it("keeps the prompt grounded: no web research and no guessing material fields", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: { certificateType: "Certificate 3", relevantActivity: "Banking" } as any,
      portalUrl: "https://my.gov.gg",
    });
    expect(prompt).toContain("Never search the web");
    expect(prompt).toContain("Never guess a value that could change the filing");
    expect(prompt.match(/upload_file/g)?.length ?? 0).toBe(0); // no PDF provided
  });
});

describe("buildSubmitPreparedReturnPrompt", () => {
  const base = {
    taxReturn: { entityName: "Example Limited", taxYear: 2025 } as any,
    substanceForm: {
      companyNumber: "12345",
      accountingPeriodStart: "2025-01-01",
      accountingPeriodEnd: "2025-12-31",
    } as any,
    portalUrl: "https://my.gov.gg",
    returnLink: "https://my.gov.gg/revenue/case/abc/process",
    reviewUrl: "https://revenueservice.gov.gg/company-tax-ui/a/reviewAndSubmit/summary",
    portalReference: "ESR-42",
    contactName: "NSM Filings Team",
    contactEmail: "filings@nsm.example",
  };

  it("opens the exact prepared draft and verifies identity and review state before submitting", () => {
    const prompt = buildSubmitPreparedReturnPrompt(base);
    expect(prompt).toContain(`Go to the prepared review/submit page: ${base.reviewUrl}`);
    expect(prompt).toContain("Entity name is **Example Limited**");
    expect(prompt).toContain("Tax year is **2025** (accounting period 2025-01-01 to 2025-12-31)");
    expect(prompt).toContain("it is **12345**");
    expect(prompt).toContain("reference **ESR-42** exactly");
    expect(prompt).toContain("its name is **NSM Filings Team** and its email is **filings@nsm.example**");
    expect(prompt).toContain("No section is shown as incomplete");
    expect(prompt).toContain("**REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED:**");
    expect(prompt).toContain("Never click Submit a second time");
    expect(prompt).toContain("Download the portal-generated completion/receipt/return PDF");
  });

  it("does not fill, edit, upload, reassign or re-review", () => {
    const prompt = buildSubmitPreparedReturnPrompt(base);
    expect(prompt).toContain("Do **NOT** open sections, click **Change**/**Edit**/section links, type into or change any field, upload files, re-assign the case");
    for (const forbidden of [
      "SECTION 1: BACKGROUND",
      "upload_file",
      "Assign to user",
      "re-check/re-fill",
      "Do not skip fields merely because they are already populated",
      "READY_FOR_MANUAL_SUBMISSION",
    ]) {
      expect(prompt).not.toContain(forbidden);
    }
  });

  it("binds the run to the recorded draft id and reference, with no case-page fallback", () => {
    const prompt = buildSubmitPreparedReturnPrompt(base);
    expect(prompt).toContain("its path must be **/company-tax-ui/a/reviewAndSubmit/summary**");
    expect(prompt).toContain("Do not reach a review page any other way");
    expect(prompt).not.toContain(`Go to the case: ${base.returnLink}`);
    expect(prompt).toContain("If no reference is shown, or it differs, this check fails.");
  });

  it("opens the case only when the draft is identified by its reference", () => {
    const prompt = buildSubmitPreparedReturnPrompt({ ...base, reviewUrl: "https://my.gov.gg/revenue" });
    expect(prompt).toContain(`Go to the case: ${base.returnLink}`);
    expect(prompt).not.toContain("prepared review/submit page:");
    expect(prompt).toContain("reference **ESR-42** exactly. If no reference is shown");
  });

  it("refuses to build without a specific draft identity", () => {
    for (const identity of [
      { reviewUrl: null, portalReference: null },
      { reviewUrl: "https://my.gov.gg/revenue", portalReference: "NONE" },
    ]) {
      expect(() => buildSubmitPreparedReturnPrompt({ ...base, ...identity })).toThrow(
        "review page URL or portal reference",
      );
    }
  });

  it("is much shorter than the filling prompt", () => {
    const fill = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: { certificateType: "Certificate 3", relevantActivity: "Banking" } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "submit_and_capture_pdf",
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
    });
    expect(buildSubmitPreparedReturnPrompt(base).length).toBeLessThan(fill.length / 2);
  });
});
