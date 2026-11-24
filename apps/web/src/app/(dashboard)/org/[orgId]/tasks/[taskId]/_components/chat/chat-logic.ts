import type {
  AgentQuestion,
  OperatorMessage,
} from "@repo/database/operator-messages";
import type { ChatMessage } from "../types";

export type DeliveryState = "sending" | "queued" | "delivered" | "undelivered";

export type ChatTimelineItem =
  | { kind: "agent"; id: string; content: string; timestamp: number }
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

function deliveryFor(
  message: OperatorMessage,
  jobStatus: string | null | undefined,
): DeliveryState {
  if (message.status === "delivered") return "delivered";
  return isActiveJobStatus(jobStatus) ? "queued" : "undelivered";
}

/**
 * Merge the locally persisted chat log with the server-owned reviewer messages
 * (the source of truth for what reached the agent). Same id = same message.
 */
export function buildChatTimeline(input: {
  chatMessages: ChatMessage[];
  operatorMessages: OperatorMessage[];
  jobStatus: string | null | undefined;
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
    if (message.role === "assistant") {
      items.push({
        kind: "agent",
        id: message.id,
        content: message.content,
        timestamp: message.timestamp,
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
      const asked =
        input.question?.reason === "agent_question" ||
        input.question?.reason === "filing_contact";
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
