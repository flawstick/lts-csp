"use client";

import { ArrowLeft, Check, Circle } from "lucide-react";
import { motion } from "motion/react";

import type { SubstanceFormData } from "@/lib/schemas/substance-form";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import {
  getSectionCompletion,
  type FormSection,
  type VaultFile,
} from "../../_components/return-workspace-shared";

export const FINAL_STEP_ID = "financial-pack";

export type GuidedStep =
  | {
      id: string;
      kind: "section";
      title: string;
      description: string;
      fields: readonly string[];
    }
  | {
      id: typeof FINAL_STEP_ID;
      kind: "upload";
      title: string;
      description: string;
    };

export function buildSteps(visibleSections: FormSection[]): GuidedStep[] {
  return [
    ...visibleSections.map((section) => ({
      id: section.id,
      kind: "section" as const,
      title: section.title,
      description: section.description,
      fields: section.fields,
    })),
    {
      id: FINAL_STEP_ID,
      kind: "upload" as const,
      title: "Financial Pack",
      description: "Upload signed financial statements for the filing.",
    },
  ];
}

type GuidedSidebarProps = {
  steps: GuidedStep[];
  activeStepId: string;
  entityName: string;
  draftForm: Partial<SubstanceFormData>;
  draftMissingFields: string[];
  visibleSections: FormSection[];
  progressRatio: number;
  uploadReady: boolean;
  assignedFinancialStatementsFile: VaultFile | null;
  selectedFinancialStatementsName: string | null;
  missingFieldsByStep: Map<string, string[]>;
  onStepChange: (stepId: string) => void;
  onBack: () => void;
};

export function GuidedSidebar({
  steps,
  activeStepId,
  entityName,
  draftForm,
  draftMissingFields,
  visibleSections,
  progressRatio,
  uploadReady,
  assignedFinancialStatementsFile,
  selectedFinancialStatementsName,
  missingFieldsByStep,
  onStepChange,
  onBack,
}: GuidedSidebarProps) {
  const completedCount = steps.filter((step) => {
    if (step.kind === "section") {
      const c = getSectionCompletion(step.fields, draftForm);
      return c.missingRequired === 0 && c.filled > 0;
    }
    return uploadReady;
  }).length;

  return (
    <aside className="flex min-h-0 flex-col border-b border-border/60 bg-card lg:border-r lg:border-b-0">
      {/* Header */}
      <div className="border-b border-border/50 px-5 pt-4 pb-4">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5 mb-2 h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5" />
          Back
        </Button>

        <div className="mt-1">
          <p className="text-[10px] font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            Guided finish
          </p>
          <h1 className="mt-1 text-base font-semibold leading-tight tracking-tight">
            {entityName}
          </h1>
        </div>

        {/* Progress */}
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progressRatio * 100}%` }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {completedCount}/{steps.length}
          </span>
        </div>
      </div>

      {/* Step list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-2">
          {steps.map((step, index) => {
            const isActive = step.id === activeStepId;
            const isSection = step.kind === "section";
            const missingFields = isSection
              ? (missingFieldsByStep.get(step.id) ?? [])
              : [];
            const completion = isSection
              ? getSectionCompletion(step.fields, draftForm)
              : null;
            const isComplete = isSection
              ? completion?.missingRequired === 0 && completion.filled > 0
              : uploadReady;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onStepChange(step.id)}
                className={cn(
                  "group flex w-full items-start gap-3 px-5 py-2.5 text-left transition-colors",
                  isActive
                    ? "bg-primary/[0.06]"
                    : "hover:bg-muted/50",
                )}
              >
                {/* Step indicator */}
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs transition-colors",
                    isComplete
                      ? "bg-emerald-500/15 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : isActive
                        ? "bg-primary/15 text-primary ring-1 ring-primary/25"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {isComplete ? (
                    <Check className="size-3.5" strokeWidth={2.5} />
                  ) : (
                    <span className="text-[10px] font-medium">{index + 1}</span>
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-[13px] font-medium leading-tight",
                      isActive ? "text-foreground" : "text-foreground/80",
                    )}
                  >
                    {step.title}
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-1">
                    {isSection && completion
                      ? completion.filled > 0
                        ? `${completion.filled}/${completion.total} answered`
                        : `${completion.total} fields`
                      : assignedFinancialStatementsFile
                        ? `Assigned: ${assignedFinancialStatementsFile.name}`
                        : selectedFinancialStatementsName
                          ? `Queued: ${selectedFinancialStatementsName}`
                          : "No file selected"}
                  </p>
                  {missingFields.length > 0 && !isComplete ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Circle className="size-1.5 fill-current" />
                      {missingFields.length} required
                    </span>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Stats footer */}
      <div className="border-t border-border/50 px-5 py-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {draftMissingFields.length === 0
              ? "All required fields complete"
              : `${draftMissingFields.length} required fields remaining`}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
              uploadReady
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            {uploadReady ? "Financials ready" : "No financials"}
          </span>
        </div>
      </div>
    </aside>
  );
}
