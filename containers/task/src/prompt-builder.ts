/**
 * Prompt Builder for Browser Use AI Agent
 * Generates comprehensive instructions from substance form data for Guernsey tax return filing
 */

import type { SubstanceForm, TaxReturn } from "@repo/database";

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
}

const DEFAULT_CERTIFICATE_TYPE = "Certificate 3";
const INFERABLE_FIELDS = new Set([
  "entityActivity",
  "relevantActivity",
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
  } = options;

  const sections: string[] = [];
  const caseViewUrl = getCaseViewUrl(returnLink);
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
# TASK: Complete Guernsey Economic Substance Register Form

## LOGIN CREDENTIALS
If you need to log in to the portal, use:
- Email: dev@flawstick.com
- Password: V424d3ef@1

## CSP / GUERNSEY REVENUE SERVICE CREDENTIALS
If prompted for CSP or secret credentials:
- Customer Number: C066
- Security Code: X312E49624

## NAVIGATION
1. Go to: ${returnLink || portalUrl}
2. You should see the Economic Substance Register form for: ${taxReturn.entityName}
3. Tax Year: ${taxReturn.taxYear}

## CASE ASSIGNMENT — DO THIS BEFORE PROCESSING THE RETURN
- Before filling or reviewing any return fields, make sure the case is assigned to **Amir Isaac**.
- The **"Assign to user"** button is on the case **view** page, not the processing form itself.
- If you are not already on the case view page, navigate to the case URL ending in **/view** before trying to assign.${ 
  caseViewUrl
    ? ` Use this case view URL: ${caseViewUrl}`
    : ""
}
- Once you are on the case **view** page, click **"Assign to user"**.
- A list of users will appear.
- Click **"Assign"** on the **second "Amir Isaac"** that appears in the list (not the first one).
- If that assignment does not work, does not stick, or the case still does not appear assigned correctly, repeat the action and click **"Assign"** on the **other "Amir Isaac"** entry (the first one).
- If the case is already assigned to someone already, including **Amir Isaac**, still reassign it: click **"Assign to another user"** and then pick the **second "Amir Isaac"** again.
- Only after the case has been freshly assigned to **Amir Isaac** in this run should you continue with the filing workflow.
- After assignment, return to the filing/processing page and continue the return.

## IMPORTANT INSTRUCTIONS

**CERTIFICATE TYPE:** When you encounter the "Certificate Type" field, always select "${DEFAULT_CERTIFICATE_TYPE}" (this is always the correct option).

**TURNOVER FIELD:** The "Turnover / Gross Income" field in Section 6 may be labeled simply as "Turnover" on the portal. Look for a field asking for gross income or turnover amount in the Adequacy Assessment area.

**COMPLETION:** Double-check all fields before moving to the next section. Do not leave any fields empty - fill them with the data provided below or mark as N/A if truly not applicable.

**IF STUCK:** If you cannot complete a field or encounter an error you cannot resolve, pause the task and report the issue for user intervention.

**SUMMARY PAGE SAFETY:** ${
  submissionMode === "submit_and_capture_pdf"
    ? "If the portal lands on a page ending in **reviewAndSubmit/summary** before every section has been checked in this run, treat it as an incomplete draft summary. Use the summary page's **Change** or **Edit** links to re-enter the filing sections and continue the return. Only once the filing is fully validated should you use the final submit path, wait for confirmation, and download the portal-generated completion PDF."
    : 'If the portal lands on a page ending in **reviewAndSubmit/summary**, treat it as a saved draft summary. Do **NOT** click Submit, Confirm, Print, Download, or any final filing action from that page. Use the summary page\'s **Change** or **Edit** links to re-enter the filing sections and continue the return.'
}

**TAB / BLANK PAGE RECOVERY:** Use Browser Use native tools only: **switch**, **close**, **navigate**, **go_back**, **click**, **input**, **upload_file**, **evaluate**, **screenshot**. Do **NOT** use Python or browser-wrapper tab recovery helpers such as **get_tabs**. If a bad click opens a stray tab or leaves you on **about:blank**, use **switch** or **close** to get back to the main Guernsey portal tab. If that fails quickly, use **navigate** to return to the filing URL and continue.

## INFERENCE RULES FOR GUERNSEY FILING
- If the portal asks for **Entity Activity** or **Relevant Company Activity** and the saved value is blank, weak, or "None of the above", infer a short, plausible business description from the rest of the context. Use the company name, relevant activity, economic classification code, accounts data, and any other form details. Do NOT pause just because this field was not explicitly provided.
- If the portal asks **Has Intellectual Property Holding?** and the saved answer is missing, infer it from context instead of pausing.
- Answer **"Yes"** for intellectual property holding only if the context clearly suggests IP ownership or exploitation, such as licensing, royalties, trademarks, patents, brands, software IP, or an Intellectual Property Holding Company relevant activity.
- Otherwise answer **"No"** for intellectual property holding.
- Prefer a reasonable inferred answer over stopping the task. Only pause if the portal blocks progress after you have already made the best inference from the provided context.
${
  financialStatementsFile && financialStatementsUrl
    ? `

## FINANCIAL STATEMENTS PDF — CRITICAL: DO NOT SKIP THIS
- File: "${financialStatementsFile.originalName}"
- Uploaded Browser Use workspace file: "${financialStatementsFile.sessionFileName}"
- Uploaded Browser Use workspace path: "${financialStatementsFile.sessionFilePath}"
- Download URL fallback: ${financialStatementsUrl}

**PORTAL FLOW FOR FINANCIAL STATEMENTS (Upload Accounts section):**
1. When the portal asks if financial statements are available online, select **"No"**.
2. A file upload input will appear.
3. Use Browser Use's **upload_file** tool on the visible file input as the PRIMARY method, with the uploaded workspace path "${financialStatementsFile.sessionFilePath}".
4. After using **upload_file**, visually confirm that the control no longer says **"No file chosen"** and that a filename is shown.
5. If the control still says **"No file chosen"** or no filename is visible, the upload did NOT work yet. Do NOT continue.
6. If **upload_file** fails or the control still shows **"No file chosen"**, use Browser Use's **evaluate** tool with this EXACT script:

fetch('${financialStatementsUrl}').then(r=>r.blob()).then(blob=>{const f=new File([blob],'${financialStatementsFile.originalName}',{type:'application/pdf'});const d=new DataTransfer();d.items.add(f);const i=document.querySelector('input[type=\"file\"]');if(i){i.files=d.files;i.dispatchEvent(new Event('change',{bubbles:true}))}})

7. After **evaluate**, verify again that the control no longer says **"No file chosen"**.
8. Only once a filename is visible should you leave **"Would you like to upload another file?"** as **"No"** and click Save/Continue.
9. Never leave the Accounts upload step while the control still says **"No file chosen"**. If the portal somehow advances without a file attached, go back and upload it before continuing.
10. If neither **upload_file** nor **evaluate** works, STOP and report "REQUIRES_ATTENTION: Financial statements upload failed".
`
    : `

## FINANCIAL STATEMENTS PDF
- No financial statements PDF was provided.
- If the portal requires a financial statements upload, STOP and report "REQUIRES_ATTENTION: No financial statements PDF available for upload".
`
}
${
  overrideSaved
    ? `
## OVERRIDE MODE ENABLED
- Re-enter ALL fields even if they appear to be already filled in
- Do not skip any fields because they look complete - overwrite everything with the values provided below
- This is a full re-submission of all data
`
    : ""
}
`);

  // Section 1: Background
  sections.push(buildBackgroundSection(substanceForm));

  // Section 2: Company Information
  sections.push(buildCompanyInfoSection(substanceForm));

  // Section 3: Partnership Information (if applicable)
  if (substanceForm.entityType === "Partnership") {
    sections.push(buildPartnershipSection(substanceForm));
  }

  // Section 4: Financial Statements
  sections.push(buildFinancialStatementsSection(substanceForm));

  // Section 5: Financial Institutions
  sections.push(buildFinancialInstitutionsSection(substanceForm));

  // Section 6: Relevant Activities
  sections.push(buildRelevantActivitiesSection(substanceForm));

  const hasRelevantActivity =
    substanceForm.relevantActivity &&
    substanceForm.relevantActivity !== "None of the above";

  if (hasRelevantActivity) {
    // Sections 7-10 only apply when entity has a relevant activity
    // Section 7: CIGA
    sections.push(buildCigaSection(substanceForm));

    // Section 8: Employees
    sections.push(buildEmployeesSection(substanceForm));

    // Section 9: Outsourcing
    sections.push(buildOutsourcingSection(substanceForm));

    // Section 10: Beneficial Ownership
    sections.push(buildBeneficialOwnershipSection(substanceForm));
  } else {
    sections.push(`
## SECTIONS 7-10: SKIPPED
The entity has no relevant activity — Adequacy Assessment, CIGA, Employees (FTE), Outsourcing, and Beneficial Ownership sections are not applicable. Leave these sections blank on the portal.
`);
  }

  // Section 11: Direction and Management
  sections.push(buildDirectionManagementSection(substanceForm));

  // Section 12: Declaration
  sections.push(buildDeclarationSection(substanceForm));

  // Section 13: Country by Country Reporting
  sections.push(buildCbcrSection(substanceForm));

  // Section 14: Additional Information
  sections.push(buildAdditionalInfoSection(substanceForm));

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
  sections.push(`
## COMPLETION
After filling all sections:
1. Review the entire form for accuracy
2. Navigate to the final submission page/screen
${
  submissionMode === "submit_and_capture_pdf"
    ? `3. Resolve every validation error shown on the portal before continuing
4. Click the final submit/confirm action and complete the filing
5. Wait for the post-submission confirmation page or confirmation state
6. Find the portal-generated completion/receipt/return PDF and download it into the Browser Use session
7. Do not finish the task until the PDF download has completed, or you have explicitly reported that no downloadable completion PDF exists
8. If there are validation errors or the portal blocks submission, report them exactly as shown`
    : `3. **STOP BEFORE CLICKING SUBMIT** - Do NOT click the final submit button
4. You should be exactly ONE CLICK away from submission - the submit button should be visible and ready
5. Report that the form is ready for manual submission and describe what button/action remains
6. If there are validation errors, report them exactly as shown`
}
`);

  return sections.join("\n");
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

function buildCompanyInfoSection(form: SubstanceForm): string {
  return `
## SECTION 2: COMPANY INFORMATION
${field("Company Number", form.companyNumber)}
${field("Tax Reference Number", form.taxReferenceNumber)}
${field("Registered Address", form.registeredAddress)}
${field("Principal Place of Business", form.principalPlaceOfBusiness)}
${field("Is Incorporated in Guernsey", form.isIncorporatedInGuernsey)}
${field("Economic Classification Code", form.economicClassificationCode)}
${field("Certificate Type", DEFAULT_CERTIFICATE_TYPE)}
${field("Entity Activity", form.entityActivity)}

**IMPORTANT:**
- Economic Classification Code is REQUIRED for 2025 returns — this is a dropdown field on the portal, select the matching option.
- Certificate Type is fixed for this filing flow: always use ${DEFAULT_CERTIFICATE_TYPE}.
- Entity Activity describes the nature of the entity's business (e.g., "Property Holdings"). Preferred to have it filled even if the entity has no relevant activity.
`;
}

function buildPartnershipSection(form: SubstanceForm): string {
  return `
## SECTION 3: PARTNERSHIP INFORMATION
${field("Partnership Name", form.partnershipName)}
${field("Partnership Number", form.partnershipNumber)}
`;
}

function clampNegativeToZero(
  value: string | null | undefined,
): string | null | undefined {
  if (!value) return value;
  const num = parseFloat(value.replace(/[^0-9.-]/g, ""));
  if (!isNaN(num) && num < 0) return "0";
  return value;
}

function buildFinancialStatementsSection(form: SubstanceForm): string {
  return `
## SECTION 4: FINANCIAL STATEMENTS
${field("Are Financial Statements Consolidated", form.areFinancialStatementsConsolidated)}
${field("Accounts Preparer Name", form.accountsPreparerName)}
${field("Accounts Preparer Qualification", form.accountsPreparerQualification)}
${field("Net Book Value", clampNegativeToZero(form.netBookValue))}
${field("Total Profit", clampNegativeToZero(form.totalProfit))}
${field("Profit Before Tax Allocation", form.profitAllocation)}

**IMPORTANT:**
- Net Book Value and Total Profit: if the value is negative (a loss), enter **0**. The portal does not accept negative values.
- Profit Before Tax Allocation is REQUIRED — must be either "Investment" or "Business".
- Accounts Preparer Name/Qualification is the ACCOUNTANT who prepared the financial statements, NOT LTS Tax.
- **FINANCIAL STATEMENTS UPLOAD:** When the portal asks if financial statements are available online, select **"No"** and then use **upload_file** on the visible file input with the preloaded Browser Use workspace PDF described above. If the control still shows **"No file chosen"**, use **evaluate** as fallback. Do NOT click Save/Continue until a filename is visible.
- If you reach **reviewAndSubmit/summary** before verifying this upload, go back into the filing using a **Change/Edit** link and return to the Financial Statements / Accounts section before continuing.
`;
}

function buildFinancialInstitutionsSection(form: SubstanceForm): string {
  return `
## SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
${field("Is Guernsey Financial Institution (FATCA)", form.isGuernseyFiFatca)}
${field("Is Guernsey Financial Institution (CRS)", form.isGuernseyFiCrs)}
${field("Is Registered on IGOR", form.isRegisteredOnIgor)}

**IMPORTANT:** If FATCA is "Yes", the entity MUST be registered on IGOR. "No" for IGOR with "Yes" for FATCA is a red flag on the Guernsey portal.
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
${field("Turnover", form.activityGrossIncome)}
${field("Has Adequate Expenditure", form.hasAdequateExpenditure)}
${field("Has Adequate Physical Presence", form.hasAdequatePhysicalPresence)}
${field("Adequacy Expenditure Details", form.adequacyExpenditureDetails)}
${field("Adequacy Physical Presence Details", form.adequacyPhysicalPresenceDetails)}`
    : `
**No relevant activity — IP Holdings and Adequacy Assessment sections are not applicable. Leave blank.`;

  return `
## SECTION 6: RELEVANT ACTIVITIES
${field("Relevant Activity", form.relevantActivity)}
${field("Has Multiple Relevant Activities", form.hasMultipleRelevantActivities)}
${field("Has Intellectual Property Holding", form.hasIntellectualPropertyHolding)}

**IMPORTANT:**
- If the portal requires a business description such as "Entity Activity" or "Relevant Company Activity", infer a concise description from the broader context even if the saved value is blank or "None of the above".
- If "Has Intellectual Property Holding" is missing, infer it from context. Default to **"No"** unless the form context clearly indicates IP ownership, licensing, royalties, trademarks, patents, brands, software IP, or an Intellectual Property Holding Company activity.
- If you encounter the final summary page while Section 6 has not been checked in this run, do **NOT** submit from there. Use a **Change/Edit** link to return to the relevant activities section and continue filling the form.
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
${field("Total FTE", form.totalFte?.toString())}
${field("Total Qualified FTE", form.totalQualifiedFte?.toString())}

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
`;
}

function buildDirectionManagementSection(form: SubstanceForm): string {
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
${field("Total Board Meetings", form.totalBoardMeetings?.toString())}
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

function buildDeclarationSection(form: SubstanceForm): string {
  return `
## SECTION 12: DECLARATION
${field("Prepared By", form.preparedBy || "LTS Tax Limited")}
${field("Prepared Date", form.preparedDate)}
${field("Manager Sign Off", form.managerSignOff)}
${field("Manager Sign Off Date", form.managerSignOffDate)}
`;
}

function buildCbcrSection(form: SubstanceForm): string {
  return `
## SECTION 13: COUNTRY BY COUNTRY REPORTING (CbCR)
${field("Is Constituent Entity", form.isConstituentEntity || "No")}

**IMPORTANT:** This is a REQUIRED question for 2025 returns. Default is "No".
`;
}

function buildAdditionalInfoSection(form: SubstanceForm): string {
  return `
## SECTION 14: ADDITIONAL INFORMATION
${field("Has Post Balance Sheet Event", form.hasPostBalanceSheetEvent)}
${field("Post Balance Sheet Event Details", form.postBalanceSheetEventDetails)}
${field("Has C42 Association", form.hasC42Association)}
${field("C42 Associated Companies", form.c42AssociatedCompanies)}
${field("Contract Information (CSP)", form.contractInformation)}
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
