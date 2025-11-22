import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { JobLogger } from "./logger";

export interface BrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function createBrowserSession(
  logger: JobLogger,
  options?: {
    headless?: boolean;
    proxy?: string;
  }
): Promise<BrowserSession> {
  await logger.step("Launching browser");

  const browser = await chromium.launch({
    headless: options?.headless ?? true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ...(options?.proxy && {
      proxy: { server: options.proxy },
    }),
  });

  const page = await context.newPage();

  // Screenshot helper
  const takeScreenshot = async (description: string) => {
    const buffer = await page.screenshot({ type: "jpeg", quality: 60 });
    await logger.screenshot(buffer.toString("base64"), description);
  };

  // Auto-screenshot on navigation
  page.on("load", async () => {
    await takeScreenshot(`Page loaded: ${page.url()}`);
  });

  return {
    browser,
    context,
    page,
    close: async () => {
      await context.close();
      await browser.close();
    },
  };
}
