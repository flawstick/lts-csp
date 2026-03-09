"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
} from "lucide-react";

import { uploadPortalFile } from "@/lib/portal-upload";
import {
  FORM_SECTIONS,
  getMissingFields,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { api } from "@/trpc/react";
import { ReturnWorkspacePageSkeleton } from "@/components/return-workspace-skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  asVaultFiles,
  isPdfLike,
  sanitizeFormData,
} from "../_components/return-workspace-shared";

import { buildSteps, FINAL_STEP_ID } from "./_components/guided-sidebar";
import { GuidedSidebar } from "./_components/guided-sidebar";
import { GuidedStepContent } from "./_components/guided-step-content";

export default function GuidedFinishPage() {
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
  const [draftForm, setDraftForm] = useState<Partial<SubstanceFormData>>({});
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
    setDraftForm(sanitizeFormData(substanceFormQuery.data));
  }, [substanceFormQuery.data, selectedReturn?.id]);

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

  const goBack = () => router.push(`/org/${orgId}/returns/${returnId}`);

  if (returnsQuery.isLoading) {
    return <ReturnWorkspacePageSkeleton />;
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
      <div className="relative grid h-full min-h-0 lg:grid-cols-[18rem_minmax(0,1fr)] xl:grid-cols-[20rem_minmax(0,1fr)]">
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
          onBack={goBack}
        />

        <div className="flex min-h-0 flex-col">
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
                    disabled={draftMissingFields.length > 0 || isBusy}
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
      </div>
    </div>
  );
}
