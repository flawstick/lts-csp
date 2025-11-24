/**
 * Script to fill a substance form with dummy data for testing
 * Usage: bun run src/scripts/fill-form.ts <taxReturnId>
 */
import { db } from "../index";
import { substanceForms } from "../schema";
import { eq } from "drizzle-orm";

const TAX_RETURN_ID = process.argv[2] || "f9a133a2-085a-4b14-a33a-f9b11c545164";

const dummyData = {
  // SECTION 1: BACKGROUND
  entityName: "Aurora Holdings Ltd",
  entityType: "Company",
  accountingPeriodStart: "2024-01-01",
  accountingPeriodEnd: "2024-12-31",
  isCollectiveInvestmentVehicle: "No",

  // SECTION 2: COMPANY INFORMATION
  companyNumber: "12345678",
  taxReferenceNumber: "TRN-2024-001",
  registeredAddress: "Suite 100, Lefebvre House, Lefebvre Street, St Peter Port, Guernsey GY1 2JP",
  principalPlaceOfBusiness: "Suite 100, Lefebvre House, Lefebvre Street, St Peter Port, Guernsey GY1 2JP",

  // SECTION 4: FINANCIAL STATEMENTS
  areFinancialStatementsConsolidated: "No",
  accountsPreparerName: "Smith & Associates LLP",
  accountsPreparerQualification: "ICAEW",

  // SECTION 5: FINANCIAL INSTITUTIONS (FATCA/CRS)
  isGuernseyFiFatca: "No",
  isGuernseyFiCrs: "No",

  // SECTION 6: RELEVANT ACTIVITIES
  relevantActivity: "Pure Equity Holding",
  hasMultipleRelevantActivities: "No",

  // SECTION 7: CIGA
  cigaPerformed: "Taking decisions on the holding and selling of equity interests; Managing and overseeing the company's equity portfolio; Monitoring investments and making strategic decisions",
  cigaDetails: "Board meetings held quarterly to review portfolio performance and make strategic decisions regarding equity holdings. All major decisions documented in board minutes.",

  // SECTION 8: EMPLOYEES
  employees: [
    {
      name: "John Smith",
      qualifiedForReporting: true,
      unitsOnCompany: 1000,
      totalUnits: 2000,
      fteFraction: 0.5,
      qualifiedFteFraction: 0.5,
    },
    {
      name: "Jane Doe",
      qualifiedForReporting: true,
      unitsOnCompany: 800,
      totalUnits: 2000,
      fteFraction: 0.4,
      qualifiedFteFraction: 0.4,
    },
  ],
  totalFte: 1,
  totalQualifiedFte: 1,

  // SECTION 9: OUTSOURCING
  hasCigaOutsourcing: "No",
  outsourcingDetails: "",

  // SECTION 10: BENEFICIAL OWNERSHIP
  immediateParents: [
    {
      name: "Global Investments PLC",
      countryOfTaxResidence: "United Kingdom",
      tin: "GB123456789",
      tinCountry: "United Kingdom",
      registeredAddress: "10 Downing Street, London, UK",
    },
  ],
  ultimateParents: [
    {
      name: "Worldwide Holdings Corp",
      countryOfTaxResidence: "United States",
      tin: "US-98-7654321",
      tinCountry: "United States",
      registeredAddress: "1 Wall Street, New York, NY 10005, USA",
    },
  ],
  ultimateBeneficialOwners: [
    {
      name: "Robert Johnson",
      dateOfBirth: "1965-03-15",
      placeOfBirth: "New York, USA",
      nationality: "American",
      countryOfTaxResidence: "United States",
      tin: "US-SSN-123-45-6789",
      tinCountry: "United States",
      address: "100 Park Avenue, New York, NY 10017, USA",
    },
  ],

  // SECTION 11: DIRECTED AND MANAGED IN GUERNSEY
  allBoardMeetingsInGuernsey: "Yes",
  totalBoardMeetings: 4,
  boardMeetingsInGuernsey: 4,
  adequateMeetingFrequency: "Yes",
  enoughDirectorsPresent: "Yes",
  directorsHaveExpertise: "Yes",
  strategicDecisionsMadeInGuernsey: "Yes",
  recordsMaintainedInGuernsey: "Yes",
  boardMeetingLocation: "Suite 100, Lefebvre House, St Peter Port, Guernsey",
  directors: [
    { name: "Michael Brown", initials: "MB" },
    { name: "Sarah Wilson", initials: "SW" },
    { name: "David Lee", initials: "DL" },
  ],
  boardMeetings: [
    {
      date: "2024-03-15",
      attendees: "MB, SW, DL",
      allPresentInGuernsey: true,
      agendaPoints: "Q1 review, dividend declaration, investment strategy",
    },
    {
      date: "2024-06-20",
      attendees: "MB, SW, DL",
      allPresentInGuernsey: true,
      agendaPoints: "Q2 review, portfolio rebalancing, compliance review",
    },
    {
      date: "2024-09-18",
      attendees: "MB, SW, DL",
      allPresentInGuernsey: true,
      agendaPoints: "Q3 review, risk assessment, budget planning",
    },
    {
      date: "2024-12-12",
      attendees: "MB, SW, DL",
      allPresentInGuernsey: true,
      agendaPoints: "Year-end review, annual accounts approval, 2025 strategy",
    },
  ],

  // SECTION 12: DECLARATION
  preparedBy: "Tax Compliance Team",
  preparedDate: "2024-11-20",
  managerSignOff: "Senior Tax Manager",
  managerSignOffDate: "2024-11-22",

  // STATUS
  isComplete: true,
  missingFields: [] as string[],
};

async function main() {
  console.log("Filling substance form for tax return:", TAX_RETURN_ID);

  const existing = await db.query.substanceForms.findFirst({
    where: eq(substanceForms.taxReturnId, TAX_RETURN_ID),
  });

  if (!existing) {
    console.log("Creating new substance form...");
    await db.insert(substanceForms).values({
      taxReturnId: TAX_RETURN_ID,
      ...dummyData,
    });
  } else {
    console.log("Updating existing substance form...");
    await db
      .update(substanceForms)
      .set({
        ...dummyData,
        lastEditedAt: new Date(),
      })
      .where(eq(substanceForms.taxReturnId, TAX_RETURN_ID));
  }

  console.log("Done! Substance form filled with dummy data.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
