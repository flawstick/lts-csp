import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  activeJobStatus?: string | null;
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
  if (lower.includes("wait") || lower.includes("loading") || lower.includes("load"))
    return <Clock className="size-3.5 text-amber-500" />;
  if (lower.includes("click") || lower.includes("select") || lower.includes("check") || lower.includes("press"))
    return <MousePointer2 className="size-3.5 text-blue-500" />;
  if (lower.includes("navigate") || lower.includes("go to") || lower.includes("open"))
    return <Globe className="size-3.5 text-violet-500" />;
  if (lower.includes("type") || lower.includes("enter") || lower.includes("input") || lower.includes("fill"))
    return <Type className="size-3.5 text-emerald-500" />;
  if (lower.includes("read") || lower.includes("verify") || lower.includes("review") || lower.includes("look"))
    return <Eye className="size-3.5 text-cyan-500" />;
  if (lower.includes("download") || lower.includes("save"))
    return <Download className="size-3.5 text-orange-500" />;
  if (lower.includes("submit") || lower.includes("continue") || lower.includes("next") || lower.includes("proceed"))
    return <ArrowRight className="size-3.5 text-emerald-500" />;
  if (lower.includes("form") || lower.includes("document") || lower.includes("file"))
    return <FileText className="size-3.5 text-indigo-500" />;
  return <CheckCircle2 className="size-3.5 text-muted-foreground/40" />;
}

export function AgentPanel({
  entityName,
  orgId,
  taxReturnId,
  isSubstanceFormIncomplete,
  pausedJob,
  runningJob,
  activeJobStatus,
  currentStep,
  steps,
  chatMessages,
  messageInput,
  setMessageInput,
  onSendMessage,
  scrollRef,
}: AgentPanelProps) {
  const recentSteps = steps.slice(-20);

  return (
    <div className="bg-background flex h-full flex-col">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b px-3">
        <Bot className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Agent Console</span>
        {entityName ? (
          <span className="ml-auto max-w-[140px] truncate text-[11px] text-muted-foreground">
            {entityName}
          </span>
        ) : null}
      </div>

      {/* Paused banner */}
      {pausedJob ? (
        <div className="flex items-center gap-2.5 border-b border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
            <AlertCircle className="size-3 text-amber-500" />
          </div>
          <p className="flex-1 text-[11px] font-medium text-amber-700 dark:text-amber-400">
            Action required — complete the step in the browser, then resume.
          </p>
        </div>
      ) : null}

      {/* Messages + Activity Feed */}
      <ScrollArea className="min-h-0 flex-1" ref={scrollRef}>
        <div className="p-3">
          {steps.length === 0 && chatMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex size-11 items-center justify-center rounded-xl bg-muted">
                <Bot className="size-5 text-muted-foreground/30" />
              </div>
              <p className="mt-3 text-xs font-medium text-foreground">No activity yet</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Start the task to see agent progress
              </p>
              {isSubstanceFormIncomplete && taxReturnId ? (
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">
                  <AlertCircle className="size-3" />
                  Substance form incomplete
                  <Button variant="link" size="sm" asChild className="h-auto p-0 text-[11px] text-amber-600">
                    <Link href={`/org/${orgId}/returns/${taxReturnId}`}>Complete &rarr;</Link>
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Chat messages */}
          {chatMessages.length > 0 && (
            <div className="space-y-3">
              {chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                      msg.role === "user"
                        ? "bg-foreground text-background"
                        : "bg-blue-500/10 text-blue-500"
                    }`}
                  >
                    {msg.role === "user" ? <User className="size-3" /> : <Bot className="size-3" />}
                  </div>
                  <div className={`max-w-[85%] min-w-0 ${msg.role === "user" ? "text-right" : ""}`}>
                    <div
                      className={`inline-block rounded-2xl px-3 py-2 text-[12px] leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-br-md bg-primary text-primary-foreground"
                          : "rounded-bl-md bg-muted/70"
                      }`}
                    >
                      {msg.role === "assistant" ? (
                        <div className="prose prose-xs dark:prose-invert max-w-none break-words [&_p]:m-0 [&_p]:leading-relaxed">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                      )}
                    </div>
                    <p className="mt-0.5 px-1 text-[9px] tabular-nums text-muted-foreground/40">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Activity feed with timeline */}
          {recentSteps.length > 0 ? (
            <div className={`relative ${chatMessages.length > 0 ? "mt-3 border-t pt-3" : ""}`}>
              {/* Vertical timeline line */}
              <div className="absolute bottom-0 left-[11px] top-0 w-px bg-border" />

              <div className="space-y-0.5">
                {recentSteps.map((step, index) => {
                  const isActive =
                    currentStep?.stepNumber !== undefined &&
                    currentStep.stepNumber === step.stepNumber;
                  const isLast = index === recentSteps.length - 1;
                  const isRunningStep = isActive && isLast && !!runningJob;
                  const stepNum = step.stepNumber ?? index + 1;
                  const goal = step.goal ?? step.message ?? "Processing...";
                  const url = step.url ?? null;
                  const domain = url
                    ? url.replace(/^https?:\/\//, "").split("/")[0]
                    : null;

                  return (
                    <Tooltip key={`step-${stepNum}-${index}`}>
                      <TooltipTrigger asChild>
                        <div
                          className={`group relative flex items-start gap-2.5 rounded-md px-1 py-1.5 transition-colors ${
                            isRunningStep ? "bg-blue-500/5" : "hover:bg-muted/50"
                          }`}
                        >
                          {/* Timeline dot */}
                          <div className={`relative z-10 mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border bg-card ${
                            isRunningStep ? "border-blue-500/40" : "border-border"
                          }`}>
                            {isRunningStep ? (
                              <Loader2 className="size-3 animate-spin text-blue-500" />
                            ) : (
                              inferStepIcon(goal)
                            )}
                          </div>

                          {/* Content */}
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="flex items-baseline gap-2">
                              <span className="shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                                {stepNum}
                              </span>
                              <p className={`truncate text-[11px] leading-snug ${
                                isRunningStep ? "font-medium text-blue-600 dark:text-blue-400" : "text-foreground/80"
                              }`}>
                                {goal}
                              </p>
                            </div>
                            {domain ? (
                              <p className="mt-px truncate text-[10px] text-muted-foreground/50">
                                {domain}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[260px]">
                        <p className="text-xs font-medium">Step {stepNum}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{goal}</p>
                        {url ? <p className="mt-1 truncate text-[10px] text-muted-foreground/60">{url}</p> : null}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="shrink-0 border-t p-3">
        <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-1.5 transition-colors focus-within:border-primary/30 focus-within:ring-1 focus-within:ring-primary/10">
          <Input
            placeholder="Message the agent..."
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSendMessage()}
            disabled={!runningJob && !pausedJob}
            className="h-7 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0"
          />
          <Button
            size="icon"
            className="size-7 shrink-0 rounded-lg"
            onClick={onSendMessage}
            disabled={(!runningJob && !pausedJob) || !messageInput.trim()}
          >
            <Send className="size-3" />
          </Button>
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          {runningJob
            ? "Agent is running"
            : activeJobStatus === "queued"
              ? "Waiting for a warm worker"
              : activeJobStatus === "starting"
                ? "Connecting browser session"
                : pausedJob
                  ? "Waiting for user action"
                  : "Start task to enable chat"}
        </p>
      </div>
    </div>
  );
}
