import * as crypto from "crypto";
import { gotScraping } from "got-scraping";
import { CookieJar } from "tough-cookie";

const IDENTITY_URL = "https://identity.gov.gg";
const MYGOV_URL = "https://my.gov.gg";
const CLIENT_ID = "drupal_oidc";
const REDIRECT_URI = `${MYGOV_URL}/pa/oidc/cb`;

interface AuthResult {
  cookies: string;
  expiresAt: Date;
}

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

const log = (msg: string) => console.log(`[AUTH] ${msg}`);

export async function authenticate(username: string, password: string): Promise<AuthResult> {
  const cookieJar = new CookieJar();

  // Generate fake analytics cookies
  const sessionId = Math.floor(Math.random() * 1000000000);
  const timestamp = Math.floor(Date.now() / 1000);
  await cookieJar.setCookie(`_ga=GA1.2.${sessionId}.${timestamp}`, MYGOV_URL);
  await cookieJar.setCookie(`_gid=GA1.2.${sessionId + 1}.${timestamp}`, MYGOV_URL);
  await cookieJar.setCookie(`cb-enabled=accepted`, MYGOV_URL);

  const browserHeaders = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Sec-GPC": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Priority": "u=0, i",
  };

  // Step 0: Visit my.gov.gg to trigger PingAccess redirect chain
  // This is critical - we MUST follow my.gov.gg's redirects to get proper state
  log("Requesting protected resource to trigger OAuth flow...");
  let currentUrl = `${MYGOV_URL}/revenue/all-cases`;
  let authUrl: string | null = null;

  // Follow redirects from my.gov.gg until we reach identity.gov.gg
  for (let i = 0; i < 10; i++) {
    log(`Step ${i}: Requesting ${currentUrl.substring(0, 80)}...`);

    const response = await gotScraping({
      url: currentUrl,
      followRedirect: false,
      cookieJar,
      headers: {
        ...browserHeaders,
        ...(currentUrl.includes("identity.gov.gg") ? { "Sec-Fetch-Site": "cross-site" } : {}),
      },
      headerGeneratorOptions: {
        browsers: ["firefox"],
        devices: ["desktop"],
        operatingSystems: ["macos"],
      },
    });

    log(`Step ${i} status: ${response.statusCode}`);
    log(`Step ${i} headers: ${JSON.stringify(response.headers)}`);

    const cookies = await cookieJar.getCookies(currentUrl.includes("identity.gov.gg") ? IDENTITY_URL : MYGOV_URL);
    log(`Step ${i} cookies: ${cookies.map(c => c.key).join(", ")}`);

    // Check for redirect
    if (response.statusCode === 302 || response.statusCode === 301) {
      const location = response.headers.location;
      if (location) {
        // Check if this is the OAuth authorization URL
        if (location.includes("/as/authorization.oauth2") || location.includes("identity.gov.gg")) {
          authUrl = location.startsWith("http") ? location : `${MYGOV_URL}${location}`;
          log(`Found OAuth URL: ${authUrl}`);
          break;
        }
        currentUrl = location.startsWith("http") ? location : `${MYGOV_URL}${location}`;
        continue;
      }
    }

    // Check for 401 with redirect in body or meta refresh
    if (response.statusCode === 401 || response.statusCode === 200) {
      const body = response.body;

      // Check for meta refresh redirect
      const metaRefreshMatch = body.match(/content=["']?\d+;\s*url=([^"'\s>]+)/i);
      if (metaRefreshMatch) {
        currentUrl = metaRefreshMatch[1];
        log(`Found meta refresh redirect: ${currentUrl}`);
        continue;
      }

      // Check for JavaScript redirect
      const jsRedirectMatch = body.match(/window\.location\s*=\s*["']([^"']+)["']/i) ||
                              body.match(/location\.href\s*=\s*["']([^"']+)["']/i);
      if (jsRedirectMatch) {
        // Unescape JS string: \/ -> /, \x26 -> &, etc.
        let url = jsRedirectMatch[1]
          .replace(/\\\//g, "/")
          .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
          .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
        currentUrl = url;
        log(`Found JS redirect: ${currentUrl}`);
        continue;
      }

      // If 401 with no redirect, check if there's a WWW-Authenticate header or Location
      if (response.headers.location) {
        currentUrl = response.headers.location.startsWith("http")
          ? response.headers.location
          : `${MYGOV_URL}${response.headers.location}`;
        continue;
      }

      // Log response body for debugging
      log(`Response body preview: ${body.substring(0, 500)}`);
    }

    // If we get here without a redirect, something's wrong
    log(`No redirect found at step ${i}`);
    break;
  }

  if (!authUrl) {
    throw new Error("Could not find OAuth authorization URL from my.gov.gg redirect chain");
  }

  log("Following OAuth URL from PingAccess...");
  const authResponse = await gotScraping({
    url: authUrl,
    followRedirect: false,
    cookieJar,
    headers: {
      ...browserHeaders,
      "Referer": `${MYGOV_URL}/`,
      "Sec-Fetch-Site": "cross-site",
    },
    headerGeneratorOptions: {
      browsers: ["firefox"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  log(`Auth response status: ${authResponse.statusCode}`);

  // Follow redirect to login page
  let loginPageUrl = authResponse.headers.location;
  if (!loginPageUrl) {
    loginPageUrl = authUrl;
  }

  log("Following redirect to login page...");
  const fullLoginUrl = loginPageUrl.startsWith("http") ? loginPageUrl : `${IDENTITY_URL}${loginPageUrl}`;

  const loginPageResponse = await gotScraping({
    url: fullLoginUrl,
    followRedirect: false,
    cookieJar,
    headers: {
      ...browserHeaders,
      "Referer": authUrl,
      "Sec-Fetch-Site": "same-origin",
    },
    headerGeneratorOptions: {
      browsers: ["firefox"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  log(`Login page status: ${loginPageResponse.statusCode}`);

  // Extract form action
  const loginHtml = loginPageResponse.body;
  const formActionMatch = loginHtml.match(/action="([^"]+)"/);
  let formActionUrl: string;

  if (formActionMatch) {
    formActionUrl = formActionMatch[1].replace(/&amp;/g, "&");
    if (!formActionUrl.startsWith("http")) {
      formActionUrl = `${IDENTITY_URL}${formActionUrl}`;
    }
  } else {
    const urlPath = new URL(fullLoginUrl).pathname;
    formActionUrl = `${IDENTITY_URL}${urlPath}`;
  }

  log("Submitting credentials...");
  log(`Form action: ${formActionUrl}`);

  // Step 3: Submit login form
  const loginFormData = new URLSearchParams({
    "pf.username": username,
    "pf.pass": password,
    "pf.ok": "clicked",
    "pf.cancel": "",
    "pf.passwordreset": "",
    "pf.registration": "",
    "pf.adapterId": "PHF",
  });

  const loginResponse = await gotScraping({
    url: formActionUrl,
    method: "POST",
    followRedirect: false,
    cookieJar,
    headers: {
      ...browserHeaders,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": IDENTITY_URL,
      "Referer": fullLoginUrl,
      "Sec-Fetch-Site": "same-origin",
    },
    body: loginFormData.toString(),
    headerGeneratorOptions: {
      browsers: ["firefox"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  log(`Login response status: ${loginResponse.statusCode}`);

  const callbackUrl = loginResponse.headers.location;
  if (!callbackUrl || !callbackUrl.includes("/pa/oidc/cb")) {
    log(`Login response body: ${loginResponse.body.substring(0, 500)}`);
    throw new Error(`Login failed. Status: ${loginResponse.statusCode}. No callback redirect.`);
  }

  log("Login successful, following callback...");
  log(`Callback URL: ${callbackUrl}`);

  // Log cookies before callback
  const mygovCookiesBefore = await cookieJar.getCookies(MYGOV_URL);
  const identityCookiesBefore = await cookieJar.getCookies(IDENTITY_URL);
  log(`MyGov cookies before callback: ${mygovCookiesBefore.map(c => c.key).join(", ")}`);
  log(`Identity cookies before callback: ${identityCookiesBefore.map(c => c.key).join(", ")}`);

  // Step 4: Follow callback
  const callbackResponse = await gotScraping({
    url: callbackUrl,
    followRedirect: false,
    cookieJar,
    headers: {
      ...browserHeaders,
      "Referer": `${IDENTITY_URL}/`,
      "Sec-Fetch-Site": "cross-site",
    },
    headerGeneratorOptions: {
      browsers: ["firefox"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  log(`Callback response status: ${callbackResponse.statusCode}`);

  if (callbackResponse.statusCode >= 400) {
    log(`Callback error body: ${callbackResponse.body.substring(0, 1500)}`);
    log(`Callback headers: ${JSON.stringify(callbackResponse.headers)}`);
  }

  // Follow redirects
  let nextLocation = callbackResponse.headers.location;
  let redirectCount = 0;

  while (nextLocation && redirectCount < 10) {
    redirectCount++;
    const fullUrl = nextLocation.startsWith("http") ? nextLocation : `${MYGOV_URL}${nextLocation}`;
    log(`Following redirect ${redirectCount}: ${fullUrl.substring(0, 80)}...`);

    const redirectResponse = await gotScraping({
      url: fullUrl,
      followRedirect: false,
      cookieJar,
      headers: {
        ...browserHeaders,
        "Sec-Fetch-Site": "same-origin",
      },
      headerGeneratorOptions: {
        browsers: ["firefox"],
        devices: ["desktop"],
        operatingSystems: ["macos"],
      },
    });

    log(`Redirect ${redirectCount} status: ${redirectResponse.statusCode}`);
    nextLocation = redirectResponse.headers.location;
  }

  // Get final cookies
  const mygovCookies = await cookieJar.getCookies(MYGOV_URL);
  log(`Final MyGov cookies: ${mygovCookies.map(c => c.key).join(", ")}`);

  const jwtCookie = mygovCookies.find(c => c.key === "PA.drupal_oidc");
  if (!jwtCookie) {
    throw new Error("Authentication failed: PA.drupal_oidc cookie not received");
  }

  let expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  try {
    const [, payloadB64] = jwtCookie.value.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp) {
      expiresAt = new Date(payload.exp * 1000);
    }
  } catch {
    log("Warning: Could not parse JWT expiration");
  }

  log(`Authentication complete. Session expires at ${expiresAt.toISOString()}`);

  const cookieString = mygovCookies.map(c => `${c.key}=${c.value}`).join("; ");
  return { cookies: cookieString, expiresAt };
}
