"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import { Check, FileText, UploadCloud, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

import {
  FIELD_LABELS,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ReturnFormFields } from "../../_components/return-form-fields";
import {
  formatBytes,
  getSectionCompletion,
  isPdfLike,
  type VaultFile,
} from "../../_components/return-workspace-shared";

import type { GuidedStep } from "./guided-sidebar";

type GuidedStepContentProps = {
  contentRef: RefObject<HTMLDivElement | null>;
  resolvedActiveStep: GuidedStep;
  activeStepIndex: number;
  totalSteps: number;
  entityName: string;
  taxYear: number;
  draftForm: Partial<SubstanceFormData>;
  setDraftForm: Dispatch<SetStateAction<Partial<SubstanceFormData>>>;
  draftMissingFields: string[];
  missingFieldsByStep: Map<string, string[]>;
  sectionStepIndexByField: Map<string, string>;
  selectedFinancialFiles: File[];
  setSelectedFinancialFiles: Dispatch<SetStateAction<File[]>>;
  financialStatementsIndex: number | null;
  setFinancialStatementsIndex: Dispatch<SetStateAction<number | null>>;
  selectedFinancialStatementsName: string | null;
  assignedFinancialStatementsFile: VaultFile | null;
  onStepChange: (stepId: string) => void;
  readOnly?: boolean;
};

export function GuidedStepContent({
  contentRef,
  resolvedActiveStep,
  activeStepIndex,
  totalSteps,
  entityName,
  taxYear: _taxYear,
  draftForm,
  setDraftForm,
  draftMissingFields,
  missingFieldsByStep,
  sectionStepIndexByField,
  selectedFinancialFiles,
  setSelectedFinancialFiles,
  financialStatementsIndex,
  setFinancialStatementsIndex,
  selectedFinancialStatementsName,
  assignedFinancialStatementsFile,
  onStepChange,
  readOnly = false,
}: GuidedStepContentProps) {
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
          className="mx-auto max-w-3xl px-6 pt-8 pb-12 lg:px-10"
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
            <SectionStepContent
              resolvedActiveStep={resolvedActiveStep}
              draftForm={draftForm}
              setDraftForm={setDraftForm}
              missingFieldsByStep={missingFieldsByStep}
              readOnly={readOnly}
            />
          ) : (
            <UploadStepContent
              draftMissingFields={draftMissingFields}
              sectionStepIndexByField={sectionStepIndexByField}
              selectedFinancialFiles={selectedFinancialFiles}
              setSelectedFinancialFiles={setSelectedFinancialFiles}
              financialStatementsIndex={financialStatementsIndex}
              setFinancialStatementsIndex={setFinancialStatementsIndex}
              selectedFinancialStatementsName={selectedFinancialStatementsName}
              assignedFinancialStatementsFile={assignedFinancialStatementsFile}
              onStepChange={onStepChange}
              readOnly={readOnly}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function SectionStepContent({
  resolvedActiveStep,
  draftForm,
  setDraftForm,
  missingFieldsByStep,
  readOnly,
}: {
  resolvedActiveStep: GuidedStep & { kind: "section" };
  draftForm: Partial<SubstanceFormData>;
  setDraftForm: Dispatch<SetStateAction<Partial<SubstanceFormData>>>;
  missingFieldsByStep: Map<string, string[]>;
  readOnly: boolean;
}) {
  const missingFields = missingFieldsByStep.get(resolvedActiveStep.id) ?? [];
  const completion = getSectionCompletion(resolvedActiveStep.fields, draftForm);

  return (
    <div className="space-y-6">
      {/* Section progress bar */}
      {completion.total > 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
          <div className="h-1.5 flex-1 rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                completion.missingRequired === 0
                  ? "bg-emerald-500"
                  : "bg-primary",
              )}
              style={{
                width: `${(completion.filled / completion.total) * 100}%`,
              }}
            />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">
            {completion.filled}/{completion.total} answered
          </span>
          {missingFields.length > 0 ? (
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {missingFields.length} required
            </span>
          ) : null}
        </div>
      ) : null}

      {/* Form fields */}
      <ReturnFormFields
        fields={resolvedActiveStep.fields}
        draftForm={draftForm}
        setDraftForm={setDraftForm}
        surface
        showRequiredBadges
        disabled={readOnly}
      />
    </div>
  );
}

function UploadStepContent({
  draftMissingFields,
  sectionStepIndexByField,
  selectedFinancialFiles,
  setSelectedFinancialFiles,
  financialStatementsIndex,
  setFinancialStatementsIndex,
  selectedFinancialStatementsName: _selectedFinancialStatementsName,
  assignedFinancialStatementsFile,
  onStepChange,
  readOnly,
}: {
  draftMissingFields: string[];
  sectionStepIndexByField: Map<string, string>;
  selectedFinancialFiles: File[];
  setSelectedFinancialFiles: Dispatch<SetStateAction<File[]>>;
  financialStatementsIndex: number | null;
  setFinancialStatementsIndex: Dispatch<SetStateAction<number | null>>;
  selectedFinancialStatementsName: string | null;
  assignedFinancialStatementsFile: VaultFile | null;
  onStepChange: (stepId: string) => void;
  readOnly: boolean;
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
      <label
        className={cn(
          "group flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border/80 bg-card px-6 py-14 text-center transition-colors",
          readOnly
            ? "cursor-not-allowed opacity-70"
            : "cursor-pointer hover:border-primary/40 hover:bg-primary/[0.02]",
        )}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.xlsx,.xls,.csv,.zip,.doc,.docx"
          className="hidden"
          disabled={readOnly}
          onChange={(event) => {
            if (readOnly) {
              event.target.value = "";
              return;
            }
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
      {draftMissingFields.length > 0 ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.04] px-4 py-4 dark:border-amber-500/15">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {draftMissingFields.length} required field{draftMissingFields.length !== 1 ? "s" : ""} still need attention
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {draftMissingFields.map((field) => {
              const stepId = sectionStepIndexByField.get(field) ?? null;
              return (
                <button
                  key={field}
                  type="button"
                  onClick={() => {
                    if (stepId) onStepChange(stepId);
                  }}
                  className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-500/20 dark:text-amber-400"
                >
                  {FIELD_LABELS[field] ?? field}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
