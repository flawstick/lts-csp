import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Globe,
  Loader2,
  MousePointer2,
  Clock,
  Send,
  Type,
  User,
  Eye,
  ArrowRight,
  FileText,
  Download,
} from "@/lib/icons";
import type { ChatMessage, StepEvent } from "./types";

type AgentPanelProps = {
  entityName: string | null;
  orgId: string;
  taxReturnId?: string;
  isSubstanceFormIncomplete: boolean;
  pausedJob: { id: string } | null | undefined;
  runningJob: { id: string } | null | undefined;
  currentStep: StepEvent | null;
  steps: StepEvent[];
  chatMessages: ChatMessage[];
  messageInput: string;
  setMessageInput: (v: string) => void;
  onSendMessage: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

function inferStepIcon(goal: string) {
  const lower = goal.toLowerCase();
  if (lower.includes("wait") || lower.includes("loading") || lower.includes("load")) {
    return <Clock className="size-3 text-amber-500" />;
  }
  if (lower.includes("click") || lower.includes("select") || lower.includes("check") || lower.includes("press")) {
    return <MousePointer2 className="size-3 text-blue-500" />;
  }
  if (lower.includes("navigate") || lower.includes("go to") || lower.includes("open")) {
    return <Globe className="size-3 text-violet-500" />;
  }
  if (lower.includes("type") || lower.includes("enter") || lower.includes("input") || lower.includes("fill")) {
    return <Type className="size-3 text-emerald-500" />;
  }
  if (lower.includes("read") || lower.includes("verify") || lower.includes("review") || lower.includes("look")) {
    return <Eye className="size-3 text-cyan-500" />;
  }
  if (lower.includes("download") || lower.includes("save")) {
    return <Download className="size-3 text-orange-500" />;
  }
  if (lower.includes("submit") || lower.includes("continue") || lower.includes("next") || lower.includes("proceed")) {
    return <ArrowRight className="size-3 text-green-500" />;
  }
  if (lower.includes("form") || lower.includes("document") || lower.includes("file")) {
    return <FileText className="size-3 text-indigo-500" />;
  }
  return <CheckCircle2 className="size-3 text-muted-foreground/50" />;
}

function truncateGoal(text: string, max: number) {
  if (text.length <= max) return text;
  return text.slice(0, max).trimEnd() + "\u2026";
}

export function AgentPanel({
  entityName,
  orgId,
  taxReturnId,
  isSubstanceFormIncomplete,
  pausedJob,
  runningJob,
  currentStep,
  steps,
  chatMessages,
  messageInput,
  setMessageInput,
  onSendMessage,
  scrollRef,
}: AgentPanelProps) {
  const recentSteps = steps.slice(-16);

  return (
    <div className="bg-background flex h-full flex-col">
      {/* Panel header */}
      <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
        <div className="flex size-6 items-center justify-center rounded-md bg-blue-500/10">
          <Bot className="size-3.5 text-blue-500" />
        </div>
        <span className="text-xs font-semibold">Agent Console</span>
        {entityName ? (
          <span className="text-muted-foreground ml-auto max-w-[120px] truncate text-[10px]">
            {entityName}
          </span>
        ) : null}
      </div>

      {/* Paused banner */}
      {pausedJob ? (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/5 px-4 py-2">
          <AlertCircle className="size-3.5 shrink-0 text-amber-500" />
          <p className="flex-1 text-[11px] text-amber-700 dark:text-amber-400">
            Action required — complete the step in the browser, then resume.
          </p>
        </div>
      ) : null}

      {/* Messages + Steps */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
        <div className="space-y-4 p-4">
          {steps.length === 0 && chatMessages.length === 0 ? (
            <div className="py-16 text-center">
              <div className="bg-muted mx-auto mb-3 flex size-10 items-center justify-center rounded-xl">
                <Bot className="text-muted-foreground/30 size-5" />
              </div>
              <p className="text-foreground text-xs font-medium">
                No activity yet
              </p>
              <p className="text-muted-foreground mt-0.5 text-[11px]">
                Start the task to see agent progress
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
          ) : null}

          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 ${
                msg.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <div
                className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                  msg.role === "user"
                    ? "bg-foreground text-background"
                    : "bg-blue-500/10 text-blue-500"
                }`}
              >
                {msg.role === "user" ? (
                  <User className="size-3.5" />
                ) : (
                  <Bot className="size-3.5" />
                )}
              </div>
              <div
                className={`max-w-[85%] min-w-0 ${
                  msg.role === "user" ? "text-right" : ""
                }`}
              >
                <div
                  className={`inline-block rounded-xl px-3 py-2 text-[12px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-foreground text-background rounded-tr-sm"
                      : "bg-muted/80 rounded-tl-sm"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-xs dark:prose-invert max-w-none break-words [&_p]:m-0 [&_p]:leading-relaxed">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="break-words whitespace-pre-wrap">
                      {msg.content}
                    </p>
                  )}
                </div>
                <p className="text-muted-foreground/50 mt-0.5 px-1 text-[9px] tabular-nums">
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Steps as stacked badges with icons */}
          {recentSteps.length > 0 ? (
            <div className="flex flex-col gap-1">
              {recentSteps.map((step, index) => {
                const isActive =
                  currentStep?.stepNumber !== undefined &&
                  currentStep.stepNumber === step.stepNumber;
                const isLast = index === recentSteps.length - 1;
                const stepNum = step.stepNumber ?? index + 1;
                const goal = step.goal ?? step.message ?? "Processing...";
                const memory =
                  typeof step.memory === "string" &&
                  step.memory.trim() &&
                  !step.memory.startsWith("{") &&
                  !step.memory.startsWith("[")
                    ? step.memory.trim()
                    : null;
                const url = step.url ?? null;

                return (
                  <HoverCard
                    key={`step-badge-${stepNum}`}
                    openDelay={200}
                    closeDelay={100}
                  >
                    <HoverCardTrigger asChild>
                      <Badge
                        variant="outline"
                        className={`cursor-default gap-1.5 rounded-md px-2 py-1 text-[11px] font-normal transition-colors ${
                          isActive && isLast && runningJob
                            ? "border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                            : "border-border/60 text-muted-foreground hover:bg-muted/50"
                        }`}
                      >
                        {isActive && isLast && runningJob ? (
                          <Loader2 className="size-3 animate-spin shrink-0 text-blue-500" />
                        ) : (
                          inferStepIcon(goal)
                        )}
                        <span className="font-semibold tabular-nums shrink-0">
                          {stepNum}
                        </span>
                        <span className="truncate">
                          {truncateGoal(goal, 50)}
                        </span>
                      </Badge>
                    </HoverCardTrigger>
                    <HoverCardContent
                      side="top"
                      align="start"
                      className="w-72 p-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant="secondary"
                            className="h-4 px-1.5 text-[10px] font-semibold"
                          >
                            Step {stepNum}
                          </Badge>
                          {url ? (
                            <span className="text-muted-foreground/60 truncate text-[10px]">
                              {url.replace(/^https?:\/\//, "").split("/")[0]}
                            </span>
                          ) : null}
                        </div>
                        <p className="text-foreground text-[11px] leading-relaxed">
                          {goal}
                        </p>
                        {memory ? (
                          <p className="text-muted-foreground text-[10px] leading-relaxed">
                            {memory}
                          </p>
                        ) : null}
                      </div>
                    </HoverCardContent>
                  </HoverCard>
                );
              })}
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Message the agent..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !e.shiftKey && onSendMessage()
            }
            disabled={!runningJob && !pausedJob}
            className="h-9 text-xs"
          />
          <Button
            size="icon"
            className="size-9 shrink-0"
            onClick={onSendMessage}
            disabled={(!runningJob && !pausedJob) || !messageInput.trim()}
          >
            <Send className="size-3.5" />
          </Button>
        </div>
        <p className="text-muted-foreground/50 mt-1.5 text-center text-[10px]">
          {runningJob
            ? "Agent is running"
            : pausedJob
              ? "Waiting for user action"
              : "Start task to enable chat"}
        </p>
      </div>
    </div>
  );
}
