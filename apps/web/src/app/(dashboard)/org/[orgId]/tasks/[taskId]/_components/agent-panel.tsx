"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import {
  OPERATOR_MESSAGE_MAX_LENGTH,
  type AgentQuestion,
} from "@repo/database/operator-messages";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Bot,
  Check,
  Clock,
  Loader2,
  Play,
  Send,
  Shield,
  X,
} from "@/lib/icons";
import { getStatusConfig, type StepEvent } from "./types";
import {
  formatTimeLeft,
  type ChatTimelineItem,
  type ComposerState,
  type DeliveryState,
} from "./chat/chat-logic";

type AgentPanelProps = {
  entityName: string | null;
  orgId: string;
  taxReturnId?: string;
  isSubstanceFormIncomplete: boolean;
  jobStatus: string | null;
  isPrepareOnly: boolean;
  question: AgentQuestion | null;
  currentStep: StepEvent | null;
  timeline: ChatTimelineItem[];
  composer: ComposerState;
  messageInput: string;
  setMessageInput: (v: string) => void;
  onSendMessage: () => void;
  onResumeWithoutMessage?: () => void;
  isResumePending?: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Mobile sheet: renders a close button in the header. */
  onClose?: () => void;
  className?: string;
};

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Header ──────────────────────────────────────────────────────────

function PanelHeader({
  entityName,
  jobStatus,
  isPrepareOnly,
  onClose,
}: Pick<AgentPanelProps, "entityName" | "jobStatus" | "isPrepareOnly" | "onClose">) {
  const status = jobStatus ? getStatusConfig(jobStatus) : null;
  const live = jobStatus === "running";
  const waiting = jobStatus === "paused";

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
      <span className="relative flex size-2 shrink-0" aria-hidden>
        {live || waiting ? (
          <span
            className={cn(
              "absolute inline-flex size-full animate-ping rounded-full opacity-60",
              live ? "bg-blue-500" : "bg-amber-500",
            )}
          />
        ) : null}
        <span
          className={cn(
            "relative inline-flex size-2 rounded-full",
            live ? "bg-blue-500" : waiting ? "bg-amber-500" : "bg-muted-foreground/30",
          )}
        />
      </span>
      <span className="text-[13px] font-medium tracking-tight">Agent</span>
      {status ? (
        <span className="text-muted-foreground text-[11px]">· {status.label}</span>
      ) : null}
      <div className="ml-auto flex min-w-0 items-center gap-1.5">
        {isPrepareOnly && jobStatus ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
            title="This run stops before submission and never files the return"
          >
            <Shield className="size-2.5" />
            Prepare only
          </span>
        ) : null}
        {entityName ? (
          <span className="text-muted-foreground hidden max-w-[140px] truncate text-[11px] sm:inline">
            {entityName}
          </span>
        ) : null}
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onClose}
            aria-label="Close agent chat"
          >
            <X className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function LiveStepStrip({ step }: { step: StepEvent }) {
  const goal = step.goal ?? step.message;
  if (!goal) return null;
  const memory =
    typeof step.memory === "string" &&
    step.memory.trim() &&
    !step.memory.startsWith("{") &&
    !step.memory.startsWith("[")
      ? step.memory.trim()
      : null;

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div className="flex shrink-0 cursor-default items-center gap-2 border-b bg-blue-500/[0.04] px-3 py-1.5 text-[11px]">
          <Loader2 className="size-3 shrink-0 animate-spin text-blue-500" />
          {step.stepNumber ? (
            <span className="text-blue-600 dark:text-blue-400 shrink-0 font-semibold tabular-nums">
              {step.stepNumber}
            </span>
          ) : null}
          <span className="text-muted-foreground truncate">{goal}</span>
        </div>
      </HoverCardTrigger>
      <HoverCardContent side="bottom" align="start" className="w-72 p-3">
        <p className="text-foreground text-[11px] leading-relaxed">{goal}</p>
        {memory ? (
          <p className="text-muted-foreground mt-2 text-[10px] leading-relaxed">
            {memory}
          </p>
        ) : null}
      </HoverCardContent>
    </HoverCard>
  );
}

// ── Messages ────────────────────────────────────────────────────────

const DELIVERY_COPY: Record<
  DeliveryState,
  { label: string; icon: React.ReactNode; className: string }
> = {
  sending: {
    label: "Sending",
    icon: <Loader2 className="size-2.5 animate-spin" />,
    className: "text-muted-foreground",
  },
  queued: {
    label: "Waiting for the agent",
    icon: <Clock className="size-2.5" />,
    className: "text-amber-600 dark:text-amber-400",
  },
  delivered: {
    label: "Agent has it",
    icon: <Check className="size-2.5" />,
    className: "text-emerald-600 dark:text-emerald-400",
  },
  undelivered: {
    label: "Not delivered",
    icon: <AlertCircle className="size-2.5" />,
    className: "text-muted-foreground",
  },
};

function AgentMessage({ item }: { item: Extract<ChatTimelineItem, { kind: "agent" }> }) {
  return (
    <div className="group flex gap-2.5">
      <div className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg">
        <Bot className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="prose prose-sm dark:prose-invert text-foreground/90 max-w-none text-[13px] leading-relaxed break-words [&_p]:my-1 [&_p:first-child]:mt-0 [&_ul]:my-1 [&_li]:my-0">
          <ReactMarkdown>{item.content}</ReactMarkdown>
        </div>
        <p className="text-muted-foreground/60 mt-0.5 text-[10px] tabular-nums opacity-0 transition-opacity group-hover:opacity-100">
          {timeLabel(item.timestamp)}
        </p>
      </div>
    </div>
  );
}

function OperatorMessage({
  item,
}: {
  item: Extract<ChatTimelineItem, { kind: "operator" }>;
}) {
  const delivery = DELIVERY_COPY[item.delivery];
  return (
    <div className="flex flex-col items-end gap-1 pl-8">
      {item.replyTo ? (
        <p className="text-muted-foreground line-clamp-2 max-w-full border-r-2 border-amber-500/40 pr-2 text-right text-[11px] leading-snug">
          {item.replyTo}
        </p>
      ) : null}
      <div className="bg-foreground text-background max-w-full rounded-2xl rounded-br-md px-3 py-2 text-[13px] leading-relaxed">
        <p className="break-words whitespace-pre-wrap">{item.content}</p>
      </div>
      <p
        className={cn(
          "flex items-center gap-1 text-[10px] tabular-nums",
          delivery.className,
        )}
      >
        {delivery.icon}
        {item.interrupt && item.delivery === "queued"
          ? "Pausing the agent"
          : delivery.label}
        <span className="text-muted-foreground/50">· {timeLabel(item.timestamp)}</span>
      </p>
    </div>
  );
}

// ── Question card + composer ────────────────────────────────────────

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

function QuestionCard({
  question,
  onResumeWithoutMessage,
  isResumePending,
}: {
  question: AgentQuestion | null;
  onResumeWithoutMessage?: () => void;
  isResumePending?: boolean;
}) {
  const now = useNow(true);
  const asked =
    question?.reason === "agent_question" || question?.reason === "filing_contact";
  const timeLeft = formatTimeLeft(question?.expiresAt, now);

  return (
    <div
      role="status"
      className="animate-in fade-in slide-in-from-bottom-1 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-3 duration-300"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="size-1.5 rounded-full bg-amber-500" aria-hidden />
        <span className="text-[11px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
          {asked ? "The agent needs you" : "Paused"}
        </span>
        {timeLeft ? (
          <span className="text-muted-foreground ml-auto text-[10px] tabular-nums">
            {timeLeft}
          </span>
        ) : null}
      </div>
      {asked && question ? (
        <div className="prose prose-sm dark:prose-invert text-foreground max-h-40 max-w-none overflow-y-auto text-[13px] leading-relaxed break-words [&_p]:my-1">
          <ReactMarkdown>{question.text}</ReactMarkdown>
        </div>
      ) : (
        <p className="text-foreground/85 text-[13px] leading-relaxed">
          Finish anything you need in the browser, then resume, or tell the
          agent what to do next.
        </p>
      )}
      {question?.reason === "filing_contact" ? (
        <p className="text-muted-foreground mt-2 text-[11px] leading-snug">
          The agent will not type contact details. Fill the contact step in the
          browser yourself, then resume.
        </p>
      ) : null}
      {onResumeWithoutMessage ? (
        <div className="mt-2.5 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full bg-transparent px-3 text-[11px]"
            onClick={onResumeWithoutMessage}
            disabled={isResumePending}
          >
            {isResumePending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Play className="size-3" />
            )}
            {asked ? "Resume without replying" : "Resume"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Composer({
  composer,
  value,
  onChange,
  onSend,
}: {
  composer: ComposerState;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = !composer.canSend;
  const length = value.trim().length;
  const tooLong = length > OPERATOR_MESSAGE_MAX_LENGTH;
  const canSubmit = !disabled && length > 0 && !tooLong;

  useEffect(() => {
    if (composer.mode === "answer") textareaRef.current?.focus();
  }, [composer.mode]);

  return (
    <div
      className={cn(
        "bg-muted/40 rounded-[20px] border transition-[border-color,box-shadow,background-color] duration-200",
        "focus-within:border-ring/60 focus-within:bg-background focus-within:ring-ring/15 focus-within:ring-[3px]",
        composer.mode === "answer" && "border-amber-500/40",
        disabled && "opacity-70",
      )}
    >
      <label htmlFor="agent-composer" className="sr-only">
        Message the agent
      </label>
      <textarea
        id="agent-composer"
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (canSubmit) onSend();
          }
        }}
        disabled={disabled}
        rows={1}
        placeholder={composer.placeholder}
        className="placeholder:text-muted-foreground/70 block max-h-40 min-h-11 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-[13px] leading-relaxed outline-none [field-sizing:content] disabled:cursor-not-allowed"
      />
      <div className="flex items-center justify-end gap-2 px-2 pb-2">
        {length > OPERATOR_MESSAGE_MAX_LENGTH * 0.8 ? (
          <span
            className={cn(
              "text-[10px] tabular-nums",
              tooLong ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {length}/{OPERATOR_MESSAGE_MAX_LENGTH}
          </span>
        ) : null}
        <Button
          size="sm"
          className="h-8 gap-1.5 rounded-full px-3 text-[12px]"
          onClick={onSend}
          disabled={!canSubmit}
        >
          {composer.mode === "waiting" ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          {composer.submitLabel}
        </Button>
      </div>
    </div>
  );
}

// ── Panel ───────────────────────────────────────────────────────────

export function AgentPanel({
  entityName,
  orgId,
  taxReturnId,
  isSubstanceFormIncomplete,
  jobStatus,
  isPrepareOnly,
  question,
  currentStep,
  timeline,
  composer,
  messageInput,
  setMessageInput,
  onSendMessage,
  onResumeWithoutMessage,
  isResumePending,
  scrollRef,
  onClose,
  className,
}: AgentPanelProps) {
  const showQuestion = jobStatus === "paused" && composer.mode !== "waiting";

  return (
    <div className={cn("bg-background flex h-full min-h-0 flex-col", className)}>
      <PanelHeader
        entityName={entityName}
        jobStatus={jobStatus}
        isPrepareOnly={isPrepareOnly}
        onClose={onClose}
      />
      {jobStatus === "running" && currentStep ? (
        <LiveStepStrip step={currentStep} />
      ) : null}

      <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
        <div className="space-y-5 px-3 py-4 sm:px-4" aria-live="polite">
          {timeline.length === 0 ? (
            <div className="py-14 text-center">
              <div className="bg-muted mx-auto mb-3 flex size-10 items-center justify-center rounded-xl">
                <Bot className="text-muted-foreground/40 size-5" />
              </div>
              <p className="text-foreground text-xs font-medium">No activity yet</p>
              <p className="text-muted-foreground mx-auto mt-1 max-w-[220px] text-[11px] leading-snug">
                Start a run. If the agent gets stuck it asks you here, and your
                reply goes straight back to the same browser.
              </p>
              {isSubstanceFormIncomplete && taxReturnId ? (
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-3" />
                  Substance form incomplete
                  <Button
                    variant="link"
                    size="sm"
                    asChild
                    className="h-auto p-0 text-[11px] text-amber-600"
                  >
                    <Link href={`/org/${orgId}/returns/${taxReturnId}`}>
                      Complete →
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : (
            timeline.map((item) =>
              item.kind === "agent" ? (
                <AgentMessage key={item.id} item={item} />
              ) : (
                <OperatorMessage key={item.id} item={item} />
              ),
            )
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 space-y-2 border-t p-2.5 sm:p-3">
        {showQuestion ? (
          <QuestionCard
            question={question}
            onResumeWithoutMessage={
              composer.canResumeWithoutMessage ? onResumeWithoutMessage : undefined
            }
            isResumePending={isResumePending}
          />
        ) : null}
        <Composer
          composer={composer}
          value={messageInput}
          onChange={setMessageInput}
          onSend={onSendMessage}
        />
        <p className="text-muted-foreground/70 px-1 text-[10px] leading-snug">
          {composer.hint}
        </p>
      </div>
    </div>
  );
}
