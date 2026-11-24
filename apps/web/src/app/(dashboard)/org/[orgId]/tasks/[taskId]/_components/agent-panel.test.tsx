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
    currentStep: null,
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
      { kind: "agent", id: "a", content: "Which address?", timestamp: 1 },
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
      { kind: "agent", id: "question-q1", content: "Placeholder question.", timestamp: 1 },
    ];
    renderPanel({ timeline });
    const log = screen.getByRole("log", { name: "Agent conversation" });
    expect(log.tabIndex).toBe(0);
    expect(screen.getByText("Question for you")).toBeTruthy();
  });

  it("expands the live step for its full goal", () => {
    renderPanel({
      jobStatus: "running",
      question: null,
      currentStep: { stepNumber: 4, goal: "Placeholder goal text", memory: "Placeholder note" },
      composer: deriveComposerState({
        jobStatus: "running",
        question: null,
        hasPendingDelivery: false,
        isSending: false,
        isPrepareOnly: true,
      }),
    });
    const toggle = screen.getByRole("button", { name: /Placeholder goal text/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Placeholder note")).toBeTruthy();
  });
});
