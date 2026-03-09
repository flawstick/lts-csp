import * as cheerio from "cheerio";
import { db, schema } from "@repo/database";
import { eq } from "drizzle-orm";
import { authenticate } from "./auth";

const ITEMS_PER_PAGE = 50;
const MAX_PAGES = 100;
const BASE_URL = "https://my.gov.gg/revenue/employee-assigned-cases";

let sessionCookies: string = "";

const getHeaders = () => ({
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cookie": sessionCookies,
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
});

const log = (msg: string) => console.log(`[TAX-SYNC] ${msg}`);

async function fetchPage(page: number): Promise<string> {
  const url = `${BASE_URL}?taxReferenceType=All&year=All&formStatus=All&items_per_page=${ITEMS_PER_PAGE}&page=${page}`;
  const res = await fetch(url, { headers: getHeaders() });
  if (!res.ok) throw new Error(`Page ${page} failed: ${res.status}`);
  return res.text();
}

function parseReturns(html: string) {
  const $ = cheerio.load(html);
  const returns: any[] = [];

  $("table tbody tr").each((_, row) => {
    const $row = $(row);
    const entityName = $row.find(".views-field-taxReferenceOwnerName").text().replace(/\s+/g, " ").trim();
    const trn = $row.find(".views-field-taxReferenceNumber").text().replace(/\s+/g, " ").trim();
    const yearStr = $row.find(".views-field-year").text().replace(/\s+/g, " ").trim();
    const statusText = $row.find(".views-field-formStatus").text().replace(/\s+/g, " ").trim();
    const clientLink = $row.find(".views-field-taxReferenceOwnerName a").attr("href");
    const caseLink = $row.find(".views-field-nothing a").attr("href");

    if (entityName && trn) {
      let status: "pending" | "completed" | "in_progress" = "pending";
      if (statusText.includes("Submitted")) status = "completed";
      else if (statusText.includes("Prepared")) status = "in_progress";

      returns.push({
        externalId: `${trn}-${yearStr}`,
        entityName,
        taxYear: parseInt(yearStr) || 2024,
        status,
        link: caseLink ? `https://my.gov.gg${caseLink}` : "",
        pdfUrl: `https://my.gov.gg/revenue/pdf/${trn}/${yearStr}/instructions.pdf`,
        metadata: { source: "Guernsey Tax Portal", clientProfileUrl: clientLink, rawStatus: statusText }
      });
    }
  });

  return returns;
}

async function main() {
  const jobId = process.env.TAX_SYNC_JOB_ID;
  log(`Starting sync${jobId ? ` (job: ${jobId})` : ""}...`);

  try {
    // Update job status to running
    if (jobId) {
      await db.update(schema.taxSyncJobs)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(schema.taxSyncJobs.id, jobId));
    }

    // Authenticate to get session cookies
    const username = process.env.MYGOV_USERNAME;
    const password = process.env.MYGOV_PASSWORD;

    if (!username || !password) {
      throw new Error("MYGOV_USERNAME and MYGOV_PASSWORD environment variables are required");
    }

    log("Authenticating with MyGov portal...");
    const authResult = await authenticate(username, password);
    sessionCookies = authResult.cookies;
    log(`Session established, expires at ${authResult.expiresAt.toISOString()}`);

    const allReturns: any[] = [];

    let pagesFetched = 0;

    for (let page = 0; page < MAX_PAGES; page++) {
      log(`Fetching page ${page + 1}...`);
      const html = await fetchPage(page);
      const returns = parseReturns(html);
      log(`Page ${page + 1}: ${returns.length} returns`);

      if (returns.length === 0) {
        break;
      }

      allReturns.push(...returns);
      pagesFetched = page + 1;
    }

    if (pagesFetched === MAX_PAGES) {
      log(`Reached pagination safety cap at ${MAX_PAGES} pages`);
    }

    log(`Total: ${allReturns.length} returns across ${pagesFetched} pages`);

    // Update database
    if (allReturns.length > 0) {
      const orgId = process.env.ORG_ID;
      if (!orgId) {
        throw new Error("ORG_ID environment variable is required");
      }

      const org = await db.query.organisations.findFirst({
        where: eq(schema.organisations.id, orgId)
      });
      const jurisdiction = await db.query.jurisdictions.findFirst({
        where: eq(schema.jurisdictions.name, "Guernsey")
      });

      if (!org || !jurisdiction) {
        throw new Error("Organisation or Guernsey Jurisdiction not found");
      }

      for (const ret of allReturns) {
        await db.insert(schema.taxReturns)
          .values({ ...ret, orgId: org.id, jurisdictionId: jurisdiction.id })
          .onConflictDoUpdate({
            target: schema.taxReturns.externalId,
            set: { status: ret.status, link: ret.link, pdfUrl: ret.pdfUrl, updatedAt: new Date() }
          });
      }

      log(`Synced ${allReturns.length} returns to DB`);

      // Update job status
      if (jobId) {
        await db.update(schema.taxSyncJobs)
          .set({ status: "completed", completedAt: new Date(), returnsFound: allReturns.length })
          .where(eq(schema.taxSyncJobs.id, jobId));
      }
    }

    log("Done!");
    process.exit(0);
  } catch (error) {
    log(`Error: ${error}`);
    if (jobId) {
      await db.update(schema.taxSyncJobs)
        .set({ status: "failed", completedAt: new Date(), errorMessage: String(error) })
        .where(eq(schema.taxSyncJobs.id, jobId));
    }
    process.exit(1);
  }
}

main();
