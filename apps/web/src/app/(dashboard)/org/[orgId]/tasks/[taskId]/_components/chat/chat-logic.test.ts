import { describe, expect, it } from "vitest";
import type { OperatorMessage } from "@repo/database/operator-messages";
import {
  buildChatTimeline,
  createClientMessageId,
  deriveComposerState,
  deriveRunActivity,
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

describe("buildChatTimeline: agent harness transcript", () => {
  it("drops app-written lifecycle lines from older saved chats", () => {
    const timeline = buildChatTimeline({
      chatMessages: [
        { id: "sys-1", role: "assistant", content: "Task queued. Allocating browser worker...", timestamp: 1 },
        { id: "started-1", role: "assistant", content: "Task started. I'm now automating the form submission...", timestamp: 2 },
        { id: "question-q-old", role: "assistant", content: "Pausing the agent to pass on your message...", timestamp: 3 },
        { id: "resumed-4", role: "assistant", content: "Got your message. Continuing in the same browser session.", timestamp: 4 },
        { id: "attention-5", role: "assistant", content: "I need your help to continue.", timestamp: 5 },
        { id: "question-q1", role: "assistant", content: "Which year end?", timestamp: 6 },
        { id: "final-1", role: "assistant", content: "Prepared the return.", timestamp: 7 },
      ],
      operatorMessages: [],
      jobStatus: "completed",
    });
    expect(timeline.map((item) => item.id)).toEqual(["question-q1", "final-1"]);
    expect(timeline[0]).toMatchObject({ kind: "agent", isQuestion: true });
    expect(timeline[1]).toMatchObject({ kind: "agent", isQuestion: false });
  });

  it("shows the paused agent's real question, never a delivery pause", () => {
    const asked = buildChatTimeline({
      chatMessages: [],
      operatorMessages: [],
      jobStatus: "paused",
      question: { id: "q1", text: "Which year end?", askedAt: 5, reason: "agent_question" },
    });
    expect(asked).toEqual([
      { kind: "agent", id: "question-q1", content: "Which year end?", timestamp: 5, isQuestion: true },
    ]);
    for (const reason of ["operator_interrupt", "user_pause"] as const) {
      expect(
        buildChatTimeline({
          chatMessages: [],
          operatorMessages: [],
          jobStatus: "paused",
          question: { id: "q2", text: "Pausing the agent...", askedAt: 5, reason },
        }),
      ).toEqual([]);
    }
  });

  it("does not duplicate a question already in the chat log", () => {
    const timeline = buildChatTimeline({
      chatMessages: [
        { id: "question-q1", role: "assistant", content: "Which year end?", timestamp: 5 },
      ],
      operatorMessages: [],
      jobStatus: "paused",
      question: { id: "q1", text: "Which year end?", askedAt: 5, reason: "agent_question" },
    });
    expect(timeline).toHaveLength(1);
  });

  it("turns the agent's steps into updates, in time order with replies", () => {
    const timeline = buildChatTimeline({
      chatMessages: [],
      operatorMessages: [stored({ createdAt: 25, status: "delivered", interrupt: true })],
      jobStatus: "running",
      steps: [
        { stepNumber: 1, goal: "browser.ready", timestamp: 10 },
        { stepNumber: 2, goal: "Opened the ESR portal", timestamp: 20 },
        { stepNumber: 2, goal: "Opened the ESR portal", timestamp: 21 },
        { stepNumber: 3, message: "Poll cycle", timestamp: 22 },
        { stepNumber: 4, goal: "Filled the entity details", timestamp: 30 },
      ],
    });
    expect(timeline.map((item) => [item.kind, item.content])).toEqual([
      ["update", "Opened the ESR portal"],
      ["operator", "Use the registered office address."],
      ["update", "Filled the entity details"],
    ]);
    expect(timeline[1]).toMatchObject({ delivery: "delivered", interrupt: true });
  });

  it("keeps the order of steps saved without timestamps", () => {
    const timeline = buildChatTimeline({
      chatMessages: [],
      operatorMessages: [],
      jobStatus: "completed",
      steps: [{ goal: "First" }, { goal: "Second" }],
    });
    expect(timeline.map((item) => item.content)).toEqual(["First", "Second"]);
  });
});

describe("deriveRunActivity", () => {
  const base = { question: null, hasPendingInterrupt: false, hasPendingDelivery: false };

  it("describes the run lifecycle", () => {
    expect(deriveRunActivity({ ...base, jobStatus: "queued" })).toMatchObject({ label: "Queued" });
    expect(deriveRunActivity({ ...base, jobStatus: "running" })).toMatchObject({ tone: "live", label: "Working" });
    expect(
      deriveRunActivity({ ...base, jobStatus: "running", hasPendingInterrupt: true, hasPendingDelivery: true }),
    ).toMatchObject({ label: "Pausing to pass on your message" });
    expect(
      deriveRunActivity({ ...base, jobStatus: "paused", hasPendingDelivery: true }),
    ).toMatchObject({ label: "Resuming with your message" });
    expect(
      deriveRunActivity({
        ...base,
        jobStatus: "paused",
        question: { id: "q", text: "?", askedAt: 1, reason: "agent_question" },
      }),
    ).toMatchObject({ label: "Waiting for your reply" });
    expect(
      deriveRunActivity({ ...base, jobStatus: "failed", errorMessage: "Portal timed out" }),
    ).toMatchObject({ tone: "error", detail: "Portal timed out" });
    expect(deriveRunActivity({ ...base, jobStatus: null })).toBeNull();
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
