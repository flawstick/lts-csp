/** Staff dashboard (apps/web) flows, driven in a real browser. */
import type { Page } from "playwright";
import { shot } from "../browser";
import { formRow, jobsForTask, returnRow } from "../db";
import type { Flow, FlowContext } from "./index";
import { staffPage } from "./session";

const PREPARE_AGAIN = "Run Prepare only again, then submit the new draft.";

async function openReturn(page: Page, ctx: FlowContext, key: string) {
  const r = ctx.seeded.returns[key]!;
  await page.goto(`${ctx.webUrl}/org/${ctx.seeded.orgId}/returns/${r.taxReturnId}`);
  await page.getByRole("heading", { name: "Additional Information" }).waitFor();
  return r;
}

async function openAdditionalInformation(page: Page) {
  await page.getByRole("heading", { name: "Additional Information" }).click();
  const dialog = page.getByRole("dialog", { name: "Additional Information" });
  await dialog.waitFor();
  return dialog;
}

const noaTrigger = (page: Page) => page.locator("button#noticeOfAssessment");

async function chooseNoa(page: Page, option: "Yes" | "No") {
  await noaTrigger(page).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function openTask(page: Page, ctx: FlowContext, key: string) {
  const r = ctx.seeded.returns[key]!;
  await page.goto(`${ctx.webUrl}/org/${ctx.seeded.orgId}/tasks/${r.taskId}`);
  // Idle: start buttons; a run in progress: its Cancel task button.
  await page.getByRole("button", { name: "Prepare only" }).or(page.getByRole("button", { name: "Cancel task" })).waitFor();
  return r;
}

async function openMoreMenu(page: Page) {
  await page.getByRole("button", { name: "More" }).click();
  const menu = page.getByRole("menu");
  await menu.waitFor();
  return menu;
}

const submitPreparedItem = (page: Page) => page.getByRole("menuitem", { name: /Submit prepared return/ });
const fullSubmitItem = (page: Page) => page.getByRole("menuitem", { name: /Submit return \+ save PDF/ });
const isDisabled = async (locator: ReturnType<Page["locator"]>) =>
  (await locator.getAttribute("aria-disabled")) === "true" || (await locator.getAttribute("data-disabled")) !== null;

/** Return page: unset answer shows "Yes (default)"; No and back is no change. */
const editorDefault: Flow = {
  name: "web: return (a) editor shows Yes (default); No and back is no change",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const r = await openReturn(page, ctx, "a_ready_default");
    const dialog = await openAdditionalInformation(page);
    await noaTrigger(page).waitFor();
    c.eq("NoA select shows the effective default", (await noaTrigger(page).innerText()).trim(), "Yes (default)");
    c.ok("help text says LTS answers Yes unless No", await dialog.getByText("LTS answers Yes unless you choose No.").isVisible());
    c.ok("signed-off warning shown", await dialog.getByRole("note").isVisible());
    c.ok("Save button shows no change", await dialog.getByRole("button", { name: "Save Changes" }).isVisible());
    await shot(page, "a1-editor-default");

    await noaTrigger(page).click();
    const options = (await page.getByRole("option").allInnerTexts()).map((t) => t.trim());
    c.eq("only Yes and No are offered", options, ["Yes", "No"]);
    await shot(page, "a2-editor-options");
    await page.getByRole("option", { name: "No", exact: true }).click();
    c.eq("after choosing No the select shows No", (await noaTrigger(page).innerText()).trim(), "No");
    c.ok(
      "choosing No is a change that would clear the client sign-off",
      await dialog.getByRole("button", { name: "Save and clear client sign-off" }).isVisible(),
    );
    await shot(page, "a3-editor-no");

    await chooseNoa(page, "Yes");
    c.eq("back to Yes shows the default again", (await noaTrigger(page).innerText()).trim(), "Yes (default)");
    c.ok("No then Yes is no change", await dialog.getByRole("button", { name: "Save Changes" }).isVisible());
    await shot(page, "a4-editor-back-to-yes");
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await dialog.waitFor({ state: "hidden" });

    const form = await formRow(r.taxReturnId);
    const ret = await returnRow(r.taxReturnId);
    c.eq("nothing saved: NoA still unset", form.notice_of_assessment, null);
    c.ok("client sign-off kept", ret.ready_for_submission_at !== null);
    await page.close();
  },
};

/** Saving No then Yes from the editor; the prepared draft stays valid. */
const editorSave: Flow = {
  name: "web: return (f) save No, then Yes",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const r = await openReturn(page, ctx, "f_edit_noa");
    let dialog = await openAdditionalInformation(page);
    await chooseNoa(page, "No");
    await dialog.getByRole("button", { name: "Save and clear client sign-off" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(500);
    let form = await formRow(r.taxReturnId);
    const ret = await returnRow(r.taxReturnId);
    c.eq("No saved", form.notice_of_assessment, "No");
    c.eq("saving a change clears the client sign-off (by design)", ret.ready_for_submission_at, null);

    dialog = await openAdditionalInformation(page);
    c.eq("saved No shows as No", (await noaTrigger(page).innerText()).trim(), "No");
    await chooseNoa(page, "Yes");
    c.eq("explicit Yes over a saved No shows Yes", (await noaTrigger(page).innerText()).trim(), "Yes");
    await shot(page, "f1-editor-yes-over-no");
    await dialog.getByRole("button", { name: "Save Changes" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(500);
    form = await formRow(r.taxReturnId);
    c.eq("Yes saved", form.notice_of_assessment, "Yes");

    // NoA is answered at submission, so it is not part of the draft fingerprint:
    // the only thing now blocking Submit prepared return is the client sign-off.
    await openTask(page, ctx, "f_edit_noa");
    await openMoreMenu(page);
    c.ok("Submit prepared return disabled until the client signs off again", await isDisabled(submitPreparedItem(page)));
    const menuText = await page.getByRole("menu").innerText();
    c.ok("reason is the client sign-off", menuText.includes("The client has not signed off this return"), menuText);
    c.ok("prepared draft still valid (no 'data changed')", !menuText.includes("changed after the draft was prepared"), menuText);
    await shot(page, "f2-task-awaiting-client-signoff");
    await page.keyboard.press("Escape");
    await page.close();
  },
};

/** (a) Submit prepared return: enabled, dialog shows Yes (default), queues the right job. */
const submitPreparedReady: Flow = {
  name: "web: task (a) Submit prepared return queues submit_prepared",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const r = await openTask(page, ctx, "a_ready_default");
    const before = await jobsForTask(r.taskId);
    await openMoreMenu(page);
    c.ok("Submit prepared return enabled", !(await isDisabled(submitPreparedItem(page))));
    c.ok("full submit enabled too", !(await isDisabled(fullSubmitItem(page))));
    await shot(page, "a5-task-menu");
    await submitPreparedItem(page).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    c.ok("dialog is the prepared-return confirmation", text.includes("Submit the prepared return?"), text);
    c.ok("dialog shows Notice of assessment: Yes (default)", /Notice of assessment:\s*Yes \(default\)/.test(text), text);
    const confirm = dialog.getByRole("button", { name: "Submit prepared return" });
    c.ok("confirm disabled until the review box is ticked", await confirm.isDisabled());
    await dialog.getByRole("checkbox").check();
    c.ok("confirm enabled after ticking", await confirm.isEnabled());
    await shot(page, "a6-submit-dialog");
    await confirm.click();
    await dialog.waitFor({ state: "hidden" });

    let created: Awaited<ReturnType<typeof jobsForTask>>[number] | undefined;
    for (let i = 0; i < 40 && !created; i++) {
      created = (await jobsForTask(r.taskId)).find((j) => !before.some((b) => b.id === j.id));
      if (!created) await page.waitForTimeout(250);
    }
    c.ok("a new job was created", !!created);
    if (created) {
      const data = created.result_data ?? {};
      const prepared = before.find((j) => j.status === "completed");
      c.eq("job is queued (enqueue only, no ECS)", created.status, "queued");
      c.eq("filingOperation", data.filingOperation, "submit_prepared");
      c.eq("submissionMode", data.submissionMode, "submit_and_capture_pdf");
      c.eq("preparedJobId is the prepared run", data.preparedJobId, prepared?.id);
      c.eq("overrideSaved", data.overrideSaved, false);
      c.ok("no ECS task ARN", !("ecsTaskArn" in data));
      ctx.shared.aQueuedJobId = created.id;
    }
    c.ok("no start error shown", (await page.getByText("did not start").count()) === 0);
    await page.waitForTimeout(1000);
    await shot(page, "a7-after-submit-queued");
    await page.close();
  },
};

/**
 * (a) Cancel the queued Submit prepared return run before a worker claims it
 * (queued runs never time out on their own), then submit again.
 */
const cancelQueuedSubmit: Flow = {
  name: "web: task (a) cancel the queued run, then submit again",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const r = await openTask(page, ctx, "a_ready_default");
    const queuedId = ctx.shared.aQueuedJobId;
    c.ok("page shows the queued run", await page.getByText("Queued", { exact: true }).first().isVisible());
    c.ok("no start actions while a run is queued", (await page.getByRole("button", { name: "More" }).count()) === 0);
    // The square "Cancel task" button next to the Queued badge.
    await page.getByRole("button", { name: "Cancel task" }).click();
    let status = "queued";
    for (let i = 0; i < 20 && status === "queued"; i++) {
      await page.waitForTimeout(250);
      status = (await jobsForTask(r.taskId)).find((j) => j.id === queuedId)?.status ?? "missing";
    }
    c.eq("queued run is cancelled", status, "cancelled");
    await shot(page, "a8-after-cancel");

    await page.reload();
    await page.getByRole("button", { name: "Prepare only" }).waitFor();
    await openMoreMenu(page);
    c.ok("Submit prepared return offered again after cancelling (same draft)", !(await isDisabled(submitPreparedItem(page))));
    await submitPreparedItem(page).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Submit prepared return" }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.waitForTimeout(1000);
    const jobs = await jobsForTask(r.taskId);
    const requeued = jobs.find((j) => j.status === "queued");
    c.ok("re-queued", !!requeued, JSON.stringify(jobs.map((j) => [j.job_number, j.status])));
    c.eq("re-queued run targets the same prepared draft", requeued?.result_data?.preparedJobId, jobs[0]?.id);
    if (requeued) ctx.shared.aQueuedJobId = requeued.id;
    await page.close();
  },
};

/** (b) Latest prepare failed: disabled with the reason; forced start shows the server refusal. */
const submitPreparedFailedPrepare: Flow = {
  name: "web: task (b) failed prepare blocks Submit prepared return",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const r = await openTask(page, ctx, "b_failed_prepare");
    const before = await jobsForTask(r.taskId);
    await openMoreMenu(page);
    const expected = `The latest preparation did not finish on the review page. ${PREPARE_AGAIN}`;
    c.ok("Submit prepared return disabled", await isDisabled(submitPreparedItem(page)));
    c.ok("reason shown under the item", await page.getByRole("menu").getByText(expected).isVisible());
    c.ok("full submit still available", !(await isDisabled(fullSubmitItem(page))));
    await shot(page, "b1-disabled-with-reason");
    await page.keyboard.press("Escape");

    // Force it: pretend the page's readiness is stale (says ready), so the
    // server's own gate is what refuses.
    await page.route("**/api/trpc/**taxReturn.getTask**", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(
        /"submitPrepared":\{"ready":false,"blocker":"(?:[^"\\]|\\.)*"\}/g,
        '"submitPrepared":{"ready":true,"blocker":null}',
      );
      await route.fulfill({ response, body });
    });
    await page.reload();
    await page.getByRole("button", { name: "Prepare only" }).waitFor();
    const runLabelBefore = (await page.getByRole("button", { name: /^Run \d+/ }).innerText()).trim();
    await openMoreMenu(page);
    c.ok("(forced) item enabled with stale readiness", !(await isDisabled(submitPreparedItem(page))));
    await submitPreparedItem(page).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Submit prepared return" }).click();
    // The refusal opens its own dialog once the confirmation has closed.
    const alert = page.getByRole("alertdialog").filter({ hasText: "did not start" });
    await alert.waitFor();
    const alertText = await alert.innerText();
    c.ok("refusal dialog names the action", alertText.includes("Submit prepared return did not start"), alertText);
    c.ok("refusal dialog shows the server's reason", alertText.includes("The latest preparation did not finish on the review page"), alertText);
    c.ok("refusal dialog says no run was created", alertText.includes("No new run was created"), alertText);
    await page.waitForTimeout(6000); // past the toast's lifetime
    c.ok("refusal dialog is still there after the toast", await alert.isVisible());
    const after = await jobsForTask(r.taskId);
    c.eq("no job created by the refused start", after.length, before.length);
    await shot(page, "b2-forced-refusal-alert");
    await alert.getByRole("button", { name: "OK" }).click();
    await alert.waitFor({ state: "hidden" });
    c.ok("refusal dialog dismissable", (await page.getByText("did not start").count()) === 0);
    // The modal hid the page from the accessibility tree; check it once closed.
    c.eq("selected run unchanged", (await page.getByRole("button", { name: /^Run \d+/ }).innerText()).trim(), runLabelBefore);
    c.ok("earlier run's output still shown", await page.getByText("E2E seeded output of the timed-out prepare run").first().isVisible());
    await page.unroute("**/api/trpc/**taxReturn.getTask**");

    // The fix for (b): Prepare only again. It queues a prepare run (no ECS),
    // and the queued run can be withdrawn.
    await page.reload();
    await page.getByRole("button", { name: "Prepare only" }).click();
    await page.getByRole("button", { name: "Cancel task" }).waitFor();
    const prepare = (await jobsForTask(r.taskId)).find((j) => !before.some((b) => b.id === j.id));
    c.eq("Prepare only queued a run", prepare?.status, "queued");
    c.eq("prepare run is prepare_only", prepare?.result_data?.submissionMode, "prepare_only");
    c.ok("prepare run is a fill, not submit_prepared", prepare?.result_data?.filingOperation === undefined);
    await shot(page, "b3-prepare-only-queued");
    await page.getByRole("button", { name: "Cancel task" }).click();
    await page.getByRole("button", { name: "Prepare only" }).waitFor();
    c.eq("queued prepare run cancelled", (await jobsForTask(r.taskId)).find((j) => j.id === prepare?.id)?.status, "cancelled");
    await page.close();
  },
};

/**
 * (c) Locked return: the toolbar's "Submit locked" indicator opens the lock
 * dialog; confirm-not-filed (a second view of that dialog) needs a note,
 * then the lock is released.
 */
const lockedReturn: Flow = {
  name: "web: task (c) dispatch lock and confirm not filed",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const r = await openTask(page, ctx, "c_locked");
    const indicator = page.getByRole("button", { name: "Submit locked" });
    await indicator.waitFor();
    c.ok("no inline lock banner", (await page.getByText("Submitting is locked for this return").count()) === 0);
    await indicator.click();
    const dialog = page.getByRole("dialog").filter({ hasText: "Submitting is locked for this return" });
    await dialog.waitFor();
    c.ok("agent report collapsed by default", !(await dialog.innerText()).includes("PREPARED_DRAFT_NOT_VERIFIED"));
    await dialog.getByRole("button", { name: "Show agent report" }).click();
    const dialogText = await dialog.innerText();
    c.ok("dialog shows the agent report", dialogText.includes("PREPARED_DRAFT_NOT_VERIFIED"), dialogText);
    c.ok("dialog explains no browser session / 24h rule", dialogText.includes("recorded no browser session"), dialogText);
    await shot(page, "c1-lock-banner");
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "hidden" });

    await openMoreMenu(page);
    c.ok("Submit prepared return disabled while locked", await isDisabled(submitPreparedItem(page)));
    c.ok("full submit disabled while locked", await isDisabled(fullSubmitItem(page)));
    c.ok("lock reason shown in menu", (await page.getByRole("menu").innerText()).includes("may have accepted the filing"));
    // The menu offers the lock dialog next to the reason.
    await page.getByRole("menuitem", { name: /Review the submit lock/ }).click();
    await dialog.waitFor();

    await dialog.getByRole("button", { name: /I checked the portal: not submitted/ }).click();
    // Same dialog, second view: no dialog stacked on top.
    const form = page.getByRole("dialog").filter({ hasText: "did not submit?" });
    await form.waitFor();
    c.eq("one dialog open", await page.getByRole("dialog").count(), 1);
    const record = form.getByRole("button", { name: "Record not submitted" });
    c.ok("record disabled with nothing filled in", await record.isDisabled());
    await form.getByRole("checkbox").click();
    c.ok("record disabled without a note", await record.isDisabled());
    await form.getByRole("textbox").fill("too short");
    c.ok("record disabled with a note under 10 characters", await record.isDisabled());
    await form.getByRole("textbox").fill("E2E check: the 2025 return is still a draft on the portal; no submitted return or receipt.");
    c.ok("record enabled with a note and the box ticked", await record.isEnabled());
    await shot(page, "c2-confirm-dialog");
    await record.click();
    // The lock lifts, so the dialog closes and the indicator goes.
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await indicator.waitFor({ state: "hidden" });
    c.ok("lock indicator gone", (await page.getByText("Submitting is locked for this return").count()) === 0);
    await shot(page, "c3-lock-released");

    const jobs = await jobsForTask(r.taskId);
    const submitJob = jobs.find((j) => j.result_data?.filingOperation === "submit_prepared");
    c.ok("confirmation stored on the run", !!submitJob?.result_data?.submitNotFiledConfirmation);
    const ret = await returnRow(r.taxReturnId);
    const history = (ret.metadata?.submitNotFiledConfirmations ?? []) as unknown[];
    c.eq("audit entry on the return", history.length, 1);

    await openMoreMenu(page);
    const menuText = await page.getByRole("menu").innerText();
    c.ok("full submit available again", !(await isDisabled(fullSubmitItem(page))), menuText);
    c.ok("Submit prepared return now asks for a fresh Prepare only", await isDisabled(submitPreparedItem(page)));
    c.ok("reason mentions the confirmed run", menuText.includes("staff confirmed it did not submit"), menuText);
    await shot(page, "c4-menu-after-release");
    await page.keyboard.press("Escape");
    await page.close();
  },
};

/** (d) NoA "No": dialog shows No. */
const submitPreparedNo: Flow = {
  name: "web: task (d) dialog shows Notice of assessment: No",
  async run(ctx, c) {
    const page = await staffPage(ctx.webUrl);
    const r = await openTask(page, ctx, "d_noa_no");
    const before = await jobsForTask(r.taskId);
    await openMoreMenu(page);
    c.ok("Submit prepared return enabled", !(await isDisabled(submitPreparedItem(page))));
    await submitPreparedItem(page).click();
    const dialog = page.getByRole("alertdialog");
    await dialog.waitFor();
    const text = await dialog.innerText();
    c.ok("dialog shows Notice of assessment: No", /Notice of assessment:\s*No\b/.test(text), text);
    c.ok("not labelled as default", !text.includes("(default)"), text);
    await shot(page, "d1-submit-dialog-no");
    await dialog.getByRole("button", { name: "Keep reviewing" }).click();
    await dialog.waitFor({ state: "hidden" });
    c.eq("cancelling creates no job", (await jobsForTask(r.taskId)).length, before.length);
    await page.close();
  },
};

export const webFlows: Flow[] = [
  editorDefault,
  submitPreparedReady,
  cancelQueuedSubmit,
  submitPreparedFailedPrepare,
  lockedReturn,
  submitPreparedNo,
  editorSave,
];
