import * as crypto from "crypto";
import { gotScraping } from "got-scraping";
import { CookieJar } from "tough-cookie";

const IDENTITY_URL = "https://identity.gov.gg";
const MYGOV_URL = "https://my.gov.gg";

interface AuthResult {
  cookies: string;
  expiresAt: Date;
}

const log = (msg: string) => console.log(`[AUTH] ${msg}`);

function unescapeJs(str: string): string {
  // Unescape JavaScript string escapes
  return str
    .replace(/\\x26/g, "&")
    .replace(/\\x3d/g, "=")
    .replace(/\\\//g, "/")
    .replace(/\\-/g, "-")
    .replace(/\\_/g, "_");
}

export async function authenticate(username: string, password: string): Promise<AuthResult> {
  const cookieJar = new CookieJar();

  const browserHeaders = {
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "max-age=0",
    "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"macOS"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
  };

  // Step 1: Visit my.gov.gg to get the OAuth redirect URL
  log("Visiting my.gov.gg...");
  const step1 = await gotScraping({
    url: `${MYGOV_URL}/revenue/all-cases`,
    followRedirect: false,
    cookieJar,
    headers: browserHeaders,
    headerGeneratorOptions: { browsers: ["chrome"], devices: ["desktop"], operatingSystems: ["macos"] },
  });

  log(`Step 1 status: ${step1.statusCode}`);

  // Add cookie consent
  await cookieJar.setCookie("cb-enabled=accepted", MYGOV_URL);

  // Extract the OAuth URL from the 401 page
  const oauthMatch = step1.body.match(/window\.location\s*=\s*['"]([^'"]+)['"]/);
  if (!oauthMatch) {
    throw new Error("Could not find OAuth redirect URL in my.gov.gg response");
  }

  const oauthUrl = unescapeJs(oauthMatch[1]);
  log(`OAuth URL: ${oauthUrl.substring(0, 100)}...`);

  // Step 2: Follow the OAuth URL to identity.gov.gg
  log("Starting OAuth flow...");
  const step2 = await gotScraping({
    url: oauthUrl,
    followRedirect: false,
    cookieJar,
    headers: {
      ...browserHeaders,
      "Referer": `${MYGOV_URL}/`,
    },
    headerGeneratorOptions: { browsers: ["chrome"], devices: ["desktop"], operatingSystems: ["macos"] },
  });

  log(`Step 2 status: ${step2.statusCode}`);

  // Handle redirect or direct response
  let loginPageUrl: string;
  let loginHtml: string;

  if (step2.statusCode === 200) {
    loginPageUrl = oauthUrl;
    loginHtml = step2.body;
    log("Login form in response body");
  } else if (step2.headers.location) {
    loginPageUrl = step2.headers.location.startsWith("http")
      ? step2.headers.location
      : `${IDENTITY_URL}${step2.headers.location}`;
    log(`Following redirect to: ${loginPageUrl.substring(0, 80)}...`);

    const step3 = await gotScraping({
      url: loginPageUrl,
      followRedirect: false,
      cookieJar,
      headers: {
        ...browserHeaders,
        "Referer": oauthUrl,
        "Sec-Fetch-Site": "same-origin",
      },
      headerGeneratorOptions: { browsers: ["chrome"], devices: ["desktop"], operatingSystems: ["macos"] },
    });
    log(`Step 3 status: ${step3.statusCode}`);
    loginHtml = step3.body;
  } else {
    throw new Error(`Unexpected response: ${step2.statusCode}, no redirect`);
  }

  // Extract form action
  const formMatch = loginHtml.match(/action="([^"]+)"/);
  if (!formMatch) {
    throw new Error("Could not find login form action");
  }
  let formAction = formMatch[1].replace(/&amp;/g, "&");
  if (!formAction.startsWith("http")) {
    formAction = `${IDENTITY_URL}${formAction}`;
  }
  log(`Form action: ${formAction.substring(0, 80)}...`);

  // Step 4: Submit credentials
  log("Submitting credentials...");
  const loginResponse = await gotScraping({
    url: formAction,
    method: "POST",
    followRedirect: false,
    cookieJar,
    headers: {
      ...browserHeaders,
      "Content-Type": "application/x-www-form-urlencoded",
      "Origin": IDENTITY_URL,
      "Referer": loginPageUrl,
      "Sec-Fetch-Site": "same-origin",
    },
    body: new URLSearchParams({
      "pf.username": username,
      "pf.pass": password,
      "pf.ok": "clicked",
      "pf.cancel": "",
      "pf.passwordreset": "",
      "pf.registration": "",
      "pf.adapterId": "PHF",
    }).toString(),
    headerGeneratorOptions: { browsers: ["chrome"], devices: ["desktop"], operatingSystems: ["macos"] },
  });

  log(`Login response status: ${loginResponse.statusCode}`);

  const callbackUrl = loginResponse.headers.location;
  if (!callbackUrl?.includes("/pa/oidc/cb")) {
    throw new Error(`Login failed. Status: ${loginResponse.statusCode}. Response: ${loginResponse.body.substring(0, 300)}`);
  }

  log("Login successful!");
  log(`Callback URL: ${callbackUrl.substring(0, 100)}...`);

  // Step 5: Follow callback - this is the critical step
  // The callback should set the PA.drupal_oidc cookie
  log("Following callback...");

  // Get my.gov.gg cookies before callback
  const mygovCookies = await cookieJar.getCookies(MYGOV_URL);
  log(`Cookies for callback: ${mygovCookies.map(c => c.key).join(", ")}`);

  const callbackResponse = await gotScraping({
    url: callbackUrl,
    followRedirect: false,
    cookieJar,
    headers: {
      ...browserHeaders,
      "Referer": loginPageUrl,
      "Sec-Fetch-Site": "cross-site",
    },
    headerGeneratorOptions: { browsers: ["chrome"], devices: ["desktop"], operatingSystems: ["macos"] },
  });

  log(`Callback status: ${callbackResponse.statusCode}`);

  if (callbackResponse.statusCode === 403) {
    log(`Callback 403 body: ${callbackResponse.body.substring(0, 300)}`);
    throw new Error("Callback returned 403 Forbidden");
  }

  // Follow any additional redirects
  let nextLocation = callbackResponse.headers.location;
  let redirectCount = 0;

  while (nextLocation && redirectCount < 10) {
    redirectCount++;
    const fullUrl = nextLocation.startsWith("http") ? nextLocation : `${MYGOV_URL}${nextLocation}`;
    log(`Following redirect ${redirectCount}: ${fullUrl.substring(0, 60)}...`);

    const redirectResponse = await gotScraping({
      url: fullUrl,
      followRedirect: false,
      cookieJar,
      headers: {
        ...browserHeaders,
        "Sec-Fetch-Site": "same-origin",
      },
      headerGeneratorOptions: { browsers: ["chrome"], devices: ["desktop"], operatingSystems: ["macos"] },
    });

    log(`Redirect ${redirectCount} status: ${redirectResponse.statusCode}`);
    nextLocation = redirectResponse.headers.location;
  }

  // Get final cookies
  const finalCookies = await cookieJar.getCookies(MYGOV_URL);
  log(`Final cookies: ${finalCookies.map(c => c.key).join(", ")}`);

  // Find JWT cookie
  const jwtCookie = finalCookies.find(c => c.key === "PA.drupal_oidc");
  if (!jwtCookie || !jwtCookie.value) {
    throw new Error("Authentication failed: PA.drupal_oidc cookie not received");
  }

  log(`Got PA.drupal_oidc (${jwtCookie.value.length} chars)`);

  // Parse JWT for expiration
  let expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  try {
    const [, payloadB64] = jwtCookie.value.split(".");
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString());
    if (payload.exp) {
      expiresAt = new Date(payload.exp * 1000);
    }
  } catch {
    log("Could not parse JWT expiration");
  }

  log(`Session expires: ${expiresAt.toISOString()}`);

  const cookieString = finalCookies.map(c => `${c.key}=${c.value}`).join("; ");
  return { cookies: cookieString, expiresAt };
}
