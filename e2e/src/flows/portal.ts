/**
 * Client portal (apps/portal) flows: the client's sign-off with the notice of
 * assessment left unset (the refusal operators hit before the default), and
 * what staff can then do with it on the dashboard.
 */
import type { Page } from "playwright";
import { shot } from "../browser";
import { formRow, jobsForTask, returnRow } from "../db";
import type { Flow, FlowContext } from "./index";
import { clientPage, staffPage } from "./session";

const NOA_LABEL = "Receive a notice of assessment?";

async function openPortalReturn(page: Page, ctx: FlowContext, key: string) {
  const r = ctx.seeded.returns[key]!;
  await page.goto(`${ctx.portalUrl}/org/${ctx.seeded.orgId}/returns/${r.taxReturnId}`);
  await page.getByRole("heading", { name: r.entityName }).first().waitFor();
  await page.getByText("Finalising the Return").first().waitFor();
  return r;
}

async function readPortalNoa(page: Page) {
  // The section card (a button); the header may also say "Last opened: Finalising the Return".
  await page.getByRole("button").filter({ hasText: "Finalising the Return" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const select = dialog.getByRole("combobox", { name: NOA_LABEL });
  await select.waitFor();
  return { dialog, select, text: (await select.innerText()).trim() };
}

async function openStaffTask(page: Page, ctx: FlowContext, key: string) {
  const r = ctx.seeded.returns[key]!;
  await page.goto(`${ctx.webUrl}/org/${ctx.seeded.orgId}/tasks/${r.taskId}`);
  await page.getByRole("button", { name: "Prepare only" }).waitFor();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menu").waitFor();
  return r;
}

const disabled = async (page: Page, name: RegExp) => {
  const item = page.getByRole("menuitem", { name });
  return (await item.getAttribute("aria-disabled")) === "true" || (await item.getAttribute("data-disabled")) !== null;
};

/** (e) The client signs off with the answer unset; staff can then submit. */
const clientSignoffDefault: Flow = {
  name: "portal: (e) client signs off with NoA unset, staff can submit",
  needsPortal: true,
  async run(ctx, c) {
    const page = await clientPage(ctx.portalUrl);
    const r = await openPortalReturn(page, ctx, "e_awaiting_signoff");
    const noa = await readPortalNoa(page);
    c.eq("portal field shows Yes (default)", noa.text, "Yes (default)");
    c.ok("portal help text", await noa.dialog.getByText("LTS answers Yes unless you choose No.").isVisible());
    await shot(page, "e1-portal-noa-default");
    await page.keyboard.press("Escape");
    await noa.dialog.waitFor({ state: "hidden" });

    c.ok("no 'Submit for filing is unavailable' reason", (await page.getByTestId("approval-blocked-reason").count()) === 0);
    const submit = page.getByRole("button", { name: "Submit for filing" });
    c.ok("Submit for filing enabled", await submit.isEnabled());
    await shot(page, "e2-portal-before-signoff");
    await submit.click();
    await page.getByText("Return marked ready for filing.").waitFor();
    await page.waitForTimeout(500);
    const ret = await returnRow(r.taxReturnId);
    c.ok("client sign-off recorded", ret.ready_for_submission_at !== null);
    c.eq("NoA still unset (default applies)", (await formRow(r.taxReturnId)).notice_of_assessment, null);
    await shot(page, "e3-portal-signed-off");
    await page.close();

    // Staff side: nothing waits for the answer any more.
    const staff = await staffPage(ctx.webUrl);
    await openStaffTask(staff, ctx, "e_awaiting_signoff");
    c.ok("full submit enabled with NoA unset", !(await disabled(staff, /Submit return \+ save PDF/)));
    const menuText = await staff.getByRole("menu").innerText();
    c.ok("Submit prepared return needs a prepared draft first", menuText.includes("No prepared draft found"), menuText);
    c.ok("no notice-of-assessment blocker anywhere", !/notice of assessment/i.test(menuText), menuText);
    await staff.getByRole("menuitem", { name: /Submit return \+ save PDF/ }).click();
    const dialog = staff.getByRole("alertdialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    c.ok("full-submit dialog shows Notice of assessment: Yes (default)", /Notice of assessment:\s*Yes \(default\)/.test(text), text);
    await dialog.getByRole("checkbox").check();
    await shot(staff, "e4-staff-full-submit-dialog");
    const before = await jobsForTask(r.taskId);
    await dialog.getByRole("button", { name: "Submit return" }).click();
    await dialog.waitFor({ state: "hidden" });
    let created;
    for (let i = 0; i < 40 && !created; i++) {
      created = (await jobsForTask(r.taskId)).find((j) => !before.some((b) => b.id === j.id));
      if (!created) await staff.waitForTimeout(250);
    }
    c.ok("full submit queued", created?.status === "queued", JSON.stringify(created));
    c.eq("submissionMode", created?.result_data?.submissionMode, "submit_and_capture_pdf");
    c.ok("not a submit_prepared run", created?.result_data?.filingOperation === undefined);
    c.ok("no start error shown", (await staff.getByText("did not start").count()) === 0);
    await shot(staff, "e5-staff-full-submit-queued");

    // Worker: the full-submit prompt answers Yes as LTS's default.
    const { buildSubstanceFormPrompt } = await import("@repo/task/src/prompt-builder");
    const { db, taxReturns, eq } = await import("@repo/database");
    const row = await db.query.taxReturns.findFirst({
      where: eq(taxReturns.id, r.taxReturnId),
      with: { substanceForm: true, jurisdiction: true },
    });
    const prompt = buildSubstanceFormPrompt({
      taxReturn: row!,
      substanceForm: row!.substanceForm!,
      portalUrl: "https://my.gov.gg",
      submissionMode: "submit_and_capture_pdf",
      contactName: "E2E Filing Contact",
      contactEmail: "filing@client-e2e.test",
    } as Parameters<typeof buildSubstanceFormPrompt>[0]);
    c.ok("full-submit prompt answers Yes (LTS default)", prompt.includes("The answer for this return is **Yes** (LTS's default answer for this return)"));
    await staff.close();
  },
};

/** (f) After staff saved an explicit Yes (clearing sign-off), the client re-approves. */
const clientReapprove: Flow = {
  name: "portal: (f) client re-approves, staff dialog shows explicit Yes",
  needsPortal: true,
  async run(ctx, c) {
    const page = await clientPage(ctx.portalUrl);
    const r = await openPortalReturn(page, ctx, "f_edit_noa");
    const noa = await readPortalNoa(page);
    c.eq("portal shows the saved Yes", noa.text, "Yes");
    await page.keyboard.press("Escape");
    await noa.dialog.waitFor({ state: "hidden" });
    const reapprove = page.getByRole("button", { name: /Re-approve for filing|Submit for filing/ });
    c.ok("re-approval offered", await reapprove.isEnabled());
    await shot(page, "f3-portal-reapprove");
    await reapprove.click();
    await page.getByText("Return marked ready for filing.").waitFor();
    await page.waitForTimeout(500);
    c.ok("client sign-off recorded again", (await returnRow(r.taxReturnId)).ready_for_submission_at !== null);
    await page.close();

    const staff = await staffPage(ctx.webUrl);
    await openStaffTask(staff, ctx, "f_edit_noa");
    c.ok("Submit prepared return enabled again (draft still valid)", !(await disabled(staff, /Submit prepared return/)));
    await staff.getByRole("menuitem", { name: /Submit prepared return/ }).click();
    const dialog = staff.getByRole("alertdialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    c.ok("dialog shows Notice of assessment: Yes (saved, not default)", /Notice of assessment:\s*Yes\b/.test(text) && !text.includes("(default)"), text);
    await shot(staff, "f4-staff-dialog-explicit-yes");
    await dialog.getByRole("button", { name: "Keep reviewing" }).click();
    await staff.close();
  },
};

/**
 * (d) The client changes the reviewer's "No" to "Yes" in the portal: saving
 * the section unchanged keeps the sign-off; the change clears it; after the
 * client re-approves, the prepared draft is still the one to file.
 */
const clientChangesNoToYes: Flow = {
  name: "portal: (d) client changes No to Yes and re-approves",
  needsPortal: true,
  async run(ctx, c) {
    const page = await clientPage(ctx.portalUrl);
    const r = await openPortalReturn(page, ctx, "d_noa_no");
    let noa = await readPortalNoa(page);
    c.eq("portal shows the reviewer's No", noa.text, "No");
    await noa.dialog.getByRole("button", { name: "Save section" }).click();
    await page.getByText("Finalising the Return saved.").first().waitFor();
    await page.waitForTimeout(500);
    c.ok("saving the section unchanged keeps the client sign-off", (await returnRow(r.taxReturnId)).ready_for_submission_at !== null);
    c.eq("NoA unchanged", (await formRow(r.taxReturnId)).notice_of_assessment, "No");

    noa = await readPortalNoa(page);
    await noa.select.click();
    await page.getByRole("option", { name: "Yes", exact: true }).click();
    c.eq("portal select shows Yes", (await noa.select.innerText()).trim(), "Yes");
    await shot(page, "d2-portal-no-to-yes");
    await noa.dialog.getByRole("button", { name: "Save section" }).click();
    await noa.dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(800);
    c.eq("Yes saved", (await formRow(r.taxReturnId)).notice_of_assessment, "Yes");
    c.eq("changing the answer clears the client sign-off", (await returnRow(r.taxReturnId)).ready_for_submission_at, null);
    const reapprove = page.getByRole("button", { name: "Re-approve for filing" });
    await reapprove.waitFor();
    c.ok("Re-approval needed banner", await page.getByText("Re-approval needed").isVisible());
    await shot(page, "d3-portal-reapproval-needed");
    await reapprove.click();
    await page.getByText("Return marked ready for filing.").waitFor();
    await page.waitForTimeout(500);
    c.ok("re-approved", (await returnRow(r.taxReturnId)).ready_for_submission_at !== null);
    await page.close();

    const staff = await staffPage(ctx.webUrl);
    await openStaffTask(staff, ctx, "d_noa_no");
    c.ok("Submit prepared return still available (NoA is not part of the draft)", !(await disabled(staff, /Submit prepared return/)), await staff.getByRole("menu").innerText());
    await staff.getByRole("menuitem", { name: /Submit prepared return/ }).click();
    const dialog = staff.getByRole("alertdialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    c.ok("dialog now shows Notice of assessment: Yes", /Notice of assessment:\s*Yes\b/.test(text) && !text.includes("(default)"), text);
    await dialog.getByRole("button", { name: "Keep reviewing" }).click();
    await staff.close();
  },
};

export const portalFlows: Flow[] = [clientSignoffDefault, clientReapprove, clientChangesNoToYes];
