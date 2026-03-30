import { useEffect } from "react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, Loader2 } from "@/lib/icons";
import type { StepEvent } from "./types";

type StepsTimelineProps = {
  steps: StepEvent[];
  currentStep: StepEvent | null;
  isRunning: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
};

function getStepTitle(step: StepEvent) {
  return step.goal ?? step.message ?? "Processing...";
}

export function StepsTimeline({
  steps,
  currentStep,
  isRunning,
  scrollRef,
}: StepsTimelineProps) {
  useEffect(() => {
    const root = scrollRef.current;
    const viewport = root?.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement | null;

    if (!viewport) return;

    const shouldAnimate = viewport.scrollLeft > 0;
    const frame = requestAnimationFrame(() => {
      viewport.scrollTo({
        left: viewport.scrollWidth,
        behavior: shouldAnimate ? "smooth" : "auto",
      });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    scrollRef,
    steps.length,
    currentStep?.stepNumber,
    currentStep?.goal,
    currentStep?.message,
  ]);

  return (
    <div className="shrink-0 border-t">
      <div className="flex h-8 items-center justify-between border-b px-3">
        <span className="text-[11px] font-medium text-muted-foreground">Steps</span>
        {steps.length > 0 ? (
          <span className="text-[10px] tabular-nums text-muted-foreground/60">
            {steps.length} step{steps.length !== 1 ? "s" : ""}
          </span>
        ) : null}
      </div>
      <ScrollArea className="h-[7rem]" ref={scrollRef}>
        <div className="flex min-w-max gap-1.5 p-2">
          {steps.length === 0 ? (
            <div className="flex items-center px-4 text-xs text-muted-foreground/50">
              {isRunning ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="size-3 animate-spin" />
                  Waiting for steps...
                </span>
              ) : (
                "No steps yet"
              )}
            </div>
          ) : (
            steps.map((step, i) => {
              const isActive = currentStep?.stepNumber === step.stepNumber;
              const isLast = i === steps.length - 1;
              const isRunningStep = isActive && isLast && isRunning;
              const stepTitle = getStepTitle(step);
              const domain = step.url
                ? step.url.replace(/^https?:\/\//, "").split("/")[0]
                : null;

              return (
                <Tooltip key={`step-${i}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={`flex w-48 shrink-0 flex-col justify-between rounded-lg border p-2.5 transition-colors ${
                        isRunningStep
                          ? "border-blue-500/30 bg-blue-500/5"
                          : "border-border/50 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        {isRunningStep ? (
                          <Loader2 className="size-3 shrink-0 animate-spin text-blue-500" />
                        ) : (
                          <CheckCircle2 className="size-3 shrink-0 text-emerald-500" />
                        )}
                        <span className="text-[10px] font-semibold tabular-nums text-muted-foreground">
                          Step {step.stepNumber ?? i + 1}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-foreground/80">
                        {stepTitle}
                      </p>
                      {domain ? (
                        <p className="mt-1 truncate text-[9px] text-muted-foreground/40">
                          {domain}
                        </p>
                      ) : null}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[280px]">
                    <p className="text-xs font-medium">Step {step.stepNumber ?? i + 1}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{stepTitle}</p>
                    {step.url ? <p className="mt-1 truncate text-[10px] text-muted-foreground/50">{step.url}</p> : null}
                  </TooltipContent>
                </Tooltip>
              );
            })
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
