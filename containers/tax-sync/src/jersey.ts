import * as cheerio from "cheerio";
import { CookieJar } from "tough-cookie";
import { gotScraping } from "got-scraping";
import type { SyncedTaxReturn, SyncLogger } from "./types";

const BASE_URL = "https://empret.jsytax.je/TOOS";
const LOGIN_URL = `${BASE_URL}/Default.aspx`;
const SELECT_URL = `${BASE_URL}/Services/Agent/Select.aspx`;

function baseHeaders() {
  return {
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
    "Upgrade-Insecure-Requests": "1",
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };
}

function getHiddenField($: cheerio.CheerioAPI, name: string): string {
  return $(`input[name="${name}"]`).attr("value") ?? "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function mapReturnType(label: string): SyncedTaxReturn["returnType"] {
  const normalized = label.toLowerCase();

  if (normalized.includes("company")) {
    return "company";
  }
  if (normalized.includes("personal")) {
    return "personal";
  }
  if (normalized.includes("partnership")) {
    return "partnership";
  }
  if (normalized.includes("notification")) {
    return "notification";
  }

  return "other";
}

function mapStatus(statusText: string): SyncedTaxReturn["status"] {
  const normalized = statusText.toLowerCase();

  if (
    normalized.includes("complete") ||
    normalized.includes("submitted") ||
    normalized.includes("view")
  ) {
    return "completed";
  }
  if (
    normalized.includes("progress") ||
    normalized.includes("saved") ||
    normalized.includes("resume")
  ) {
    return "in_progress";
  }

  return "pending";
}

async function authenticateJersey(input: {
  username: string;
  password: string;
  logger: SyncLogger;
}): Promise<CookieJar> {
  const { username, password, logger } = input;
  const cookieJar = new CookieJar();

  logger.info("Loading Jersey login page");
  const loginPage = await gotScraping({
    url: LOGIN_URL,
    cookieJar,
    headers: baseHeaders(),
    headerGeneratorOptions: {
      browsers: ["chrome"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  const $ = cheerio.load(loginPage.body);
  const formData = new URLSearchParams({
    __VIEWSTATE: getHiddenField($, "__VIEWSTATE"),
    __VIEWSTATEGENERATOR: getHiddenField($, "__VIEWSTATEGENERATOR"),
    __EVENTVALIDATION: getHiddenField($, "__EVENTVALIDATION"),
    "ctl00$ctl00$ContentPlaceHolder1$ContentPlaceHolder1$LoginUser$UserName":
      username,
    "ctl00$ctl00$ContentPlaceHolder1$ContentPlaceHolder1$LoginUser$Password":
      password,
    "ctl00$ctl00$ContentPlaceHolder1$ContentPlaceHolder1$LoginUser$LoginButton":
      "Log In",
  });

  logger.info("Submitting Jersey credentials");
  const loginResponse = await gotScraping({
    url: LOGIN_URL,
    method: "POST",
    cookieJar,
    followRedirect: false,
    headers: {
      ...baseHeaders(),
      "Content-Type": "application/x-www-form-urlencoded",
      Referer: LOGIN_URL,
    },
    body: formData.toString(),
    headerGeneratorOptions: {
      browsers: ["chrome"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  const location = loginResponse.headers.location ?? "";
  const failedAttempt = normalizeWhitespace(loginResponse.body).includes(
    "Your login attempt was not successful",
  );

  if (failedAttempt || loginResponse.statusCode >= 400) {
    throw new Error("Jersey login failed");
  }

  if (
    loginResponse.statusCode !== 302 &&
    !location.includes("/Services/Agent/Default.aspx")
  ) {
    throw new Error(
      `Unexpected Jersey login response: ${loginResponse.statusCode}`,
    );
  }

  logger.info("Jersey login successful", {
    redirect: location,
  });

  return cookieJar;
}

function parseJerseyRows(html: string, logger: SyncLogger): SyncedTaxReturn[] {
  const $ = cheerio.load(html);
  const table = $("#ContentPlaceHolder1_ContentPlaceHolder1_dgvAgentsList");

  if (!table.length) {
    throw new Error("Could not find Jersey agent returns table");
  }

  const rows: SyncedTaxReturn[] = [];

  table.find("tr").each((rowIndex, row) => {
    const currentRow = $(row);
    const button = currentRow
      .find('input[type="submit"][name*="cmdAction"]')
      .first();

    if (!button.length) {
      return;
    }

    const cells = currentRow
      .find("td")
      .map((_, cell) => normalizeWhitespace($(cell).text()))
      .get()
      .filter(Boolean);
    const buttonTitle = normalizeWhitespace(button.attr("title") ?? "");
    const actionName = button.attr("name") ?? null;
    const actionLabel = normalizeWhitespace(button.attr("value") ?? "");

    const yearMatch = buttonTitle.match(/\b(20\d{2})\b/);
    const taxYear = Number.parseInt(yearMatch?.[1] ?? "", 10) || new Date().getFullYear();

    const titleReferenceMatch = buttonTitle.match(/for\s+([A-Z]{1,3}\s*\d+)/i);
    const cellReference = cells[0] ?? "";
    const taxReferenceNumber = normalizeWhitespace(
      titleReferenceMatch?.[1] ?? cellReference,
    ).replace(/\s+/g, "");

    const entityName = cells[1] || cells[0] || `Jersey return ${rowIndex + 1}`;
    const returnTypeLabel = cells[2] || buttonTitle.match(/\b(company|personal|partnership|notification)\b/i)?.[0] || "Other";
    const statusText = cells[3] || actionLabel || "Not Started";

    rows.push({
      externalId: taxReferenceNumber,
      entityName,
      taxYear,
      status: mapStatus(statusText),
      returnType: mapReturnType(returnTypeLabel),
      link: SELECT_URL,
      pdfUrl: null,
      metadata: {
        source: "Jersey Taxes Online",
        rawCells: cells,
        rawStatus: statusText,
        taxReferenceNumber,
        returnTypeLabel,
        actionName,
        actionLabel,
        actionTitle: buttonTitle,
        rowIndex,
      },
    });
  });

  logger.info("Parsed Jersey rows", {
    returnsFound: rows.length,
  });

  return rows;
}

export async function syncJerseyReturns(input: {
  username: string;
  password: string;
  logger: SyncLogger;
}): Promise<SyncedTaxReturn[]> {
  const { username, password, logger } = input;
  const cookieJar = await authenticateJersey({
    username,
    password,
    logger: logger.child("auth"),
  });

  logger.info("Fetching Jersey agent return list");
  const response = await gotScraping({
    url: SELECT_URL,
    cookieJar,
    headers: {
      ...baseHeaders(),
      Referer: `${BASE_URL}/Services/Agent/Default.aspx`,
    },
    headerGeneratorOptions: {
      browsers: ["chrome"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  return parseJerseyRows(response.body, logger.child("parse"));
}
