/** One browser per run; one signed-in context per person, created on first use. */
import type { Browser, BrowserContext, Page } from "playwright";
import { CLIENT_EMAIL, STAFF_EMAIL } from "../config";
import { launch, newContext, signIn } from "../browser";

let browser: Browser | undefined;
const contexts = new Map<string, BrowserContext>();

async function signedInContext(key: string, appUrl: string, email: string) {
  browser ??= await launch();
  let context = contexts.get(key);
  if (!context) {
    context = await newContext(browser);
    context.setDefaultTimeout(90_000);
    const page = await context.newPage();
    await signIn(page, appUrl, email);
    await page.close();
    contexts.set(key, context);
  }
  return context;
}

export async function staffPage(webUrl: string): Promise<Page> {
  const page = await (await signedInContext("staff", webUrl, STAFF_EMAIL)).newPage();
  trackPageErrors(page);
  return page;
}

export async function clientPage(portalUrl: string): Promise<Page> {
  const page = await (await signedInContext("client", portalUrl, CLIENT_EMAIL)).newPage();
  trackPageErrors(page);
  return page;
}

export const pageErrors: string[] = [];
function trackPageErrors(page: Page) {
  page.on("pageerror", (error) => pageErrors.push(`${page.url()}: ${error.message}`));
}

export async function closeBrowser() {
  await browser?.close();
  browser = undefined;
  contexts.clear();
}
