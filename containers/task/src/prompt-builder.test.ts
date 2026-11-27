import { describe, expect, it } from "vitest";
import { parsePreparedDraftOutput } from "@repo/database/prepared-draft";
import { classifyRunOutcome } from "./run-outcome";
import {
  ENTITY_ACCOUNTS_INCOMPLETE_RULE,
  PROFIT_ALLOCATION_COLUMNS,
  buildNoticeOfAssessmentContinuationRule,
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

describe("profit allocation columns", () => {
  const contact = { contactName: "NSM Filings Team", contactEmail: "filings@nsm.example" };
  const build = (
    form: Record<string, unknown>,
    submissionMode: "prepare_only" | "submit_and_capture_pdf" = "prepare_only",
  ) =>
    buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
        noticeOfAssessment: "Yes",
        ...form,
      } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode,
      ...contact,
    });
  const lines = (prompt: string) =>
    prompt.split("\n").filter((line) => /^- (Total Profit|Profit before tax \([^)]*\)): ["[]/.test(line));

  it("enters 0 in the Business column when all profit is Investment (Notclif)", () => {
    const prompt = build({ totalProfit: "86895", profitAllocation: "Investment" });
    expect(lines(prompt)).toEqual([
      '- Total Profit: "86895"',
      '- Profit before tax (Investment): "86895"',
      '- Profit before tax (Business): "0"',
    ]);
    expect(prompt).toContain("enter **0** in **Profit before tax (Business)**");
    expect(prompt).toContain("Never leave a profit column blank");
  });

  it("enters 0 in the Investment column when all profit is Business", () => {
    const prompt = build({ totalProfit: "120000", profitAllocation: "Business" });
    expect(lines(prompt)).toEqual([
      '- Total Profit: "120000"',
      '- Profit before tax (Investment): "0"',
      '- Profit before tax (Business): "120000"',
    ]);
    expect(prompt).toContain("enter **0** in **Profit before tax (Investment)**");
  });

  it("carries a loss into the allocated column and still zeroes the other", () => {
    const prompt = build({ totalProfit: "-45000", profitAllocation: "Investment" });
    expect(lines(prompt)).toEqual([
      '- Total Profit: "-45000"',
      '- Profit before tax (Investment): "-45000"',
      '- Profit before tax (Business): "0"',
    ]);
    expect(prompt).toContain("Do NOT replace Total Profit with 0.");
  });

  it("explains the 0 is derived, not guessed, and keeps the never-guess rule", () => {
    const prompt = build({ totalProfit: "86895", profitAllocation: "Investment" });
    expect(prompt).toContain(
      "These figures are derived from the saved Total Profit and allocation, not guessed",
    );
    expect(prompt).toContain("Do not enter 0 in any other field because of this rule.");
    expect(prompt).toContain("Never guess a value that could change the filing");
  });

  it("does not derive the allocated column when Total Profit is missing", () => {
    const prompt = build({ profitAllocation: "Investment" });
    expect(lines(prompt)).toEqual([
      "- Total Profit: [MISSING - STOP if required]",
      "- Profit before tax (Investment): [MISSING - STOP if required]",
      '- Profit before tax (Business): "0"',
    ]);
  });

  it.each([undefined, null, "", "Mixed", "Trading"])(
    "derives no split and stops when the allocation is not a saved category (%j)",
    (profitAllocation) => {
      const prompt = build({ totalProfit: "86895", profitAllocation });
      expect(lines(prompt)).toEqual([
        '- Total Profit: "86895"',
        "- Profit before tax (Investment): [MISSING - STOP if required]",
        "- Profit before tax (Business): [MISSING - STOP if required]",
      ]);
      expect(prompt).toContain("Do NOT work out a split yourself and do NOT enter 0");
      expect(prompt).toContain("STOP and report **REQUIRES_ATTENTION** naming Profit Before Tax Allocation");
      expect(prompt).not.toContain('- Profit before tax (Business): "0"');
    },
  );

  it.each(["prepare_only", "submit_and_capture_pdf"] as const)(
    "checks every profit column before pausing on Entity Accounts INCOMPLETE (%s)",
    (submissionMode) => {
      const prompt = build({ totalProfit: "86895", profitAllocation: "Investment" }, submissionMode);
      expect(prompt).toContain("**ENTITY ACCOUNTS INCOMPLETE:**");
      expect(prompt).toContain("open Entity Accounts before you pause or report anything");
      expect(prompt).toContain("**0** in every unallocated column");
      expect(prompt).toContain("Never fill a column that SECTION 4 marks [MISSING]");
      expect(prompt).toContain("Re-saving the same values does not clear it.");
      // Restated in COMPLETION, where the agent decides to pause.
      expect(prompt.lastIndexOf(ENTITY_ACCOUNTS_INCOMPLETE_RULE)).toBeGreaterThan(
        prompt.indexOf("## COMPLETION"),
      );
    },
  );

  it("adds no profit column rules to a Certificate 2 return", () => {
    const prompt = build({ certificateType: "Certificate 2", totalProfit: "0" });
    expect(prompt).not.toContain("Profit before tax (");
    expect(prompt).not.toContain("ENTITY ACCOUNTS INCOMPLETE");
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
  const withAnswer = (noticeOfAssessment: string | null | undefined) => ({
    ...base,
    substanceForm: { ...base.substanceForm, noticeOfAssessment },
  });

  it("never tells a submit prepared run to fill a blank profit column", () => {
    const prompt = buildSubmitPreparedReturnPrompt(base);
    expect(prompt).not.toContain("ENTITY ACCOUNTS INCOMPLETE");
    expect(prompt).not.toContain("Profit before tax (");
  });

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
      substanceForm: {
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
        noticeOfAssessment: "Yes",
      } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "submit_and_capture_pdf",
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
    });
    expect(buildSubmitPreparedReturnPrompt(base).length).toBeLessThan(fill.length / 2);
  });

  it("answers the notice of assessment with the reviewer's No and allows no other change", () => {
    const prompt = buildSubmitPreparedReturnPrompt(withAnswer("No"));
    expect(prompt).toContain(
      'asks "Please indicate if you wish to receive a notice of assessment" and has declaration confirmation boxes (the portal shows three). The answer for this return is **No** (the reviewer\'s answer for this return).',
    );
    expect(prompt).toContain("select **No** for the notice of assessment question");
    expect(prompt).toContain("never select a different answer");
    expect(prompt).toContain(
      "**The only exceptions** are on the declaration step in section 3: the notice of assessment question (answer **No**, the reviewer's answer for this return) and every declaration confirmation box (the portal shows three). Change nothing else there.",
    );
    expect(prompt).toContain("Change no other field or control");
    // Answering happens before the single Submit click.
    expect(prompt.indexOf("select **No** for the notice")).toBeLessThan(
      prompt.indexOf("Click the final **Submit** action (**Complete submission to Revenue Service**) once"),
    );
    expect(buildSubmitPreparedReturnPrompt(withAnswer("Yes"))).toContain(
      "select **Yes** for the notice of assessment question",
    );
  });

  it.each([null, undefined, "", "maybe"])(
    "selects the default Yes when no answer is saved (%j)",
    (noticeOfAssessment) => {
      const prompt = buildSubmitPreparedReturnPrompt(withAnswer(noticeOfAssessment));
      expect(prompt).toContain(
        "The answer for this return is **Yes** (LTS's default answer for this return).",
      );
      expect(prompt).toContain("select **Yes** for the notice of assessment question");
      expect(prompt).not.toContain("**No**");
    },
  );

  it("selects the default Yes when the form carries no answer field", () => {
    expect(buildSubmitPreparedReturnPrompt(base)).toContain(
      "select **Yes** for the notice of assessment question",
    );
  });

  it("re-applies every declaration box before the single Submit, verifying rather than toggling", () => {
    const prompt = buildSubmitPreparedReturnPrompt(base);
    expect(prompt).toContain("Tick **every** declaration confirmation checkbox on the declaration step (the portal shows **three**");
    expect(prompt).toContain("clicking a box that is already ticked UN-TICKS it");
    expect(prompt).toContain("If they already show the right state, leave them as they are.");
    expect(prompt).toContain("in this session they are usually blank again, and you must set them");
    expect(prompt).toContain(
      "or a declaration box cannot be ticked or will not stay ticked, do **NOT** submit: stop with **REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED:**",
    );
    expect(prompt).toContain(
      "the final **Complete submission to Revenue Service** button is enabled. If it stays disabled, do **NOT** submit",
    );
    expect(prompt).not.toContain("declaration tick-box");
    expect(prompt).not.toContain("Tick the portal's declaration box");
    expect(prompt.indexOf("Tick **every** declaration confirmation checkbox")).toBeLessThan(
      prompt.indexOf("Click the final **Submit** action"),
    );
  });

  it("opens the review summary of a draft recorded on its declaration page, at its exact path", () => {
    const prompt = buildSubmitPreparedReturnPrompt({
      ...base,
      reviewUrl:
        "https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-1/reviewAndSubmit/declaration",
    });
    expect(prompt).toContain(
      "Go to the prepared review/submit page: https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-1/reviewAndSubmit/summary",
    );
    expect(prompt).toContain("The prepared draft is **d-1**");
    expect(prompt).toContain("its path must be **/company-tax-ui/company-tax/tax-returns/d-1/reviewAndSubmit/summary**");
    expect(prompt).toContain(
      "for this draft its path is **/company-tax-ui/company-tax/tax-returns/d-1/reviewAndSubmit/declaration**",
    );
    expect(prompt).not.toContain(`Go to the case: ${base.returnLink}`);
  });
});

describe("notice of assessment in the filling prompt", () => {
  const form = (noticeOfAssessment?: string | null) =>
    ({
      certificateType: "Certificate 3",
      relevantActivity: "Banking",
      noticeOfAssessment,
    }) as any;
  const contact = { contactName: "NSM Filings Team", contactEmail: "filings@nsm.example" };

  it.each(["Yes", "No"])("tells a full submit to select the reviewer's %s on the declaration step", (answer) => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: form(answer),
      portalUrl: "https://my.gov.gg",
      submissionMode: "submit_and_capture_pdf",
      ...contact,
    });
    expect(prompt).toContain("DECLARATION STEP — NOTICE OF ASSESSMENT (SET FOR THIS RETURN)");
    expect(prompt).toContain(
      `The answer for this return is **${answer}** (the reviewer's answer for this return). Select **${answer}**.`,
    );
    expect(prompt).toContain("never select a different answer");
    expect(prompt).toContain(
      `answer the notice of assessment question with **${answer}** (the reviewer's answer for this return;`,
    );
    expect(prompt.indexOf("answer the notice of assessment question")).toBeLessThan(
      prompt.indexOf("Click the final submit/confirm action"),
    );
  });

  it.each([null, undefined, "", "maybe"])(
    "tells a full submit to select the default Yes when no answer is saved (%j)",
    (answer) => {
      const prompt = buildSubstanceFormPrompt({
        taxReturn: baseTaxReturn,
        substanceForm: form(answer),
        portalUrl: "https://my.gov.gg",
        submissionMode: "submit_and_capture_pdf",
        ...contact,
      });
      expect(prompt).toContain(
        "The answer for this return is **Yes** (LTS's default answer for this return). Select **Yes**.",
      );
      expect(prompt).toContain(
        "answer the notice of assessment question with **Yes** (LTS's default answer for this return;",
      );
    },
  );

  it.each(["Yes", "No"])(
    "tells a prepare run with a contact to select the reviewer's %s and stop before the final button",
    (answer) => {
      const prompt = buildSubstanceFormPrompt({
        taxReturn: baseTaxReturn,
        substanceForm: form(answer),
        portalUrl: "https://my.gov.gg",
        submissionMode: "prepare_only",
        ...contact,
      });
      expect(prompt).toContain("DECLARATION STEP — NOTICE OF ASSESSMENT (SET FOR THIS RETURN)");
      expect(prompt).toContain(
        `The answer for this return is **${answer}** (the reviewer's answer for this return). Select **${answer}**.`,
      );
      expect(prompt).toContain(`4. On the declaration step, select **${answer}** for the notice of assessment question`);
      expect(prompt).not.toContain("This run does not answer it");
      // Never an instruction to file.
      expect(prompt).not.toContain("Click the final submit/confirm action");
      expect(prompt).not.toContain("do NOT submit: STOP");
    },
  );

  it.each([null, undefined, "", "maybe"])(
    "tells a prepare run with a contact to select the default Yes when no answer is saved (%j)",
    (answer) => {
      const prompt = buildSubstanceFormPrompt({
        taxReturn: baseTaxReturn,
        substanceForm: form(answer),
        portalUrl: "https://my.gov.gg",
        submissionMode: "prepare_only",
        ...contact,
      });
      expect(prompt).toContain(
        "The answer for this return is **Yes** (LTS's default answer for this return). Select **Yes**.",
      );
      expect(prompt).not.toContain("**No**");
    },
  );

  it("leaves the question and the boxes alone when the run stops at the contact step", () => {
    for (const submissionMode of ["prepare_only", "submit_and_capture_pdf"] as const) {
      const prompt = buildSubstanceFormPrompt({
        taxReturn: baseTaxReturn,
        substanceForm: form("No"),
        portalUrl: "https://my.gov.gg",
        submissionMode,
      });
      expect(prompt).toContain("This run does not answer it: if you see it, leave it exactly as the portal shows it");
      expect(prompt).toContain("do not tick any declaration box");
      expect(prompt).not.toContain("SET FOR THIS RETURN");
      expect(prompt).not.toContain("The answer for this return is");
      expect(prompt).not.toContain("DECLARATION BOXES");
    }
  });
});

describe("prepare only completes the declaration step", () => {
  const contact = { contactName: "NSM Filings Team", contactEmail: "filings@nsm.example" };
  const prepare = (noticeOfAssessment?: string | null) =>
    buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: {
        certificateType: "Certificate 3",
        relevantActivity: "Banking",
        noticeOfAssessment,
      } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "prepare_only",
      ...contact,
    });

  it("continues past the review page to the declaration step and ticks every box", () => {
    const prompt = prepare();
    expect(prompt).toContain("continue from the review page to the **declaration step** (usually **reviewAndSubmit/declaration**)");
    expect(prompt).toContain("Tick every declaration confirmation box (the portal shows three");
    expect(prompt).toContain("Tick **every** declaration confirmation checkbox on the declaration step (the portal shows **three**");
    expect(prompt).toContain("Change nothing else on this step");
    expect(prompt).toContain(
      "the final **Complete submission to Revenue Service** button is now enabled (not greyed out). Check its state by reading the page; do NOT click it to test it",
    );
    // The order a person would follow: review, declaration, answer, boxes, stop.
    const order = [
      "continue from the review page to the **declaration step**",
      "4. On the declaration step, select **Yes**",
      "5. Tick every declaration confirmation box",
      "**STOP BEFORE CLICKING THE FINAL BUTTON**",
      "Your final output MUST start with exactly: **READY_FOR_MANUAL_SUBMISSION:**",
    ].map((text) => prompt.indexOf(text));
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("warns that clicking a ticked box un-ticks it", () => {
    const prompt = prepare();
    expect(prompt).toContain("clicking a box that is already ticked UN-TICKS it");
    expect(prompt).toContain("click only a box that is NOT ticked");
  });

  it("never lets a prepare run click the final button", () => {
    const prompt = prepare();
    expect(prompt).toContain("Do NOT click **Complete submission to Revenue Service**");
    expect(prompt).toContain(
      "Do **NOT** click **Complete submission to Revenue Service**, a **Submit** or **Confirm** button, **Print**, **Download**, or any final filing action under any circumstances",
    );
    expect(prompt).toContain("This run is **PREPARE ONLY**");
    expect(prompt).toContain("Ticking these boxes is not filing; only the final button files.");
    expect(prompt).not.toContain("Click the final submit/confirm action");
    expect(prompt).not.toContain("Click the final **Submit** action");
    expect(prompt).not.toMatch(/\bclick (it|the final button) once\b/i);
  });

  it("reports the answer, the ticked boxes and the declaration page URL", () => {
    const prompt = prepare("No");
    expect(prompt).toContain(
      "Then state the notice of assessment answer you selected, that every declaration box is ticked (say how many), that **Complete submission to Revenue Service** is enabled and was not clicked",
    );
    expect(prompt).toContain("REVIEW_PAGE_URL: <the full URL of the declaration page currently open>");
    expect(prompt).toContain("PORTAL_REFERENCE: <the return or case reference");
  });

  it("stops with DECLARATION_INCOMPLETE when the step cannot be completed", () => {
    const prompt = prepare();
    expect(prompt).toContain(
      "a declaration box cannot be ticked or will not stay ticked, the step asks for anything else, or **Complete submission to Revenue Service** stays disabled once every box is ticked: do NOT click it",
    );
    expect(prompt).toContain("Your final output MUST instead start with exactly: **REQUIRES_ATTENTION: DECLARATION_INCOMPLETE:**");
    expect(prompt).toContain(
      "If **Yes** cannot be selected, do NOT click the final button: STOP and report **REQUIRES_ATTENTION: DECLARATION_INCOMPLETE:**",
    );
    // That output is a pause, not a prepared draft.
    const outcome = classifyRunOutcome({
      submissionMode: "prepare_only",
      sessionStatus: "idle",
      output:
        "**REQUIRES_ATTENTION: DECLARATION_INCOMPLETE:** The third box 'I confirm that I am authorised to submit this return on behalf of the company' will not stay ticked and 'Complete submission to Revenue Service' is still disabled. I did not click it and this is not READY_FOR_MANUAL_SUBMISSION.\nhttps://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-1/reviewAndSubmit/declaration",
      isTaskSuccessful: true,
    });
    expect(outcome).toMatchObject({
      prepareOnlyReady: false,
      needsAttention: true,
      prepareOnlyLikelySubmitted: false,
      needsFilingContact: false,
    });
  });

  it("produces output the worker records as the prepared draft", () => {
    const declaration =
      "https://revenueservice.gov.gg/company-tax-ui/company-tax/tax-returns/d-1/reviewAndSubmit/declaration";
    const output = [
      "**READY_FOR_MANUAL_SUBMISSION:** The return is prepared on the final declaration page. Notice of assessment: Yes selected (LTS's default). All 3 declaration boxes are ticked. 'Complete submission to Revenue Service' is now enabled and was not clicked; it is the only remaining action.",
      `**REVIEW_PAGE_URL:** ${declaration}`,
      "**PORTAL_REFERENCE:** NONE",
    ].join("\n");
    expect(parsePreparedDraftOutput(output)).toEqual({ reviewUrl: declaration, portalReference: null });
    expect(
      classifyRunOutcome({ submissionMode: "prepare_only", sessionStatus: "idle", output, isTaskSuccessful: false }),
    ).toMatchObject({ success: true, prepareOnlyReady: true, prepareOnlyLikelySubmitted: false, needsAttention: false });
  });

  it("keeps a prepare run without a contact stopping at the contact step", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: { certificateType: "Certificate 3", relevantActivity: "Banking" } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "prepare_only",
    });
    expect(prompt).toContain("COMPLETION — STOP AT THE CONTACT STEP");
    expect(prompt).toContain("stop on the final review/submit page");
    expect(prompt).not.toContain("DECLARATION_INCOMPLETE");
    expect(prompt).not.toContain("Tick every declaration confirmation box");
  });
});

describe("full submit declaration step", () => {
  it("ticks every declaration box, warns about un-ticking, then files once", () => {
    const prompt = buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: { certificateType: "Certificate 3", relevantActivity: "Banking" } as any,
      portalUrl: "https://my.gov.gg",
      submissionMode: "submit_and_capture_pdf",
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
    });
    expect(prompt).toContain("tick every declaration confirmation box (the portal shows three;");
    expect(prompt).toContain("clicking a box that is already ticked UN-TICKS it");
    expect(prompt).toContain("DECLARATION STEP — DECLARATION BOXES");
    expect(prompt).not.toContain("tick the portal's declaration\n");
    expect(prompt.indexOf("tick every declaration confirmation box")).toBeLessThan(
      prompt.indexOf("Click the final submit/confirm action once"),
    );
    expect(prompt).not.toContain("READY_FOR_MANUAL_SUBMISSION");
  });
});

describe("buildNoticeOfAssessmentContinuationRule", () => {
  it("restates the reviewer's answer for a recovered or resumed full submit", () => {
    const rule = buildNoticeOfAssessmentContinuationRule({
      answer: "Yes",
      defaulted: false,
      submitPrepared: false,
    });
    expect(rule).toContain("NOTICE OF ASSESSMENT AND DECLARATION (the reviewer's answer for this return;");
    expect(rule).toContain(
      'answer "Please indicate if you wish to receive a notice of assessment" with **Yes**',
    );
    expect(rule).toContain("Never select a different answer");
    expect(rule).toContain("Tick **every** declaration confirmation checkbox");
    expect(rule).toContain("clicking a box that is already ticked UN-TICKS it");
    expect(rule).not.toContain("only things you may set");
    expect(rule).not.toContain("PREPARE ONLY");
  });

  it("keeps a submit prepared continuation to that answer and the declaration boxes", () => {
    const rule = buildNoticeOfAssessmentContinuationRule({
      answer: "No",
      defaulted: false,
      submitPrepared: true,
    });
    expect(rule).toContain("with **No**");
    expect(rule).toContain(
      "This answer and the declaration confirmation boxes are the only things you may set. Change no other field.",
    );
    expect(rule).toContain("(the portal shows **three**");
    expect(rule).toContain("If a box is already ticked, leave it ticked");
    expect(rule).toContain("REQUIRES_ATTENTION**: PREPARED_DRAFT_NOT_VERIFIED:");
  });

  it("restates the answer and boxes for a prepare run, without clicking the final button", () => {
    const rule = buildNoticeOfAssessmentContinuationRule({
      answer: "No",
      defaulted: false,
      submitPrepared: false,
      prepareOnly: true,
    });
    expect(rule).toContain("with **No**");
    expect(rule).toContain("Tick **every** declaration confirmation checkbox");
    expect(rule).toContain("clicking a box that is already ticked UN-TICKS it");
    expect(rule).toContain(
      "This is a PREPARE ONLY run: do **NOT** click **Complete submission to Revenue Service** or any final filing action.",
    );
    expect(rule).toContain("**READY_FOR_MANUAL_SUBMISSION:**");
    expect(rule).toContain("do NOT click the final button: stop and report **REQUIRES_ATTENTION**: DECLARATION_INCOMPLETE:");
    expect(rule).not.toContain("do NOT submit");
    expect(rule).not.toContain("PREPARED_DRAFT_NOT_VERIFIED");
  });
});

describe("buildNoticeOfAssessmentContinuationRule with the default", () => {
  it("says the Yes is LTS's default", () => {
    const rule = buildNoticeOfAssessmentContinuationRule({
      answer: "Yes",
      defaulted: true,
      submitPrepared: true,
    });
    expect(rule).toContain("NOTICE OF ASSESSMENT AND DECLARATION (LTS's default answer for this return;");
    expect(rule).toContain("with **Yes**");
  });
});

describe("first check: the return is not already submitted", () => {
  const preparedBase = {
    taxReturn: { entityName: "Pudleston Farm Limited", taxYear: 2025 } as any,
    substanceForm: {
      companyNumber: "12345",
      accountingPeriodStart: "2025-01-01",
      accountingPeriodEnd: "2025-12-31",
    } as any,
    portalUrl: "https://my.gov.gg",
    returnLink: "https://my.gov.gg/revenue/case/abc/process",
    reviewUrl: "https://revenueservice.gov.gg/company-tax-ui/a/reviewAndSubmit/summary",
    portalReference: null,
    contactName: "NSM Filings Team",
    contactEmail: "filings@nsm.example",
  };
  const fullSubmit = (extra: Record<string, unknown> = {}) =>
    buildSubstanceFormPrompt({
      taxReturn: baseTaxReturn,
      substanceForm: { certificateType: "Certificate 2" } as any,
      portalUrl: "https://my.gov.gg",
      returnLink: baseTaxReturn.link,
      submissionMode: "submit_and_capture_pdf",
      contactName: "NSM Filings Team",
      contactEmail: "filings@nsm.example",
      ...extra,
    });

  it("comes first in a Submit prepared return run, on the case page, before the draft is opened", () => {
    const prompt = buildSubmitPreparedReturnPrompt(preparedBase);
    const check = prompt.indexOf("## FIRST CHECK");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(prompt.indexOf("## 1. OPEN THE PREPARED DRAFT"));
    expect(prompt).toContain("Open the case: https://my.gov.gg/revenue/case/abc/view.");
    expect(prompt).toContain("**Pending** or **In progress**");
    expect(prompt).toContain("**Submitted** / **Received**");
    expect(prompt).toContain("Your final output MUST start with exactly: **REQUIRES_ATTENTION: ALREADY_SUBMITTED:**");
    expect(prompt).toContain("download it into the Browser Use session");
    expect(prompt).toContain("do not use its links to reach the return");
    // The step 2 status check is folded into it, not a second marker for it.
    expect(prompt).toContain("The return still shows as not submitted (see **FIRST CHECK**).");
    expect(prompt).not.toContain("use the same marker, say so");
    // No earlier runs: no caution.
    expect(prompt).not.toContain("**CAUTION:**");
  });

  it("names earlier runs that reached the portal without a receipt, and is stricter", () => {
    const one = buildSubmitPreparedReturnPrompt({ ...preparedBase, earlierUnreceiptedSubmitRuns: [{ jobNumber: 3 }] });
    expect(one).toContain(
      "**CAUTION:** an earlier LTS submit run (Run #3) on this return reached the portal and saved no filed-return receipt, so it may already have filed this return.",
    );
    expect(one).toContain(
      "If you cannot see the case or return status at all, do **NOT** submit: stop with **REQUIRES_ATTENTION: PREPARED_DRAFT_NOT_VERIFIED:**",
    );
    const two = buildSubmitPreparedReturnPrompt({
      ...preparedBase,
      earlierUnreceiptedSubmitRuns: [{ jobNumber: 2 }, { jobNumber: 3 }],
    });
    expect(two).toContain("earlier LTS submit runs (Runs #2 and #3) on this return reached the portal");
    expect(two).toContain("so they may already have filed");
  });

  it("without a case link, checks on the review page", () => {
    const prompt = buildSubmitPreparedReturnPrompt({ ...preparedBase, returnLink: undefined });
    expect(prompt).toContain("Open the case for this return.");
    expect(prompt).toContain("do this check on the review page in section 2");
  });

  it("comes before navigation and case assignment in a full submit run", () => {
    const prompt = fullSubmit({ earlierUnreceiptedSubmitRuns: [{ jobNumber: 4 }] });
    const check = prompt.indexOf("## FIRST CHECK");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(prompt.indexOf("## NAVIGATION"));
    expect(check).toBeLessThan(prompt.indexOf("## CASE ASSIGNMENT"));
    expect(prompt).toContain("before case assignment, opening or editing any section");
    expect(prompt).toContain("Open the case: https://my.gov.gg/revenue/case/example/view.");
    expect(prompt).toContain("**REQUIRES_ATTENTION: ALREADY_SUBMITTED:**");
    expect(prompt).toContain("(Run #4)");
    expect(prompt).toContain("stop with **REQUIRES_ATTENTION:** saying the submission status could not be confirmed");
  });

  it("keeps the run's own submission as the expected result", () => {
    const prompt = fullSubmit();
    expect(prompt).toContain(
      "Until you click **Complete submission to Revenue Service** yourself in this run, keep checking",
    );
    expect(prompt).toContain("After your own single click, the submission confirmation is the expected result");
  });

  it("is not part of a prepare-only run", () => {
    const prompt = fullSubmit({ submissionMode: "prepare_only" });
    expect(prompt).not.toContain("## FIRST CHECK");
    expect(prompt).not.toContain("ALREADY_SUBMITTED");
  });

  it("an ALREADY_SUBMITTED report is held for review, not read as this run's filing", () => {
    const outcome = classifyRunOutcome({
      submissionMode: "submit_and_capture_pdf",
      sessionStatus: "idle",
      output:
        "**REQUIRES_ATTENTION: ALREADY_SUBMITTED:** The case view shows the 2025 return as Submitted (submitted successfully on 24/11/2026).",
      isTaskSuccessful: true,
    });
    expect(outcome).toMatchObject({ alreadySubmitted: true, success: false, likelySubmitted: false, needsAttention: true });
  });
});
