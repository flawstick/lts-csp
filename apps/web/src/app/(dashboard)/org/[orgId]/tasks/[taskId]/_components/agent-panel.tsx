"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import {
  OPERATOR_MESSAGE_MAX_LENGTH,
  type AgentQuestion,
} from "@repo/database/operator-messages";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Bot,
  Check,
  ChevronDown,
  Clock,
  Loader2,
  Play,
  Shield,
  X,
} from "@/lib/icons";
import { getStatusConfig } from "./types";
import {
  formatTimeLeft,
  isAskedQuestion,
  type ChatTimelineItem,
  type ComposerState,
  type DeliveryState,
  type RunActivity,
} from "./chat/chat-logic";

type AgentPanelProps = {
  entityName: string | null;
  orgId: string;
  taxReturnId?: string;
  isSubstanceFormIncomplete: boolean;
  jobStatus: string | null;
  isPrepareOnly: boolean;
  question: AgentQuestion | null;
  timeline: ChatTimelineItem[];
  /** Run lifecycle, shown outside the conversation. */
  activity?: RunActivity | null;
  composer: ComposerState;
  messageInput: string;
  setMessageInput: (v: string) => void;
  onSendMessage: () => void;
  onResumeWithoutMessage?: () => void;
  isResumePending?: boolean;
  /** The transcript's scroll container. */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  /** Mobile sheet: renders a close button in the header. */
  onClose?: () => void;
  className?: string;
};

/** Distance from the end (px) that still counts as "following" the chat. */
const STICK_THRESHOLD = 48;

/** Long words, ids and URLs wrap instead of widening the panel. */
const WRAP_ANYWHERE = "[overflow-wrap:anywhere]";

const MARKDOWN_CLASS = cn(
  "prose prose-sm dark:prose-invert max-w-none text-[13px] leading-relaxed",
  WRAP_ANYWHERE,
  "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0",
  "[&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:text-[12px]",
  "[&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto",
);

function timeLabel(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ArrowGlyph({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={direction === "down" ? "rotate-180" : undefined}
    >
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
      <p className="flex min-w-0 items-baseline gap-1 whitespace-nowrap">
        <span className="text-[13px] font-medium tracking-tight">Agent</span>
        {status ? (
          <span className="text-muted-foreground truncate text-[11px]">
            · {status.label}
          </span>
        ) : null}
      </p>
      <div className="ml-auto flex min-w-0 shrink-0 items-center gap-1.5">
        {isPrepareOnly && jobStatus ? (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/[0.06] px-2 py-0.5 text-[10px] font-medium whitespace-nowrap text-emerald-700 dark:text-emerald-400"
            title="This run stops before submission and never files the return"
          >
            <Shield className="size-2.5" />
            Prepare only
          </span>
        ) : null}
        {entityName ? (
          <span className="text-muted-foreground hidden max-w-[140px] truncate text-[11px] @md/agent:inline">
            {entityName}
          </span>
        ) : null}
        {onClose ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
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
  const eyebrow = item.isQuestion ? "Question for you" : null;

  return (
    <div className="group flex min-w-0 gap-2.5">
      <div className="bg-muted text-muted-foreground mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg">
        <Bot className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {eyebrow ? (
          <p className="mb-0.5 text-[10px] font-semibold tracking-wide text-amber-700 uppercase dark:text-amber-400">
            {eyebrow}
          </p>
        ) : null}
        <div className={cn(MARKDOWN_CLASS, "text-foreground/90")}>
          <ReactMarkdown>{item.content}</ReactMarkdown>
        </div>
        <p className="text-muted-foreground/60 mt-0.5 text-[10px] tabular-nums opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {timeLabel(item.timestamp)}
        </p>
      </div>
    </div>
  );
}

type UpdateItem = Extract<ChatTimelineItem, { kind: "update" }>;

/** Earlier updates in a long run of steps fold away behind a toggle. */
const VISIBLE_UPDATES = 4;

/** Consecutive agent step updates, shown compactly like tool activity. */
function AgentUpdates({ items }: { items: UpdateItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = expanded ? 0 : Math.max(0, items.length - VISIBLE_UPDATES);
  const visible = items.slice(hidden);
  return (
    <div className="flex min-w-0 gap-2.5" aria-label="Agent steps">
      <div className="flex w-6 shrink-0 justify-center pt-1.5" aria-hidden>
        <span className="bg-border h-full w-px" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        {hidden > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-sm text-[11px] outline-none focus-visible:ring-2"
          >
            {hidden === 1 ? "Show 1 earlier step" : `Show ${hidden} earlier steps`}
          </button>
        ) : null}
        <ul className="space-y-1">
          {visible.map((item) => (
            <li
              key={item.id}
              className={cn(
                "text-muted-foreground flex min-w-0 items-baseline gap-1.5 text-[12px] leading-snug",
                WRAP_ANYWHERE,
              )}
            >
              <span className="bg-muted-foreground/40 mt-[0.45em] size-1 shrink-0 rounded-full" aria-hidden />
              <span className="line-clamp-3 min-w-0">{item.content}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const ACTIVITY_DOT: Record<RunActivity["tone"], string> = {
  live: "bg-blue-500",
  waiting: "bg-amber-500",
  done: "bg-emerald-500",
  error: "bg-red-500",
  idle: "bg-muted-foreground/40",
};

/** The run's lifecycle, kept out of the conversation. */
function RunActivityRow({ activity }: { activity: RunActivity }) {
  const live = activity.tone === "live";
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground flex min-w-0 items-center gap-2 px-3 pb-1.5 text-[11px] leading-snug sm:px-4"
    >
      {live ? (
        <Loader2 className="size-3 shrink-0 animate-spin text-blue-500" aria-hidden />
      ) : (
        <span className={cn("size-1.5 shrink-0 rounded-full", ACTIVITY_DOT[activity.tone])} aria-hidden />
      )}
      <span className="text-foreground/80 shrink-0 font-medium">{activity.label}</span>
      {activity.detail ? (
        <span className={cn("min-w-0 truncate", activity.tone === "error" && "text-destructive")} title={activity.detail}>
          · {activity.detail}
        </span>
      ) : null}
    </div>
  );
}

type TimelineBlock =
  | { kind: "updates"; id: string; items: UpdateItem[] }
  | Exclude<ChatTimelineItem, UpdateItem>;

function groupTimeline(timeline: ChatTimelineItem[]): TimelineBlock[] {
  const blocks: TimelineBlock[] = [];
  for (const item of timeline) {
    if (item.kind !== "update") {
      blocks.push(item);
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "updates") last.items.push(item);
    else blocks.push({ kind: "updates", id: `updates-${item.id}`, items: [item] });
  }
  return blocks;
}

function OperatorMessage({
  item,
}: {
  item: Extract<ChatTimelineItem, { kind: "operator" }>;
}) {
  const delivery = DELIVERY_COPY[item.delivery];
  return (
    <div className="flex min-w-0 flex-col items-end gap-1 pl-8">
      {item.replyTo ? (
        <p
          className={cn(
            "text-muted-foreground line-clamp-2 max-w-full border-r-2 border-amber-500/40 pr-2 text-right text-[11px] leading-snug",
            WRAP_ANYWHERE,
          )}
        >
          {item.replyTo}
        </p>
      ) : null}
      <div className="bg-foreground text-background max-w-full rounded-2xl rounded-br-md px-3 py-2 text-[13px] leading-relaxed">
        <p className={cn("whitespace-pre-wrap", WRAP_ANYWHERE)}>{item.content}</p>
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

// ── Composer ────────────────────────────────────────────────────────

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [enabled]);
  return now;
}

/**
 * The pending question, shown at the top of the composer. Long questions
 * collapse to a preview; the toggle reveals the full text in its own scroll
 * area. The full question also stays in the transcript above.
 */
function PendingQuestion({ question }: { question: AgentQuestion | null }) {
  const now = useNow(true);
  const bodyId = useId();
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const asked = isAskedQuestion(question);
  const timeLeft = formatTimeLeft(question?.expiresAt, now);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || expanded) return;
    const measure = () => setOverflows(el.scrollHeight > el.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, question?.text]);

  return (
    <section aria-label="Agent question" className="px-3 pt-3 sm:px-4">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="size-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
          {asked
            ? "The agent needs you"
            : question?.reason === "operator_interrupt"
              ? "Paused for your message"
              : "Paused"}
        </span>
        {timeLeft ? (
          <span className="text-muted-foreground ml-auto text-[10px] whitespace-nowrap tabular-nums">
            {timeLeft}
          </span>
        ) : null}
      </div>
      <div
        id={bodyId}
        ref={bodyRef}
        tabIndex={expanded ? 0 : undefined}
        className={cn(
          "focus-visible:ring-ring/50 rounded-md outline-none focus-visible:ring-[3px]",
          expanded
            ? "max-h-[min(22rem,45svh)] overflow-y-auto overscroll-contain"
            : "max-h-[min(5.75rem,18svh)] overflow-hidden",
          !expanded &&
            overflows &&
            "[mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
        )}
      >
        {asked && question ? (
          <div className={cn(MARKDOWN_CLASS, "text-sm text-foreground/85")}>
            <ReactMarkdown>{question.text}</ReactMarkdown>
          </div>
        ) : question?.reason === "operator_interrupt" ? (
          <p className="text-foreground/85 text-sm leading-relaxed">
            The agent stopped to take your message. Resume to continue in the
            same browser, or add another instruction.
          </p>
        ) : (
          <p className="text-foreground/85 text-sm leading-relaxed">
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
      </div>
      {overflows || expanded ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring mt-1 inline-flex w-fit items-center gap-1 rounded-sm text-xs outline-none focus-visible:ring-2"
        >
          {expanded ? "Show less" : "Show full question"}
          <ChevronDown
            className={cn("size-3 transition-transform duration-200", expanded && "rotate-180")}
          />
        </button>
      ) : null}
    </section>
  );
}

function Composer({
  composer,
  question,
  showQuestion,
  value,
  onChange,
  onSend,
  onResumeWithoutMessage,
  isResumePending,
}: {
  composer: ComposerState;
  question: AgentQuestion | null;
  showQuestion: boolean;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onResumeWithoutMessage?: () => void;
  isResumePending?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const disabled = !composer.canSend;
  const length = value.trim().length;
  const tooLong = length > OPERATOR_MESSAGE_MAX_LENGTH;
  const canSubmit = !disabled && length > 0 && !tooLong;
  const waiting = composer.mode === "waiting";
  const asked = isAskedQuestion(question);
  const sendLabel = waiting ? "Sending" : composer.submitLabel;

  useEffect(() => {
    if (composer.mode === "answer") textareaRef.current?.focus();
  }, [composer.mode]);

  const sendButton = (
    <button
      type="button"
      onClick={onSend}
      disabled={!canSubmit}
      aria-label={sendLabel}
      className={cn(
        "relative isolate flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full sm:size-8",
        "bg-primary text-primary-foreground shadow-xs transition-all duration-150",
        "enabled:shadow-primary/25 enabled:inset-shadow-[0_1px_rgb(255_255_255/0.16)] enabled:cursor-pointer hover:bg-primary/90 enabled:hover:scale-105 active:shadow-none",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
        "disabled:pointer-events-none disabled:opacity-30 disabled:shadow-none",
      )}
    >
      {waiting ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <ArrowGlyph direction="up" />
      )}
    </button>
  );

  return (
    <div
      className={cn(
        "bg-card rounded-[22px] border shadow-[0_12px_28px_-18px_rgb(0_0_0/0.4)] transition-[border-color,background-color] duration-200 dark:shadow-none",
        "focus-within:border-ring/70",
        disabled && "bg-muted/40",
      )}
    >
      {showQuestion ? <PendingQuestion key={question?.id ?? "paused"} question={question} /> : null}

      <div className="px-3 pt-3 pb-2 sm:px-4">
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
          aria-describedby="agent-composer-hint"
          aria-invalid={tooLong || undefined}
          placeholder={composer.placeholder}
          className="placeholder:text-muted-foreground block max-h-[min(10rem,28svh)] min-h-6 w-full resize-none overflow-y-auto bg-transparent text-sm leading-6 outline-none [field-sizing:content] disabled:cursor-not-allowed"
        />
      </div>

      <div className="flex min-w-0 items-center justify-between gap-2 px-3 pb-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-1.5">
          {showQuestion && onResumeWithoutMessage ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 min-w-0 rounded-full px-2.5 text-xs has-[>svg]:px-2.5"
              onClick={onResumeWithoutMessage}
              disabled={isResumePending}
            >
              {isResumePending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Play className="size-3" />
              )}
              <span className="truncate">
                {asked ? "Resume without replying" : "Resume"}
              </span>
            </Button>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          {canSubmit ? (
            <Tooltip>
              <TooltipTrigger asChild>{sendButton}</TooltipTrigger>
              <TooltipContent side="top">{sendLabel}</TooltipContent>
            </Tooltip>
          ) : (
            sendButton
          )}
        </div>
      </div>
    </div>
  );
}

// ── Transcript scrolling ────────────────────────────────────────────

/**
 * Follow new messages only while the reader is at the end, so scrolling up
 * to an earlier turn is not undone by the next step update.
 */
function useStickToBottom(
  scrollRef: React.RefObject<HTMLDivElement | null>,
  contentRef: React.RefObject<HTMLDivElement | null>,
) {
  const followingRef = useRef(true);
  const [following, setFollowing] = useState(true);

  const scrollToEnd = useCallback(
    (smooth = false) => {
      const el = scrollRef.current;
      if (!el) return;
      followingRef.current = true;
      setFollowing(true);
      if (smooth && typeof el.scrollTo === "function") {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      } else {
        el.scrollTop = el.scrollHeight;
      }
    },
    [scrollRef],
  );

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atEnd = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD;
    followingRef.current = atEnd;
    setFollowing(atEnd);
  }, [scrollRef]);

  // Keep the end in view when the transcript or the dock changes size.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (followingRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(el);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [scrollRef, contentRef]);

  return { following, onScroll, scrollToEnd, followingRef };
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
  timeline,
  activity,
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
  const runIsActive =
    jobStatus === "queued" ||
    jobStatus === "starting" ||
    jobStatus === "running" ||
    jobStatus === "paused";
  const contentRef = useRef<HTMLDivElement>(null);
  const { following, onScroll, scrollToEnd, followingRef } = useStickToBottom(
    scrollRef,
    contentRef,
  );
  const lastItem = timeline[timeline.length - 1];
  const lastKey = lastItem
    ? `${timeline.length}:${lastItem.id}:${lastItem.kind === "operator" ? lastItem.delivery : ""}`
    : "";

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && followingRef.current) el.scrollTop = el.scrollHeight;
  }, [lastKey, showQuestion, scrollRef, followingRef]);

  const handleSend = () => {
    scrollToEnd();
    onSendMessage();
  };

  return (
    <div
      className={cn(
        "@container/agent bg-background flex h-full min-h-0 min-w-0 flex-col",
        className,
      )}
    >
      <PanelHeader
        entityName={entityName}
        jobStatus={jobStatus}
        isPrepareOnly={isPrepareOnly}
        onClose={onClose}
      />

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="log"
          aria-label="Agent conversation"
          aria-live="polite"
          tabIndex={0}
          className="focus-visible:ring-ring/50 h-full overflow-y-auto overscroll-contain outline-none [scrollbar-gutter:stable] focus-visible:ring-[3px] focus-visible:ring-inset"
        >
          <div ref={contentRef} className="space-y-5 px-3 py-4 sm:px-4">
            {timeline.length === 0 ? (
              <div className="py-14 text-center">
                <div className="bg-muted mx-auto mb-3 flex size-10 items-center justify-center rounded-xl">
                  <Bot className="text-muted-foreground/40 size-5" />
                </div>
                <p className="text-foreground text-xs font-medium">
                  {runIsActive ? "No updates yet" : "No activity yet"}
                </p>
                <p className="text-muted-foreground mx-auto mt-1 max-w-[220px] text-[11px] leading-snug">
                  {runIsActive
                    ? "The agent's steps appear here as it works. If it gets stuck it asks you here."
                    : "Start a run. If the agent gets stuck it asks you here, and your reply goes straight back to the same browser."}
                </p>
                {isSubstanceFormIncomplete && taxReturnId ? (
                  <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
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
              groupTimeline(timeline).map((block) =>
                block.kind === "updates" ? (
                  <AgentUpdates key={block.id} items={block.items} />
                ) : block.kind === "agent" ? (
                  <AgentMessage key={block.id} item={block} />
                ) : (
                  <OperatorMessage key={block.id} item={block} />
                ),
              )
            )}
          </div>
        </div>

        {!following ? (
          <button
            type="button"
            onClick={() => scrollToEnd(true)}
            aria-label="Scroll to latest message"
            className="bg-background/95 text-foreground hover:bg-accent focus-visible:ring-ring/50 animate-in fade-in zoom-in-95 absolute bottom-3 left-1/2 flex size-8 -translate-x-1/2 items-center justify-center rounded-full border shadow-md backdrop-blur outline-none focus-visible:ring-[3px]"
          >
            <ArrowGlyph direction="down" />
          </button>
        ) : null}
      </div>

      {/* The dock never takes the whole panel; past 75% it scrolls itself. */}
      <div className="max-h-[75%] shrink-0 overflow-y-auto overscroll-contain px-2.5 pt-1 pb-2.5 sm:px-3 sm:pb-3">
        {activity && !showQuestion ? <RunActivityRow activity={activity} /> : null}
        <Composer
          composer={composer}
          question={question}
          showQuestion={showQuestion}
          value={messageInput}
          onChange={setMessageInput}
          onSend={handleSend}
          onResumeWithoutMessage={
            composer.canResumeWithoutMessage ? onResumeWithoutMessage : undefined
          }
          isResumePending={isResumePending}
        />
        <p
          id="agent-composer-hint"
          className="text-muted-foreground/80 px-3 pt-1.5 text-[10px] leading-snug sm:px-4 [@media(max-height:560px)]:sr-only"
        >
          {composer.hint}
        </p>
      </div>
    </div>
  );
}
