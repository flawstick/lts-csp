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

  // Step 0: Visit my.gov.gg first to get initial session cookies (especially the nonce cookie)
  log("Getting initial my.gov.gg session...");
  const initialResponse = await gotScraping({
    url: `${MYGOV_URL}/revenue/all-cases`,
    followRedirect: false,
    cookieJar,
    headers: browserHeaders,
    headerGeneratorOptions: {
      browsers: ["firefox"],
      devices: ["desktop"],
      operatingSystems: ["macos"],
    },
  });

  log(`Initial response status: ${initialResponse.statusCode}`);
  const initialCookies = await cookieJar.getCookies(MYGOV_URL);
  log(`Initial my.gov.gg cookies: ${initialCookies.map(c => c.key).join(", ")}`);

  // Step 1: Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const nonce = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(32).toString("base64url");

  log("Starting OAuth2 PKCE flow...");

  // Step 2: Authorization request
  const authParams = new URLSearchParams({
    response_type: "code",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid address email phone profile",
    state: state,
    nonce: nonce,
    vnd_pi_requested_resource: `${MYGOV_URL}/revenue/all-cases`,
    vnd_pi_application_name: "Drupal CIAM/MyGov/ESS/Corp Tax",
  });

  const authUrl = `${IDENTITY_URL}/as/authorization.oauth2?${authParams.toString()}`;
  log("Requesting authorization page...");

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
