import * as cheerio from "cheerio";
import { authenticate } from "./auth";
import type { SyncedTaxReturn, SyncLogger } from "./types";

const ITEMS_PER_PAGE = 50;
const MAX_PAGES = 100;
const BASE_URL = "https://my.gov.gg/revenue/all-cases";

function getHeaders(sessionCookies: string) {
  return {
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    Cookie: sessionCookies,
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };
}

async function fetchPage(
  sessionCookies: string,
  page: number,
): Promise<string> {
  const url = `${BASE_URL}?taxReferenceType=All&year=All&formStatus=All&items_per_page=${ITEMS_PER_PAGE}&page=${page}`;
  const response = await fetch(url, {
    headers: getHeaders(sessionCookies),
  });

  if (!response.ok) {
    throw new Error(`Guernsey page ${page + 1} failed: ${response.status}`);
  }

  return response.text();
}

function parseGuernseyReturns(html: string): SyncedTaxReturn[] {
  const $ = cheerio.load(html);
  const returns: SyncedTaxReturn[] = [];

  $("table tbody tr").each((_, row) => {
    const currentRow = $(row);
    const entityName = currentRow
      .find(".views-field-taxReferenceOwnerName")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const taxReferenceNumber = currentRow
      .find(".views-field-taxReferenceNumber")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const yearText = currentRow
      .find(".views-field-year")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const statusText = currentRow
      .find(".views-field-formStatus")
      .text()
      .replace(/\s+/g, " ")
      .trim();
    const clientLink = currentRow
      .find(".views-field-taxReferenceOwnerName a")
      .attr("href");
    const caseLink = currentRow.find(".views-field-nothing a").attr("href");

    if (!entityName || !taxReferenceNumber) {
      return;
    }

    let status: SyncedTaxReturn["status"] = "pending";
    if (statusText.includes("Submitted")) {
      status = "completed";
    } else if (statusText.includes("Prepared")) {
      status = "in_progress";
    }

    const taxYear = Number.parseInt(yearText, 10) || new Date().getFullYear();

    returns.push({
      externalId: `${taxReferenceNumber}-${taxYear}`,
      entityName,
      taxYear,
      status,
      returnType: "economic_substance",
      link: caseLink ? `https://my.gov.gg${caseLink}` : "",
      pdfUrl: `https://my.gov.gg/revenue/pdf/${taxReferenceNumber}/${taxYear}/instructions.pdf`,
      metadata: {
        source: "Guernsey Tax Portal",
        clientProfileUrl: clientLink || null,
        rawStatus: statusText,
        taxReferenceNumber,
      },
    });
  });

  return returns;
}

export async function syncGuernseyReturns(input: {
  username: string;
  password: string;
  logger: SyncLogger;
}): Promise<SyncedTaxReturn[]> {
  const { username, password, logger } = input;
  const authLogger = logger.child("auth");
  const fetchLogger = logger.child("fetch");

  authLogger.info("Authenticating with my.gov.gg");
  const authResult = await authenticate(username, password);
  authLogger.info("Authenticated", {
    sessionExpiresAt: authResult.expiresAt.toISOString(),
  });

  const allReturns: SyncedTaxReturn[] = [];
  let pagesFetched = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    fetchLogger.info("Fetching page", { page: page + 1 });
    const html = await fetchPage(authResult.cookies, page);
    const rows = parseGuernseyReturns(html);
    fetchLogger.info("Parsed page", {
      page: page + 1,
      returnsFound: rows.length,
    });

    if (rows.length === 0) {
      break;
    }

    allReturns.push(...rows);
    pagesFetched = page + 1;
  }

  if (pagesFetched === MAX_PAGES) {
    fetchLogger.warn("Reached pagination safety cap", {
      maxPages: MAX_PAGES,
    });
  }

  logger.info("Guernsey sync completed", {
    pagesFetched,
    returnsFound: allReturns.length,
  });

  return allReturns;
}
