/**
 * Tasks list: a run paused on an agent question is shown as "Needs input" with
 * the question, counted on the sidebar, filterable, and links to the task.
 */
import { shot } from "../browser";
import { jobsForTask, rearmPausedJob } from "../db";
import type { Flow } from "./index";
import { staffPage } from "./session";

const tasksNeedInput: Flow = {
  name: "web: tasks list (g) shows Needs input, the question and the nav count",
  async run(ctx, c) {
    const r = ctx.seeded.returns.g_needs_input!;
    const paused = (await jobsForTask(r.taskId)).at(-1)!;
    c.eq("seeded latest run is the paused one", paused.status === "paused" || paused.status === "failed", true);
    const heartbeat = await rearmPausedJob(paused.id, r.taskId);
    try {
      const page = await staffPage(ctx.webUrl);
      await page.goto(`${ctx.webUrl}/org/${ctx.seeded.orgId}/tasks`);
      const row = page.getByRole("row").filter({ hasText: r.entityName });
      await row.waitFor();

      c.ok("row status says Needs input", await row.getByText("Needs input", { exact: true }).isVisible());
      const preview = row.getByTestId("task-question-preview");
      const previewText = (await preview.innerText()).trim();
      c.ok(
        "row shows the question preview without markers or markdown",
        previewText.startsWith("The draft isn't fully ready for submission.") &&
          !/REQUIRES_ATTENTION|PREPARED_DRAFT_NOT_VERIFIED|\*\*|`/.test(previewText),
        previewText,
      );
      c.ok("preview is at most 160 characters", previewText.length <= 160, String(previewText.length));
      // The tooltip sits on the wrapper, which also holds the screen-reader-only "Agent question:" label.
      const previewWrapper = preview.locator("..");
      c.ok(
        "preview is labelled for screen readers",
        (await previewWrapper.textContent())?.startsWith("Agent question: ") ?? false,
      );
      const title = (await previewWrapper.getAttribute("title")) ?? "";
      c.ok("full question in the preview's title", title.includes("Should I enter the saved Net Book Value"), title);

      const otherRow = page.getByRole("row").filter({ hasText: ctx.seeded.returns.a_ready_default!.entityName });
      c.ok("a finished task does not say Needs input", (await otherRow.getByText("Needs input").count()) === 0);

      const navCount = page.getByTestId("nav-attention-count-tasks");
      await navCount.waitFor();
      c.eq("sidebar Tasks shows 1 needing input", (await navCount.innerText()).trim(), "1");
      c.ok(
        "sidebar Tasks link names the count for screen readers",
        await page.getByRole("link", { name: /Tasks.*1 task needs input/ }).isVisible(),
      );
      await shot(page, "g1-tasks-needs-input");

      // Status filter: only tasks waiting on an answer; the total follows.
      await page.getByRole("button", { name: "Filter by status" }).click();
      await page.getByRole("menuitemcheckbox", { name: "Needs input" }).click();
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        (name) => {
          const rows = Array.from(document.querySelectorAll("tbody tr"));
          return rows.length === 1 && rows[0]!.textContent!.includes(name);
        },
        r.entityName,
      );
      c.ok("Needs input filter keeps only the waiting task", true);
      c.ok("filtered pagination is one page", await page.getByText("Page 1 of 1").isVisible());
      await shot(page, "g2-tasks-filter-needs-input");

      // Detail panel: the question and a link to answer it.
      await row.getByRole("button", { name: "Open menu" }).click();
      await page.getByRole("menuitem", { name: "View Details" }).click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      c.ok("detail panel says the agent asked a question", await dialog.getByText("The filing agent asked a question").isVisible());
      const fullText = (await dialog.getByTestId("task-question-text").innerText()).trim();
      c.ok("detail panel shows the whole question", fullText.includes("leave the draft for you to check?"), fullText);
      c.ok(
        "detail panel renders the question's markdown without the worker markers",
        !/REQUIRES_ATTENTION|PREPARED_DRAFT_NOT_VERIFIED|\*\*/.test(fullText) &&
          (await dialog.getByTestId("task-question-text").locator("li").count()) === 2,
        fullText,
      );
      const answer = dialog.getByRole("link", { name: "Answer in task" });
      c.eq(
        "Answer in task links to the task page",
        await answer.getAttribute("href"),
        `/org/${ctx.seeded.orgId}/tasks/${r.taskId}`,
      );
      await shot(page, "g3-task-details-question");
      await answer.click();
      await page.waitForURL((url) => url.pathname === `/org/${ctx.seeded.orgId}/tasks/${r.taskId}`);
      c.ok("Answer in task opens the task", true);
      await page.close();
    } finally {
      heartbeat.stop();
    }
  },
};

export const attentionFlows: Flow[] = [tasksNeedInput];
