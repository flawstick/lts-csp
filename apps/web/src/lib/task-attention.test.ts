import { describe, expect, it } from "vitest";
import {
  formatAskedAgo,
  getTaskAttention,
  getTaskRunState,
  TASK_QUESTION_PREVIEW_LENGTH,
  stripLeadingMarkers,
  taskNeedsInput,
  toPlainText,
  truncateText,
} from "./task-attention";

const askedAt = Date.parse("2026-11-27T10:00:00Z");

function pausedWith(pendingQuestion: unknown, extra: Record<string, unknown> = {}) {
  return { status: "paused", resultData: { pendingQuestion, ...extra } };
}

const question = (text: string, reason = "agent_question") => ({
  id: "q-1",
  text,
  reason,
  askedAt,
  expiresAt: askedAt + 3_600_000,
});

describe("getTaskAttention", () => {
  it("is a question when the paused job's agent is waiting on an answer", () => {
    const attention = getTaskAttention(
      pausedWith(question("Which accounting period should I use?")),
    );
    expect(attention).toEqual({
      kind: "question",
      reason: "agent_question",
      askedAt,
      expiresAt: askedAt + 3_600_000,
      preview: "Which accounting period should I use?",
      text: "Which accounting period should I use?",
      markdown: "Which accounting period should I use?",
    });
    expect(taskNeedsInput(attention)).toBe(true);
  });

  it("treats a filing-contact stop as a question", () => {
    const attention = getTaskAttention(
      pausedWith(question("NEEDS_FILING_CONTACT: Who is the filing contact?", "filing_contact")),
    );
    expect(attention).toMatchObject({
      kind: "question",
      reason: "filing_contact",
      preview: "Who is the filing contact?",
    });
  });

  it("is a plain pause for a reviewer pause or message delivery", () => {
    const userPause = getTaskAttention(
      pausedWith(question("Task paused. Complete any manual actions...", "user_pause")),
    );
    expect(userPause).toEqual({ kind: "paused", since: askedAt });
    expect(taskNeedsInput(userPause)).toBe(false);

    expect(
      getTaskAttention(
        pausedWith(question("Pausing the agent...", "operator_interrupt"), {
          pausedAt: askedAt - 5,
        }),
      ),
    ).toEqual({ kind: "paused", since: askedAt - 5 });
  });

  it("is a plain pause when stopJob paused it before the worker wrote a question", () => {
    expect(getTaskAttention({ status: "paused", resultData: {} })).toEqual({
      kind: "paused",
      since: null,
    });
    expect(getTaskAttention({ status: "paused", resultData: null })).toEqual({
      kind: "paused",
      since: null,
    });
    // Malformed question: not trusted as a question.
    expect(
      getTaskAttention(pausedWith({ id: 1, text: "x", askedAt })),
    ).toEqual({ kind: "paused", since: null });
  });

  it("ignores a stale question once the run is no longer paused", () => {
    for (const status of ["running", "queued", "completed", "failed", "cancelled"]) {
      expect(
        getTaskAttention({ status, resultData: { pendingQuestion: question("Still there?") } }),
      ).toBeNull();
    }
    expect(getTaskAttention(null)).toBeNull();
    expect(getTaskAttention(undefined)).toBeNull();
  });

  it("previews the long production PREPARED_DRAFT_NOT_VERIFIED question", () => {
    const text = [
      "PREPARED_DRAFT_NOT_VERIFIED: The draft isn't fully ready for submission. On the **Review & Submit** summary:",
      "",
      "- **Entity Details** shows `COMPLETE`",
      "- **Entity Accounts** shows *IN PROGRESS* (Net Book Value is blank)",
      "",
      "## What should I do?",
      "1. Re-run [Prepare only](https://revenueservice.gov.gg/company-tax-ui/abc/reviewAndSubmit/summary)",
      "2. Or enter the value yourself",
    ].join("\n");
    const attention = getTaskAttention(pausedWith(question(text)));
    expect(attention?.kind).toBe("question");
    if (attention?.kind !== "question") return;
    expect(attention.preview.startsWith("The draft isn't fully ready for submission.")).toBe(true);
    expect(attention.preview.length).toBeLessThanOrEqual(TASK_QUESTION_PREVIEW_LENGTH);
    expect(attention.preview.endsWith("…")).toBe(true);
    expect(attention.preview).not.toMatch(/PREPARED_DRAFT_NOT_VERIFIED|\*|`|#|\n|\s{2}/);
    expect(attention.text).toBe(
      [
        "The draft isn't fully ready for submission. On the Review & Submit summary:",
        "",
        "• Entity Details shows COMPLETE",
        "• Entity Accounts shows IN PROGRESS (Net Book Value is blank)",
        "",
        "What should I do?",
        "1. Re-run Prepare only",
        "2. Or enter the value yourself",
      ].join("\n"),
    );
    // The detail panel renders the markdown itself, minus the leading marker.
    expect(attention.markdown).toBe(text.replace("PREPARED_DRAFT_NOT_VERIFIED: ", ""));
  });

  it("falls back to a generic preview when the question is only markers", () => {
    const attention = getTaskAttention(pausedWith(question("**REQUIRES_ATTENTION:**")));
    expect(attention).toMatchObject({
      kind: "question",
      preview: "The filing agent asked a question.",
    });
  });
});

describe("toPlainText", () => {
  it("strips stacked markers and keeps ordinary words", () => {
    expect(
      toPlainText("**REQUIRES_ATTENTION:** PREPARED_DRAFT_NOT_VERIFIED: the reference ESR-2025-99999 differs"),
    ).toBe("the reference ESR-2025-99999 differs");
    expect(toPlainText("NET_BOOK_VALUE_CHECK\nIs the net book value 0?")).toBe(
      "Is the net book value 0?",
    );
    expect(toPlainText("Use snake_case_names and 2 * 3 = 6")).toBe(
      "Use snake_case_names and 2 * 3 = 6",
    );
  });

  it("collapses whitespace and strips quotes, emphasis and html", () => {
    expect(toPlainText("> _Please_ confirm\n\n\t<b>now</b>  ")).toBe("Please confirm now");
  });

  it("only removes markers at the start, keeping field names and words later on", () => {
    expect(toPlainText("Please confirm the VAT_NUMBER: GB123 is right")).toBe(
      "Please confirm the VAT_NUMBER: GB123 is right",
    );
    expect(toPlainText("Is NEEDS_REVIEW the right flag?")).toBe("Is NEEDS_REVIEW the right flag?");
    expect(toPlainText("**REQUIRES_ATTENTION: NEEDS_FILING_CONTACT:** Contact step reached.")).toBe(
      "Contact step reached.",
    );
    expect(toPlainText("**NET_BOOK_VALUE_CHECK**\n\nIs it 0?")).toBe("Is it 0?");
  });

  it("keeps option numbers and text that only looks like a tag", () => {
    expect(toPlainText("Reply with:\n1. Re-run\n2. Enter it yourself")).toBe(
      "Reply with: 1. Re-run 2. Enter it yourself",
    );
    expect(toPlainText("Reply with:\n1. Re-run\n2. Enter it yourself", { singleLine: false })).toBe(
      "Reply with:\n1. Re-run\n2. Enter it yourself",
    );
    expect(toPlainText("Is a <b then c> ok?")).toBe("Is a <b then c> ok?");
  });
});

describe("stripLeadingMarkers", () => {
  it("keeps the markdown and removes only leading markers", () => {
    expect(stripLeadingMarkers("**REQUIRES_ATTENTION:** Is **this** `right`?")).toBe(
      "Is **this** `right`?",
    );
    expect(stripLeadingMarkers("*Really* sure?")).toBe("*Really* sure?");
  });
});

describe("truncateText", () => {
  it("cuts on a word boundary with an ellipsis", () => {
    expect(truncateText("short", 10)).toBe("short");
    const out = truncateText("alpha beta gamma delta epsilon", 20);
    expect(out).toBe("alpha beta gamma…");
    expect(out.length).toBeLessThanOrEqual(20);
  });

  it("cuts mid-word when there is no nearby space", () => {
    const out = truncateText("a".repeat(50), 10);
    expect(out).toBe(`${"a".repeat(9)}…`);
  });
});

describe("getTaskRunState", () => {
  it("reports only live run states", () => {
    expect(getTaskRunState("queued")).toBe("queued");
    expect(getTaskRunState("starting")).toBe("starting");
    expect(getTaskRunState("running")).toBe("running");
    expect(getTaskRunState("paused")).toBeNull();
    expect(getTaskRunState("completed")).toBeNull();
    expect(getTaskRunState(undefined)).toBeNull();
  });
});

describe("formatAskedAgo", () => {
  it("uses short relative units", () => {
    expect(formatAskedAgo(askedAt, askedAt + 10_000)).toBe("just now");
    expect(formatAskedAgo(askedAt, askedAt + 5 * 60_000)).toBe("5 min ago");
    expect(formatAskedAgo(askedAt, askedAt + 3 * 3_600_000)).toBe("3 h ago");
    expect(formatAskedAgo(askedAt, askedAt + 49 * 3_600_000)).toBe("2 d ago");
  });
});
