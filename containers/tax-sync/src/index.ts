import * as cheerio from "cheerio";
import { db, schema } from "@repo/database";
import { eq } from "drizzle-orm";

const TOTAL_PAGES = 7;
const BASE_URL = "https://my.gov.gg/revenue/employee-assigned-cases";

const HEADERS = {
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cookie": process.env.EFORMS_COOKIE || "",
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
};

const log = (msg: string) => console.log(`[TAX-SYNC] ${msg}`);

async function fetchPage(page: number): Promise<string> {
  const url = `${BASE_URL}?taxReferenceType=All&year=All&formStatus=All&items_per_page=50&page=${page}`;
  const res = await fetch(url, { headers: HEADERS });
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

    const allReturns: any[] = [];

    // Fetch all pages
    for (let page = 0; page < TOTAL_PAGES; page++) {
      log(`Fetching page ${page + 1}/${TOTAL_PAGES}...`);
      const html = await fetchPage(page);
      const returns = parseReturns(html);
      allReturns.push(...returns);
      log(`Page ${page + 1}: ${returns.length} returns`);
    }

    log(`Total: ${allReturns.length} returns across ${TOTAL_PAGES} pages`);

    // Update database
    if (allReturns.length > 0) {
      const org = await db.query.organisations.findFirst();
      const jurisdiction = await db.query.jurisdictions.findFirst({
        where: eq(schema.jurisdictions.name, "Guernsey")
      });

      if (!org || !jurisdiction) {
        throw new Error("No Organisation or Guernsey Jurisdiction found");
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
