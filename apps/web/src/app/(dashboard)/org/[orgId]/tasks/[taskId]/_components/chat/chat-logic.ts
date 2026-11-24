import type {
  AgentQuestion,
  OperatorMessage,
} from "@repo/database/operator-messages";
import type { ChatMessage, StepEvent } from "../types";

export type DeliveryState = "sending" | "queued" | "delivered" | "undelivered";

/**
 * The conversation holds only what the agent and the reviewer actually said:
 * the agent's questions and final reports, its step updates, and reviewer
 * messages. Run lifecycle (queued, pausing, resumed, failed) is derived
 * separately by `deriveRunActivity` and shown outside the transcript.
 */
export type ChatTimelineItem =
  | {
      kind: "agent";
      id: string;
      content: string;
      timestamp: number;
      /** A question the agent asked and is waiting on. */
      isQuestion: boolean;
    }
  | { kind: "update"; id: string; content: string; timestamp: number }
  | {
      kind: "operator";
      id: string;
      content: string;
      timestamp: number;
      delivery: DeliveryState;
      replyTo: string | null;
      interrupt: boolean;
    };

const ACTIVE_STATUSES = new Set(["queued", "starting", "running", "paused"]);

export function isActiveJobStatus(status: string | null | undefined) {
  return !!status && ACTIVE_STATUSES.has(status);
}

/** Only these pauses are the agent asking something; the rest are lifecycle. */
export function isAskedQuestion(question: AgentQuestion | null | undefined) {
  return (
    question?.reason === "agent_question" ||
    question?.reason === "filing_contact"
  );
}

export function questionMessageId(question: AgentQuestion) {
  return `question-${question.id}`;
}

/**
 * Older runs stored app-written status lines in the chat log. They are not
 * something the agent said, so they are dropped from the transcript.
 */
const LIFECYCLE_ID_PREFIXES = [
  "sys-",
  "start-",
  "started-",
  "resumed-",
  "attention-",
  "error-",
];
const LIFECYCLE_TEXT_PREFIXES = [
  "Pausing the agent to pass on your message",
  "Task paused. Complete any manual actions",
];

function isLifecycleChatMessage(message: ChatMessage) {
  if (message.role !== "assistant") return false;
  if (LIFECYCLE_ID_PREFIXES.some((prefix) => message.id.startsWith(prefix))) {
    return true;
  }
  return LIFECYCLE_TEXT_PREFIXES.some((prefix) =>
    message.content.startsWith(prefix),
  );
}

/** Browser Use falls back to the raw event type (e.g. "browser.ready") when an event has no text. */
const RAW_EVENT_TYPE = /^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i;

function agentUpdateText(step: StepEvent): string | null {
  const goal = step.goal?.trim();
  if (!goal || RAW_EVENT_TYPE.test(goal)) return null;
  return goal;
}

function deliveryFor(
  message: OperatorMessage,
  jobStatus: string | null | undefined,
): DeliveryState {
  if (message.status === "delivered") return "delivered";
  return isActiveJobStatus(jobStatus) ? "queued" : "undelivered";
}

/**
 * Merge the locally persisted chat log, the agent's step updates, the pending
 * question and the server-owned reviewer messages (the source of truth for
 * what reached the agent). Same id = same message.
 */
export function buildChatTimeline(input: {
  chatMessages: ChatMessage[];
  operatorMessages: OperatorMessage[];
  jobStatus: string | null | undefined;
  steps?: StepEvent[];
  question?: AgentQuestion | null;
  sendingIds?: ReadonlySet<string>;
}): ChatTimelineItem[] {
  const operatorById = new Map(
    input.operatorMessages.map((message) => [message.id, message]),
  );
  const seen = new Set<string>();
  const items: ChatTimelineItem[] = [];

  for (const message of input.chatMessages) {
    if (seen.has(message.id)) continue;
    seen.add(message.id);
    if (isLifecycleChatMessage(message)) continue;
    if (message.role === "assistant") {
      items.push({
        kind: "agent",
        id: message.id,
        content: message.content,
        timestamp: message.timestamp,
        isQuestion: message.id.startsWith("question-"),
      });
      continue;
    }
    const stored = operatorById.get(message.id);
    items.push({
      kind: "operator",
      id: message.id,
      content: stored?.content ?? message.content,
      timestamp: message.timestamp,
      delivery: stored
        ? deliveryFor(stored, input.jobStatus)
        : input.sendingIds?.has(message.id)
          ? "sending"
          : "undelivered",
      replyTo: stored?.inReplyTo?.text ?? null,
      interrupt: stored?.interrupt === true,
    });
  }

  // The question the paused agent is waiting on, even if this tab never saw
  // it arrive (opened later, another tab).
  const question = input.question;
  if (input.jobStatus === "paused" && question && isAskedQuestion(question)) {
    const id = questionMessageId(question);
    if (!seen.has(id)) {
      seen.add(id);
      items.push({
        kind: "agent",
        id,
        content: question.text,
        timestamp: question.askedAt,
        isQuestion: true,
      });
    }
  }

  let lastStepTime = 0;
  let lastUpdate: string | null = null;
  (input.steps ?? []).forEach((step, index) => {
    // Steps saved before timestamps were recorded keep their relative order.
    const timestamp =
      typeof step.timestamp === "number" ? step.timestamp : lastStepTime;
    lastStepTime = timestamp;
    const content = agentUpdateText(step);
    if (!content || content === lastUpdate) return;
    lastUpdate = content;
    items.push({
      kind: "update",
      id: `step-${step.stepNumber ?? "x"}-${index}`,
      content,
      timestamp,
    });
  });

  for (const stored of input.operatorMessages) {
    if (seen.has(stored.id)) continue;
    seen.add(stored.id);
    items.push({
      kind: "operator",
      id: stored.id,
      content: stored.content,
      timestamp: stored.createdAt,
      delivery: deliveryFor(stored, input.jobStatus),
      replyTo: stored.inReplyTo?.text ?? null,
      interrupt: stored.interrupt === true,
    });
  }

  // Stable: equal timestamps keep insertion order.
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.timestamp - b.item.timestamp || a.index - b.index)
    .map(({ item }) => item);
}

export type RunActivityTone = "live" | "waiting" | "done" | "error" | "idle";

/** Lifecycle of the run, shown beside the conversation, never inside it. */
export type RunActivity = {
  tone: RunActivityTone;
  label: string;
  detail: string | null;
};

export function deriveRunActivity(input: {
  jobStatus: string | null | undefined;
  question: AgentQuestion | null;
  hasPendingInterrupt: boolean;
  hasPendingDelivery: boolean;
  errorMessage?: string | null;
}): RunActivity | null {
  switch (input.jobStatus) {
    case "queued":
      return { tone: "live", label: "Queued", detail: "Waiting for a browser worker" };
    case "starting":
      return { tone: "live", label: "Starting", detail: "Connecting to the browser" };
    case "running":
      return input.hasPendingInterrupt
        ? {
            tone: "waiting",
            label: "Pausing to pass on your message",
            detail: "The agent stops at a safe point, then continues in the same browser",
          }
        : { tone: "live", label: "Working", detail: null };
    case "paused":
      if (input.hasPendingDelivery) {
        return {
          tone: "live",
          label: "Resuming with your message",
          detail: "Same browser session",
        };
      }
      if (isAskedQuestion(input.question)) {
        return { tone: "waiting", label: "Waiting for your reply", detail: null };
      }
      return {
        tone: "waiting",
        label: "Paused",
        detail:
          input.question?.reason === "operator_interrupt"
            ? "Paused to pass on your message"
            : null,
      };
    case "completed":
      return { tone: "done", label: "Run finished", detail: null };
    case "failed":
      return {
        tone: "error",
        label: "Run failed",
        detail: input.errorMessage?.trim() || null,
      };
    case "cancelled":
      return { tone: "idle", label: "Run cancelled", detail: null };
    default:
      return null;
  }
}

export type ComposerMode =
  | "answer"
  | "instruct"
  | "interrupt"
  | "waiting"
  | "disabled";

export type ComposerState = {
  mode: ComposerMode;
  placeholder: string;
  submitLabel: string;
  hint: string;
  canSend: boolean;
  /** Paused for a manual step: resuming needs no message. */
  canResumeWithoutMessage: boolean;
};

export function deriveComposerState(input: {
  jobStatus: string | null | undefined;
  question: AgentQuestion | null;
  hasPendingDelivery: boolean;
  isSending: boolean;
  isPrepareOnly: boolean;
}): ComposerState {
  const guard = input.isPrepareOnly
    ? " It will not submit the return in this run, even if asked."
    : "";
  const base = {
    canSend: false,
    canResumeWithoutMessage: false,
    submitLabel: "Send",
  };

  if (input.isSending || (input.hasPendingDelivery && isActiveJobStatus(input.jobStatus))) {
    return {
      ...base,
      mode: "waiting",
      placeholder: "Passing your message to the agent…",
      hint: "The agent picks it up in the same browser session within a few seconds.",
    };
  }

  switch (input.jobStatus) {
    case "running":
      return {
        ...base,
        mode: "interrupt",
        canSend: true,
        submitLabel: "Pause & send",
        placeholder: "Give the agent an instruction…",
        hint: `Sending pauses the agent, then it continues in the same browser with your instruction.${guard}`,
      };
    case "paused": {
      const asked = isAskedQuestion(input.question);
      return {
        ...base,
        mode: asked ? "answer" : "instruct",
        canSend: true,
        canResumeWithoutMessage: true,
        submitLabel: "Send & resume",
        placeholder: asked
          ? "Answer the agent…"
          : "Add an instruction for the agent (optional)…",
        hint: `The agent resumes in the same browser session with your reply.${guard}`,
      };
    }
    case "queued":
    case "starting":
      return {
        ...base,
        mode: "disabled",
        placeholder: "The agent is starting…",
        hint: "You can message the agent once it is running.",
      };
    default:
      return {
        ...base,
        mode: "disabled",
        placeholder: "Start a run to talk to the agent",
        hint: "Messages reach the agent while a run is active.",
      };
  }
}

/** "4 min left" / "under a minute left" / null when expired or unknown. */
export function formatTimeLeft(
  expiresAt: number | undefined,
  now: number,
): string | null {
  if (!expiresAt) return null;
  const ms = expiresAt - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60_000);
  return minutes < 1 ? "under a minute left" : `${minutes} min left`;
}

export function createClientMessageId() {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `op_${random.slice(0, 24)}`;
}
