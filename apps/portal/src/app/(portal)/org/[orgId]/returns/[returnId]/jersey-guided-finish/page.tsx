"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";

import {
  createEmptyJerseyCompanyReturnFormData,
  getJerseyCompanyReturnMissingFields,
  type JerseyCompanyReturnFormData,
} from "@repo/database/jersey-company-return";

import { uploadPortalFile } from "@/lib/portal-upload";
import { sanitizeJerseyCompanyReturnData } from "@/lib/schemas/jersey-company-return";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  asVaultFiles,
  isPdfLike,
} from "../_components/return-workspace-shared";

import {
  buildJerseySteps,
  FINAL_STEP_ID,
  JerseyGuidedSidebar,
} from "./_components/jersey-guided-sidebar";
import { JerseyGuidedStepContent } from "./_components/jersey-guided-step-content";

export default function JerseyGuidedFinishPage() {
  const params = useParams<{ orgId: string; returnId: string }>();
  const orgId = params.orgId;
  const returnId = params.returnId;
  const router = useRouter();

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [selectedFinancialFiles, setSelectedFinancialFiles] = useState<File[]>(
    [],
  );
  const [financialStatementsIndex, setFinancialStatementsIndex] = useState<
    number | null
  >(null);
  const [draftForm, setDraftForm] = useState<Partial<JerseyCompanyReturnFormData>>(
    createEmptyJerseyCompanyReturnFormData(),
  );
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);

  const utils = api.useUtils();

  const returnsQuery = api.portalReturns.listByOrg.useQuery(
    { orgId },
    { enabled: !!orgId },
  );

  const selectedReturn = useMemo(
    () => (returnsQuery.data ?? []).find((row) => row.id === returnId) ?? null,
    [returnId, returnsQuery.data],
  );

  const formQuery = api.portalReturns.getJerseyCompanyReturnForm.useQuery(
    {
      orgId,
      taxReturnId: selectedReturn?.id ?? "",
    },
    {
      enabled: !!selectedReturn,
    },
  );

  const createFormMutation =
    api.portalReturns.createJerseyCompanyReturnForm.useMutation({
      onSuccess: () => {
        if (!selectedReturn) return;
        void utils.portalReturns.getJerseyCompanyReturnForm.invalidate({
          orgId,
          taxReturnId: selectedReturn.id,
        });
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });

  const updateFormMutation =
    api.portalReturns.updateJerseyCompanyReturnForm.useMutation({
      onSuccess: () => {
        if (!selectedReturn) return;
        void utils.portalReturns.getJerseyCompanyReturnForm.invalidate({
          orgId,
          taxReturnId: selectedReturn.id,
        });
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });

  const addDocumentsMutation = api.portalReturns.addReturnDocuments.useMutation(
    {
      onSuccess: () => {
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    },
  );

  const hasSyncedFormRef = useRef<string | null>(null);

  useEffect(() => {
    if (!formQuery.data || !selectedReturn?.id) return;
    // Only sync from server on first load or when switching to a different return
    if (hasSyncedFormRef.current === selectedReturn.id) return;
    hasSyncedFormRef.current = selectedReturn.id;
    setDraftForm(sanitizeJerseyCompanyReturnData(formQuery.data));
  }, [formQuery.data, selectedReturn?.id]);

  const normalizedDraft = useMemo(
    () => sanitizeJerseyCompanyReturnData(draftForm),
    [draftForm],
  );

  const missingFields = useMemo(
    () => getJerseyCompanyReturnMissingFields(normalizedDraft),
    [normalizedDraft],
  );

  const missingBySection = useMemo(() => {
    return {
      section1: missingFields.filter((field) => field.startsWith("section1.")),
      economicSubstance: missingFields.filter((field) =>
        field.startsWith("economicSubstance."),
      ),
      scheduleA: missingFields.filter((field) => field.startsWith("scheduleA.")),
      distributions: missingFields.filter((field) =>
        field.startsWith("distributions."),
      ),
      compliance: missingFields.filter((field) =>
        field.startsWith("compliance."),
      ),
      additionalInfo: missingFields.filter((field) =>
        field.startsWith("additionalInfo."),
      ),
    };
  }, [missingFields]);

  const selectedFiles = asVaultFiles(selectedReturn?.files);
  const assignedFinancialStatementsFile =
    selectedFiles.find((file) => file.role === "financial_statements") ?? null;

  const steps = useMemo(() => buildJerseySteps(), []);

  const initialStepId = useMemo(() => {
    // Find first section with missing fields
    const sectionOrder = [
      "section1",
      "economicSubstance",
      "scheduleA",
      "distributions",
      "compliance",
      "additionalInfo",
    ];

    for (const sectionId of sectionOrder) {
      const sectionMissing = missingBySection[sectionId as keyof typeof missingBySection] ?? [];
      if (sectionMissing.length > 0) return sectionId;
    }

    if (!assignedFinancialStatementsFile) return FINAL_STEP_ID;
    return "section1";
  }, [assignedFinancialStatementsFile, missingBySection]);

  useEffect(() => {
    if (!activeStepId) setActiveStepId(initialStepId);
  }, [activeStepId, initialStepId]);

  useEffect(() => {
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
  }, [selectedFinancialFiles]);

  useEffect(() => {
    const hasActiveStep = steps.some((step) => step.id === activeStepId);
    if (!hasActiveStep) setActiveStepId(initialStepId);
  }, [activeStepId, initialStepId, steps]);

  const activeStepIndex = Math.max(
    steps.findIndex((step) => step.id === activeStepId),
    0,
  );
  const activeStep = steps[activeStepIndex] ?? steps[0];
  const isSaving = updateFormMutation.isPending;
  const isInitializing = createFormMutation.isPending;
  const isUploading = addDocumentsMutation.isPending;
  const isBusy = isSaving || isInitializing || isUploading;
  const totalSteps = steps.length;
  const progressRatio = totalSteps ? (activeStepIndex + 1) / totalSteps : 0;
  const uploadReady = Boolean(
    assignedFinancialStatementsFile ??
      (financialStatementsIndex !== null &&
        selectedFinancialFiles[financialStatementsIndex]),
  );

  const selectedFinancialStatementsName =
    financialStatementsIndex !== null
      ? (selectedFinancialFiles[financialStatementsIndex]?.name ?? null)
      : null;

  const resolvedActiveStep =
    activeStep ??
    ({
      id: FINAL_STEP_ID,
      kind: "upload" as const,
      title: "Financial Pack",
      description: "Upload signed financial statements for the Jersey filing.",
    });

  const showMessage = (message: string) => setWorkspaceMessage(message);

  const ensureFormExists = async () => {
    if (!selectedReturn || formQuery.data) return;
    await createFormMutation.mutateAsync({
      orgId,
      taxReturnId: selectedReturn.id,
    });
  };

  const persistFormData = async (
    data: Partial<JerseyCompanyReturnFormData>,
    successMessage?: string,
  ) => {
    if (!selectedReturn) return;
    await ensureFormExists();
    await updateFormMutation.mutateAsync({
      orgId,
      taxReturnId: selectedReturn.id,
      data: sanitizeJerseyCompanyReturnData(data),
    });
    if (successMessage) showMessage(successMessage);
  };

  const handleStepChange = (stepId: string) => {
    setActiveStepId(stepId);
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleNext = () => {
    const nextStep = steps[activeStepIndex + 1];
    if (nextStep) handleStepChange(nextStep.id);
  };

  const handlePrevious = () => {
    const previousStep = steps[activeStepIndex - 1];
    if (previousStep) handleStepChange(previousStep.id);
  };

  const handleSaveProgress = async () => {
    try {
      showMessage("Saving...");
      await persistFormData(draftForm, "Progress saved.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to save progress.",
      );
    }
  };

  const handleComplete = async () => {
    try {
      showMessage("Saving guided return...");
      await persistFormData(draftForm);

      if (selectedFinancialFiles.length && selectedReturn) {
        const assignedIndex =
          financialStatementsIndex !== null &&
          isPdfLike(selectedFinancialFiles[financialStatementsIndex] ?? null)
            ? financialStatementsIndex
            : selectedFinancialFiles.findIndex((file) => isPdfLike(file));

        const uploaded = await Promise.all(
          selectedFinancialFiles.map((file) =>
            uploadPortalFile({
              orgId,
              taxReturnId: selectedReturn.id,
              file,
              category: "financial",
            }),
          ),
        );

        await addDocumentsMutation.mutateAsync({
          orgId,
          taxReturnId: selectedReturn.id,
          documents: uploaded.map((file, index) => ({
            ...file,
            role: index === assignedIndex ? "financial_statements" : undefined,
          })),
        });
      }

      router.push(`/org/${orgId}/returns/${returnId}`);
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to finish the guided return.",
      );
    }
  };


  if (returnsQuery.isLoading) {
    return (
      <div className="-m-4 sm:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
        <div className="relative grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Content skeleton */}
          <div className="flex min-h-0 flex-col">
            <div className="flex-1 overflow-auto p-6">
              <div className="mx-auto max-w-2xl space-y-6">
                <div>
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-6 w-48" />
                  <Skeleton className="mt-2 h-4 w-72" />
                </div>
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={`field-skel-${i}`} className="space-y-2">
                      <Skeleton className="h-3.5 w-32" />
                      <Skeleton className="h-9 w-full rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-border/60 bg-card px-6 py-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-24 rounded-md" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-20 rounded-md" />
                  <Skeleton className="h-8 w-16 rounded-md" />
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar skeleton */}
          <div className="hidden border-l border-border/60 bg-card lg:flex lg:flex-col">
            <div className="flex items-center gap-3 border-b border-border/60 px-5 py-4">
              <div>
                <Skeleton className="h-4 w-28" />
                <Skeleton className="mt-1.5 h-3 w-20" />
              </div>
            </div>
            <div className="flex-1 space-y-1 p-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={`step-skel-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                  <Skeleton className="size-5 rounded-full" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="mt-1 h-2.5 w-16" />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-border/60 px-4 py-3">
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedReturn) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Return not found in this organization.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => router.push(`/org/${orgId}/returns`)}
          >
            <ArrowLeft className="size-3.5" />
            Back to returns
          </Button>
        </div>
      </div>
    );
  }

  const isLastStep = activeStepIndex === totalSteps - 1;

  return (
    <div className="-m-4 sm:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <div className="relative grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-0 flex-col">
          <JerseyGuidedStepContent
            contentRef={contentRef}
            resolvedActiveStep={resolvedActiveStep}
            activeStepIndex={activeStepIndex}
            totalSteps={totalSteps}
            entityName={selectedReturn.entityName}
            draftForm={draftForm}
            setDraftForm={setDraftForm}
            missingFields={missingFields}
            missingBySection={missingBySection}
            selectedFinancialFiles={selectedFinancialFiles}
            setSelectedFinancialFiles={setSelectedFinancialFiles}
            financialStatementsIndex={financialStatementsIndex}
            setFinancialStatementsIndex={setFinancialStatementsIndex}
            selectedFinancialStatementsName={selectedFinancialStatementsName}
            assignedFinancialStatementsFile={assignedFinancialStatementsFile}
            onStepChange={handleStepChange}
          />

          {/* Footer */}
          <div className="border-t border-border/60 bg-card px-6 py-3">
            {/* Message toast */}
            {workspaceMessage ? (
              <div
                className={cn(
                  "mb-3 rounded-lg px-3 py-2 text-xs",
                  workspaceMessage.toLowerCase().includes("unable") ||
                    workspaceMessage.toLowerCase().includes("error")
                    ? "bg-destructive/10 text-destructive"
                    : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                )}
              >
                {workspaceMessage}
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handlePrevious}
                disabled={activeStepIndex === 0 || isBusy}
                className="h-8"
              >
                <ArrowLeft className="size-3.5" />
                Previous
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    void handleSaveProgress();
                  }}
                  disabled={isBusy}
                  className="h-8 text-xs text-muted-foreground"
                >
                  {isBusy ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : null}
                  Save draft
                </Button>

                {!isLastStep ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleNext}
                    disabled={isBusy}
                    className="h-8"
                  >
                    Next
                    <ArrowRight className="size-3.5" />
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      void handleComplete();
                    }}
                    disabled={missingFields.length > 0 || isBusy}
                    className="h-8"
                  >
                    {isBusy ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Check className="size-3.5" />
                    )}
                    {selectedFinancialFiles.length
                      ? "Save & upload financials"
                      : "Save & finish"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        <JerseyGuidedSidebar
          steps={steps}
          activeStepId={resolvedActiveStep.id}
          entityName={selectedReturn.entityName}
          draftForm={draftForm}
          missingFields={missingFields}
          missingBySection={missingBySection}
          progressRatio={progressRatio}
          uploadReady={uploadReady}
          assignedFinancialStatementsFile={assignedFinancialStatementsFile}
          selectedFinancialStatementsName={selectedFinancialStatementsName}
          onStepChange={handleStepChange}
        />
      </div>
    </div>
  );
}
