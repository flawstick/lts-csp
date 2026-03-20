import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
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

    if (!viewport) {
      return;
    }

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
      <div className="bg-muted/20 flex items-center justify-between border-b px-3 py-1.5">
        <span className="text-muted-foreground text-[11px] font-medium">
          Steps
        </span>
        <div className="flex items-center gap-2">
          {steps.length > 0 ? (
            <span className="text-muted-foreground text-[10px] tabular-nums">
              {steps.length} step{steps.length !== 1 ? "s" : ""}
            </span>
          ) : null}
          {currentStep?.stepNumber ? (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
              #{currentStep.stepNumber}
            </Badge>
          ) : null}
        </div>
      </div>
      <ScrollArea className="h-[7.5rem]" ref={scrollRef}>
        <div className="flex min-w-max gap-2 p-2.5">
          {steps.length === 0 ? (
            <div className="text-muted-foreground/60 flex items-center px-4 text-xs">
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
              const stepTitle = getStepTitle(step);
              return (
                <div
                  key={`step-${i}`}
                  className={`group relative w-56 shrink-0 rounded-lg border p-2.5 transition-colors ${
                    isActive
                      ? "border-blue-500/30 bg-blue-500/5"
                      : "border-border/60 bg-card hover:bg-muted/50"
                  }`}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    {isActive && isLast && isRunning ? (
                      <Loader2 className="size-3 animate-spin text-blue-500" />
                    ) : (
                      <CheckCircle2 className="size-3 text-emerald-500" />
                    )}
                    <span className="text-muted-foreground text-[10px] font-semibold tabular-nums">
                      Step {step.stepNumber ?? i + 1}
                    </span>
                  </div>
                  <p className="text-foreground/80 line-clamp-2 text-[11px] leading-relaxed">
                    {stepTitle}
                  </p>
                  {step.url ? (
                    <p className="text-muted-foreground/60 mt-1 truncate text-[10px]">
                      {step.url.replace(/^https?:\/\//, "").split("/")[0]}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
