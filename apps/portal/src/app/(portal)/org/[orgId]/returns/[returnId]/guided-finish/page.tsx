"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";

import { uploadPortalFile } from "@/lib/portal-upload";
import { DirectionalTransition } from "@/components/view-transitions";
import { useNavigateWithTransition } from "@/lib/navigate-with-transition";
import {
  FORM_SECTIONS,
  getMissingFields,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  asVaultFiles,
  isPdfLike,
  normalizeStatus,
  sanitizeFormData,
} from "../_components/return-workspace-shared";

import { buildSteps, FINAL_STEP_ID } from "./_components/guided-sidebar";
import { GuidedSidebar } from "./_components/guided-sidebar";
import { GuidedStepContent } from "./_components/guided-step-content";

export default function GuidedFinishPage() {
  const params = useParams<{ orgId: string; returnId: string }>();
  const orgId = params.orgId;
  const returnId = params.returnId;
  const navigate = useNavigateWithTransition();

  const contentRef = useRef<HTMLDivElement | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [selectedFinancialFiles, setSelectedFinancialFiles] = useState<File[]>(
    [],
  );
  const [financialStatementsIndex, setFinancialStatementsIndex] = useState<
    number | null
  >(null);
  const [draftForm, setDraftForm] = useState<Partial<SubstanceFormData>>({});
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);

  const utils = api.useUtils();
  const orgQuery = api.portalAccess.getOrg.useQuery({ orgId }, { enabled: !!orgId });

  const returnsQuery = api.portalReturns.listByOrg.useQuery(
    { orgId },
    { enabled: !!orgId },
  );

  const selectedReturn = useMemo(
    () => (returnsQuery.data ?? []).find((row) => row.id === returnId) ?? null,
    [returnId, returnsQuery.data],
  );
  const selectedStatus = selectedReturn
    ? normalizeStatus(selectedReturn.status)
    : "pending";
  const isGuernseyEsrLocked = Boolean(
    selectedReturn?.jurisdictionCode === "GG" &&
      selectedReturn?.returnType === "economic_substance" &&
      selectedStatus === "completed",
  );
  const guernseyLockMessage =
    "This Guernsey ESR is locked because the return is already completed in the Guernsey Tax Portal.";

  const createSubstanceFormMutation =
    api.portalReturns.createSubstanceForm.useMutation({
      onSuccess: () => {
        if (!selectedReturn) return;
        void utils.portalReturns.getSubstanceForm.invalidate({
          orgId,
          taxReturnId: selectedReturn.id,
        });
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });

  const updateSubstanceFormMutation =
    api.portalReturns.updateSubstanceForm.useMutation({
      onSuccess: () => {
        if (!selectedReturn) return;
        void utils.portalReturns.getSubstanceForm.invalidate({
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

  const substanceFormQuery = api.portalReturns.getSubstanceForm.useQuery(
    {
      orgId,
      taxReturnId: selectedReturn?.id ?? "",
    },
    {
      enabled: !!selectedReturn,
    },
  );

  useEffect(() => {
    const sanitized = sanitizeFormData(substanceFormQuery.data);
    // Auto-fill preparedBy from org accounting name if empty
    if (!sanitized.preparedBy) {
      const accountingName = orgQuery.data?.accountName ?? orgQuery.data?.name;
      if (accountingName) sanitized.preparedBy = accountingName;
    }
    setDraftForm(sanitized);
  }, [substanceFormQuery.data, selectedReturn?.id, orgQuery.data]);

  const visibleSections = useMemo(
    () =>
      FORM_SECTIONS.filter((section) => {
        if (!("conditional" in section) || !section.conditional) {
          return true;
        }
        return section.conditional(draftForm);
      }),
    [draftForm],
  );

  const draftMissingFields = useMemo(
    () => getMissingFields(draftForm),
    [draftForm],
  );

  const selectedFiles = asVaultFiles(selectedReturn?.files);
  const assignedFinancialStatementsFile =
    selectedFiles.find((file) => file.role === "financial_statements") ?? null;

  const steps = useMemo(() => buildSteps(visibleSections), [visibleSections]);

  const initialStepId = useMemo(() => {
    const firstMissingSection = visibleSections.find((section) =>
      section.fields.some((field) => draftMissingFields.includes(field)),
    );

    if (firstMissingSection) return firstMissingSection.id;
    if (!assignedFinancialStatementsFile) return FINAL_STEP_ID;
    return visibleSections[0]?.id ?? FINAL_STEP_ID;
  }, [assignedFinancialStatementsFile, draftMissingFields, visibleSections]);

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
  const isSaving = updateSubstanceFormMutation.isPending;
  const isInitializing = createSubstanceFormMutation.isPending;
  const isUploading = addDocumentsMutation.isPending;
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

  const resolvedActiveStep =
    activeStep ??
    ({
      id: FINAL_STEP_ID,
      kind: "upload" as const,
      title: "Financial Pack",
      description: "Upload signed financial statements for the filing.",
    });

  const selectedFinancialStatementsName =
    financialStatementsIndex !== null
      ? (selectedFinancialFiles[financialStatementsIndex]?.name ?? null)
      : null;

  const showMessage = (message: string) => setWorkspaceMessage(message);

  const ensureSubstanceFormExists = async () => {
    if (!selectedReturn || substanceFormQuery.data) return;
    if (isGuernseyEsrLocked) {
      throw new Error(guernseyLockMessage);
    }
    await createSubstanceFormMutation.mutateAsync({
      orgId,
      taxReturnId: selectedReturn.id,
    });
  };

  const persistFormData = async (
    data: Partial<SubstanceFormData>,
    successMessage?: string,
  ) => {
    if (!selectedReturn) return;
    if (isGuernseyEsrLocked) {
      showMessage(guernseyLockMessage);
      return;
    }
    await ensureSubstanceFormExists();
    await updateSubstanceFormMutation.mutateAsync({
      orgId,
      taxReturnId: selectedReturn.id,
      data: sanitizeFormData(data),
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
      if (isGuernseyEsrLocked) {
        showMessage(guernseyLockMessage);
        return;
      }
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
      if (isGuernseyEsrLocked) {
        showMessage(guernseyLockMessage);
        return;
      }
      showMessage("Saving guided return...");
      const finalData = { ...draftForm };
      if (!finalData.preparedBy) {
        const accountingName = orgQuery.data?.accountName ?? orgQuery.data?.name;
        if (accountingName) finalData.preparedBy = accountingName;
      }
      await persistFormData(finalData);

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

      navigate(`/org/${orgId}/returns/${returnId}`, "nav-back");
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
      <DirectionalTransition>
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
            {/* Footer skeleton */}
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
              {Array.from({ length: 8 }).map((_, i) => (
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
      </DirectionalTransition>
    );
  }

  if (!selectedReturn) {
    return (
      <DirectionalTransition>
      <div className="flex h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Return not found in this organization.
          </p>
          <Button
            className="mt-4"
            variant="outline"
            size="sm"
            onClick={() => navigate(`/org/${orgId}/returns`, "nav-back")}
          >
            <ArrowLeft className="size-3.5" />
            Back to returns
          </Button>
        </div>
      </div>
      </DirectionalTransition>
    );
  }

  const isLastStep = activeStepIndex === totalSteps - 1;

  return (
    <DirectionalTransition>
    <div className="-m-4 sm:-m-6 flex h-[calc(100vh-3.5rem)] flex-col overflow-hidden">
      <div className="relative grid h-full min-h-0 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-h-0 flex-col">
          {isGuernseyEsrLocked ? (
            <div className="border-b border-emerald-500/20 bg-emerald-500/10 px-6 py-3 text-sm text-emerald-800">
              {guernseyLockMessage}
            </div>
          ) : null}
          <GuidedStepContent
            contentRef={contentRef}
            resolvedActiveStep={resolvedActiveStep}
            activeStepIndex={activeStepIndex}
            totalSteps={totalSteps}
            entityName={selectedReturn.entityName}
            taxYear={selectedReturn.taxYear}
            draftForm={draftForm}
            setDraftForm={setDraftForm}
            draftMissingFields={draftMissingFields}
            missingFieldsByStep={missingFieldsByStep}
            sectionStepIndexByField={sectionStepIndexByField}
            selectedFinancialFiles={selectedFinancialFiles}
            setSelectedFinancialFiles={setSelectedFinancialFiles}
            financialStatementsIndex={financialStatementsIndex}
            setFinancialStatementsIndex={setFinancialStatementsIndex}
            selectedFinancialStatementsName={selectedFinancialStatementsName}
            assignedFinancialStatementsFile={assignedFinancialStatementsFile}
            onStepChange={handleStepChange}
            readOnly={isGuernseyEsrLocked}
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
                  disabled={isBusy || isGuernseyEsrLocked}
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
                    disabled={
                      draftMissingFields.length > 0 ||
                      isBusy ||
                      isGuernseyEsrLocked
                    }
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

        <GuidedSidebar
          steps={steps}
          activeStepId={resolvedActiveStep.id}
          entityName={selectedReturn.entityName}
          draftForm={draftForm}
          draftMissingFields={draftMissingFields}
          visibleSections={visibleSections}
          progressRatio={progressRatio}
          uploadReady={uploadReady}
          assignedFinancialStatementsFile={assignedFinancialStatementsFile}
          selectedFinancialStatementsName={selectedFinancialStatementsName}
          missingFieldsByStep={missingFieldsByStep}
          onStepChange={handleStepChange}
        />
      </div>
    </div>
    </DirectionalTransition>
  );
}
