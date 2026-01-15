import { NextResponse } from "next/server";

const IDENTITY_URL = "https://identity.gov.gg";
const MYGOV_URL = "https://my.gov.gg";

export async function GET() {
  const logs: string[] = [];
  const log = (msg: string) => {
    console.log(`[AUTH-DEBUG] ${msg}`);
    logs.push(msg);
  };

  try {
    const username = process.env.MYGOV_USERNAME;
    const password = process.env.MYGOV_PASSWORD;

    if (!username || !password) {
      return NextResponse.json({ error: "MYGOV_USERNAME/PASSWORD not set" }, { status: 500 });
    }

    // Track cookies per domain
    const mygovCookies = new Map<string, string>();
    const identityCookies = new Map<string, string>();

    const parseCookies = (headers: Headers, domain: "mygov" | "identity") => {
      const cookies = domain === "mygov" ? mygovCookies : identityCookies;
      const setCookies = headers.getSetCookie();
      for (const cookie of setCookies) {
        const pair = cookie.split(";")[0];
        if (!pair) continue;
        const [name, ...vals] = pair.split("=");
        const value = vals.join("=");
        if (name) {
          cookies.set(name.trim(), value);
          log(`[${domain}] Cookie: ${name.trim()}=${value.substring(0, 40)}${value.length > 40 ? "..." : ""}`);
        }
      }
    };

    const getCookieString = (domain: "mygov" | "identity") => {
      const cookies = domain === "mygov" ? mygovCookies : identityCookies;
      return Array.from(cookies.entries())
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    };

    // Step 1: Visit my.gov.gg and follow ALL redirects to get the full OAuth URL
    log("=== Step 1: Visit my.gov.gg (manual redirects) ===");
    let currentUrl = `${MYGOV_URL}/revenue/all-cases`;
    let currentDomain: "mygov" | "identity" = "mygov";
    let loginPageUrl = "";
    let loginHtml = "";

    for (let i = 0; i < 10; i++) {
      log(`Request ${i + 1}: ${currentUrl.substring(0, 80)}...`);
      const resp = await fetch(currentUrl, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html",
          "Cookie": getCookieString(currentDomain),
        },
      });

      log(`Status: ${resp.status}`);

      // Check for WWW-Authenticate
      const wwwAuth = resp.headers.get("www-authenticate");
      if (wwwAuth) log(`WWW-Authenticate: ${wwwAuth}`);

      // Log all headers for debugging
      const allHeaders: string[] = [];
      resp.headers.forEach((v, k) => allHeaders.push(`${k}: ${v.substring(0, 80)}`));
      log(`Headers: ${allHeaders.join(" | ")}`);

      parseCookies(resp.headers, currentDomain);

      const location = resp.headers.get("location");

      if (resp.status === 200) {
        // Check if this is a login form
        loginHtml = await resp.text();
        if (loginHtml.includes('pf.username') || loginHtml.includes('name="pf.pass"')) {
          loginPageUrl = currentUrl;
          log("Found login form!");
          break;
        }
        log(`Got 200 but not a login form. Body preview: ${loginHtml.substring(0, 100)}`);
        break;
      }

      if (!location) {
        // Check response body for redirect
        const body = await resp.text();
        log(`Body preview: ${body.substring(0, 500)}`);

        // Look for redirect URL in body
        const redirectMatch = body.match(/window\.location\s*=\s*["']([^"']+)["']/i) ||
                              body.match(/href=["']([^"']*identity\.gov\.gg[^"']*)["']/i) ||
                              body.match(/action=["']([^"']+)["']/i);
        if (redirectMatch?.[1]) {
          const redirectUrl = redirectMatch[1];
          log(`Found redirect in body: ${redirectUrl}`);
          currentUrl = redirectUrl.startsWith("http") ? redirectUrl :
                       redirectUrl.includes("identity.gov.gg") ? `${IDENTITY_URL}${redirectUrl}` : `${MYGOV_URL}${redirectUrl}`;
          if (redirectUrl.includes("identity.gov.gg")) currentDomain = "identity";
          continue;
        }
        break;
      }

      // Determine next domain
      if (location.includes("identity.gov.gg")) {
        currentDomain = "identity";
        currentUrl = location.startsWith("http") ? location : `${IDENTITY_URL}${location}`;
      } else if (location.includes("my.gov.gg")) {
        currentDomain = "mygov";
        currentUrl = location.startsWith("http") ? location : `${MYGOV_URL}${location}`;
      } else {
        currentUrl = location.startsWith("http") ? location : `${currentDomain === "mygov" ? MYGOV_URL : IDENTITY_URL}${location}`;
      }

      // Add cookie consent
      if (currentDomain === "mygov") {
        mygovCookies.set("cb-enabled", "accepted");
      }
    }

    if (!loginPageUrl || !loginHtml.includes("pf.username")) {
      return NextResponse.json({ error: "Could not find login form", logs });
    }

    // Extract form action
    const formMatch = loginHtml.match(/action="([^"]+)"/);
    let formAction = formMatch?.[1]?.replace(/&amp;/g, "&") || "";
    if (!formAction.startsWith("http")) formAction = `${IDENTITY_URL}${formAction}`;
    log(`Form action: ${formAction.substring(0, 100)}`);

    // Step 2: Submit credentials
    log("=== Step 2: Submit credentials ===");
    const loginResp = await fetch(formAction, {
      method: "POST",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": getCookieString("identity"),
        "Origin": IDENTITY_URL,
        "Referer": loginPageUrl,
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
    });

    log(`Status: ${loginResp.status}`);
    parseCookies(loginResp.headers, "identity");

    const callbackUrl = loginResp.headers.get("location");
    log(`Callback URL: ${callbackUrl?.substring(0, 120) || "none"}`);

    if (!callbackUrl?.includes("/pa/oidc/cb")) {
      const body = await loginResp.text();
      log(`Login failed - Body: ${body.substring(0, 500)}`);
      return NextResponse.json({ error: "Login failed", logs });
    }

    // Step 3: Follow callback and ALL subsequent redirects
    log("=== Step 3: Follow callback chain ===");
    currentUrl = callbackUrl;
    currentDomain = "mygov";

    for (let i = 0; i < 10; i++) {
      log(`Callback ${i + 1}: ${currentUrl.substring(0, 80)}...`);
      log(`Cookies: ${getCookieString(currentDomain).substring(0, 100)}...`);

      const resp = await fetch(currentUrl, {
        redirect: "manual",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          "Accept": "text/html",
          "Cookie": getCookieString(currentDomain),
          "Referer": loginPageUrl,
        },
      });

      log(`Status: ${resp.status}`);
      parseCookies(resp.headers, currentDomain);

      if (resp.status === 403) {
        const body = await resp.text();
        log(`403 Body: ${body.substring(0, 300)}`);
      }

      const location = resp.headers.get("location");
      if (!location || resp.status === 200) break;

      if (location.includes("identity.gov.gg")) {
        currentDomain = "identity";
        currentUrl = location.startsWith("http") ? location : `${IDENTITY_URL}${location}`;
      } else {
        currentDomain = "mygov";
        currentUrl = location.startsWith("http") ? location : `${MYGOV_URL}${location}`;
      }
    }

    log(`=== Final ===`);
    log(`MyGov cookies: ${Array.from(mygovCookies.keys()).join(", ")}`);
    const jwtValue = mygovCookies.get("PA.drupal_oidc");
    log(`PA.drupal_oidc: ${jwtValue ? `${jwtValue.length} chars` : "MISSING"}`);

    return NextResponse.json({
      success: !!jwtValue && jwtValue.length > 100,
      mygovCookies: Array.from(mygovCookies.keys()),
      jwtLength: jwtValue?.length || 0,
      logs
    });

  } catch (error) {
    log(`Error: ${error}`);
    return NextResponse.json({ error: String(error), logs }, { status: 500 });
  }
}
