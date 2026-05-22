#!/usr/bin/env node
/**
 * Merge dependency audit + OWASP ZAP outputs into one HTML report and export PDF.
 *
 * Env:
 *   AUDIT_JSON         - path to npm/bun audit JSON (default: audit.json)
 *   ZAP_TARGETS_JSON   - JSON array of { name, url, html, json } per platform
 *   ZAP_HTML / ZAP_JSON - legacy single-target fallback
 *   REPO_NAME          - repository name for header
 *   REPORT_DATE        - date string for header
 *   OUTPUT_HTML        - merged HTML path (default: security-report.html)
 *   OUTPUT_PDF         - PDF path (default: security-report.pdf)
 */

const fs = require("fs");
const path = require("path");

const AUDIT_JSON = process.env.AUDIT_JSON ?? "audit.json";
const ZAP_HTML = process.env.ZAP_HTML ?? "report_md.html";
const ZAP_JSON = process.env.ZAP_JSON ?? "report_json.json";
const REPO_NAME = process.env.REPO_NAME ?? "repository";
const REPORT_DATE = process.env.REPORT_DATE ?? new Date().toISOString().slice(0, 10);
const OUTPUT_HTML = process.env.OUTPUT_HTML ?? "security-report.html";
const OUTPUT_PDF = process.env.OUTPUT_PDF ?? "security-report.pdf";

function readJsonFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readTextFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function loadZapTargets() {
  if (process.env.ZAP_TARGETS_JSON) {
    try {
      const parsed = JSON.parse(process.env.ZAP_TARGETS_JSON);
      if (Array.isArray(parsed)) {
        return parsed.filter((target) => target?.name && (target.url || target.html || target.json));
      }
    } catch {
      // fall through to legacy single-target mode
    }
  }

  return [
    {
      name: "Application",
      url: process.env.ZAP_TARGET_URL ?? "",
      html: ZAP_HTML,
      json: ZAP_JSON,
    },
  ];
}

function summarizeNpmAudit(audit) {
  const empty = {
    total: 0,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
    advisories: [],
    error: null,
    source: "npm audit",
  };

  if (!audit) {
    return { ...empty, error: "audit output not found" };
  }

  if (audit.error) {
    return { ...empty, error: String(audit.error.summary ?? audit.error) };
  }

  if (audit.metadata?.vulnerabilities) {
    const vulnerabilities = audit.metadata.vulnerabilities;
    const advisories = [];

    if (audit.vulnerabilities && typeof audit.vulnerabilities === "object") {
      for (const [name, entry] of Object.entries(audit.vulnerabilities)) {
        advisories.push({
          name,
          severity: entry.severity ?? "unknown",
          title: entry.via?.[0]?.title ?? entry.name ?? name,
          range: entry.range ?? "—",
        });
      }
    }

    advisories.sort((left, right) => {
      const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4, unknown: 5 };
      return (rank[left.severity] ?? 5) - (rank[right.severity] ?? 5);
    });

    return {
      total: vulnerabilities.total ?? advisories.length,
      critical: vulnerabilities.critical ?? 0,
      high: vulnerabilities.high ?? 0,
      moderate: vulnerabilities.moderate ?? 0,
      low: vulnerabilities.low ?? 0,
      info: vulnerabilities.info ?? 0,
      advisories,
      error: null,
      source: "npm audit",
    };
  }

  return summarizeBunAudit(audit);
}

function summarizeBunAudit(audit) {
  const summary = {
    total: 0,
    critical: 0,
    high: 0,
    moderate: 0,
    low: 0,
    info: 0,
    advisories: [],
    error: null,
    source: "bun audit",
  };

  for (const [name, entries] of Object.entries(audit)) {
    if (!Array.isArray(entries)) {
      continue;
    }

    for (const entry of entries) {
      const severity = String(entry.severity ?? "unknown").toLowerCase();
      summary.total += 1;
      summary.advisories.push({
        name,
        severity,
        title: entry.title ?? name,
        range: entry.vulnerable_versions ?? "—",
      });

      if (severity === "critical") summary.critical += 1;
      else if (severity === "high") summary.high += 1;
      else if (severity === "moderate") summary.moderate += 1;
      else if (severity === "low") summary.low += 1;
      else summary.info += 1;
    }
  }

  summary.advisories.sort((left, right) => {
    const rank = { critical: 0, high: 1, moderate: 2, low: 3, info: 4, unknown: 5 };
    return (rank[left.severity] ?? 5) - (rank[right.severity] ?? 5);
  });

  return summary;
}

function riskRank(risk) {
  const normalized = String(risk ?? "").toLowerCase();
  if (normalized.includes("high")) return 0;
  if (normalized.includes("medium")) return 1;
  if (normalized.includes("low")) return 2;
  if (normalized.includes("informational")) return 3;
  return 4;
}

function summarizeZap(zapJson) {
  const empty = {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    alerts: [],
    error: null,
  };

  if (!zapJson) {
    return { ...empty, error: "ZAP JSON report not found" };
  }

  const site = Array.isArray(zapJson.site) ? zapJson.site[0] : zapJson.site;
  const alerts = Array.isArray(site?.alerts) ? site.alerts : [];

  const summary = { ...empty, alerts };

  for (const alert of alerts) {
    const riskCode = String(alert.riskcode ?? "");
    summary.total += 1;

    if (riskCode === "3") {
      summary.high += 1;
    } else if (riskCode === "2") {
      summary.medium += 1;
    } else if (riskCode === "1") {
      summary.low += 1;
    } else {
      summary.informational += 1;
    }
  }

  summary.alerts.sort(
    (left, right) =>
      riskRank(left.riskdesc ?? left.risk) - riskRank(right.riskdesc ?? right.risk),
  );

  return summary;
}

function combineZapSummaries(scans) {
  const combined = {
    total: 0,
    high: 0,
    medium: 0,
    low: 0,
    informational: 0,
    scans,
    error: null,
  };

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (const scan of scans) {
    combined.total += scan.summary.total;
    combined.high += scan.summary.high;
    combined.medium += scan.summary.medium;
    combined.low += scan.summary.low;
    combined.informational += scan.summary.informational;

    if (scan.skipped) {
      skipped += 1;
    } else if (scan.summary.error) {
      failed += 1;
    } else {
      completed += 1;
    }
  }

  if (completed === 0 && failed > 0) {
    combined.error = "All ZAP scans failed or produced no reports";
  } else if (skipped === scans.length) {
    combined.error = "No ZAP targets configured";
  }

  return combined;
}

function overallStatus(npmSummary, zapCombined) {
  const npmBlocking = npmSummary.critical + npmSummary.high;
  const zapBlocking = zapCombined.high;

  if (npmSummary.error && zapCombined.error) {
    return { label: "Incomplete", tone: "warn" };
  }

  if (npmBlocking > 0 || zapBlocking > 0) {
    return { label: "Needs review", tone: "fail" };
  }

  return { label: "Pass", tone: "pass" };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function extractZapBody(zapHtml) {
  if (!zapHtml) {
    return "<p>ZAP HTML report not available.</p>";
  }

  const bodyMatch = zapHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    return bodyMatch[1];
  }

  return zapHtml;
}

function buildAdvisoryTable(advisories, emptyMessage) {
  const rows = advisories.slice(0, 50).map(
    (advisory) => `
      <tr>
        <td>${escapeHtml(advisory.severity)}</td>
        <td>${escapeHtml(advisory.name)}</td>
        <td>${escapeHtml(advisory.title)}</td>
        <td>${escapeHtml(advisory.range)}</td>
      </tr>`,
  );

  if (rows.length === 0) {
    return `<p>${escapeHtml(emptyMessage)}</p>`;
  }

  return `<table>
    <thead>
      <tr><th>Severity</th><th>Package</th><th>Advisory</th><th>Range</th></tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function buildZapAlertTable(alerts, emptyMessage) {
  const rows = alerts.slice(0, 50).map(
    (alert) => `
      <tr>
        <td>${escapeHtml(alert.riskdesc ?? alert.risk ?? "—")}</td>
        <td>${escapeHtml(alert.alert ?? alert.name ?? "—")}</td>
        <td>${escapeHtml(alert.desc ?? alert.description ?? "—")}</td>
        <td>${escapeHtml(alert.url ?? alert.uri ?? "—")}</td>
      </tr>`,
  );

  if (rows.length === 0) {
    return `<p>${escapeHtml(emptyMessage)}</p>`;
  }

  return `<table>
    <thead>
      <tr><th>Risk</th><th>Alert</th><th>Description</th><th>URL</th></tr>
    </thead>
    <tbody>${rows.join("")}</tbody>
  </table>`;
}

function buildPlatformSection(scan) {
  if (scan.skipped) {
    return `
      <h2>OWASP ZAP — ${escapeHtml(scan.name)}</h2>
      <p class="note">Skipped — no preview URL configured for this platform.</p>`;
  }

  const status = scan.summary.error
    ? escapeHtml(scan.summary.error)
    : "Completed";

  return `
    <h2>OWASP ZAP — ${escapeHtml(scan.name)}</h2>
    <p class="note">Target: ${scan.url ? escapeHtml(scan.url) : "—"} · Status: ${status}</p>
    <p class="note">Counts: high ${scan.summary.high}, medium ${scan.summary.medium}, low ${scan.summary.low}, informational ${scan.summary.informational}</p>
    ${buildZapAlertTable(scan.summary.alerts, "No ZAP alerts recorded.")}
    <h3>${escapeHtml(scan.name)} — embedded report</h3>
    <div class="zap-detail">${extractZapBody(scan.html)}</div>`;
}

function buildMergedHtml({ npmSummary, zapCombined, status }) {
  const statusClass =
    status.tone === "pass" ? "status-pass" : status.tone === "fail" ? "status-fail" : "status-warn";

  const platformSummaryRows = zapCombined.scans
    .map((scan) => {
      if (scan.skipped) {
        return `<tr><td>${escapeHtml(scan.name)}</td><td colspan="3">Skipped (no URL configured)</td></tr>`;
      }

      return `<tr>
        <td>${escapeHtml(scan.name)}</td>
        <td>${scan.summary.total}</td>
        <td>${scan.summary.high}</td>
        <td>${scan.summary.medium}</td>
      </tr>`;
    })
    .join("");

  const platformSections = zapCombined.scans.map(buildPlatformSection).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Security Report - ${escapeHtml(REPO_NAME)} - ${escapeHtml(REPORT_DATE)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #111827;
      line-height: 1.45;
      font-size: 11px;
    }
    h1 { font-size: 22px; margin: 0 0 6px; }
    h2 { font-size: 15px; margin: 24px 0 8px; page-break-after: avoid; }
    h3 { font-size: 13px; margin: 16px 0 8px; page-break-after: avoid; }
    .meta { color: #4b5563; margin-bottom: 18px; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0 18px;
      page-break-inside: auto;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f3f4f6; }
    tr { page-break-inside: avoid; }
    .summary-table td:first-child { font-weight: 600; width: 240px; }
    .status-pass { color: #047857; font-weight: 700; }
    .status-fail { color: #b91c1c; font-weight: 700; }
    .status-warn { color: #b45309; font-weight: 700; }
    .note { color: #6b7280; font-size: 10px; }
    .zap-detail {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 12px;
      background: #fafafa;
    }
  </style>
</head>
<body>
  <h1>Security Report - ${escapeHtml(REPO_NAME)} - ${escapeHtml(REPORT_DATE)}</h1>
  <p class="meta">Generated by GitHub Actions · dependency audit + OWASP ZAP baseline scans (Web + Portal)</p>

  <h2>Summary</h2>
  <table class="summary-table">
    <tbody>
      <tr><td>Overall status</td><td class="${statusClass}">${escapeHtml(status.label)}</td></tr>
      <tr><td>Dependency vulnerabilities (total)</td><td>${npmSummary.total}</td></tr>
      <tr><td>Dependency critical / high</td><td>${npmSummary.critical} / ${npmSummary.high}</td></tr>
      <tr><td>ZAP alerts (total, all platforms)</td><td>${zapCombined.total}</td></tr>
      <tr><td>ZAP high / medium (all platforms)</td><td>${zapCombined.high} / ${zapCombined.medium}</td></tr>
      <tr><td>Dependency audit status</td><td>${npmSummary.error ? escapeHtml(npmSummary.error) : `Completed (${escapeHtml(npmSummary.source)})`}</td></tr>
      <tr><td>ZAP scan status</td><td>${zapCombined.error ? escapeHtml(zapCombined.error) : "Completed"}</td></tr>
    </tbody>
  </table>

  <h2>ZAP by platform</h2>
  <table>
    <thead>
      <tr><th>Platform</th><th>Alerts</th><th>High</th><th>Medium</th></tr>
    </thead>
    <tbody>${platformSummaryRows}</tbody>
  </table>

  <h2>Dependency audit (${escapeHtml(npmSummary.source)})</h2>
  <p class="note">Shared monorepo audit · counts: critical ${npmSummary.critical}, high ${npmSummary.high}, moderate ${npmSummary.moderate}, low ${npmSummary.low}, info ${npmSummary.info}</p>
  ${buildAdvisoryTable(npmSummary.advisories, "No dependency advisories recorded.")}

  ${platformSections}
</body>
</html>`;
}

async function writePdf(htmlPath, pdfPath) {
  let puppeteer;
  try {
    puppeteer = require("puppeteer");
  } catch {
    puppeteer = require(path.join(__dirname, "node_modules", "puppeteer"));
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    const html = fs.readFileSync(htmlPath, "utf8");
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.pdf({
      path: pdfPath,
      format: "A4",
      printBackground: true,
      margin: { top: "18mm", right: "15mm", bottom: "18mm", left: "15mm" },
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  const audit = readJsonFile(AUDIT_JSON);
  const npmSummary = summarizeNpmAudit(audit);

  const scans = loadZapTargets().map((target) => {
    const url = String(target.url ?? "").trim();
    const skipped = !url;

    return {
      name: target.name,
      url,
      html: readTextFile(target.html),
      summary: skipped
        ? summarizeZap(null)
        : summarizeZap(readJsonFile(target.json)),
      skipped,
    };
  });

  const zapCombined = combineZapSummaries(scans);
  const status = overallStatus(npmSummary, zapCombined);

  const mergedHtml = buildMergedHtml({
    npmSummary,
    zapCombined,
    status,
  });

  fs.writeFileSync(OUTPUT_HTML, mergedHtml, "utf8");
  await writePdf(OUTPUT_HTML, OUTPUT_PDF);

  console.log(`Wrote ${OUTPUT_HTML}`);
  console.log(`Wrote ${OUTPUT_PDF}`);
  console.log(
    JSON.stringify(
      {
        status: status.label,
        npmTotal: npmSummary.total,
        zapTotal: zapCombined.total,
        platforms: scans.map((scan) => ({
          name: scan.name,
          skipped: scan.skipped,
          alerts: scan.summary.total,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
