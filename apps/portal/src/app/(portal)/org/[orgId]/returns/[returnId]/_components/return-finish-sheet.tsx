"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  CircleDashed,
  CircleDot,
  FileStack,
  Loader2,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  FIELD_LABELS,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import { ReturnFormFields } from "./return-form-fields";
import {
  getSectionCompletion,
  isPdfLike,
  type FormSection,
  type VaultFile,
} from "./return-workspace-shared";

const FINAL_STEP_ID = "financial-pack";

type ReturnFinishSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedReturnName: string;
  selectedTaxYear: number;
  visibleSections: FormSection[];
  draftForm: Partial<SubstanceFormData>;
  setDraftForm: Dispatch<SetStateAction<Partial<SubstanceFormData>>>;
  draftMissingFields: string[];
  selectedFiles: VaultFile[];
  isSaving: boolean;
  isInitializing: boolean;
  isUploading: boolean;
  onSaveProgress: () => Promise<void>;
  onComplete: (input: {
    files: File[];
    financialStatementsIndex: number | null;
  }) => Promise<void>;
};

type GuidedStep =
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

export function ReturnFinishSheet({
  open,
  onOpenChange,
  selectedReturnName,
  selectedTaxYear,
  visibleSections,
  draftForm,
  setDraftForm,
  draftMissingFields,
  selectedFiles,
  isSaving,
  isInitializing,
  isUploading,
  onSaveProgress,
  onComplete,
}: ReturnFinishSheetProps) {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [selectedFinancialFiles, setSelectedFinancialFiles] = useState<File[]>(
    [],
  );
  const [financialStatementsIndex, setFinancialStatementsIndex] = useState<
    number | null
  >(null);

  const assignedFinancialStatementsFile =
    selectedFiles.find((file) => file.role === "financial_statements") ?? null;

  const steps = useMemo<GuidedStep[]>(
    () => [
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
        description:
          "Upload the financial statements and lock in the PDF Browser Use should attach.",
      },
    ],
    [visibleSections],
  );

  const initialStepId = useMemo(() => {
    const firstMissingSection = visibleSections.find((section) =>
      section.fields.some((field) => draftMissingFields.includes(field)),
    );

    if (firstMissingSection) {
      return firstMissingSection.id;
    }

    if (!assignedFinancialStatementsFile) {
      return FINAL_STEP_ID;
    }

    return visibleSections[0]?.id ?? FINAL_STEP_ID;
  }, [assignedFinancialStatementsFile, draftMissingFields, visibleSections]);

  useEffect(() => {
    if (!open) {
      setActiveStepId(null);
      setSelectedFinancialFiles([]);
      setFinancialStatementsIndex(null);
      return;
    }

    setActiveStepId(initialStepId);
  }, [initialStepId, open]);

  useEffect(() => {
    if (!open) return;

    const nextIndex = selectedFinancialFiles.findIndex((file) =>
      isPdfLike(file),
    );
    setFinancialStatementsIndex((previous) => {
      if (
        previous !== null &&
        previous >= 0 &&
        previous < selectedFinancialFiles.length &&
        isPdfLike(selectedFinancialFiles[previous] ?? null)
      ) {
        return previous;
      }

      return nextIndex >= 0 ? nextIndex : null;
    });
  }, [open, selectedFinancialFiles]);

  useEffect(() => {
    if (!open) return;

    const hasActiveStep = steps.some((step) => step.id === activeStepId);
    if (!hasActiveStep) {
      setActiveStepId(initialStepId);
    }
  }, [activeStepId, initialStepId, open, steps]);

  const activeStepIndex = Math.max(
    steps.findIndex((step) => step.id === activeStepId),
    0,
  );
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const isBusy = isSaving || isInitializing || isUploading;
  const totalSteps = steps.length;
  const progressRatio = totalSteps ? (activeStepIndex + 1) / totalSteps : 0;
  const uploadReady = Boolean(
    assignedFinancialStatementsFile ??
    (financialStatementsIndex !== null &&
      selectedFinancialFiles[financialStatementsIndex]),
  );

  const missingFieldsByStep = useMemo(() => {
    return new Map<string, string[]>(
      visibleSections.map((section) => [
        section.id,
        section.fields.filter((field) => draftMissingFields.includes(field)),
      ]),
    );
  }, [draftMissingFields, visibleSections]);

  const sectionStepIndexByField = useMemo(() => {
    return new Map<string, string>(
      visibleSections.flatMap((section) =>
        section.fields.map((field) => [field, section.id] as const),
      ),
    );
  }, [visibleSections]);

  const resolvedActiveStep: GuidedStep =
    activeStep ??
    ({
      id: FINAL_STEP_ID,
      kind: "upload",
      title: "Financial Pack",
      description:
        "Upload the financial statements and lock in the PDF Browser Use should attach.",
    } satisfies GuidedStep);

  const selectedFinancialStatementsName =
    financialStatementsIndex !== null
      ? (selectedFinancialFiles[financialStatementsIndex]?.name ?? null)
      : null;

  const handleStepChange = (stepId: string) => {
    setActiveStepId(stepId);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    const nextStep = steps[activeStepIndex + 1];
    if (!nextStep) return;
    handleStepChange(nextStep.id);
  };

  const handlePrevious = () => {
    const previousStep = steps[activeStepIndex - 1];
    if (!previousStep) return;
    handleStepChange(previousStep.id);
  };

  const handleSaveProgress = async () => {
    try {
      await onSaveProgress();
    } catch {}
  };

  const handleComplete = async () => {
    try {
      await onComplete({
        files: selectedFinancialFiles,
        financialStatementsIndex,
      });
      onOpenChange(false);
    } catch {}
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full gap-0 overflow-hidden border-l-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[min(96rem,100vw)]"
      >
        <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_34%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,0.98))]">
          <div className="border-border/60 absolute inset-y-0 left-0 hidden w-[23rem] border-r bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(241,245,249,0.92))] lg:block" />
          <div className="relative grid h-full min-h-0 lg:grid-cols-[23rem_minmax(0,1fr)]">
            <aside className="border-border/60 flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
              <SheetHeader className="px-5 pt-5 pb-4">
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <SheetTitle className="text-lg font-semibold">
                        Guided finish
                      </SheetTitle>
                      <SheetDescription className="mt-1 text-sm">
                        Walk through the ESR one section at a time, then upload
                        the financial statements at the end.
                      </SheetDescription>
                    </div>
                    <span className="inline-flex size-11 items-center justify-center rounded-full border border-blue-500/20 bg-white/80 text-blue-700">
                      <Sparkles className="size-5" />
                    </span>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                    <div className="border-border/70 rounded-[1rem] border bg-white/70 px-3 py-2.5">
                      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                        Required left
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {draftMissingFields.length}
                      </p>
                    </div>
                    <div className="border-border/70 rounded-[1rem] border bg-white/70 px-3 py-2.5">
                      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                        Sections
                      </p>
                      <p className="mt-1 text-2xl font-semibold">
                        {visibleSections.length}
                      </p>
                    </div>
                    <div className="border-border/70 rounded-[1rem] border bg-white/70 px-3 py-2.5">
                      <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                        Financials
                      </p>
                      <p className="mt-1 text-sm font-semibold">
                        {uploadReady ? "Ready to attach" : "Pending upload"}
                      </p>
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
                <div className="bg-muted/60 rounded-full p-1">
                  <div
                    className="h-2 rounded-full bg-[linear-gradient(90deg,rgba(59,130,246,0.85),rgba(16,185,129,0.72))] transition-[width] duration-500"
                    style={{ width: `${progressRatio * 100}%` }}
                  />
                </div>

                <div className="mt-4 space-y-2">
                  {steps.map((step, index) => {
                    const isActive = step.id === resolvedActiveStep.id;
                    const isSection = step.kind === "section";
                    const missingFields = isSection
                      ? (missingFieldsByStep.get(step.id) ?? [])
                      : [];
                    const completion = isSection
                      ? getSectionCompletion(step.fields, draftForm)
                      : null;
                    const isComplete = isSection
                      ? completion?.missingRequired === 0 &&
                        completion.filled > 0
                      : uploadReady;

                    return (
                      <motion.button
                        key={step.id}
                        type="button"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.03, duration: 0.25 }}
                        onClick={() => handleStepChange(step.id)}
                        className={cn(
                          "portal-card w-full rounded-[1.25rem] px-4 py-3 text-left transition",
                          isActive
                            ? "border-blue-500/35 bg-[linear-gradient(135deg,rgba(59,130,246,0.08),rgba(255,255,255,0.9))]"
                            : "bg-background/85 hover:bg-background hover:border-blue-500/20",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span
                            className={cn(
                              "mt-0.5 inline-flex size-8 items-center justify-center rounded-full border text-sm",
                              isComplete
                                ? "border-emerald-500/25 bg-emerald-500/12 text-emerald-700"
                                : isActive
                                  ? "border-blue-500/25 bg-blue-500/12 text-blue-700"
                                  : "border-border/70 bg-muted/55 text-muted-foreground",
                            )}
                          >
                            {isComplete ? (
                              <BadgeCheck className="size-4" />
                            ) : isActive ? (
                              <CircleDot className="size-4" />
                            ) : (
                              <CircleDashed className="size-4" />
                            )}
                          </span>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold">
                                {index + 1}. {step.title}
                              </p>
                              {missingFields.length ? (
                                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.16em] text-amber-700 uppercase">
                                  {missingFields.length} missing
                                </span>
                              ) : null}
                            </div>
                            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                              {step.description}
                            </p>
                            <p className="text-muted-foreground mt-2 text-[11px]">
                              {isSection && completion
                                ? `${completion.filled}/${completion.total} fields answered`
                                : assignedFinancialStatementsFile
                                  ? `Assigned: ${assignedFinancialStatementsFile.name}`
                                  : selectedFinancialStatementsName
                                    ? `Queued: ${selectedFinancialStatementsName}`
                                    : "Choose a PDF to assign"}
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <div className="flex min-h-0 flex-col">
              <div
                ref={contentRef}
                className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-6 sm:px-6"
              >
                <AnimatePresence mode="wait">
                  <motion.div
                    key={resolvedActiveStep.id}
                    initial={{ opacity: 0, x: 28, filter: "blur(8px)" }}
                    animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: -28, filter: "blur(8px)" }}
                    transition={{ duration: 0.28, ease: "easeOut" }}
                    className="mx-auto max-w-4xl space-y-5"
                  >
                    <Card className="portal-card rounded-[1.8rem] bg-white/85 py-0 backdrop-blur">
                      <CardContent className="p-5">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="max-w-2xl">
                            <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.22em] uppercase">
                              Step {activeStepIndex + 1} of {totalSteps}
                            </p>
                            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                              {resolvedActiveStep.title}
                            </h2>
                            <p className="text-muted-foreground mt-2 text-sm">
                              {resolvedActiveStep.kind === "section"
                                ? `${selectedReturnName} • ${resolvedActiveStep.description}`
                                : `${selectedReturnName} • ${selectedTaxYear} return`}
                            </p>
                          </div>

                          {resolvedActiveStep.kind === "section" ? (
                            <div className="border-border/70 bg-muted/35 min-w-48 rounded-[1.2rem] border px-4 py-3">
                              {(() => {
                                const completion = getSectionCompletion(
                                  resolvedActiveStep.fields,
                                  draftForm,
                                );

                                return (
                                  <>
                                    <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                                      Section progress
                                    </p>
                                    <p className="mt-1 text-2xl font-semibold">
                                      {completion.filled}/{completion.total}
                                    </p>
                                    <p className="text-muted-foreground mt-1 text-xs">
                                      {completion.missingRequired === 0
                                        ? "No required fields missing in this section."
                                        : `${completion.missingRequired} required field(s) still need input.`}
                                    </p>
                                  </>
                                );
                              })()}
                            </div>
                          ) : (
                            <div className="min-w-48 rounded-[1.2rem] border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
                              <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                                Final step
                              </p>
                              <p className="mt-1 text-2xl font-semibold">
                                {selectedFinancialFiles.length}
                              </p>
                              <p className="text-muted-foreground mt-1 text-xs">
                                File(s) queued for upload from the guided flow.
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {resolvedActiveStep.kind === "section" ? (
                      <>
                        {(missingFieldsByStep.get(resolvedActiveStep.id) ?? [])
                          .length > 0 ? (
                          <Card className="portal-card rounded-[1.4rem] border-amber-500/25 bg-white/90 py-0">
                            <CardContent className="p-4">
                              <p className="text-sm font-semibold">
                                Mandatory questions in this step
                              </p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {(
                                  missingFieldsByStep.get(
                                    resolvedActiveStep.id,
                                  ) ?? []
                                ).map((field) => (
                                  <span
                                    key={field}
                                    className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-800"
                                  >
                                    {FIELD_LABELS[field] ?? field}
                                  </span>
                                ))}
                              </div>
                            </CardContent>
                          </Card>
                        ) : null}

                        <ReturnFormFields
                          fields={resolvedActiveStep.fields}
                          draftForm={draftForm}
                          setDraftForm={setDraftForm}
                          surface
                          showRequiredBadges
                        />
                      </>
                    ) : (
                      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
                        <div className="space-y-4">
                          <Card className="portal-card rounded-[1.5rem] border-emerald-500/20 bg-white/90 py-0">
                            <CardContent className="p-5">
                              <div className="flex items-start gap-4">
                                <span className="inline-flex size-12 items-center justify-center rounded-full border border-emerald-500/20 bg-white/75 text-emerald-700">
                                  <UploadCloud className="size-5" />
                                </span>
                                <div className="flex-1">
                                  <p className="text-base font-semibold">
                                    Upload the financial pack
                                  </p>
                                  <p className="text-muted-foreground mt-1 text-sm">
                                    Select the annual accounts, then mark which
                                    PDF should be treated as the financial
                                    statements attachment for the Guernsey
                                    filing.
                                  </p>
                                </div>
                              </div>

                              <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-[1.35rem] border border-dashed border-emerald-500/30 bg-white/70 px-4 py-10 text-center transition hover:border-emerald-500/45 hover:bg-white">
                                <input
                                  type="file"
                                  multiple
                                  accept=".pdf,.xlsx,.xls,.csv,.zip,.doc,.docx"
                                  className="hidden"
                                  onChange={(event) => {
                                    setSelectedFinancialFiles(
                                      Array.from(event.target.files ?? []),
                                    );
                                  }}
                                />
                                <span className="inline-flex size-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-700">
                                  <FileStack className="size-5" />
                                </span>
                                <span className="mt-3 text-sm font-semibold">
                                  Drop files here or choose from your computer
                                </span>
                                <span className="text-muted-foreground mt-1 text-xs">
                                  PDF, Excel, CSV, ZIP, DOC and DOCX are
                                  accepted.
                                </span>
                              </label>
                            </CardContent>
                          </Card>

                          <Card className="portal-card rounded-[1.5rem] bg-white/90 py-0">
                            <CardContent className="p-5">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-base font-semibold">
                                    Upload queue
                                  </p>
                                  <p className="text-muted-foreground mt-1 text-sm">
                                    Choose one PDF as the financial statements
                                    file.
                                  </p>
                                </div>
                                {selectedFinancialStatementsName ? (
                                  <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-emerald-700 uppercase">
                                    {selectedFinancialStatementsName}
                                  </span>
                                ) : null}
                              </div>

                              {!selectedFinancialFiles.length ? (
                                <p className="border-border/70 text-muted-foreground mt-4 rounded-[1rem] border border-dashed px-4 py-8 text-center text-sm">
                                  No files selected yet.
                                </p>
                              ) : (
                                <div className="mt-4 space-y-3">
                                  {selectedFinancialFiles.map((file, index) => {
                                    const selectable = isPdfLike(file);
                                    const isAssigned =
                                      financialStatementsIndex === index;

                                    return (
                                      <div
                                        key={`${file.name}-${file.size}-${index}`}
                                        className="border-border/70 bg-background/75 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border px-4 py-3"
                                      >
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-medium">
                                            {file.name}
                                          </p>
                                          <p className="text-muted-foreground mt-1 text-xs">
                                            {selectable
                                              ? "Eligible for financial statements assignment"
                                              : "Uploadable, but not assignable as the statements PDF"}
                                          </p>
                                        </div>
                                        <Button
                                          type="button"
                                          variant={
                                            isAssigned ? "default" : "outline"
                                          }
                                          size="sm"
                                          disabled={!selectable}
                                          onClick={() => {
                                            setFinancialStatementsIndex(index);
                                          }}
                                        >
                                          {isAssigned
                                            ? "Financial statements PDF"
                                            : "Use as financials"}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>

                        <div className="space-y-4">
                          <Card className="portal-card rounded-[1.5rem] bg-white/90 py-0">
                            <CardContent className="p-5">
                              <p className="text-base font-semibold">
                                Completion check
                              </p>
                              <div className="mt-4 space-y-3">
                                <div className="border-border/70 bg-muted/35 rounded-[1rem] border px-4 py-3">
                                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                                    ESR data
                                  </p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {draftMissingFields.length === 0
                                      ? "All required fields answered"
                                      : `${draftMissingFields.length} required field(s) still need attention`}
                                  </p>
                                </div>

                                <div className="border-border/70 bg-muted/35 rounded-[1rem] border px-4 py-3">
                                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                                    Current assignment
                                  </p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {assignedFinancialStatementsFile?.name ??
                                      "No uploaded financial statements PDF assigned yet"}
                                  </p>
                                </div>

                                <div className="border-border/70 bg-muted/35 rounded-[1rem] border px-4 py-3">
                                  <p className="text-muted-foreground text-[10px] font-semibold tracking-[0.18em] uppercase">
                                    Finish action
                                  </p>
                                  <p className="text-muted-foreground mt-1 text-sm">
                                    Finishing saves the guided answers into the
                                    portal ESR record and uploads any selected
                                    financial documents to this return.
                                  </p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>

                          {draftMissingFields.length ? (
                            <Card className="portal-card rounded-[1.5rem] border-amber-500/25 bg-white/90 py-0">
                              <CardContent className="p-5">
                                <p className="text-sm font-semibold">
                                  Required items still open
                                </p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {draftMissingFields.map((field) => {
                                    const stepId =
                                      sectionStepIndexByField.get(field) ??
                                      null;

                                    return (
                                      <button
                                        key={field}
                                        type="button"
                                        onClick={() => {
                                          if (stepId) {
                                            handleStepChange(stepId);
                                          }
                                        }}
                                        className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-800 transition hover:bg-amber-500/15"
                                      >
                                        {FIELD_LABELS[field] ?? field}
                                      </button>
                                    );
                                  })}
                                </div>
                              </CardContent>
                            </Card>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              <SheetFooter className="border-border/70 border-t bg-white/85 px-5 py-4 backdrop-blur sm:px-6">
                <div className="flex w-full flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handlePrevious}
                      disabled={activeStepIndex === 0 || isBusy}
                    >
                      <ArrowLeft className="size-4" />
                      Previous
                    </Button>
                    {activeStepIndex < totalSteps - 1 ? (
                      <Button
                        type="button"
                        onClick={handleNext}
                        disabled={isBusy}
                      >
                        Next step
                        <ArrowRight className="size-4" />
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        onClick={() => {
                          void handleComplete();
                        }}
                        disabled={draftMissingFields.length > 0 || isBusy}
                      >
                        {isBusy ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <BadgeCheck className="size-4" />
                        )}
                        {selectedFinancialFiles.length
                          ? "Update return + upload financials"
                          : "Update return"}
                      </Button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground text-xs">
                      Step {activeStepIndex + 1}/{totalSteps}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        void handleSaveProgress();
                      }}
                      disabled={isBusy}
                    >
                      {isBusy ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Sparkles className="size-4" />
                      )}
                      Save progress
                    </Button>
                  </div>
                </div>
              </SheetFooter>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
