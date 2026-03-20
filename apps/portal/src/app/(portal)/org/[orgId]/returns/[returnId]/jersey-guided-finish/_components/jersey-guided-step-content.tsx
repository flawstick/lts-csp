"use client";

import { useMemo, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { Check, FileText, Plus, Trash2, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  JERSEY_CIGA_OPTIONS,
  JERSEY_CONSOLIDATED_REVENUE_OPTIONS,
  JERSEY_ENTITY_STATUS_OPTIONS,
  JERSEY_RELEVANT_ACTIVITY_OPTIONS,
  JERSEY_RESIDENCE_OPTIONS,
  JERSEY_YES_NO_OPTIONS,
  type JerseyCompanyReturnFormData,
  type JerseyConnectedPersonDeduction,
  type JerseyDistributionShareholder,
  type JerseyOutsourcingProvider,
  type JerseyRelevantActivity,
  type JerseyRelevantActivityDetail,
} from "@repo/database/jersey-company-return";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { sanitizeJerseyCompanyReturnData } from "@/lib/schemas/jersey-company-return";

import {
  formatBytes,
  isPdfLike,
  type VaultFile,
} from "../../_components/return-workspace-shared";

import type { JerseyGuidedStep } from "./jersey-guided-sidebar";

// ─── Primitive components ───────────────────────────────────────────

/** Fields that are always required regardless of form state */
const ALWAYS_REQUIRED = new Set([
  "section1.residence",
  "section1.entityStatuses",
  "section1.accountingDateEndsInYearOfAssessment",
  "section1.receivesScheduleAIncome",
  "economicSubstance.partOfMultiNationalGroup",
  "economicSubstance.financialPeriodsStartAfter2018",
]);

type SectionKey = keyof JerseyCompanyReturnFormData;

function FieldShell({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <div>
        <p className="text-[13px] font-medium text-foreground/90">
          {label}
          {required ? <span className="ml-0.5 text-red-400">*</span> : null}
        </p>
        {hint ? <p className="text-muted-foreground text-[11px] leading-snug">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Binary Yes / No toggle — replaces <Select> for boolean-like fields */
function YesNo({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (next: (typeof JERSEY_YES_NO_OPTIONS)[number]) => void;
}) {
  return (
    <div className="inline-flex h-8 rounded-lg border border-border bg-card p-0.5 shadow-sm">
      {JERSEY_YES_NO_OPTIONS.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "relative h-full rounded-md px-4 text-[12px] font-semibold transition-all",
            value === opt
              ? "bg-foreground text-background shadow-sm"
              : "text-muted-foreground/70 hover:text-foreground",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

/** Toggle chip for multi-select (entity statuses, CIGA, etc.) */
function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-[12px] leading-snug shadow-sm transition-all",
        checked
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
          : "border-border bg-white text-foreground/80 hover:border-emerald-500/30 hover:text-foreground dark:bg-card",
      )}
    >
      <span
        className={cn(
          "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-all",
          checked
            ? "border-emerald-500/50 bg-emerald-500 text-white"
            : "border-border bg-muted/60 group-hover:border-muted-foreground/40",
        )}
      >
        {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
      <span className="flex-1">{label}</span>
    </button>
  );
}

/** Section divider with optional title */
function SectionGroup({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      {title ? (
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/60" />
          <div className="text-center">
            <p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">
              {title}
            </p>
            {description ? (
              <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>
            ) : null}
          </div>
          <div className="h-px flex-1 bg-border/60" />
        </div>
      ) : null}
      {children}
    </div>
  );
}

// ─── Data helpers ───────────────────────────────────────────────────

function emptyActivity(): JerseyRelevantActivityDetail {
  return {
    cigaSelections: [],
    premisesAddresses: [],
    outsourcingProviders: [],
    ultimateBeneficialOwners: [],
  };
}

function emptyProvider(): JerseyOutsourcingProvider {
  return {};
}

function emptyShareholder(): JerseyDistributionShareholder {
  return {};
}

function emptyDeduction(): JerseyConnectedPersonDeduction {
  return {};
}

function stringArrayFromTextarea(value: string) {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function textareaFromStringArray(value: string[] | undefined) {
  return (value ?? []).join("\n");
}

// ─── Props ──────────────────────────────────────────────────────────

type JerseyGuidedStepContentProps = {
  contentRef: RefObject<HTMLDivElement | null>;
  resolvedActiveStep: JerseyGuidedStep;
  activeStepIndex: number;
  totalSteps: number;
  entityName: string;
  draftForm: Partial<JerseyCompanyReturnFormData>;
  setDraftForm: Dispatch<SetStateAction<Partial<JerseyCompanyReturnFormData>>>;
  missingFields: string[];
  missingBySection: Record<string, string[]>;
  selectedFinancialFiles: File[];
  setSelectedFinancialFiles: Dispatch<SetStateAction<File[]>>;
  financialStatementsIndex: number | null;
  setFinancialStatementsIndex: Dispatch<SetStateAction<number | null>>;
  selectedFinancialStatementsName: string | null;
  assignedFinancialStatementsFile: VaultFile | null;
  onStepChange: (stepId: string) => void;
};

export function JerseyGuidedStepContent({
  contentRef,
  resolvedActiveStep,
  activeStepIndex,
  totalSteps,
  entityName,
  draftForm,
  setDraftForm,
  missingFields,
  missingBySection,
  selectedFinancialFiles,
  setSelectedFinancialFiles,
  financialStatementsIndex,
  setFinancialStatementsIndex,
  selectedFinancialStatementsName: _selectedFinancialStatementsName,
  assignedFinancialStatementsFile,
  onStepChange,
}: JerseyGuidedStepContentProps) {
  return (
    <div
      ref={contentRef}
      className="min-h-0 flex-1 overflow-y-auto bg-container"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={resolvedActiveStep.id}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mx-auto max-w-3xl px-6 pt-8 pb-12 lg:px-10 [&_input]:bg-white [&_input]:text-foreground [&_textarea]:bg-white [&_textarea]:text-foreground [&_[data-slot=select-trigger]]:bg-white dark:[&_input]:bg-white/[0.06] dark:[&_textarea]:bg-white/[0.06] dark:[&_[data-slot=select-trigger]]:bg-white/[0.06]"
        >
          {/* Step header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">
                Step {activeStepIndex + 1} of {totalSteps}
              </span>
              <span className="text-border">|</span>
              <span>{entityName}</span>
            </div>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              {resolvedActiveStep.title}
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {resolvedActiveStep.description}
            </p>
          </div>

          {resolvedActiveStep.kind === "section" ? (
            <JerseySectionStepContent
              sectionId={resolvedActiveStep.id}
              draftForm={draftForm}
              setDraftForm={setDraftForm}
              missingBySection={missingBySection}
            />
          ) : (
            <UploadStepContent
              missingFields={missingFields}
              missingBySection={missingBySection}
              selectedFinancialFiles={selectedFinancialFiles}
              setSelectedFinancialFiles={setSelectedFinancialFiles}
              financialStatementsIndex={financialStatementsIndex}
              setFinancialStatementsIndex={setFinancialStatementsIndex}
              assignedFinancialStatementsFile={assignedFinancialStatementsFile}
              onStepChange={onStepChange}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ─── Section step content ───────────────────────────────────────────

function JerseySectionStepContent({
  sectionId,
  draftForm,
  setDraftForm,
  missingBySection,
}: {
  sectionId: string;
  draftForm: Partial<JerseyCompanyReturnFormData>;
  setDraftForm: Dispatch<SetStateAction<Partial<JerseyCompanyReturnFormData>>>;
  missingBySection: Record<string, string[]>;
}) {
  const sectionMissing = missingBySection[sectionId] ?? [];
  const normalizedDraft = sanitizeJerseyCompanyReturnData(draftForm);

  const allMissing = useMemo(
    () => new Set(Object.values(missingBySection).flat()),
    [missingBySection],
  );

  /** True when the field is required — shows star regardless of whether it's filled */
  const isRequired = (fieldPath: string) => {
    const key = `${sectionId}.${fieldPath}`;
    // If the field is currently missing, it's required
    if (allMissing.has(key)) return true;
    // If it was required and is now filled, we still want to show the star.
    // We detect this by checking: if clearing the value would make it appear in missing fields.
    // For simplicity, hardcode the unconditionally required fields per section.
    return ALWAYS_REQUIRED.has(key);
  };

  const updateSection = <K extends SectionKey>(
    section: K,
    patch: Partial<JerseyCompanyReturnFormData[K]>,
  ) => {
    setDraftForm((current) =>
      sanitizeJerseyCompanyReturnData({
        ...current,
        [section]: {
          ...(current[section] ?? {}),
          ...patch,
        },
      }),
    );
  };

  const updateActivity = (
    index: number,
    patch: Partial<JerseyRelevantActivityDetail>,
  ) => {
    const nextActivities = [
      ...(normalizedDraft.economicSubstance?.relevantActivities ?? []),
    ];
    nextActivities[index] = {
      ...emptyActivity(),
      ...nextActivities[index],
      ...patch,
    };
    updateSection("economicSubstance", {
      relevantActivities: nextActivities,
    });
  };

  const removeActivity = (index: number) => {
    updateSection("economicSubstance", {
      relevantActivities: (
        normalizedDraft.economicSubstance?.relevantActivities ?? []
      ).filter((_, activityIndex) => activityIndex !== index),
    });
  };

  const addActivity = () => {
    updateSection("economicSubstance", {
      relevantActivities: [
        ...(normalizedDraft.economicSubstance?.relevantActivities ?? []),
        emptyActivity(),
      ],
    });
  };

  const addProvider = (activityIndex: number) => {
    const activity =
      normalizedDraft.economicSubstance?.relevantActivities?.[activityIndex];
    updateActivity(activityIndex, {
      outsourcingProviders: [
        ...(activity?.outsourcingProviders ?? []),
        emptyProvider(),
      ],
    });
  };

  const updateProvider = (
    activityIndex: number,
    providerIndex: number,
    patch: Partial<JerseyOutsourcingProvider>,
  ) => {
    const activity =
      normalizedDraft.economicSubstance?.relevantActivities?.[activityIndex];
    const nextProviders = [...(activity?.outsourcingProviders ?? [])];
    nextProviders[providerIndex] = {
      ...nextProviders[providerIndex],
      ...patch,
    };
    updateActivity(activityIndex, {
      outsourcingProviders: nextProviders,
    });
  };

  const removeProvider = (activityIndex: number, providerIndex: number) => {
    const activity =
      normalizedDraft.economicSubstance?.relevantActivities?.[activityIndex];
    updateActivity(activityIndex, {
      outsourcingProviders: (activity?.outsourcingProviders ?? []).filter(
        (_provider, currentIndex) => currentIndex !== providerIndex,
      ),
    });
  };

  const addShareholder = () => {
    updateSection("distributions", {
      shareholders: [
        ...(normalizedDraft.distributions?.shareholders ?? []),
        emptyShareholder(),
      ],
    });
  };

  const updateShareholder = (
    index: number,
    patch: Partial<JerseyDistributionShareholder>,
  ) => {
    const nextShareholders = [
      ...(normalizedDraft.distributions?.shareholders ?? []),
    ];
    nextShareholders[index] = {
      ...nextShareholders[index],
      ...patch,
    };
    updateSection("distributions", {
      shareholders: nextShareholders,
    });
  };

  const removeShareholder = (index: number) => {
    updateSection("distributions", {
      shareholders: (normalizedDraft.distributions?.shareholders ?? []).filter(
        (_shareholder, currentIndex) => currentIndex !== index,
      ),
    });
  };

  const addDeduction = () => {
    updateSection("compliance", {
      connectedPersonDeductions: [
        ...(normalizedDraft.compliance?.connectedPersonDeductions ?? []),
        emptyDeduction(),
      ],
    });
  };

  const updateDeduction = (
    index: number,
    patch: Partial<JerseyConnectedPersonDeduction>,
  ) => {
    const nextDeductions = [
      ...(normalizedDraft.compliance?.connectedPersonDeductions ?? []),
    ];
    nextDeductions[index] = {
      ...nextDeductions[index],
      ...patch,
    };
    updateSection("compliance", {
      connectedPersonDeductions: nextDeductions,
    });
  };

  const removeDeduction = (index: number) => {
    updateSection("compliance", {
      connectedPersonDeductions: (
        normalizedDraft.compliance?.connectedPersonDeductions ?? []
      ).filter((_deduction, currentIndex) => currentIndex !== index),
    });
  };

  const section1 = normalizedDraft.section1 ?? {};
  const scheduleA = normalizedDraft.scheduleA ?? {};
  const distributions = normalizedDraft.distributions ?? {};
  const compliance = normalizedDraft.compliance ?? {};
  const economicSubstance = normalizedDraft.economicSubstance ?? {
    relevantActivities: [],
  };
  const relevantActivities = economicSubstance.relevantActivities ?? [];
  const additionalInfo = normalizedDraft.additionalInfo ?? {};

  return (
    <div className="space-y-6">
      {/* Section progress card */}
      <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
        <div className="h-1.5 flex-1 rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              sectionMissing.length === 0
                ? "bg-emerald-500"
                : "bg-primary",
            )}
            style={{
              width: sectionMissing.length === 0 ? "100%" : "50%",
            }}
          />
        </div>
        {sectionMissing.length > 0 ? (
          <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
            {sectionMissing.length} required
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Complete</span>
        )}
      </div>

      {/* ─── Section 1 ──────────────────────────────────────────── */}
      {sectionId === "section1" ? (
        <div className="space-y-5">
          <SectionGroup title="Residency & statements">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
              <FieldShell label="Residence" required={isRequired("residence")}>
                <Select
                  value={section1.residence ?? ""}
                  onValueChange={(value) =>
                    updateSection("section1", {
                      residence: value as JerseyCompanyReturnFormData["section1"]["residence"],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {JERSEY_RESIDENCE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell label="Jersey branch or PE" required={isRequired("hasJerseyBranchOrPermanentEstablishment")}>
                <YesNo
                  value={section1.hasJerseyBranchOrPermanentEstablishment}
                  onChange={(value) =>
                    updateSection("section1", {
                      hasJerseyBranchOrPermanentEstablishment: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Accounting date ends in YOA" required={isRequired("accountingDateEndsInYearOfAssessment")}>
                <YesNo
                  value={section1.accountingDateEndsInYearOfAssessment}
                  onChange={(value) =>
                    updateSection("section1", {
                      accountingDateEndsInYearOfAssessment: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Signed financial statements attached" required={isRequired("areSignedFinancialStatementsAttached")}>
                <YesNo
                  value={section1.areSignedFinancialStatementsAttached}
                  onChange={(value) =>
                    updateSection("section1", {
                      areSignedFinancialStatementsAttached: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Branch financial statements attached" required={isRequired("areBranchFinancialStatementsAttached")}>
                <YesNo
                  value={section1.areBranchFinancialStatementsAttached}
                  onChange={(value) =>
                    updateSection("section1", {
                      areBranchFinancialStatementsAttached: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Schedule A income" required={isRequired("receivesScheduleAIncome")}>
                <YesNo
                  value={section1.receivesScheduleAIncome}
                  onChange={(value) =>
                    updateSection("section1", {
                      receivesScheduleAIncome: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Jersey resident individual owns >2%" required={isRequired("jerseyResidentIndividualOwnsOverTwoPercent")}>
                <YesNo
                  value={section1.jerseyResidentIndividualOwnsOverTwoPercent}
                  onChange={(value) =>
                    updateSection("section1", {
                      jerseyResidentIndividualOwnsOverTwoPercent: value,
                    })
                  }
                />
              </FieldShell>
            </div>
          </SectionGroup>

          <SectionGroup title="Activity & financials">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <FieldShell
                label="Activity description"
                required={isRequired("activityDescription")}
                className="md:col-span-2 xl:col-span-3"
              >
                <Textarea
                  value={section1.activityDescription ?? ""}
                  onChange={(event) =>
                    updateSection("section1", {
                      activityDescription: event.target.value,
                    })
                  }
                  rows={3}
                  className="resize-none"
                />
              </FieldShell>

              <FieldShell label="SIC code" required={isRequired("sicCode")}>
                <Input
                  value={section1.sicCode ?? ""}
                  onChange={(event) =>
                    updateSection("section1", { sicCode: event.target.value })
                  }
                  placeholder="5-digit SIC"
                />
              </FieldShell>

              <FieldShell label="Gross turnover" required={isRequired("grossTurnover")}>
                <Input
                  value={section1.grossTurnover ?? ""}
                  onChange={(event) =>
                    updateSection("section1", { grossTurnover: event.target.value })
                  }
                  placeholder="0.00"
                />
              </FieldShell>

              <FieldShell label="Accounting profit or loss" required={isRequired("accountingProfitOrLoss")}>
                <Input
                  value={section1.accountingProfitOrLoss ?? ""}
                  onChange={(event) =>
                    updateSection("section1", {
                      accountingProfitOrLoss: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </FieldShell>
            </div>
          </SectionGroup>

          <SectionGroup title="Entity status" description="Select at least one status (required)">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {JERSEY_ENTITY_STATUS_OPTIONS.map((status) => (
                <ToggleChip
                  key={status}
                  label={status}
                  checked={section1.entityStatuses?.includes(status) ?? false}
                  onChange={(nextChecked) => {
                    const current = section1.entityStatuses ?? [];
                    updateSection("section1", {
                      entityStatuses: nextChecked
                        ? [...current, status]
                        : current.filter((entry) => entry !== status),
                    });
                  }}
                />
              ))}
            </div>
          </SectionGroup>
        </div>
      ) : null}

      {/* ─── Economic Substance ──────────────────────────────────── */}
      {sectionId === "economicSubstance" ? (
        <div className="space-y-5">
          <SectionGroup title="Group & period flags">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <FieldShell label="Part of multi-national group" required={isRequired("partOfMultiNationalGroup")}>
                <YesNo
                  value={economicSubstance.partOfMultiNationalGroup}
                  onChange={(value) =>
                    updateSection("economicSubstance", {
                      partOfMultiNationalGroup: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Consolidated revenue category" required={isRequired("consolidatedRevenueCategory")}>
                <Select
                  value={economicSubstance.consolidatedRevenueCategory ?? ""}
                  onValueChange={(value) =>
                    updateSection("economicSubstance", {
                      consolidatedRevenueCategory: value as (typeof JERSEY_CONSOLIDATED_REVENUE_OPTIONS)[number],
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {JERSEY_CONSOLIDATED_REVENUE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldShell>

              <FieldShell label="Financial periods start after 2018" required={isRequired("financialPeriodsStartAfter2018")}>
                <YesNo
                  value={economicSubstance.financialPeriodsStartAfter2018}
                  onChange={(value) =>
                    updateSection("economicSubstance", {
                      financialPeriodsStartAfter2018: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="No relevant activities" required={isRequired("noRelevantActivities")}>
                <YesNo
                  value={economicSubstance.noRelevantActivities}
                  onChange={(value) =>
                    updateSection("economicSubstance", {
                      noRelevantActivities: value,
                    })
                  }
                />
              </FieldShell>
            </div>
          </SectionGroup>

          <SectionGroup title="Board governance">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <FieldShell label="Adequate board meetings frequency" required={isRequired("adequateFrequencyBoardMeetings")}>
                <YesNo
                  value={economicSubstance.adequateFrequencyBoardMeetings}
                  onChange={(value) =>
                    updateSection("economicSubstance", {
                      adequateFrequencyBoardMeetings: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Board meeting count" required={isRequired("boardMeetingCount")}>
                <Input
                  value={economicSubstance.boardMeetingCount ?? ""}
                  onChange={(event) =>
                    updateSection("economicSubstance", {
                      boardMeetingCount: event.target.value,
                    })
                  }
                  placeholder="0"
                />
              </FieldShell>

              <FieldShell label="Strategic decisions made at meetings" required={isRequired("strategicDecisionsMadeAtMeetings")}>
                <YesNo
                  value={economicSubstance.strategicDecisionsMadeAtMeetings}
                  onChange={(value) =>
                    updateSection("economicSubstance", {
                      strategicDecisionsMadeAtMeetings: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Board minutes kept in Jersey" required={isRequired("boardMinutesKeptInJersey")}>
                <YesNo
                  value={economicSubstance.boardMinutesKeptInJersey}
                  onChange={(value) =>
                    updateSection("economicSubstance", {
                      boardMinutesKeptInJersey: value,
                    })
                  }
                />
              </FieldShell>

              <FieldShell label="Board has sufficient expertise" required={isRequired("boardHasSufficientExpertiseAndKnowledge")}>
                <YesNo
                  value={economicSubstance.boardHasSufficientExpertiseAndKnowledge}
                  onChange={(value) =>
                    updateSection("economicSubstance", {
                      boardHasSufficientExpertiseAndKnowledge: value,
                    })
                  }
                />
              </FieldShell>
            </div>
          </SectionGroup>

          {/* Relevant activities */}
          <SectionGroup title="Relevant activities">
            <div className="space-y-4">
              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={addActivity} className="h-8 gap-1.5 text-xs">
                  <Plus className="size-3.5" />
                  Add activity
                </Button>
              </div>

              {!relevantActivities.length ? (
                <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground/60">
                  No relevant activities added yet.
                </div>
              ) : null}

              {relevantActivities.map((activity, index) => {
                const availableCiga =
                  activity.activity && activity.activity in JERSEY_CIGA_OPTIONS
                    ? JERSEY_CIGA_OPTIONS[activity.activity]
                    : [];

                return (
                  <div
                    key={`activity-${index}`}
                    className="rounded-xl border border-border bg-card shadow-sm"
                  >
                    {/* Activity header */}
                    <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-[11px] font-bold text-primary">
                          {index + 1}
                        </span>
                        <p className="text-[13px] font-semibold">
                          {activity.activity ?? "New activity"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeActivity(index)}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                        Remove
                      </button>
                    </div>

                    <div className="space-y-4 p-4">
                      {/* Core fields */}
                      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                        <FieldShell label="Relevant activity">
                          <Select
                            value={activity.activity ?? ""}
                            onValueChange={(value) =>
                              updateActivity(index, {
                                activity: value as JerseyRelevantActivity,
                                cigaSelections: [],
                              })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select activity" />
                            </SelectTrigger>
                            <SelectContent>
                              {JERSEY_RELEVANT_ACTIVITY_OPTIONS.map((option) => (
                                <SelectItem key={option} value={option}>
                                  {option}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldShell>

                        <FieldShell label="Gross income">
                          <Input
                            value={activity.grossIncome ?? ""}
                            onChange={(event) =>
                              updateActivity(index, { grossIncome: event.target.value })
                            }
                            placeholder="0.00"
                          />
                        </FieldShell>

                        <FieldShell label="Attributable accounting profits">
                          <Input
                            value={activity.attributableAccountingProfits ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                attributableAccountingProfits: event.target.value,
                              })
                            }
                            placeholder="0.00"
                          />
                        </FieldShell>

                        <FieldShell label="Employee count">
                          <Input
                            value={activity.employeeCount ?? ""}
                            onChange={(event) =>
                              updateActivity(index, { employeeCount: event.target.value })
                            }
                            placeholder="0"
                          />
                        </FieldShell>

                        <FieldShell label="Qualified employee count">
                          <Input
                            value={activity.qualifiedEmployeeCount ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                qualifiedEmployeeCount: event.target.value,
                              })
                            }
                            placeholder="0"
                          />
                        </FieldShell>

                        <FieldShell label="Total Jersey gross expenditure">
                          <Input
                            value={activity.totalGrossExpenditureInJersey ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                totalGrossExpenditureInJersey: event.target.value,
                              })
                            }
                            placeholder="0.00"
                          />
                        </FieldShell>

                        <FieldShell label="Outsourcing gross expenditure">
                          <Input
                            value={activity.outsourcingGrossExpenditureInJersey ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                outsourcingGrossExpenditureInJersey: event.target.value,
                              })
                            }
                            placeholder="0.00"
                          />
                        </FieldShell>

                        <FieldShell label="Outsourcing provider count">
                          <Input
                            value={activity.outsourcingProviderCount ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                outsourcingProviderCount: event.target.value,
                              })
                            }
                            placeholder="0"
                          />
                        </FieldShell>

                        <FieldShell label="Tangible assets NBV">
                          <Input
                            value={activity.tangibleAssetsNetBookValue ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                tangibleAssetsNetBookValue: event.target.value,
                              })
                            }
                            placeholder="0.00"
                          />
                        </FieldShell>
                      </div>

                      {/* Substance & compliance toggles */}
                      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
                        <FieldShell label="Meets substance test">
                          <YesNo
                            value={activity.meetsSubstanceTest}
                            onChange={(value) =>
                              updateActivity(index, { meetsSubstanceTest: value })
                            }
                          />
                        </FieldShell>

                        <FieldShell label="CIGA outsourced">
                          <YesNo
                            value={activity.hasCigaBeenOutsourced}
                            onChange={(value) =>
                              updateActivity(index, { hasCigaBeenOutsourced: value })
                            }
                          />
                        </FieldShell>

                        <FieldShell label="High-risk IP company">
                          <YesNo
                            value={activity.highRiskIpCompany}
                            onChange={(value) =>
                              updateActivity(index, { highRiskIpCompany: value })
                            }
                          />
                        </FieldShell>

                        <FieldShell label="Evidence attached">
                          <YesNo
                            value={activity.evidenceAttached}
                            onChange={(value) =>
                              updateActivity(index, { evidenceAttached: value })
                            }
                          />
                        </FieldShell>
                      </div>

                      {/* Premises */}
                      <FieldShell
                        label="Premises addresses"
                        hint="Enter one address per line."
                      >
                        <Textarea
                          value={textareaFromStringArray(activity.premisesAddresses)}
                          onChange={(event) =>
                            updateActivity(index, {
                              premisesAddresses: stringArrayFromTextarea(event.target.value),
                            })
                          }
                          rows={3}
                          className="resize-none"
                        />
                      </FieldShell>

                      {/* CIGA selections */}
                      {availableCiga.length ? (
                        <FieldShell label="CIGA selections">
                          <div className="grid gap-2 md:grid-cols-2">
                            {availableCiga.map((option) => (
                              <ToggleChip
                                key={option}
                                label={option}
                                checked={activity.cigaSelections?.includes(option) ?? false}
                                onChange={(nextChecked) => {
                                  const current = activity.cigaSelections ?? [];
                                  updateActivity(index, {
                                    cigaSelections: nextChecked
                                      ? [...current, option]
                                      : current.filter((entry) => entry !== option),
                                  });
                                }}
                              />
                            ))}
                          </div>
                        </FieldShell>
                      ) : null}

                      <FieldShell label="Other CIGA details">
                        <Textarea
                          value={activity.otherCiga ?? ""}
                          onChange={(event) =>
                            updateActivity(index, { otherCiga: event.target.value })
                          }
                          rows={2}
                          className="resize-none"
                        />
                      </FieldShell>

                      {/* Parent entities */}
                      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
                        <FieldShell label="Immediate parent name">
                          <Input
                            value={activity.immediateParentName ?? ""}
                            onChange={(event) =>
                              updateActivity(index, { immediateParentName: event.target.value })
                            }
                          />
                        </FieldShell>
                        <FieldShell label="Immediate parent address">
                          <Input
                            value={activity.immediateParentAddress ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                immediateParentAddress: event.target.value,
                              })
                            }
                          />
                        </FieldShell>
                        <FieldShell label="Ultimate parent name">
                          <Input
                            value={activity.ultimateParentName ?? ""}
                            onChange={(event) =>
                              updateActivity(index, { ultimateParentName: event.target.value })
                            }
                          />
                        </FieldShell>
                        <FieldShell label="Ultimate parent address">
                          <Input
                            value={activity.ultimateParentAddress ?? ""}
                            onChange={(event) =>
                              updateActivity(index, {
                                ultimateParentAddress: event.target.value,
                              })
                            }
                          />
                        </FieldShell>
                      </div>

                      {/* Outsourcing providers */}
                      <div className="space-y-3 border-t border-border/50 pt-4">
                        <div className="flex items-center justify-between">
                          <p className="text-[13px] font-semibold">Outsourcing providers</p>
                          <Button variant="outline" size="sm" onClick={() => addProvider(index)} className="h-7 gap-1.5 text-[11px]">
                            <Plus className="size-3" />
                            Add provider
                          </Button>
                        </div>

                        {(activity.outsourcingProviders ?? []).map(
                          (provider, providerIndex) => (
                            <div
                              key={`provider-${index}-${providerIndex}`}
                              className="rounded-lg border border-border/80 bg-muted/30 p-3.5"
                            >
                              <div className="mb-4 flex items-center justify-between">
                                <p className="text-[12px] font-semibold text-muted-foreground">
                                  Provider {providerIndex + 1}
                                </p>
                                <button
                                  type="button"
                                  onClick={() => removeProvider(index, providerIndex)}
                                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                >
                                  <Trash2 className="size-2.5" />
                                  Remove
                                </button>
                              </div>

                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                <FieldShell label="Name">
                                  <Input
                                    value={provider.name ?? ""}
                                    onChange={(event) =>
                                      updateProvider(index, providerIndex, {
                                        name: event.target.value,
                                      })
                                    }
                                  />
                                </FieldShell>
                                <FieldShell label="Expenditure value">
                                  <Input
                                    value={provider.expenditureValue ?? ""}
                                    onChange={(event) =>
                                      updateProvider(index, providerIndex, {
                                        expenditureValue: event.target.value,
                                      })
                                    }
                                  />
                                </FieldShell>
                                <FieldShell label="TIN">
                                  <Input
                                    value={provider.tin ?? ""}
                                    onChange={(event) =>
                                      updateProvider(index, providerIndex, {
                                        tin: event.target.value,
                                      })
                                    }
                                  />
                                </FieldShell>
                                <FieldShell label="Address">
                                  <Input
                                    value={provider.address ?? ""}
                                    onChange={(event) =>
                                      updateProvider(index, providerIndex, {
                                        address: event.target.value,
                                      })
                                    }
                                  />
                                </FieldShell>
                                <FieldShell label="Employee figures included">
                                  <YesNo
                                    value={provider.employeeFiguresIncluded}
                                    onChange={(value) =>
                                      updateProvider(index, providerIndex, {
                                        employeeFiguresIncluded: value,
                                      })
                                    }
                                  />
                                </FieldShell>
                                <FieldShell label="Premises provided">
                                  <YesNo
                                    value={provider.premisesProvided}
                                    onChange={(value) =>
                                      updateProvider(index, providerIndex, {
                                        premisesProvided: value,
                                      })
                                    }
                                  />
                                </FieldShell>
                              </div>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </SectionGroup>
        </div>
      ) : null}

      {/* ─── Schedule A ─────────────────────────────────────────── */}
      {sectionId === "scheduleA" ? (
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
          <FieldShell label="Schedule A financial statements attached">
            <YesNo
              value={scheduleA.areScheduleAFinancialStatementsAttached}
              onChange={(value) =>
                updateSection("scheduleA", {
                  areScheduleAFinancialStatementsAttached: value,
                })
              }
            />
          </FieldShell>

          <FieldShell label="Gross income or premiums" required={isRequired("grossIncomeOrPremiums")}>
            <Input
              value={scheduleA.grossIncomeOrPremiums ?? ""}
              onChange={(event) =>
                updateSection("scheduleA", {
                  grossIncomeOrPremiums: event.target.value,
                })
              }
              placeholder="0.00"
            />
          </FieldShell>
        </div>
      ) : null}

      {/* ─── Distributions ──────────────────────────────────────── */}
      {sectionId === "distributions" ? (
        <div className="space-y-5">
          <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
            <FieldShell label="Distributions to Jersey-resident shareholders">
              <YesNo
                value={distributions.hasDistributionsToJerseyResidentShareholders}
                onChange={(value) =>
                  updateSection("distributions", {
                    hasDistributionsToJerseyResidentShareholders: value,
                  })
                }
              />
            </FieldShell>

            <FieldShell label="Total distributions amount">
              <Input
                value={distributions.totalDistributionsAmount ?? ""}
                onChange={(event) =>
                  updateSection("distributions", {
                    totalDistributionsAmount: event.target.value,
                  })
                }
                placeholder="0.00"
              />
            </FieldShell>
          </div>

          <SectionGroup title="Shareholders">
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={addShareholder} className="h-8 gap-1.5 text-xs">
                  <Plus className="size-3.5" />
                  Add shareholder
                </Button>
              </div>

              {(distributions.shareholders ?? []).map((shareholder, index) => (
                <div
                  key={`shareholder-${index}`}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                        {index + 1}
                      </span>
                      <p className="text-[13px] font-semibold">Shareholder</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeShareholder(index)}
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                      Remove
                    </button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <FieldShell label="Name">
                      <Input
                        value={shareholder.name ?? ""}
                        onChange={(event) =>
                          updateShareholder(index, { name: event.target.value })
                        }
                      />
                    </FieldShell>
                    <FieldShell label="TIN">
                      <Input
                        value={shareholder.tin ?? ""}
                        onChange={(event) =>
                          updateShareholder(index, { tin: event.target.value })
                        }
                      />
                    </FieldShell>
                    <FieldShell label="Amount">
                      <Input
                        value={shareholder.amount ?? ""}
                        onChange={(event) =>
                          updateShareholder(index, { amount: event.target.value })
                        }
                      />
                    </FieldShell>
                    <FieldShell label="Address">
                      <Input
                        value={shareholder.address ?? ""}
                        onChange={(event) =>
                          updateShareholder(index, { address: event.target.value })
                        }
                      />
                    </FieldShell>
                  </div>
                </div>
              ))}
            </div>
          </SectionGroup>
        </div>
      ) : null}

      {/* ─── Compliance ─────────────────────────────────────────── */}
      {sectionId === "compliance" ? (
        <div className="space-y-5">
          <SectionGroup title="Ultimate parent">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <FieldShell label="Has ultimate parent company">
                <YesNo
                  value={compliance.hasUltimateParentCompany}
                  onChange={(value) =>
                    updateSection("compliance", {
                      hasUltimateParentCompany: value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Ultimate parent country">
                <Input
                  value={compliance.ultimateParentCountry ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      ultimateParentCountry: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Ultimate parent name">
                <Input
                  value={compliance.ultimateParentName ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      ultimateParentName: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Ultimate parent address" className="md:col-span-2 xl:col-span-3">
                <Input
                  value={compliance.ultimateParentAddress ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      ultimateParentAddress: event.target.value,
                    })
                  }
                />
              </FieldShell>
            </div>
          </SectionGroup>

          <SectionGroup title="Financial metrics">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <FieldShell label="Gross profit">
                <Input
                  value={compliance.grossProfit ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", { grossProfit: event.target.value })
                  }
                  placeholder="0.00"
                />
              </FieldShell>
              <FieldShell label="Employment costs">
                <Input
                  value={compliance.employmentCosts ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", { employmentCosts: event.target.value })
                  }
                  placeholder="0.00"
                />
              </FieldShell>
              <FieldShell label="Directors remuneration">
                <Input
                  value={compliance.directorsRemuneration ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      directorsRemuneration: event.target.value,
                    })
                  }
                  placeholder="0.00"
                />
              </FieldShell>
              <FieldShell label="Finance costs">
                <Input
                  value={compliance.financeCosts ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", { financeCosts: event.target.value })
                  }
                  placeholder="0.00"
                />
              </FieldShell>
              <FieldShell label="Connected person deductions above threshold">
                <YesNo
                  value={compliance.hasConnectedPersonDeductionsAboveThreshold}
                  onChange={(value) =>
                    updateSection("compliance", {
                      hasConnectedPersonDeductionsAboveThreshold: value,
                    })
                  }
                />
              </FieldShell>
            </div>
          </SectionGroup>

          <SectionGroup title="Balance sheet">
            <div className="grid gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
              <FieldShell label="Stock value">
                <Input
                  value={compliance.stockValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", { stockValue: event.target.value })
                  }
                />
              </FieldShell>
              <FieldShell label="Land value">
                <Input
                  value={compliance.landValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", { landValue: event.target.value })
                  }
                />
              </FieldShell>
              <FieldShell label="Fixed assets other than land">
                <Input
                  value={compliance.fixedAssetsOtherThanLandValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      fixedAssetsOtherThanLandValue: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Intangible assets value">
                <Input
                  value={compliance.intangibleAssetsValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      intangibleAssetsValue: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Finance assets value">
                <Input
                  value={compliance.financeAssetsValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      financeAssetsValue: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Finance liabilities value">
                <Input
                  value={compliance.financeLiabilitiesValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      financeLiabilitiesValue: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Trade debtors value">
                <Input
                  value={compliance.tradeDebtorsValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      tradeDebtorsValue: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Trade creditors value">
                <Input
                  value={compliance.tradeCreditorsValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", {
                      tradeCreditorsValue: event.target.value,
                    })
                  }
                />
              </FieldShell>
              <FieldShell label="Fund value">
                <Input
                  value={compliance.fundValue ?? ""}
                  onChange={(event) =>
                    updateSection("compliance", { fundValue: event.target.value })
                  }
                />
              </FieldShell>
            </div>
          </SectionGroup>

          <SectionGroup title="Connected person deductions">
            <div className="space-y-3">
              <div className="flex items-center justify-end">
                <Button variant="outline" size="sm" onClick={addDeduction} className="h-8 gap-1.5 text-xs">
                  <Plus className="size-3.5" />
                  Add deduction
                </Button>
              </div>

              {(compliance.connectedPersonDeductions ?? []).map(
                (deduction, index) => (
                  <div
                    key={`deduction-${index}`}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm"
                  >
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-bold text-muted-foreground">
                          {index + 1}
                        </span>
                        <p className="text-[13px] font-semibold">Deduction</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeDeduction(index)}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="size-3" />
                        Remove
                      </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <FieldShell label="Country of residence">
                        <Input
                          value={deduction.countryOfResidence ?? ""}
                          onChange={(event) =>
                            updateDeduction(index, {
                              countryOfResidence: event.target.value,
                            })
                          }
                        />
                      </FieldShell>
                      <FieldShell label="Name">
                        <Input
                          value={deduction.name ?? ""}
                          onChange={(event) =>
                            updateDeduction(index, { name: event.target.value })
                          }
                        />
                      </FieldShell>
                      <FieldShell label="Amount">
                        <Input
                          value={deduction.amount ?? ""}
                          onChange={(event) =>
                            updateDeduction(index, { amount: event.target.value })
                          }
                        />
                      </FieldShell>
                      <FieldShell label="Address">
                        <Input
                          value={deduction.address ?? ""}
                          onChange={(event) =>
                            updateDeduction(index, { address: event.target.value })
                          }
                        />
                      </FieldShell>
                    </div>
                  </div>
                ),
              )}
            </div>
          </SectionGroup>
        </div>
      ) : null}

      {/* ─── Additional Info ────────────────────────────────────── */}
      {sectionId === "additionalInfo" ? (
        <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
          <FieldShell label="Notes">
            <Textarea
              value={additionalInfo.notes ?? ""}
              onChange={(event) =>
                updateSection("additionalInfo", { notes: event.target.value })
              }
              rows={5}
              className="resize-none"
            />
          </FieldShell>
          <FieldShell label="Evidence notes">
            <Textarea
              value={additionalInfo.evidenceNotes ?? ""}
              onChange={(event) =>
                updateSection("additionalInfo", {
                  evidenceNotes: event.target.value,
                })
              }
              rows={5}
              className="resize-none"
            />
          </FieldShell>
        </div>
      ) : null}
    </div>
  );
}

// ─── Upload step content ────────────────────────────────────────────

function UploadStepContent({
  missingFields,
  missingBySection,
  selectedFinancialFiles,
  setSelectedFinancialFiles,
  financialStatementsIndex,
  setFinancialStatementsIndex,
  assignedFinancialStatementsFile,
  onStepChange,
}: {
  missingFields: string[];
  missingBySection: Record<string, string[]>;
  selectedFinancialFiles: File[];
  setSelectedFinancialFiles: Dispatch<SetStateAction<File[]>>;
  financialStatementsIndex: number | null;
  setFinancialStatementsIndex: Dispatch<SetStateAction<number | null>>;
  assignedFinancialStatementsFile: VaultFile | null;
  onStepChange: (stepId: string) => void;
}) {
  const removeFile = (index: number) => {
    setSelectedFinancialFiles((prev) => prev.filter((_, i) => i !== index));
    setFinancialStatementsIndex((prev) => {
      if (prev === null) return null;
      if (prev === index) return null;
      if (prev > index) return prev - 1;
      return prev;
    });
  };

  return (
    <div className="space-y-6">
      {/* Already-assigned banner */}
      {assignedFinancialStatementsFile ? (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3 dark:border-emerald-500/15">
          <Check className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Financial statements assigned</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {assignedFinancialStatementsFile.name}
            </p>
          </div>
        </div>
      ) : null}

      {/* Drop zone */}
      <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-card px-6 py-14 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.02]">
        <input
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv,.zip,.doc,.docx"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) {
              setSelectedFinancialFiles((prev) => [...prev, ...files]);
            }
            event.target.value = "";
          }}
        />
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <UploadCloud className="size-5" />
        </div>
        <p className="mt-4 text-sm font-medium">
          Upload financial statements
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Drop files here or click to browse. PDF, Excel, CSV, ZIP, DOC accepted.
        </p>
      </label>

      {/* File list */}
      {selectedFinancialFiles.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">
            {selectedFinancialFiles.length} file{selectedFinancialFiles.length !== 1 ? "s" : ""} queued
          </p>
          <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-card">
            {selectedFinancialFiles.map((file, index) => {
              const selectable = isPdfLike(file);
              const isAssigned = financialStatementsIndex === index;

              return (
                <div
                  key={`${file.name}-${file.size}-${index}`}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <div
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      isAssigned
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <FileText className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{file.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(file.size)}
                      {isAssigned ? " · Financial statements" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {selectable && !isAssigned ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setFinancialStatementsIndex(index)}
                      >
                        Assign as statements
                      </Button>
                    ) : null}
                    {isAssigned ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        <Check className="size-3" />
                        Assigned
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Missing fields warning */}
      {missingFields.length > 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4 dark:border-amber-500/15">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {missingFields.length} required field{missingFields.length !== 1 ? "s" : ""} still need attention
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(missingBySection).map(([sId, fields]) =>
              fields.length > 0 ? (
                <button
                  key={sId}
                  type="button"
                  onClick={() => onStepChange(sId)}
                  className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                >
                  {sId === "section1"
                    ? "Section 1"
                    : sId === "economicSubstance"
                      ? "Economic Substance"
                      : sId === "scheduleA"
                        ? "Schedule A"
                        : sId === "distributions"
                          ? "Distributions"
                          : sId === "compliance"
                            ? "Compliance"
                            : "Additional Info"}{" "}
                  ({fields.length})
                </button>
              ) : null,
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
