/** Playwright helpers: real OTP sign-in through the app's login page, screenshots, checks. */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { AUTH_URL, E2E } from "./config";

export const shotsDir = () => {
  const dir = path.join(E2E.outDir, "shots");
  mkdirSync(dir, { recursive: true });
  return dir;
};

export async function launch(): Promise<Browser> {
  return chromium.launch({ headless: process.env.E2E_HEADED !== "1" });
}

export async function newContext(browser: Browser): Promise<BrowserContext> {
  // ignoreHTTPSErrors: the local auth stand-in uses a self-signed certificate.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ignoreHTTPSErrors: true });
  // Belt and braces: the page may only talk to this machine.
  await context.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) => route.abort("blockedbyclient"));
  return context;
}

export async function shot(page: Page, name: string) {
  const file = path.join(shotsDir(), `${name}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

/**
 * Signs in exactly as a person does: types the email on /login, reads the
 * code the local auth stand-in "sent" (its inbox endpoint), types it.
 */
export async function signIn(page: Page, appUrl: string, email: string) {
  await page.goto(`${appUrl}/login`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('button[type="submit"]').click();
  let code: string | null = null;
  for (let i = 0; i < 40 && !code; i++) {
    const res = await fetch(`${AUTH_URL}/__e2e/inbox?email=${encodeURIComponent(email)}`, {
      tls: { rejectUnauthorized: false },
    } as RequestInit);
    if (res.ok) code = ((await res.json()) as { code: string }).code;
    else await page.waitForTimeout(250);
  }
  if (!code) throw new Error(`no sign-in code was sent for ${email}`);
  const otpInput = page.getByPlaceholder("123456").or(page.locator('input[autocomplete="one-time-code"]')).first();
  await otpInput.waitFor();
  await otpInput.fill(code);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

export class Checks {
  results: Array<{ flow: string; name: string; ok: boolean; detail?: string }> = [];
  constructor(private flow: string) {}
  ok(name: string, condition: boolean, detail?: string) {
    this.results.push({ flow: this.flow, name, ok: condition, detail });
    console.log(`  ${condition ? "PASS" : "FAIL"}  ${name}${!condition && detail ? `\n        ${detail}` : ""}`);
    return condition;
  }
  eq(name: string, actual: unknown, expected: unknown) {
    return this.ok(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
  get failed() {
    return this.results.filter((r) => !r.ok);
  }
}
