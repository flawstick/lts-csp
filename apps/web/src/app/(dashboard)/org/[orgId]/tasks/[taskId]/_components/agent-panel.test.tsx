import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AgentPanel } from "./agent-panel";
import { deriveComposerState, type ChatTimelineItem } from "./chat/chat-logic";

const question = {
  id: "q1",
  text: "Is the entity incorporated in Guernsey?",
  askedAt: Date.now(),
  reason: "agent_question" as const,
  expiresAt: Date.now() + 5 * 60_000,
};

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof AgentPanel>> = {},
) {
  const props: React.ComponentProps<typeof AgentPanel> = {
    entityName: "Example Entity",
    orgId: "org",
    isSubstanceFormIncomplete: false,
    jobStatus: "paused",
    isPrepareOnly: true,
    question,
    timeline: [],
    composer: deriveComposerState({
      jobStatus: "paused",
      question,
      hasPendingDelivery: false,
      isSending: false,
      isPrepareOnly: true,
    }),
    messageInput: "",
    setMessageInput: vi.fn(),
    onSendMessage: vi.fn(),
    onResumeWithoutMessage: vi.fn(),
    scrollRef: { current: null },
    ...overrides,
  };
  render(
    <TooltipProvider>
      <AgentPanel {...props} />
    </TooltipProvider>,
  );
  return props;
}

describe("AgentPanel", () => {
  it("shows the agent's question with the prepare-only guard and resume option", () => {
    const props = renderPanel();
    expect(screen.getByText("The agent needs you")).toBeTruthy();
    expect(screen.getByText(question.text)).toBeTruthy();
    expect(screen.getByText("Prepare only")).toBeTruthy();
    expect(screen.getByText(/will not submit the return/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Resume without replying/ }));
    expect(props.onResumeWithoutMessage).toHaveBeenCalledTimes(1);
  });

  it("sends on Enter but keeps Shift+Enter for new lines", () => {
    const props = renderPanel({ messageInput: "Yes, it is." });
    const box = screen.getByLabelText("Message the agent");
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(props.onSendMessage).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(props.onSendMessage).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Send & resume/ }));
    expect(props.onSendMessage).toHaveBeenCalledTimes(2);
  });

  it("does not send empty messages or while the run is inactive", () => {
    const empty = renderPanel({ messageInput: "   " });
    fireEvent.keyDown(screen.getByLabelText("Message the agent"), { key: "Enter" });
    expect(empty.onSendMessage).not.toHaveBeenCalled();
  });

  it("renders delivery state for reviewer replies", () => {
    const timeline: ChatTimelineItem[] = [
      { kind: "agent", id: "a", content: "Which address?", timestamp: 1, isQuestion: true },
      {
        kind: "operator",
        id: "op",
        content: "Registered office.",
        timestamp: 2,
        delivery: "delivered",
        replyTo: "Which address?",
        interrupt: false,
      },
    ];
    renderPanel({
      jobStatus: "running",
      question: null,
      timeline,
      composer: deriveComposerState({
        jobStatus: "running",
        question: null,
        hasPendingDelivery: false,
        isSending: false,
        isPrepareOnly: true,
      }),
    });
    expect(screen.getByText("Registered office.")).toBeTruthy();
    expect(screen.getByText("Agent has it")).toBeTruthy();
    expect(screen.queryByText("The agent needs you")).toBeNull();
    expect(screen.getByRole("button", { name: /Pause & send/ })).toBeTruthy();
  });

  it("uses an icon-only send control that names its action", () => {
    renderPanel({ messageInput: "" });
    const send = screen.getByRole("button", { name: "Send & resume" }) as HTMLButtonElement;
    expect(send.textContent).toBe("");
    expect(send.disabled).toBe(true);
  });

  it("keeps the transcript reachable by keyboard", () => {
    const timeline: ChatTimelineItem[] = [
      {
        kind: "agent",
        id: "question-q1",
        content: "Placeholder question.",
        timestamp: 1,
        isQuestion: true,
      },
    ];
    renderPanel({ timeline });
    const log = screen.getByRole("log", { name: "Agent conversation" });
    expect(log.tabIndex).toBe(0);
    expect(screen.getByText("Question for you")).toBeTruthy();
  });

  it("keeps run lifecycle out of the conversation", () => {
    const timeline: ChatTimelineItem[] = [
      { kind: "update", id: "s1", content: "Opened the ESR portal", timestamp: 1 },
      {
        kind: "operator",
        id: "op",
        content: "Use the 2024 figures.",
        timestamp: 2,
        delivery: "queued",
        replyTo: null,
        interrupt: true,
      },
    ];
    renderPanel({
      jobStatus: "running",
      question: null,
      timeline,
      activity: {
        tone: "waiting",
        label: "Pausing to pass on your message",
        detail: null,
      },
      composer: deriveComposerState({
        jobStatus: "running",
        question: null,
        hasPendingDelivery: true,
        isSending: false,
        isPrepareOnly: true,
      }),
    });
    const log = screen.getByRole("log", { name: "Agent conversation" });
    expect(log.textContent).toContain("Opened the ESR portal");
    expect(log.textContent).not.toContain("Pausing to pass on your message");
    expect(screen.queryByText("Question for you")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain(
      "Pausing to pass on your message",
    );
  });

  it("does not present a message-delivery pause as a question", () => {
    renderPanel({
      question: {
        id: "q2",
        text: "Pausing the agent to pass on your message...",
        askedAt: 1,
        reason: "operator_interrupt",
      },
    });
    expect(screen.queryByText("The agent needs you")).toBeNull();
    expect(screen.queryByText("Question for you")).toBeNull();
    expect(screen.getByText("Paused for your message")).toBeTruthy();
    expect(screen.queryByText(/Pausing the agent to pass on/)).toBeNull();
  });

  it("folds long runs of agent steps", () => {
    const timeline: ChatTimelineItem[] = Array.from({ length: 7 }, (_, i) => ({
      kind: "update" as const,
      id: `s${i}`,
      content: `Step ${i}`,
      timestamp: i,
    }));
    renderPanel({ jobStatus: "running", question: null, timeline });
    expect(screen.queryByText("Step 0")).toBeNull();
    expect(screen.getByText("Step 6")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show 3 earlier steps" }));
    expect(screen.getByText("Step 0")).toBeTruthy();
  });
});
