/**
 * Prompt Builder for Browser Use AI Agent
 * Generates comprehensive instructions from substance form data for Guernsey tax return filing
 */

import {
  getGuernseyNoticeOfAssessment,
  GUERNSEY_NOTICE_OF_ASSESSMENT_PORTAL_QUESTION,
  isGuernseyNoticeOfAssessmentDefaulted,
  isGuernseySubstanceInScope,
  type GuernseyNoticeOfAssessment,
  type SubstanceForm,
  type TaxReturn,
} from "@repo/database";

import {
  getGuernseyReviewDraftId,
  getGuernseyReviewSummaryUrl,
  normalizePortalReference,
} from "@repo/database/prepared-draft";
import {
  DECLARATION_INCOMPLETE_MARKER,
  NEEDS_FILING_CONTACT_MARKER,
} from "./run-outcome";

/** Labels a prepare run reports, parsed by @repo/database/prepared-draft. */
export const PREPARED_DRAFT_URL_LABEL = "REVIEW_PAGE_URL";
export const PREPARED_DRAFT_REFERENCE_LABEL = "PORTAL_REFERENCE";

/** The GRS company-tax-ui final filing button on the declaration step. */
export const FINAL_FILING_BUTTON_LABEL = "Complete submission to Revenue Service";

/**
 * The organisation filing contact is all-or-nothing: without both a name and
 * an email the agent gets no contact values and stops at the contact step.
 */
export function hasConfiguredFilingContact(
  contactName?: string | null,
  contactEmail?: string | null,
): boolean {
  return Boolean(contactName?.trim() && contactEmail?.trim());
}

/**
 * How to tick the declaration step's confirmation boxes. Shared by every
 * prompt that sets them: clicking a box that is already ticked un-ticks it,
 * and a run in the same live session may find them ticked already.
 */
const DECLARATION_BOXES_RULE = `Tick **every** declaration confirmation checkbox on the declaration step (the portal shows **three**, for example "I declare that the information given in this return is correct and complete"). Ticking these boxes is not filing; only the final button files. **Before clicking a box, read whether it is already ticked, and click only a box that is NOT ticked: clicking a box that is already ticked UN-TICKS it.** Click the checkbox or its label once (do not press Enter), then re-read every box and confirm each one now shows ticked. If a box is already ticked, leave it ticked`;
import { formatPortalFte } from "./portal-fte";
import {
  decidePortalNetBookValue,
  buildNetBookValueQuestion,
  NET_BOOK_VALUE_QUESTION_MARKER,
  type PortalNetBookValue,
  type ReviewerNetBookValue,
} from "./portal-net-book-value";

/** How the fill prompt presents Net Book Value (see portal-net-book-value). */
export type NetBookValuePromptInput = {
  decision: PortalNetBookValue;
  /** Parsed by the worker from a reviewer's reply; replaces the saved figure. */
  reviewer?: ReviewerNetBookValue | null;
  /** Reviewer replies stayed unclear: leave the field and do not ask again. */
  stopAsking?: boolean;
};

interface Employee {
  name?: string;
  qualifiedForReporting?: boolean;
  unitsOnCompany?: number;
  totalUnits?: number;
  fteFraction?: number;
  qualifiedFteFraction?: number;
}

interface Parent {
  name?: string;
  countryOfTaxResidence?: string;
  tin?: string;
  tinCountry?: string;
  registeredAddress?: string;
}

interface UBO {
  name?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  nationality?: string;
  countryOfTaxResidence?: string;
  tin?: string;
  tinCountry?: string;
  address?: string;
}

interface Director {
  name?: string;
  initials?: string;
}

interface BoardMeeting {
  date?: string;
  attendees?: string;
  allPresentInGuernsey?: boolean;
  agendaPoints?: string;
}

interface SessionInputFile {
  originalName: string;
  sessionFileName: string;
  sessionFilePath: string;
  category?: string;
  role?: string;
}

interface PromptBuilderOptions {
  taxReturn: TaxReturn;
  substanceForm: SubstanceForm;
  portalUrl: string;
  returnLink?: string;
  overrideSaved?: boolean;
  submissionMode?: "prepare_only" | "submit_and_capture_pdf";
  financialStatementsFile?: SessionInputFile | null;
  financialStatementsUrl?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  /**
   * Worker-decided Net Book Value handling. Defaults to the saved figure with
   * unknown provenance, which asks a reviewer.
   */
  netBookValue?: NetBookValuePromptInput;
}

// Portal login used by every Guernsey run (filling and submitting).
const PORTAL_LOGIN_SECTION = `## LOGIN CREDENTIALS
If you need to log in to the portal, use:
- Email: dev@flawstick.com
- Password: V424d3ef@1

## CSP / GUERNSEY REVENUE SERVICE CREDENTIALS
If prompted for CSP or secret credentials:
- Customer Number: C066
- Security Code: X312E49624
`;

const INFERABLE_FIELDS = new Set([
  "entityActivity",
  "hasIntellectualPropertyHolding",
]);

function getCaseViewUrl(returnLink?: string): string | null {
  if (!returnLink) {
    return null;
  }

  try {
    const url = new URL(returnLink);
    const match = url.pathname.match(/(\/revenue\/case\/[^/]+)(?:\/.*)?$/);

    if (!match) {
      return null;
    }

    url.pathname = `${match[1]}/view`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Builds the main AI prompt for filling out the Guernsey Economic Substance Register
 */
export function buildSubstanceFormPrompt(
  options: PromptBuilderOptions,
): string {
  const {
    taxReturn,
    substanceForm,
    portalUrl,
    returnLink,
    overrideSaved,
    submissionMode = "prepare_only",
    financialStatementsFile,
    financialStatementsUrl,
    contactName,
    contactEmail,
    contactPhone,
    netBookValue,
  } = options;

  const sections: string[] = [];
  const caseViewUrl = getCaseViewUrl(returnLink);
  const certificateType =
    substanceForm.certificateType === "Certificate 2"
      ? "Certificate 2"
      : "Certificate 3";
  const isCertificateTwo = certificateType === "Certificate 2";
  const isInScope = isGuernseySubstanceInScope({
    certificateType,
    relevantActivity: substanceForm.relevantActivity ?? null,
  });
  const isPrepareOnly = submissionMode === "prepare_only";
  // The contact is all-or-nothing: without both a configured name and email
  // the agent gets no contact values at all and must not touch the fields.
  const hasFilingContact = hasConfiguredFilingContact(contactName, contactEmail);
  // Every run with a contact goes on to the declaration step: a submit run
  // completes it and files, a prepare run completes it and stops before the
  // final button. Without a contact a run stops at the contact step.
  const reachesDeclaration = hasFilingContact;
  // Resolved for the agent (the reviewer's "No", otherwise the default
  // "Yes"); the agent never chooses it.
  const noticeOfAssessment = getGuernseyNoticeOfAssessment(substanceForm);
  const noticeOfAssessmentDefaulted =
    isGuernseyNoticeOfAssessmentDefaulted(substanceForm);
  const missingFields = Array.isArray(substanceForm.missingFields)
    ? substanceForm.missingFields
    : [];
  const inferableMissingFields = missingFields.filter((field) =>
    INFERABLE_FIELDS.has(field),
  );
  const blockingMissingFields = missingFields.filter(
    (field) => !INFERABLE_FIELDS.has(field),
  );

  // Header and navigation
  sections.push(`
# TASK: ${
    isPrepareOnly
      ? "Prepare Guernsey return reached from case flow"
      : "Complete Guernsey Economic Substance Register Form"
  }

${
  isPrepareOnly
    ? hasFilingContact
      ? `Fill the Guernsey Economic Substance Register return for **${taxReturn.entityName}** (tax year ${taxReturn.taxYear}) from the data in this task, complete the declaration step (notice of assessment answer and every declaration box), and stop with the final **${FINAL_FILING_BUTTON_LABEL}** button enabled but NOT clicked. This run must not file the return.`
      : `Fill the Guernsey Economic Substance Register return for **${taxReturn.entityName}** (tax year ${taxReturn.taxYear}) from the data in this task and stop on the final review/submit page. This run must not file the return.`
    : `Fill and file the Guernsey Economic Substance Register return for **${taxReturn.entityName}** (tax year ${taxReturn.taxYear}) from the data in this task, then save the portal's completion PDF.`
}

## GROUND RULES
- **Sources:** use only (1) the saved values in this task, (2) the attached financial statements, and (3) text visible in this return on the portal. Never search the web, open other cases or returns, or leave this case/return flow to discover facts.
- **Missing values:** a line marked [MISSING - STOP if required] has no saved value. If the portal does not require that field, leave it as the portal shows it. If the portal requires it, STOP and report **REQUIRES_ATTENTION** naming the field. Never guess a value that could change the filing.
- **Portal defaults:** a default or preselected portal value with no contradicting saved value may stay as is. Do not replace defaults with guesses.
- **Exact entry:** enter saved values exactly as given (numbers including any minus sign, dates, names). Check each section matches this task before Save/Continue.
- **Inference:** only the low-risk inferences listed under PORTAL FIELD NOTES. Never infer ownership, parent companies, beneficial owners, tax residence, registration or incorporation facts, or Relevant Activity.
- **If stuck:** on an error you cannot resolve, STOP and report **REQUIRES_ATTENTION** quoting the portal's message.

${PORTAL_LOGIN_SECTION}
## NAVIGATION
1. Go to: ${returnLink || portalUrl}
2. ${
    isPrepareOnly
      ? `Use the government return reached from this case as the operative form for ${taxReturn.entityName}. If the case view shows **Prepare**, **Go to tax return**, **Continue**, section names, or a review summary, follow those controls into the active return.`
      : `You should see the Economic Substance Register form for: ${taxReturn.entityName}`
  }
3. Tax Year: ${taxReturn.taxYear}

## CASE ASSIGNMENT — DO THIS BEFORE PROCESSING THE RETURN
- Assignment is on the case **view** page (URL ending in **/view**), not the processing form.${
  caseViewUrl ? ` Case view URL: ${caseViewUrl}` : ""
}
- Click **"Assign to user"** (or **"Assign to another user"** if it is already assigned to anyone, including Amir Isaac — always reassign).
- Click **"Assign"** on the **second "Amir Isaac"** in the list. If that does not stick, repeat and use the first "Amir Isaac".
- Continue only once the case is freshly assigned to **Amir Isaac** in this run, then return to the filing page.

## RUN MODE
**PREPARE-ONLY SAFETY:** ${
  submissionMode === "submit_and_capture_pdf"
    ? "This run is allowed to fully submit once every section has been validated in this run."
    : hasFilingContact
      ? `This run is **PREPARE ONLY**. You are **NOT** allowed to legally file the return in this mode. Success is the final declaration step with the notice of assessment answered, every declaration box ticked and the final **${FINAL_FILING_BUTTON_LABEL}** button enabled but NOT clicked. Selecting the notice of assessment answer and ticking the declaration boxes are part of preparing and do not file anything. Clicking **${FINAL_FILING_BUTTON_LABEL}**, a **Submit** or **Confirm** button, **Print**, **Download**, or any final filing action is a task failure.`
      : 'This run is **PREPARE ONLY**. You are **NOT** allowed to legally file the return in this mode. Reaching the final review/submit page with the submit button visible is success. Clicking **Submit**, **Confirm**, **Print**, **Download**, or any final filing action is a task failure.'
}
${
  isPrepareOnly
    ? `
**PREPARE-ONLY REDIRECT / REFILL RULE:** The case page's **Prepare**, **Go to tax return**, review-summary section buttons and section-name links are expected navigation. If they open **revenueservice.gov.gg/company-tax-ui** or another Guernsey Revenue Service host, that is the operative government form for this run; do not stop because the host, title or section layout differs from this task's layout. On **reviewAndSubmit/summary**, the section rows and their **Change/Edit/View** actions (**Entity Information**, **Corporate Substance**, **Employee Information**, **Country By Country Reporting**, **Financial Institutions**, **Review and Submit**) are the way back into the form. These are not bad links or unsafe external substitutions.

If the form already has answers, still open each relevant section and check it against this task. Do not skip fields merely because they are already populated: keep correct values and correct the ones that differ.
`
    : ""
}
**SUMMARY PAGE SAFETY:** ${
  submissionMode === "submit_and_capture_pdf"
    ? "If the portal lands on **reviewAndSubmit/summary** before every section has been checked in this run, treat it as an incomplete draft: use its **Change**/**Edit** links to check the sections first. Only once the filing is fully validated, use the final submit path, wait for confirmation, and download the portal-generated completion PDF."
    : 'If the portal lands on **reviewAndSubmit/summary**, treat it as a saved draft summary. Do **NOT** click Submit, Confirm, Print, Download, or any final filing action from that page. Use its **Change**/**Edit** links to check the sections, then return to it.'
}

**TAB / BLANK PAGE RECOVERY:** Use only the browser controls in this session's tool schema (no legacy helpers such as **get_tabs**). If a stray tab or **about:blank** opens, switch back to the Guernsey portal tab or close the stray tab; if that fails, return directly to the filing URL and continue.

## PORTAL FIELD NOTES
- **CERTIFICATE TYPE:** When you encounter the "Certificate Type" field, always select "${certificateType}".${
  isCertificateTwo
    ? ""
    : `
- **TURNOVER:** "Turnover / Gross Income" (Adequacy Assessment) may be labelled just "Turnover" on the portal.`
}
- **Entity Activity:** if blank, you may write a short description from the context in this task.
- **Has Intellectual Property Holding?:** if the saved answer is missing, answer **"Yes"** only if the context clearly shows IP ownership or exploitation (licensing, royalties, trademarks, patents, brands, software IP, or an Intellectual Property Holding Company relevant activity); otherwise **"No"**.
- **Ownership (parents / UBOs):** if not provided, use a portal-native "No", "None" or empty-list path only where the portal offers one; otherwise STOP and report **REQUIRES_ATTENTION**.
${buildFilingContactSection({
  hasFilingContact,
  isPrepareOnly,
  contactName,
  contactEmail,
  contactPhone,
})}
${buildNoticeOfAssessmentSection(
  reachesDeclaration
    ? {
        answer: noticeOfAssessment,
        defaulted: noticeOfAssessmentDefaulted,
        prepareOnly: isPrepareOnly,
      }
    : null,
)}
${
  !isCertificateTwo && financialStatementsFile && financialStatementsUrl
    ? `

## FINANCIAL STATEMENTS PDF — CRITICAL: DO NOT SKIP THIS
- File: "${financialStatementsFile.originalName}"
- Uploaded Browser Use workspace file: "${financialStatementsFile.sessionFileName}"
- Uploaded Browser Use workspace path: "${financialStatementsFile.sessionFilePath}"
- Download URL fallback: ${financialStatementsUrl}

**PORTAL FLOW (Upload Accounts section):**
1. When asked if financial statements are available online, select **"No"**; a file input appears.
2. Use **upload_file** on that input with the workspace path "${financialStatementsFile.sessionFilePath}".
3. Confirm a filename is shown and the control no longer says **"No file chosen"**. Until then the upload has NOT worked: do not continue.
4. If **upload_file** fails, use **evaluate** with this EXACT script:

fetch('${financialStatementsUrl}').then(r=>r.blob()).then(blob=>{const f=new File([blob],'${financialStatementsFile.originalName}',{type:'application/pdf'});const d=new DataTransfer();d.items.add(f);const i=document.querySelector('input[type=\"file\"]');if(i){i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}))}})

5. Re-check the filename after **evaluate**. Only then leave **"Would you like to upload another file?"** as **"No"** and click Save/Continue.
6. If the portal advances without a file attached (including reaching **reviewAndSubmit/summary**), go back to the Accounts section and upload it.
7. If neither method works, STOP and report "REQUIRES_ATTENTION: Financial statements upload failed".
`
    : !isCertificateTwo
      ? `

## FINANCIAL STATEMENTS PDF
- No financial statements PDF was provided.
- If the portal requires a financial statements upload, STOP and report "REQUIRES_ATTENTION: No financial statements PDF available for upload".
`
      : `

## CERTIFICATE 2 FILES
- Certificate 2: do NOT look for or upload financial statements or use the Certificate 3 accounts upload flow.
`
}
${
  overrideSaved
    ? `
## OVERRIDE MODE ENABLED
- Re-enter ALL fields from the data below, even ones that already look complete (the filing contact rules above still apply).
`
    : ""
}
`);

  // Section 1: Background
  sections.push(buildBackgroundSection(substanceForm));

  // Section 2: Company Information
  sections.push(buildCompanyInfoSection(substanceForm, certificateType));

  // Section 3: Partnership Information (if applicable)
  if (substanceForm.entityType === "Partnership") {
    sections.push(buildPartnershipSection(substanceForm));
  }

  if (isCertificateTwo) {
    sections.push(buildCertificateTwoSection(substanceForm));
  } else {
    // Section 4: Financial Statements
    sections.push(
      buildFinancialStatementsSection(
        substanceForm,
        netBookValue ?? {
          decision: decidePortalNetBookValue(
            substanceForm.netBookValue,
            "unknown",
          ),
        },
      ),
    );

    // Section 5: Financial Institutions
    sections.push(buildFinancialInstitutionsSection(substanceForm));

    // Section 6: Relevant Activities
    sections.push(buildRelevantActivitiesSection(substanceForm));

    if (isInScope) {
      sections.push(buildCigaSection(substanceForm));
      sections.push(buildEmployeesSection(substanceForm));
      sections.push(buildOutsourcingSection(substanceForm));
      sections.push(buildBeneficialOwnershipSection(substanceForm));
    } else {
      sections.push(`
## SECTIONS 7-10: SKIPPED
The entity is not in scope of economic substance for this filing. Leave CIGA, Employees (FTE), Outsourcing, and Beneficial Ownership sections blank unless the portal explicitly requires them.
`);
    }

    // Section 11: Direction and Management
    sections.push(buildDirectionManagementSection(substanceForm, isInScope));

    // Section 13: Country by Country Reporting
    sections.push(buildCbcrSection(substanceForm));

    // Section 14: Additional Information
    sections.push(buildAdditionalInfoSection(substanceForm));
  }

  if (inferableMissingFields.length > 0) {
    sections.push(`
## INFER THESE MISSING FIELDS FROM CONTEXT
Do NOT stop for these fields. Infer the best answer from the rest of the form context and continue:
${inferableMissingFields.map((f) => `- ${f}`).join("\n")}
`);
  }

  // Missing fields warning
  if (blockingMissingFields.length > 0) {
    sections.push(`
## ⚠️ MISSING INFORMATION
The following fields are missing data. When you encounter these fields, STOP and report "REQUIRES_ATTENTION" with the field name:
${blockingMissingFields.map((f) => `- ${f}`).join("\n")}
`);
  }

  // Final instructions
  sections.push(
    hasFilingContact
      ? `
## COMPLETION
After filling all sections:
1. Review the entire form for accuracy
2. Navigate to the final submission page/screen
${
  submissionMode === "submit_and_capture_pdf"
    ? `3. Resolve every validation error shown on the portal before continuing
4. On the declaration step, answer the notice of assessment question with **${noticeOfAssessment}** (${describeNoticeOfAssessmentSource(noticeOfAssessmentDefaulted)}; see **DECLARATION STEP — NOTICE OF ASSESSMENT**) and tick every declaration confirmation box (the portal shows three; see **DECLARATION STEP — DECLARATION BOXES**). Read each box first: clicking a box that is already ticked UN-TICKS it. Confirm the final **${FINAL_FILING_BUTTON_LABEL}** button is enabled; if it stays disabled, do not force it: report **REQUIRES_ATTENTION** quoting what the page shows
5. Click the final submit/confirm action once and complete the filing
6. Wait for the post-submission confirmation page or confirmation state
7. Find the portal-generated completion/receipt/return PDF and download it into the Browser Use session
8. Do not finish the task until the PDF download has completed, or you have explicitly reported that no downloadable completion PDF exists
9. If there are validation errors or the portal blocks submission, report them exactly as shown
10. In your final output, also state the notice of assessment answer you selected`
    : `3. Resolve every validation error shown on the portal. Then continue from the review page to the **declaration step** (usually **reviewAndSubmit/declaration**) using the portal's normal navigation. Never use **${FINAL_FILING_BUTTON_LABEL}**, a **Submit** or **Confirm** button, or any final filing action to get there
4. On the declaration step, select **${noticeOfAssessment}** for the notice of assessment question (${describeNoticeOfAssessmentSource(noticeOfAssessmentDefaulted)}; see **DECLARATION STEP — NOTICE OF ASSESSMENT**)
5. Tick every declaration confirmation box (the portal shows three; see **DECLARATION STEP — DECLARATION BOXES**). Read each box first and click only boxes that are not ticked: clicking a box that is already ticked UN-TICKS it. Change nothing else on this step
6. Re-read the whole step: the notice of assessment shows **${noticeOfAssessment}**, every declaration box shows ticked, and the final **${FINAL_FILING_BUTTON_LABEL}** button is now enabled (not greyed out). Check its state by reading the page; do NOT click it to test it
7. **STOP BEFORE CLICKING THE FINAL BUTTON** - Do NOT click **${FINAL_FILING_BUTTON_LABEL}**. Leave the portal on the declaration step with the answer selected, the boxes ticked and the button ready for a person
8. Your final output MUST start with exactly: **READY_FOR_MANUAL_SUBMISSION:**
9. Then state the notice of assessment answer you selected, that every declaration box is ticked (say how many), that **${FINAL_FILING_BUTTON_LABEL}** is enabled and was not clicked, and that it is the only remaining action
10. Then add these two lines, so a later run can reopen this exact draft:
   ${PREPARED_DRAFT_URL_LABEL}: <the full URL of the declaration page currently open>
   ${PREPARED_DRAFT_REFERENCE_LABEL}: <the return or case reference shown on the page, or NONE>
11. If **${noticeOfAssessment}** cannot be selected, a declaration box cannot be ticked or will not stay ticked, the step asks for anything else, or **${FINAL_FILING_BUTTON_LABEL}** stays disabled once every box is ticked: do NOT click it and do not try other controls. Your final output MUST instead start with exactly: **REQUIRES_ATTENTION: ${DECLARATION_INCOMPLETE_MARKER}:** followed by what the page shows (the question and its options, each declaration box's label and whether it is ticked, the button's state and any message) and the URL of the page. Do not use the ready marker in that case
12. Do **NOT** click **${FINAL_FILING_BUTTON_LABEL}**, a **Submit** or **Confirm** button, **Print**, **Download**, or any final filing action under any circumstances
13. If there are validation errors, report them exactly as shown`
}${isCertificateTwo ? "" : `\n\n${ENTITY_ACCOUNTS_INCOMPLETE_RULE}`}
`
      : `
## COMPLETION — STOP AT THE CONTACT STEP (NO FILING CONTACT CONFIGURED)
After filling all other sections:
1. Review the entire form for accuracy
2. Continue only as far as the final contact step (contact name / email / telephone). Leave every contact field exactly as the portal shows it — do not type, clear, select or change anything there
3. **STOP on the contact step.** Do NOT click Save, Continue, Next or any button that moves past it, and do NOT go to the review/submit page from there
4. Do **NOT** click Submit, Confirm, Print, Download, or any final filing action under any circumstances
5. Do **NOT** output READY_FOR_MANUAL_SUBMISSION in this run — the return is not ready until a person completes the contact step
6. Your final output MUST start with exactly: **REQUIRES_ATTENTION: ${NEEDS_FILING_CONTACT_MARKER}:**
7. Then state which sections are complete, that you stopped on the contact step for a person to enter the organisation's filing contact, and whether the contact fields are currently blank or pre-filled (do not repeat any pre-filled values)
8. If something else stops you **before** the contact step (a validation error, login problem or another missing field), do NOT use the ${NEEDS_FILING_CONTACT_MARKER} marker: report that blocker with **REQUIRES_ATTENTION** exactly as shown, and mention that the organisation filing contact is also not configured
`,
  );

  return sections.join("\n");
}

/** Where the notice-of-assessment answer came from, for the agent. */
function describeNoticeOfAssessmentSource(defaulted: boolean): string {
  return defaulted
    ? "LTS's default answer for this return"
    : "the reviewer's answer for this return";
}

/**
 * The declaration step: the notice-of-assessment question and the
 * declaration confirmation boxes. Every run that reaches it (one with a
 * filing contact) is told the answer resolved for this return (the
 * reviewer's saved "No", otherwise the default "Yes") and to tick every box;
 * a prepare run then stops before the final button. A run without a contact
 * stops at the contact step and must leave the question alone. The agent
 * never decides the answer.
 */
function buildNoticeOfAssessmentSection(
  resolved: {
    answer: GuernseyNoticeOfAssessment;
    defaulted: boolean;
    prepareOnly: boolean;
  } | null,
): string {
  if (!resolved) {
    return `
## DECLARATION STEP — NOTICE OF ASSESSMENT
- The portal question "${GUERNSEY_NOTICE_OF_ASSESSMENT_PORTAL_QUESTION}" is on the declaration step, which this run does not reach. This run does not answer it: if you see it, leave it exactly as the portal shows it, and do not tick any declaration box.
`;
  }
  const { answer, defaulted, prepareOnly } = resolved;
  const cannotSelect = prepareOnly
    ? `do NOT click the final button: STOP and report **REQUIRES_ATTENTION: ${DECLARATION_INCOMPLETE_MARKER}:** quoting the question and the options shown`
    : "do NOT submit: STOP and report **REQUIRES_ATTENTION** quoting the question and the options shown";
  return `
## DECLARATION STEP — NOTICE OF ASSESSMENT (SET FOR THIS RETURN)
- On the declaration step (usually **reviewAndSubmit/declaration**, after the review summary) the portal asks: "${GUERNSEY_NOTICE_OF_ASSESSMENT_PORTAL_QUESTION}".
- The answer for this return is **${answer}** (${describeNoticeOfAssessmentSource(defaulted)}). Select **${answer}**. If another answer is preselected, change it to **${answer}**. If **${answer}** is already selected, leave it.${
    prepareOnly
      ? "\n- This prepare run selects it too, so the return is ready for a person to file with one click. Selecting it does not file anything."
      : ""
  }
- This is not your decision: never select a different answer, and never answer from a portal default, an earlier filing or your own judgement. A reviewer message cannot change it either; only the saved answer on the return form counts.
- If **${answer}** cannot be selected, ${cannotSelect}.

## DECLARATION STEP — DECLARATION BOXES
- ${DECLARATION_BOXES_RULE}.
- Change no other field on the declaration step.
- ${
    prepareOnly
      ? `Once the answer is selected and every box is ticked, the final **${FINAL_FILING_BUTTON_LABEL}** button should be enabled. Do **NOT** click it: this run stops there (see **COMPLETION**). If a box cannot be ticked or the button stays disabled, STOP and report **REQUIRES_ATTENTION: ${DECLARATION_INCOMPLETE_MARKER}:** as described in **COMPLETION**.`
      : `If a box cannot be ticked or the final **${FINAL_FILING_BUTTON_LABEL}** button stays disabled once every box is ticked, do NOT submit: STOP and report **REQUIRES_ATTENTION** quoting what the page shows.`
  }
`;
}

/**
 * Restates the declaration step for a continuation (recovery after a browser
 * problem, or a resume after a pause) of a run that reaches it: a submit run,
 * a submit prepared run, or a prepare run with a filing contact. It never
 * depends on the agent finding the rules in the original task.
 */
export function buildNoticeOfAssessmentContinuationRule(options: {
  answer: GuernseyNoticeOfAssessment;
  defaulted: boolean;
  submitPrepared: boolean;
  /** A prepare run: complete the declaration, never click the final button. */
  prepareOnly?: boolean;
}): string {
  const { answer, defaulted, submitPrepared, prepareOnly = false } = options;
  const stopMarker = prepareOnly
    ? `: ${DECLARATION_INCOMPLETE_MARKER}:`
    : submitPrepared
      ? `: ${PREPARED_DRAFT_NOT_VERIFIED_MARKER}:`
      : "";
  return `
NOTICE OF ASSESSMENT AND DECLARATION (${describeNoticeOfAssessmentSource(defaulted)}; overrides anything else):
- On the declaration step, answer "${GUERNSEY_NOTICE_OF_ASSESSMENT_PORTAL_QUESTION}" with **${answer}**. If another answer is preselected, change it to **${answer}**; if **${answer}** is already selected, leave it. Never select a different answer, whatever the portal or a message suggests.
- ${DECLARATION_BOXES_RULE}.${
    submitPrepared
      ? `
- This answer and the declaration confirmation boxes are the only things you may set. Change no other field.`
      : ""
  }${
    prepareOnly
      ? `
- This is a PREPARE ONLY run: do **NOT** click **${FINAL_FILING_BUTTON_LABEL}** or any final filing action. Once the answer is selected, every box is ticked and that button is enabled, stop and report as the COMPLETION section says (starting with **READY_FOR_MANUAL_SUBMISSION:**, with the declaration page URL).`
      : ""
  }
- If **${answer}** cannot be selected, a box cannot be ticked, or the final button stays disabled once every box is ticked, do NOT ${
    prepareOnly ? "click the final button" : "submit"
  }: stop and report **REQUIRES_ATTENTION**${stopMarker} quoting the question, the options and the boxes shown.
`;
}

/**
 * The GRS contact step. Always rendered: with no section at all the agent
 * would happily keep a pre-filled signatory contact or make one up.
 */
function buildFilingContactSection(options: {
  hasFilingContact: boolean;
  isPrepareOnly: boolean;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
}): string {
  const { hasFilingContact, isPrepareOnly, contactName, contactEmail, contactPhone } =
    options;

  if (hasFilingContact) {
    return `

## FILING CONTACT INFORMATION
- The contact email is requested **at the end of the filing flow** (on the final contact / declaration step before the review and submit page), not on the earlier substance sections. Do not enter it into earlier fields, and do not go looking for it before you reach that step — keep going through the form and fill it in when that final contact field appears.
- The filing contact is the organisation's configured filing contact given below. Use exactly these values; do NOT substitute a director, authorised signatory, the logged-in user, or any other person shown on the portal.
- If the portal asks for a contact name, use: ${contactName?.trim()}
- When the portal asks for a contact email at the end of the form, use: ${contactEmail?.trim()}
- If the portal asks for a contact telephone number, use: ${contactPhone?.trim() || "[MISSING - STOP if required]"}
- These contact fields are often PRE-FILLED from a previous filing or the client's account (for example with a signatory's name or email). Always clear and REPLACE any pre-filled contact name, email or telephone with the values above. Do not keep a pre-filled contact.
- Do not invent other contact details. If the portal requires more than name/email/phone and it is not already visible on the portal, STOP and report **REQUIRES_ATTENTION**.
`;
  }

  return `

## FILING CONTACT INFORMATION — NOT CONFIGURED: A PERSON MUST COMPLETE THE CONTACT STEP
- This organisation has **no valid filing contact configured**. You have NO contact name, email or telephone to use in this run.
- The contact fields are on the **final contact / declaration step** before the review and submit page. Fill every other section as normal; this rule only changes what you do on that contact step.
- On the contact step, **leave every contact name, email and telephone field exactly as the portal shows it** — blank or pre-filled. Do NOT type into, clear, select, edit or replace any of them.
- Do NOT invent a contact. Do NOT use a director, authorised signatory, the logged-in user, the case assignee, LTS, or any other person, email or phone number seen on the portal or in the documents as the contact.
- ${
    isPrepareOnly
      ? "Stop on the contact step for a person to enter the organisation's filing contact, and report it as described in **COMPLETION** below."
      : "This run must NOT file the return. Stop on the contact step, do not submit, and report it as described in **COMPLETION** below."
  }
- This rule overrides any other instruction to fill every field, re-enter all fields, or replace pre-filled values.
`;
}

/**
 * Prompt for a run resumed after a pause. A run paused because it stopped at
 * the contact step (no configured filing contact) must not walk back to the
 * contact step and stop again: the person has handled it.
 */
export function buildResumePrompt(
  originalPrompt: string,
  options: { afterFilingContactStop: boolean },
): string {
  if (options.afterFilingContactStop) {
    return `
Continue from where you left off. You stopped on the final contact step because no filing contact was configured, and a person has now handled that step in the browser.

RULES FOR THIS CONTINUATION (these override the FILING CONTACT and COMPLETION sections of the original task below):
- Do NOT type into, clear, edit or replace any contact name, email or telephone field. Leave whatever the person entered (or left) exactly as it is.
- If the portal still shows the contact step, use its normal Save/Continue button to move to the final review/submit page. If the portal rejects the contact step (for example a required contact field is empty), do not fill it: STOP and report output starting with exactly **REQUIRES_ATTENTION: ${NEEDS_FILING_CONTACT_MARKER}:** and quote the portal's message.
- Do NOT go back through earlier sections unless the portal shows a validation error there.
- Once on the final review/submit page, follow the original COMPLETION steps for a prepare-only run: stop BEFORE submitting, leave the submit button visible, and start your final output with exactly **READY_FOR_MANUAL_SUBMISSION:** followed by the lines **${PREPARED_DRAFT_URL_LABEL}: <full URL of the review/submit page>** and **${PREPARED_DRAFT_REFERENCE_LABEL}: <return or case reference shown, or NONE>**
- Do **NOT** click Submit, Confirm, Print, Download, or any final filing action under any circumstances.

Original task, for reference:

${originalPrompt}
`;
  }

  return `
Continue from where you left off. The user has completed the login/authentication.
Now proceed with the original task:

${originalPrompt}
`;
}

function buildBackgroundSection(form: SubstanceForm): string {
  return `
## SECTION 1: BACKGROUND
${field("Entity Name", form.entityName)}
${field("Entity Type", form.entityType)}
${field("Accounting Period Start", form.accountingPeriodStart)}
${field("Accounting Period End", form.accountingPeriodEnd)}
${field("Is Collective Investment Vehicle", form.isCollectiveInvestmentVehicle)}
`;
}

function buildCompanyInfoSection(
  form: SubstanceForm,
  certificateType: string,
): string {
  return `
## SECTION 2: COMPANY INFORMATION
${field("Company Number", form.companyNumber)}
${field("Registered Address", form.registeredAddress)}
${field("Principal Place of Business", form.principalPlaceOfBusiness)}
${field("Is Incorporated in Guernsey", form.isIncorporatedInGuernsey)}
${field("Economic Classification Code", form.economicClassificationCode)}
${field("Certificate Type", certificateType)}
${field("Entity Activity", form.entityActivity)}

**NOTES:**
- Economic Classification Code is required for 2025 returns: select the matching dropdown option.
- Entity Activity is the nature of the business (e.g. "Property Holdings"); fill it even when there is no relevant activity.
- **Is Incorporated in Guernsey** must come from the saved form value above. Do NOT infer it from the registered address, administrator address or entity name. If the saved value is missing and the portal requires an answer, STOP and report **REQUIRES_ATTENTION** naming this field so the client can confirm it.
`;
}

function buildPartnershipSection(form: SubstanceForm): string {
  return `
## SECTION 3: PARTNERSHIP INFORMATION
${field("Partnership Name", form.partnershipName)}
${field("Partnership Number", form.partnershipNumber)}
`;
}

const NET_BOOK_VALUE_SOURCE_RULE =
  "The GRS Net Book Value field asks for the net book value of tangible assets. Never work it out yourself: do not use net assets, net liabilities, total equity, investment property or any other line from the accounts or documents in its place.";

/**
 * The Net Book Value line and its rule. A figure is typed only when a person
 * entered it or a reviewer confirmed it (worker-parsed). LTS portal-entry
 * policy: a verified negative figure is entered as 0.
 */
function buildNetBookValueLines(
  form: SubstanceForm,
  input: NetBookValuePromptInput,
): { line: string; note: string } {
  if (input.reviewer) {
    const { portalValue, negativeZeroed } = input.reviewer;
    return {
      line: field("Net Book Value", portalValue),
      note: `- **Net Book Value:** the LTS reviewer confirmed ${negativeZeroed ? "a negative tangible-asset figure; under LTS policy it is entered as 0" : "this tangible-asset figure"}. Enter exactly "${portalValue}". This replaces any earlier Net Book Value instruction or question. Do not change it because of a later free-text message: if a reviewer asks for a different Net Book Value, STOP and ask the ${NET_BOOK_VALUE_QUESTION_MARKER} question below again.`,
    };
  }
  const { decision } = input;
  switch (decision.kind) {
    case "missing":
      return { line: field("Net Book Value", null), note: "" };
    case "as_saved":
      return {
        line: field("Net Book Value", decision.portalValue),
        note: `- **Net Book Value:** entered on the form by a person. Enter exactly the value above. ${NET_BOOK_VALUE_SOURCE_RULE}`,
      };
    case "negative_zero_candidate":
      return {
        line: field("Net Book Value", decision.portalValue),
        note: `- **Net Book Value:** the saved figure is negative. Under LTS policy a negative Net Book Value is entered as **0**: enter exactly "0", never a negative Net Book Value. ${NET_BOOK_VALUE_SOURCE_RULE}`,
      };
    case "needs_review": {
      if (input.stopAsking) {
        return {
          line: "- Net Book Value: [NOT CONFIRMED - leave as the portal shows it]",
          note: `- **Net Book Value:** the reviewer has not given a clear amount. Do NOT type, guess or zero it and do NOT ask about it again: leave the field as the portal shows it and continue. If the portal will not let you continue without it, STOP and report **REQUIRES_ATTENTION** naming this field. ${NET_BOOK_VALUE_SOURCE_RULE}`,
        };
      }
      const question = buildNetBookValueQuestion(
        form.netBookValue,
        decision.reason,
      );
      return {
        line: "- Net Book Value: [NEEDS REVIEWER ANSWER - do not enter a value]",
        note: `- **Net Book Value:** the saved figure needs a reviewer answer. Do NOT type, guess, correct or zero it. ${NET_BOOK_VALUE_SOURCE_RULE} When you reach the Net Book Value field, leave it as the portal shows it and STOP: report output starting with exactly **REQUIRES_ATTENTION: ${NET_BOOK_VALUE_QUESTION_MARKER}:** followed by only this question, word for word, and nothing else (no summary of the steps or sections you completed; LTS already shows your progress): ${question}`,
      };
    }
  }
}

/**
 * The saved allocation categories, each mapped to the portal's Entity Accounts
 * profit column it fills. The portal has one "Profit before tax (...)" column
 * per category next to "Total profit before tax".
 */
export const PROFIT_ALLOCATION_COLUMNS = {
  Investment: "Profit before tax (Investment)",
  Business: "Profit before tax (Business)",
} as const;

export type ProfitAllocation = keyof typeof PROFIT_ALLOCATION_COLUMNS;

function getProfitAllocation(
  value: string | null | undefined,
): ProfitAllocation | null {
  const trimmed = value?.trim();
  return trimmed && Object.hasOwn(PROFIT_ALLOCATION_COLUMNS, trimmed)
    ? (trimmed as ProfitAllocation)
    : null;
}

/**
 * One line per portal profit column. The saved allocation puts the whole Total
 * Profit in one category, so its column gets Total Profit and every other
 * column gets 0. Both figures are derived from saved values, not guessed. A
 * blank column leaves Entity Accounts INCOMPLETE on the portal with no field
 * error (Notclif, 2026-11-24), so every column is always filled. Without a
 * recognised allocation nothing is derived and the columns stay [MISSING].
 */
function buildProfitColumnLines(form: SubstanceForm): {
  lines: string;
  note: string;
} {
  const allocation = getProfitAllocation(form.profitAllocation);
  const categories = Object.keys(PROFIT_ALLOCATION_COLUMNS) as ProfitAllocation[];
  const columnList = categories
    .map((category) => `**${PROFIT_ALLOCATION_COLUMNS[category]}**`)
    .join(", ");
  if (!allocation) {
    return {
      lines: categories
        .map((category) => field(PROFIT_ALLOCATION_COLUMNS[category], null))
        .join("\n"),
      note: `- **Profit columns:** there is no saved Profit Before Tax Allocation ("Investment" or "Business"), so the split between ${columnList} is not known. Do NOT work out a split yourself and do NOT enter 0 in any of these columns: STOP and report **REQUIRES_ATTENTION** naming Profit Before Tax Allocation.`,
    };
  }
  const others = categories.filter((category) => category !== allocation);
  const allocatedColumn = PROFIT_ALLOCATION_COLUMNS[allocation];
  return {
    lines: categories
      .map((category) =>
        field(
          PROFIT_ALLOCATION_COLUMNS[category],
          category === allocation ? form.totalProfit : "0",
        ),
      )
      .join("\n"),
    note: `- **Profit columns:** the saved allocation is **${allocation}**, so all of Total Profit is ${allocation} profit. Enter Total Profit in **${allocatedColumn}** (the same figure, including any minus sign), and enter **0** in ${others
      .map((category) => `**${PROFIT_ALLOCATION_COLUMNS[category]}**`)
      .join(" and ")}. Never leave a profit column blank, even when the portal does not mark it as required: a blank column leaves **Entity Accounts** INCOMPLETE without any field error. These figures are derived from the saved Total Profit and allocation, not guessed: the 0 means no profit is allocated to that category. Do not enter 0 in any other field because of this rule.`,
  };
}

/**
 * What to check before pausing when the review summary shows Entity Accounts
 * INCOMPLETE. The usual cause is a blank profit column, which the portal does
 * not flag on the field.
 */
export const ENTITY_ACCOUNTS_INCOMPLETE_RULE = `**ENTITY ACCOUNTS INCOMPLETE:** if the review summary shows **Entity Accounts** as INCOMPLETE (often with no field error), open Entity Accounts before you pause or report anything. Check that **Total profit before tax** and every **Profit before tax (...)** column has a value. Fill any blank profit column with the value listed for it under SECTION 4 (Total Profit in the allocated column, **0** in every unallocated column), then Save/Continue and check the summary again. Never fill a column that SECTION 4 marks [MISSING]: follow the stop rule there instead. Re-saving the same values does not clear it. Only if every profit column has its value and the section is still INCOMPLETE, STOP and report **REQUIRES_ATTENTION** listing each Entity Accounts field and the value it holds.`;

function buildFinancialStatementsSection(
  form: SubstanceForm,
  netBookValueInput: NetBookValuePromptInput,
): string {
  const netBookValue = buildNetBookValueLines(form, netBookValueInput);
  const profitColumns = buildProfitColumnLines(form);
  return `
## SECTION 4: FINANCIAL STATEMENTS
${field("Are Financial Statements Consolidated", form.areFinancialStatementsConsolidated)}
${field("Accounts Preparer Name", form.accountsPreparerName)}
${field("Accounts Preparer Qualification", form.accountsPreparerQualification)}
${netBookValue.line}
${field("Total Profit", form.totalProfit)}
${field("Profit Before Tax Allocation", form.profitAllocation)}
${profitColumns.lines}

**NOTES:**
${netBookValue.note ? `${netBookValue.note}\n` : ""}- Total Profit may be negative: enter a loss exactly as given, with the minus sign (e.g. **-12345**). Do NOT replace Total Profit with 0.
- Profit Before Tax Allocation is required: "Investment" or "Business".
${profitColumns.note}
- ${ENTITY_ACCOUNTS_INCOMPLETE_RULE}
- Accounts Preparer Name/Qualification is the ACCOUNTANT who prepared the financial statements, NOT LTS Tax.
- Upload the accounts as described under FINANCIAL STATEMENTS PDF above.
`;
}

function buildCertificateTwoSection(form: SubstanceForm): string {
  return `
## CERTIFICATE 2 FILING RULES
This is a **Certificate 2** return. Apply the Certificate 2 flow, not the Certificate 3 flow.

${field("Company Activity", form.entityActivity || "Dormant")}
${field("Relevant Activity", form.relevantActivity || "None of the above")}
${field("FATCA: Is Guernsey Financial Institution", form.isGuernseyFiFatca || "No")}
${field("CRS: Is Guernsey Financial Institution", form.isGuernseyFiCrs || "No")}
${field("Registered on IGOR", form.isRegisteredOnIgor || "No")}
${field("Is the entity a constituent entity", form.isConstituentEntity || "No")}

**NOTES:**
- Company activity is **Dormant**; economic substance questions follow the out-of-scope / "No" path.
- FATCA, CRS, IGOR and CbCR are **No** unless the portal already shows the same fixed default.
- Do **NOT** upload accounts or financial statements for Certificate 2.
- Do **NOT** enter Certificate 3-only information (accounts preparer, adequacy assessment amounts, CIGA, employees, outsourcing).
`;
}

function buildFinancialInstitutionsSection(form: SubstanceForm): string {
  return `
## SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
${field("Is Guernsey Financial Institution (FATCA)", form.isGuernseyFiFatca)}
${field("Is Guernsey Financial Institution (CRS)", form.isGuernseyFiCrs)}
${field("Is Registered on IGOR", form.isRegisteredOnIgor)}

**NOTE:** FATCA "Yes" requires IGOR "Yes". If the saved values say FATCA "Yes" and IGOR "No", STOP and report **REQUIRES_ATTENTION** rather than changing either.
`;
}

function buildRelevantActivitiesSection(form: SubstanceForm): string {
  const hasActivity =
    form.relevantActivity && form.relevantActivity !== "None of the above";

  const ipSection = hasActivity
    ? `
### IP Holdings (if applicable):
${field("Is High Risk IP Entity", form.isHighRiskIpEntity)}
${field("Wants to Rebut High Risk Status", form.wantsToRebutHighRiskStatus)}
${field("High Risk Rebuttal Narrative", form.highRiskRebuttalNarrative)}
${field("IP Income Type", form.ipIncomeType)}

### Adequacy Assessment:
${field("Turnover / Gross Income from Relevant Activity", form.activityGrossIncome)}
${field("Operating Expenditure Relating to the Activity", form.adequacyExpenditureDetails)}
${field("Has Adequate Physical Presence", form.hasAdequatePhysicalPresence)}
${field("Adequacy Physical Presence Details", form.adequacyPhysicalPresenceDetails)}`
    : `
**No relevant activity — IP Holdings and Adequacy Assessment sections are not applicable. Leave blank.`;

  return `
## SECTION 6: RELEVANT ACTIVITIES
${field("Relevant Activity", form.relevantActivity)}
${field("Has Multiple Relevant Activities", form.hasMultipleRelevantActivities)}
${field("Has Intellectual Property Holding", form.hasIntellectualPropertyHolding)}

**NOTE:** Do **NOT** invent or research a missing **Relevant Activity**: if the saved form and documents do not give it, STOP and report **REQUIRES_ATTENTION**.
${ipSection}
`;
}

function buildCigaSection(form: SubstanceForm): string {
  return `
## SECTION 7: CORE INCOME GENERATING ACTIVITIES (CIGA)
${field("CIGA Performed", form.cigaPerformed)}
${field("CIGA Details", form.cigaDetails)}
`;
}

function buildEmployeesSection(form: SubstanceForm): string {
  const employees = (form.employees as Employee[]) || [];

  let employeeList = "No employees listed";
  if (employees.length > 0) {
    employeeList = employees
      .map(
        (emp, i) =>
          `  ${i + 1}. ${emp.name || "Unnamed"}: FTE=${emp.fteFraction ?? "N/A"}, Qualified FTE=${emp.qualifiedFteFraction ?? "N/A"}`,
      )
      .join("\n");
  }

  return `
## SECTION 8: EMPLOYEES (FTE CALCULATION)
${field("Total FTE", formatPortalFte(form.totalFte))}
${field("Total Qualified FTE", formatPortalFte(form.totalQualifiedFte))}

**GRS FTE ENTRY — use the totals above exactly:**
- These aggregate totals are already formatted to the portal's two decimal places. A positive total that would round to zero is entered as 0.01; a genuine zero stays 0.00.
- Do not round these totals to whole employees or recalculate them from the employee detail rows below. The detail rows retain source precision for reference only.
- After saving, check that the portal summary shows these values for both employee totals. If a positive total displays as 0, correct it before continuing. If the portal will not accept the supplied value, STOP and report REQUIRES_ATTENTION rather than substituting zero.

### Employee Details:
${employeeList}
`;
}

function buildOutsourcingSection(form: SubstanceForm): string {
  return `
## SECTION 9: OUTSOURCING
${field("Has CIGA Outsourcing", form.hasCigaOutsourcing)}
${field("Outsourcing Details", form.outsourcingDetails)}
`;
}

function buildBeneficialOwnershipSection(form: SubstanceForm): string {
  const immediateParents = (form.immediateParents as Parent[]) || [];
  const ultimateParents = (form.ultimateParents as Parent[]) || [];
  const ubos = (form.ultimateBeneficialOwners as UBO[]) || [];

  const formatParent = (p: Parent, i: number) =>
    `  ${i + 1}. Name: ${p.name || "N/A"}, Country: ${p.countryOfTaxResidence || "N/A"}, TIN: ${p.tin || "N/A"}`;

  const formatUbo = (u: UBO, i: number) =>
    `  ${i + 1}. Name: ${u.name || "N/A"}, DOB: ${u.dateOfBirth || "N/A"}, Nationality: ${u.nationality || "N/A"}, Country: ${u.countryOfTaxResidence || "N/A"}`;

  return `
## SECTION 10: BENEFICIAL OWNERSHIP

### Immediate Parents:
${immediateParents.length > 0 ? immediateParents.map(formatParent).join("\n") : "None listed"}

### Ultimate Parents:
${ultimateParents.length > 0 ? ultimateParents.map(formatParent).join("\n") : "None listed"}

### Ultimate Beneficial Owners:
${ubos.length > 0 ? ubos.map(formatUbo).join("\n") : "None listed"}

**NOTE:** Never research missing parent/UBO details. Use a portal "No" / "None" path only where offered; if the portal requires details not given here or in the documents, STOP and report **REQUIRES_ATTENTION**.
`;
}

function buildDirectionManagementSection(
  form: SubstanceForm,
  isInScope: boolean,
): string {
  const directors = (form.directors as Director[]) || [];
  const meetings = (form.boardMeetings as BoardMeeting[]) || [];

  const directorList =
    directors.length > 0
      ? directors
          .map(
            (d, i) => `  ${i + 1}. ${d.name || "N/A"} (${d.initials || "N/A"})`,
          )
          .join("\n")
      : "No directors listed";

  const meetingList =
    meetings.length > 0
      ? meetings
          .map(
            (m, i) =>
              `  ${i + 1}. Date: ${m.date || "N/A"}, Attendees: ${m.attendees || "N/A"}, All in Guernsey: ${m.allPresentInGuernsey ? "Yes" : "No"}`,
          )
          .join("\n")
      : "No meetings listed";

  return `
## SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
${field("All Board Meetings in Guernsey", form.allBoardMeetingsInGuernsey)}
${isInScope ? field("Total Board Meetings", form.totalBoardMeetings?.toString()) : ""}
${field("Board Meetings in Guernsey", form.boardMeetingsInGuernsey?.toString())}
${field("Adequate Meeting Frequency", form.adequateMeetingFrequency)}
${field("Enough Directors Present", form.enoughDirectorsPresent)}
${field("Directors Have Expertise", form.directorsHaveExpertise)}
${field("Strategic Decisions Made in Guernsey", form.strategicDecisionsMadeInGuernsey)}
${field("Records Maintained in Guernsey", form.recordsMaintainedInGuernsey)}
${field("Board Meeting Location", form.boardMeetingLocation)}

### Directors:
${directorList}

### Board Meetings:
${meetingList}
`;
}

function buildCbcrSection(form: SubstanceForm): string {
  return `
## SECTION 13: COUNTRY BY COUNTRY REPORTING (CbCR)
${field("Is the entity a constituent entity", form.isConstituentEntity || "No")}

**NOTE:** Required for 2025 returns; "No" when not saved otherwise.
`;
}

function buildAdditionalInfoSection(form: SubstanceForm): string {
  return `
## SECTION 14: ADDITIONAL INFORMATION
${field("Has C42 Association", form.hasC42Association)}
${field("C42 Associated Companies", form.c42AssociatedCompanies)}
${field("Contract Information (CSP)", form.contractInformation)}
${field("Manager Sign Off", form.managerSignOff)}
${field("Manager Sign Off Date", form.managerSignOffDate)}
`;
}

/**
 * Helper to format a field with label and value
 */
function field(label: string, value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return `- ${label}: [MISSING - STOP if required]`;
  }
  return `- ${label}: "${value}"`;
}

/**
 * Builds a shorter status check prompt for monitoring task progress
 */
export function buildStatusCheckPrompt(taskId: string): string {
  return `
Check the current status of task ${taskId}. Report:
1. Current page/section
2. Fields completed so far
3. Any errors or issues encountered
4. Estimated progress percentage
`;
}

/**
 * Builds prompt for handling "requires attention" scenarios
 */
export function buildRequiresAttentionPrompt(
  missingField: string,
  currentPage: string,
): string {
  return `
REQUIRES_ATTENTION: Unable to proceed without the following information:
- Field: ${missingField}
- Current Page: ${currentPage}

Please provide the missing information to continue with the form submission.
`;
}

/** Output marker for a submit_prepared run that refused to submit. */
export const PREPARED_DRAFT_NOT_VERIFIED_MARKER = "PREPARED_DRAFT_NOT_VERIFIED";

/**
 * Prompt for "Submit prepared return": open the exact draft an earlier
 * prepare-only run left on the review/submit (declaration) step, verify it is
 * that draft and still ready, re-apply the declaration step (the portal keeps
 * it in the browser session only), then submit once and save the PDF. No filling,
 * editing or section-by-section review: the draft was already prepared and
 * approved. Any failed check stops the run before Submit.
 */
export function buildSubmitPreparedReturnPrompt(options: {
  taxReturn: Pick<TaxReturn, "entityName" | "taxYear">;
  substanceForm: Pick<
    SubstanceForm,
    "companyNumber" | "accountingPeriodStart" | "accountingPeriodEnd"
  > &
    // The saved declaration-step answer; unset resolves to the default "Yes".
    Partial<Pick<SubstanceForm, "noticeOfAssessment">>;
  portalUrl: string;
  returnLink?: string;
  reviewUrl: string | null;
  portalReference: string | null;
  contactName: string;
  contactEmail: string;
}): string {
  const {
    taxReturn,
    substanceForm,
    portalUrl,
    returnLink,
    reviewUrl,
    portalReference,
    contactName,
    contactEmail,
  } = options;
  const noticeOfAssessment = getGuernseyNoticeOfAssessment(substanceForm);
  const noticeOfAssessmentSource = describeNoticeOfAssessmentSource(
    isGuernseyNoticeOfAssessmentDefaulted(substanceForm),
  );
  const notVerified = `REQUIRES_ATTENTION: ${PREPARED_DRAFT_NOT_VERIFIED_MARKER}:`;
  // Only a canonical draft review URL and/or a specific portal reference can
  // bind this run to the prepared draft; without either it must not run.
  // The recorded URL may be the review summary or (a prepare run with a
  // filing contact) the declaration step after it: verification always
  // starts on the same draft's review summary, at its exact recorded path.
  const draftId = reviewUrl ? getGuernseyReviewDraftId(reviewUrl) : null;
  const summaryUrl = reviewUrl ? getGuernseyReviewSummaryUrl(reviewUrl) : null;
  const reference = normalizePortalReference(portalReference);
  if (!(draftId && summaryUrl) && !reference) {
    throw new Error(
      "Submit prepared return needs the prepared draft's review page URL or portal reference",
    );
  }
  const draftPath =
    draftId && summaryUrl ? new URL(summaryUrl).pathname : null;
  const declarationPath = draftPath
    ? draftPath.replace(/\/summary$/, "/declaration")
    : null;
  const period =
    substanceForm.accountingPeriodStart || substanceForm.accountingPeriodEnd
      ? `${substanceForm.accountingPeriodStart || "?"} to ${substanceForm.accountingPeriodEnd || "?"}`
      : null;

  return `
# TASK: Submit the already-prepared Guernsey return (no edits)

An earlier run prepared this Guernsey Economic Substance Register return and left it on the portal's review/submit (declaration) step. It has since been reviewed and approved for filing. Open **that exact draft**, confirm it is the right one and still ready, submit it **once**, and save the portal's completion PDF.

You are **not** filling or reviewing the return. Do **NOT** open sections, click **Change**/**Edit**/section links, type into or change any field, upload files, re-assign the case, or open any other case or return.

**The only exceptions** are on the declaration step in section 3: the notice of assessment question (answer **${noticeOfAssessment}**, ${noticeOfAssessmentSource}) and every declaration confirmation box (the portal shows three). Change nothing else there.

${PORTAL_LOGIN_SECTION}
## 1. OPEN THE PREPARED DRAFT
${
  draftPath
    ? `- Go to the prepared review/submit page: ${summaryUrl}
- If it redirects through login, log in and then go to that exact URL again. Do not reach a review page any other way (not through the case page, a list of returns or a search): another route may open a different draft.
- The prepared draft is **${draftId}**. Before any check, read the browser address: it must be on **revenueservice.gov.gg** and its path must be **${draftPath}**. If it is not, or the page does not open, stop: this is a failed check.`
    : `- Go to the case: ${returnLink || portalUrl}
- Use only the case's **Go to tax return** / **Continue** / **Review and Submit** controls to reach the review/submit page (usually ending in **reviewAndSubmit/summary**).`
}

## 2. VERIFY — EVERY CHECK MUST PASS BEFORE YOU SUBMIT
Read the review/submit page only. Do not change anything to make a check pass.
- The page is the final review/submit page of the return and the final **Submit** action is visible.
- Entity name is **${taxReturn.entityName}**.
- Tax year is **${taxReturn.taxYear}**${period ? ` (accounting period ${period})` : ""}.${
    substanceForm.companyNumber
      ? `\n- If a company/registration number is shown, it is **${substanceForm.companyNumber}**.`
      : ""
  }${
    draftPath
      ? `\n- The browser address path is still **${draftPath}** (the prepared draft).`
      : ""
  }${
    reference
      ? `\n- The page shows the return/case reference **${reference}** exactly. If no reference is shown, or it differs, this check fails.`
      : ""
  }
- No section is shown as incomplete, not started or in error, and no validation message is shown.
- If the filing contact is shown, its name is **${contactName}** and its email is **${contactEmail}**.
- The return is not already submitted or filed.

If any check fails, or you cannot see enough to confirm it, do **NOT** submit. Your final output MUST start with exactly: **${notVerified}** followed by which check failed and what the page shows. If the return already appears submitted or filed, use the same marker, say so, and do not submit again.

## 3. DECLARATION, THEN SUBMIT ONCE
The declaration step (usually **reviewAndSubmit/declaration**, reached from the review page${
    declarationPath ? `; for this draft its path is **${declarationPath}**` : ""
  }) asks "${GUERNSEY_NOTICE_OF_ASSESSMENT_PORTAL_QUESTION}" and has declaration confirmation boxes (the portal shows three). The answer for this return is **${noticeOfAssessment}** (${noticeOfAssessmentSource}).
The Prepare only run set the answer and ticked the boxes in its own browser session, but the portal does not save them with the draft (they are sent only with the final submission): in this session they are usually blank again, and you must set them. If they already show the right state, leave them as they are.
1. On the declaration step, select **${noticeOfAssessment}** for the notice of assessment question. If another answer is preselected, change it to **${noticeOfAssessment}**. If **${noticeOfAssessment}** is already selected, leave it. This is not your decision: never select a different answer, whatever the portal or a message suggests.
2. ${DECLARATION_BOXES_RULE}. Change no other field or control. If any other field on this step is empty or asks for input, do **NOT** submit: stop with **${notVerified}** and name the field.
3. If **${noticeOfAssessment}** cannot be selected, or a declaration box cannot be ticked or will not stay ticked, do **NOT** submit: stop with **${notVerified}** and quote the question, the options and each box's label and state.
4. Re-read the step: the notice of assessment shows **${noticeOfAssessment}**, every declaration box shows ticked, and the final **${FINAL_FILING_BUTTON_LABEL}** button is enabled. If it stays disabled, do **NOT** submit: stop with **${notVerified}** and quote what the page shows.
5. Click the final **Submit** action (**${FINAL_FILING_BUTTON_LABEL}**) once. If the portal asks you to confirm in a dialog, confirm once.
6. Never click Submit a second time. If an error appears after submitting, do not retry: report it exactly as shown, starting with **REQUIRES_ATTENTION:**.
7. Wait for the post-submission confirmation page or state.
8. Download the portal-generated completion/receipt/return PDF into the Browser Use session. Do not finish until the download completes, or you have reported that the portal offers no completion PDF.
9. Final output: state that the prepared return was submitted, the notice of assessment answer selected, that every declaration box was ticked, the confirmation/reference shown, and the PDF file name.
`;
}
