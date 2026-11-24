import { describe, expect, it } from "vitest";
import type { OperatorMessage } from "@repo/database/operator-messages";
import {
  buildChatTimeline,
  createClientMessageId,
  deriveComposerState,
  formatTimeLeft,
} from "./chat-logic";

const stored = (overrides: Partial<OperatorMessage> = {}): OperatorMessage => ({
  id: "op_1",
  content: "Use the registered office address.",
  kind: "answer",
  status: "pending",
  createdAt: 20,
  ...overrides,
});

describe("buildChatTimeline", () => {
  it("uses the server copy for delivery state and dedupes by id", () => {
    const timeline = buildChatTimeline({
      chatMessages: [
        { id: "a1", role: "assistant", content: "Which address?", timestamp: 10 },
        { id: "op_1", role: "user", content: "local copy", timestamp: 20 },
        { id: "op_1", role: "user", content: "dup", timestamp: 20 },
      ],
      operatorMessages: [
        stored({ status: "delivered", inReplyTo: { id: "q", text: "Which address?" } }),
      ],
      jobStatus: "running",
    });
    expect(timeline).toHaveLength(2);
    expect(timeline[1]).toMatchObject({
      kind: "operator",
      content: "Use the registered office address.",
      delivery: "delivered",
      replyTo: "Which address?",
    });
  });

  it("shows server-only messages (e.g. sent from another tab) in time order", () => {
    const timeline = buildChatTimeline({
      chatMessages: [
        { id: "a2", role: "assistant", content: "later", timestamp: 30 },
      ],
      operatorMessages: [stored()],
      jobStatus: "paused",
    });
    expect(timeline.map((item) => item.id)).toEqual(["op_1", "a2"]);
    expect(timeline[0]).toMatchObject({ delivery: "queued" });
  });

  it("marks pending messages undelivered once the run ended, and local sends as sending", () => {
    expect(
      buildChatTimeline({
        chatMessages: [],
        operatorMessages: [stored()],
        jobStatus: "failed",
      })[0],
    ).toMatchObject({ delivery: "undelivered" });
    expect(
      buildChatTimeline({
        chatMessages: [{ id: "op_x", role: "user", content: "hi", timestamp: 1 }],
        operatorMessages: [],
        jobStatus: "paused",
        sendingIds: new Set(["op_x"]),
      })[0],
    ).toMatchObject({ delivery: "sending" });
  });
});

describe("deriveComposerState", () => {
  const base = {
    question: null,
    hasPendingDelivery: false,
    isSending: false,
    isPrepareOnly: true,
  };

  it("answers an agent question and resumes", () => {
    const state = deriveComposerState({
      ...base,
      jobStatus: "paused",
      question: { id: "q", text: "?", askedAt: 1, reason: "agent_question" },
    });
    expect(state).toMatchObject({
      mode: "answer",
      canSend: true,
      canResumeWithoutMessage: true,
      submitLabel: "Send & resume",
    });
    expect(state.hint).toContain("same browser session");
    expect(state.hint).toContain("will not submit");
  });

  it("offers an optional instruction on a manual pause", () => {
    expect(
      deriveComposerState({
        ...base,
        jobStatus: "paused",
        question: { id: "q", text: "Paused", askedAt: 1, reason: "user_pause" },
      }).mode,
    ).toBe("instruct");
  });

  it("interrupts a running agent, and never claims prepare-only for submit runs", () => {
    const state = deriveComposerState({
      ...base,
      jobStatus: "running",
      isPrepareOnly: false,
    });
    expect(state).toMatchObject({ mode: "interrupt", submitLabel: "Pause & send" });
    expect(state.hint).not.toContain("will not submit");
  });

  it("locks while a message is in flight or the run is not active", () => {
    expect(
      deriveComposerState({ ...base, jobStatus: "paused", hasPendingDelivery: true }),
    ).toMatchObject({ mode: "waiting", canSend: false });
    expect(
      deriveComposerState({ ...base, jobStatus: "completed", hasPendingDelivery: true }),
    ).toMatchObject({ mode: "disabled", canSend: false });
    expect(deriveComposerState({ ...base, jobStatus: "starting" }).canSend).toBe(false);
    expect(deriveComposerState({ ...base, jobStatus: null }).canSend).toBe(false);
  });
});

describe("helpers", () => {
  it("formats the pause window", () => {
    expect(formatTimeLeft(undefined, 0)).toBeNull();
    expect(formatTimeLeft(100, 200)).toBeNull();
    expect(formatTimeLeft(30_000, 0)).toBe("under a minute left");
    expect(formatTimeLeft(5 * 60_000 + 1, 0)).toBe("5 min left");
  });

  it("creates ids the API accepts", () => {
    expect(createClientMessageId()).toMatch(/^[A-Za-z0-9_-]{8,100}$/);
  });
});
