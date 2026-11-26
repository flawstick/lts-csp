/**
 * Every main page for every seeded return state loads without a server error
 * or an uncaught exception in the browser.
 */
import type { Page } from "playwright";
import { shot } from "../browser";
import type { Checks } from "../browser";
import type { Flow } from "./index";
import { clientPage, staffPage } from "./session";

async function visit(page: Page, c: Checks, url: string, ready: (page: Page) => Promise<unknown>, label: string) {
  const serverErrors: string[] = [];
  const pageErrors: string[] = [];
  const onResponse = (res: { status(): number; url(): string }) => {
    if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`);
  };
  const onPageError = (error: Error) => pageErrors.push(error.message);
  page.on("response", onResponse);
  page.on("pageerror", onPageError);
  await page.goto(url);
  await ready(page);
  await page.waitForTimeout(1500);
  page.off("response", onResponse);
  page.off("pageerror", onPageError);
  c.ok(`${label}: no 5xx`, serverErrors.length === 0, serverErrors.join("; "));
  c.ok(`${label}: no uncaught page errors`, pageErrors.length === 0, pageErrors.join("; "));
}

const webSmoke: Flow = {
  name: "web: smoke - dashboard, lists, every return and task",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const org = `${ctx.webUrl}/org/${ctx.seeded.orgId}`;
    await visit(page, c, org, (p) => p.getByText("Dashboard").first().waitFor(), "dashboard");
    await visit(page, c, `${org}/returns`, (p) => p.getByText("Notclif E2E Holdings Limited").first().waitFor(), "returns list");
    await shot(page, "s1-web-returns-list");
    await visit(page, c, `${org}/tasks`, (p) => p.getByText("Notclif E2E Holdings Limited").first().waitFor(), "tasks list");
    for (const r of Object.values(ctx.seeded.returns)) {
      await visit(page, c, `${org}/returns/${r.taxReturnId}`, (p) => p.getByRole("heading", { name: "Additional Information" }).waitFor(), `return ${r.key}`);
      await visit(
        page,
        c,
        `${org}/tasks/${r.taskId}`,
        (p) => p.getByRole("button", { name: "Prepare only" }).or(p.getByRole("button", { name: "Cancel task" })).waitFor(),
        `task ${r.key}`,
      );
    }
    await page.close();
  },
};

const portalSmoke: Flow = {
  name: "portal: smoke - returns list and every return",
  needsPortal: true,
  async run(ctx, c) {
    const page = await clientPage(ctx.portalUrl);
    const org = `${ctx.portalUrl}/org/${ctx.seeded.orgId}`;
    await visit(page, c, `${org}/returns`, (p) => p.getByText("Notclif E2E Holdings Limited").first().waitFor(), "portal returns list");
    await shot(page, "s2-portal-returns-list");
    for (const r of Object.values(ctx.seeded.returns)) {
      await visit(page, c, `${org}/returns/${r.taxReturnId}`, (p) => p.getByText("Finalising the Return").first().waitFor(), `portal return ${r.key}`);
    }
    await page.close();
  },
};

export const smokeFlows: Flow[] = [webSmoke, portalSmoke];
