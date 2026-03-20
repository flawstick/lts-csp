"use client";

import { Check, Circle } from "lucide-react";
import { motion } from "motion/react";

import type { JerseyCompanyReturnFormData } from "@repo/database/jersey-company-return";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

import type { VaultFile } from "../../_components/return-workspace-shared";

export const FINAL_STEP_ID = "financial-pack";

export type JerseyGuidedStep =
  | {
      id: string;
      kind: "section";
      title: string;
      description: string;
    }
  | {
      id: typeof FINAL_STEP_ID;
      kind: "upload";
      title: string;
      description: string;
    };

export type JerseySection = {
  id: string;
  title: string;
  description: string;
};

export const JERSEY_GUIDED_SECTIONS: JerseySection[] = [
  {
    id: "section1",
    title: "Section 1",
    description: "Residency, statement attachments, SIC code, profit figures, and Schedule A gating.",
  },
  {
    id: "economicSubstance",
    title: "Economic Substance",
    description: "Multi-national group flags, relevant activities, CIGA, outsourcing, and board management.",
  },
  {
    id: "scheduleA",
    title: "Schedule A",
    description: "Assessment basis, income computation, and tax charge calculations.",
  },
  {
    id: "distributions",
    title: "Distributions",
    description: "Shareholder dividends, distribution details, and withholding amounts.",
  },
  {
    id: "compliance",
    title: "Compliance",
    description: "Connected person deductions, FATCA/CRS, and declaration statements.",
  },
  {
    id: "additionalInfo",
    title: "Additional Info",
    description: "Supplementary notes and any extra information for the filing.",
  },
];

export function buildJerseySteps(): JerseyGuidedStep[] {
  return [
    ...JERSEY_GUIDED_SECTIONS.map((section) => ({
      id: section.id,
      kind: "section" as const,
      title: section.title,
      description: section.description,
    })),
    {
      id: FINAL_STEP_ID,
      kind: "upload" as const,
      title: "Financial Pack",
      description: "Upload signed financial statements for the Jersey filing.",
    },
  ];
}

function countSectionFilled(
  sectionId: string,
  draft: Partial<JerseyCompanyReturnFormData>,
): { filled: number; total: number } {
  const sectionData = draft[sectionId as keyof JerseyCompanyReturnFormData];
  if (!sectionData || typeof sectionData !== "object") return { filled: 0, total: 0 };

  const entries = Object.entries(sectionData);
  const total = entries.length;
  const filled = entries.filter(([, value]) => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  }).length;

  return { filled, total };
}

type JerseyGuidedSidebarProps = {
  steps: JerseyGuidedStep[];
  activeStepId: string;
  entityName: string;
  draftForm: Partial<JerseyCompanyReturnFormData>;
  missingFields: string[];
  missingBySection: Record<string, string[]>;
  progressRatio: number;
  uploadReady: boolean;
  assignedFinancialStatementsFile: VaultFile | null;
  selectedFinancialStatementsName: string | null;
  onStepChange: (stepId: string) => void;
};

export function JerseyGuidedSidebar({
  steps,
  activeStepId,
  entityName,
  draftForm,
  missingFields,
  missingBySection,
  progressRatio,
  uploadReady,
  assignedFinancialStatementsFile,
  selectedFinancialStatementsName,
  onStepChange,
}: JerseyGuidedSidebarProps) {
  const completedCount = steps.filter((step) => {
    if (step.kind === "section") {
      const sectionMissing = missingBySection[step.id] ?? [];
      const completion = countSectionFilled(step.id, draftForm);
      return sectionMissing.length === 0 && completion.filled > 0;
    }
    return uploadReady;
  }).length;

  return (
    <aside className="flex min-h-0 flex-col border-b border-border/60 bg-card lg:border-l lg:border-b-0">
      {/* Header */}
      <div className="border-b border-border/50 px-5 pt-4 pb-4">
        <div>
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
            const sectionMissing = isSection
              ? (missingBySection[step.id] ?? [])
              : [];
            const completion = isSection
              ? countSectionFilled(step.id, draftForm)
              : null;
            const isComplete = isSection
              ? sectionMissing.length === 0 && (completion?.filled ?? 0) > 0
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
                  {sectionMissing.length > 0 && !isComplete ? (
                    <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      <Circle className="size-1.5 fill-current" />
                      {sectionMissing.length} required
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
            {missingFields.length === 0
              ? "All required fields complete"
              : `${missingFields.length} required fields remaining`}
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
