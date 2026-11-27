/**
 * What a task's run is waiting on, for the Tasks list and the sidebar count.
 *
 * Derived from the task's latest job only (the one listTasks already uses for
 * the row status): a paused job whose worker recorded an agent question is
 * waiting for a person to answer it; any other paused job was paused by a
 * reviewer. Pure and dependency-free apart from the shared question parser, so
 * the server router and the browser bundle use the same rules.
 */
import {
  parsePendingAgentQuestion,
  type AgentQuestionReason,
} from "@repo/database/operator-messages";

/** Characters of the question shown in the list row (ellipsis included). */
export const TASK_QUESTION_PREVIEW_LENGTH = 160;
/** Characters of the question kept for tooltips and the detail panel. */
export const TASK_QUESTION_TEXT_LENGTH = 2000;

export type TaskAttention =
  | {
      kind: "question";
      /** agent_question: the agent stopped to ask; filing_contact: it needs the filing contact. */
      reason: Extract<AgentQuestionReason, "agent_question" | "filing_contact">;
      askedAt: number;
      expiresAt: number | null;
      /** One line, markdown and worker markers removed, at most TASK_QUESTION_PREVIEW_LENGTH. */
      preview: string;
      /** The whole question as plain text with its line breaks (capped), for title / tooltip. */
      text: string;
      /** The whole question's markdown, leading markers removed (capped), for the detail panel. */
      markdown: string;
    }
  | {
      kind: "paused";
      /** When the run paused, if the worker recorded it. */
      since: number | null;
    };

/** A run that is moving on its own; null when idle, ended or paused. */
export type TaskRunState = "queued" | "starting" | "running";

/** The only result_data keys the task list needs from each latest job. */
export const TASK_LIST_JOB_RESULT_KEYS = [
  // getBrowserJobStaleReason
  "lastHeartbeatAt",
  "startupStartedAt",
  "browserUseApiVersion",
  "browserUseStartupPhase",
  // getTaskAttention
  "pendingQuestion",
  "pausedAt",
] as const;

type JobLike = { status: string; resultData?: unknown } | null | undefined;

const QUESTION_REASONS = new Set<AgentQuestionReason>([
  "agent_question",
  "filing_contact",
]);

export function getTaskAttention(job: JobLike): TaskAttention | null {
  if (!job || job.status !== "paused") return null;
  const question = parsePendingAgentQuestion(job.resultData);
  if (question && QUESTION_REASONS.has(question.reason)) {
    const preview = toPlainText(question.text);
    const text = toPlainText(question.text, { singleLine: false });
    const markdown = stripLeadingMarkers(question.text);
    return {
      kind: "question",
      reason: question.reason as "agent_question" | "filing_contact",
      askedAt: question.askedAt,
      expiresAt: question.expiresAt ?? null,
      preview: truncateText(preview, TASK_QUESTION_PREVIEW_LENGTH) || FALLBACK_PREVIEW,
      text: truncateText(text, TASK_QUESTION_TEXT_LENGTH) || FALLBACK_PREVIEW,
      markdown: truncateText(markdown, TASK_QUESTION_TEXT_LENGTH) || FALLBACK_PREVIEW,
    };
  }
  // Reviewer pause (user_pause), a pause that delivers a reviewer message
  // (operator_interrupt), or a pause the worker has not annotated yet.
  const record =
    job.resultData && typeof job.resultData === "object"
      ? (job.resultData as Record<string, unknown>)
      : null;
  const pausedAt = record?.pausedAt;
  return {
    kind: "paused",
    since:
      typeof pausedAt === "number"
        ? pausedAt
        : question
          ? question.askedAt
          : null,
  };
}

export function taskNeedsInput(attention: TaskAttention | null | undefined) {
  return attention?.kind === "question";
}

export function getTaskRunState(status: string | null | undefined): TaskRunState | null {
  return status === "queued" || status === "starting" || status === "running"
    ? status
    : null;
}

const FALLBACK_PREVIEW = "The filing agent asked a question.";

/**
 * Worker / prompt markers the agent opens its output with (REQUIRES_ATTENTION:,
 * PREPARED_DRAFT_NOT_VERIFIED:, NEEDS_FILING_CONTACT:, NET_BOOK_VALUE_CHECK...).
 * Like extractAgentQuestionText, only markers at the very start are removed
 * (possibly bold and stacked); an ALL_CAPS token later in the question, such as
 * a field name ("VAT_NUMBER:"), is part of the question and is kept.
 */
const LEADING_MARKER =
  /^\s*(?:\*\*|__)?\s*[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\s*(?:\*\*|__)?\s*(?::|(?=\n|$))[ \t]*(?:\*\*|__)?/;

/** The question with its leading worker markers removed (markdown kept). */
export function stripLeadingMarkers(raw: string): string {
  let text = raw.replace(/\r\n?/g, "\n");
  for (let i = 0; i < 8; i++) {
    const next = text.replace(LEADING_MARKER, "");
    if (next === text) break;
    text = next;
  }
  return text.trim();
}

/**
 * Markdown removed, for a title / tooltip (multiline, line breaks and list
 * numbers kept) or the list row (singleLine: whitespace collapsed).
 */
export function toPlainText(raw: string, { singleLine = true } = {}): string {
  const plain = stripLeadingMarkers(raw)
    // Fenced code: keep the code, drop the fences.
    .replace(/```[^\n]*\n?/g, singleLine ? " " : "")
    // Images and links keep their text.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // HTML tags only when they look like tags (name, then name="value" attributes).
    .replace(/<\/?[a-z][a-z0-9-]*(?:\s+[a-z-]+=(?:"[^"]*"|'[^']*'))*\s*\/?>/gi, " ")
    // Line-level syntax: headings, quotes, bullets (numbers kept), rules, tables.
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]{0,3}>[ \t]?/gm, "")
    .replace(/^([ \t]*)[-*+][ \t]+/gm, singleLine ? "$1" : "$1• ")
    .replace(/^[ \t]*(?:[-*_][ \t]*){3,}$/gm, "")
    .replace(/\|/g, " ")
    // Emphasis and inline code.
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2")
    .replace(/\*\*|__/g, "")
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, "$1$2")
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, "$1$2")
    .replace(/`+/g, "");
  if (singleLine) return plain.replace(/\s+/g, " ").trim();
  return plain
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** At most `max` characters, cut on a word boundary when one is close. */
export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  const room = text.slice(0, max - 1);
  const lastSpace = room.lastIndexOf(" ");
  const cut = lastSpace >= max * 0.6 ? room.slice(0, lastSpace) : room;
  return `${cut.replace(/[\s,.;:–—-]+$/, "")}…`;
}

/** Short, human description of the question's age ("5 min ago"). */
export function formatAskedAgo(askedAt: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - askedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
}
