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

interface AttachedFile {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
}

interface PromptBuilderOptions {
  taxReturn: TaxReturn;
  substanceForm: SubstanceForm;
  portalUrl: string;
  returnLink?: string;
  overrideSaved?: boolean;
}

/**
 * Builds the main AI prompt for filling out the Guernsey Economic Substance Register
 */
export function buildSubstanceFormPrompt(options: PromptBuilderOptions): string {
  const { taxReturn, substanceForm, portalUrl, returnLink, overrideSaved } = options;

  const sections: string[] = [];

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

## IMPORTANT INSTRUCTIONS
- Fill in ALL fields as specified below
- If a field is not applicable, select "N/A" or leave blank as appropriate
- Use exact values provided - do not modify or interpret the data
- If you cannot find a field or encounter an error, STOP and report the issue
- After completing each section, verify the data before moving to the next
- SKIP/IGNORE any questions about "economic classifications" - do not attempt to answer them
${overrideSaved ? `
## OVERRIDE MODE ENABLED
- Re-enter ALL fields even if they appear to be already filled in
- Do not skip any fields because they look complete - overwrite everything with the values provided below
- This is a full re-submission of all data
` : ''}
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

  // Section 7: CIGA
  sections.push(buildCigaSection(substanceForm));

  // Section 8: Employees
  sections.push(buildEmployeesSection(substanceForm));

  // Section 9: Outsourcing
  sections.push(buildOutsourcingSection(substanceForm));

  // Section 10: Beneficial Ownership
  sections.push(buildBeneficialOwnershipSection(substanceForm));

  // Section 11: Direction and Management
  sections.push(buildDirectionManagementSection(substanceForm));

  // Section 12: Declaration
  sections.push(buildDeclarationSection(substanceForm));

  // Missing fields warning
  if (substanceForm.missingFields && substanceForm.missingFields.length > 0) {
    sections.push(`
## ⚠️ MISSING INFORMATION
The following fields are missing data. When you encounter these fields, STOP and report "REQUIRES_ATTENTION" with the field name:
${substanceForm.missingFields.map(f => `- ${f}`).join('\n')}
`);
  }

  // Final instructions
  sections.push(`
## COMPLETION
After filling all sections:
1. Review the entire form for accuracy
2. If everything looks correct, click Submit/Save
3. Report the confirmation number or any success message
4. If there are validation errors, report them exactly as shown
`);

  return sections.join('\n');
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
`;
}

function buildPartnershipSection(form: SubstanceForm): string {
  return `
## SECTION 3: PARTNERSHIP INFORMATION
${field("Partnership Name", form.partnershipName)}
${field("Partnership Number", form.partnershipNumber)}
`;
}

function buildFinancialStatementsSection(form: SubstanceForm): string {
  return `
## SECTION 4: FINANCIAL STATEMENTS
${field("Are Financial Statements Consolidated", form.areFinancialStatementsConsolidated)}
${field("Accounts Preparer Name", form.accountsPreparerName)}
${field("Accounts Preparer Qualification", form.accountsPreparerQualification)}
`;
}

function buildFinancialInstitutionsSection(form: SubstanceForm): string {
  return `
## SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
${field("Is Guernsey Financial Institution (FATCA)", form.isGuernseyFiFatca)}
${field("Is Guernsey Financial Institution (CRS)", form.isGuernseyFiCrs)}
`;
}

function buildRelevantActivitiesSection(form: SubstanceForm): string {
  return `
## SECTION 6: RELEVANT ACTIVITIES
${field("Relevant Activity", form.relevantActivity)}
${field("Has Multiple Relevant Activities", form.hasMultipleRelevantActivities)}
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
    employeeList = employees.map((emp, i) =>
      `  ${i + 1}. ${emp.name || "Unnamed"}: FTE=${emp.fteFraction ?? "N/A"}, Qualified FTE=${emp.qualifiedFteFraction ?? "N/A"}`
    ).join('\n');
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
${immediateParents.length > 0 ? immediateParents.map(formatParent).join('\n') : "None listed"}

### Ultimate Parents:
${ultimateParents.length > 0 ? ultimateParents.map(formatParent).join('\n') : "None listed"}

### Ultimate Beneficial Owners:
${ubos.length > 0 ? ubos.map(formatUbo).join('\n') : "None listed"}
`;
}

function buildDirectionManagementSection(form: SubstanceForm): string {
  const directors = (form.directors as Director[]) || [];
  const meetings = (form.boardMeetings as BoardMeeting[]) || [];

  const directorList = directors.length > 0
    ? directors.map((d, i) => `  ${i + 1}. ${d.name || "N/A"} (${d.initials || "N/A"})`).join('\n')
    : "No directors listed";

  const meetingList = meetings.length > 0
    ? meetings.map((m, i) => `  ${i + 1}. Date: ${m.date || "N/A"}, Attendees: ${m.attendees || "N/A"}, All in Guernsey: ${m.allPresentInGuernsey ? "Yes" : "No"}`).join('\n')
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
${field("Prepared By", form.preparedBy)}
${field("Prepared Date", form.preparedDate)}
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
  currentPage: string
): string {
  return `
REQUIRES_ATTENTION: Unable to proceed without the following information:
- Field: ${missingField}
- Current Page: ${currentPage}

Please provide the missing information to continue with the form submission.
`;
}
