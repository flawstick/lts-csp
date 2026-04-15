"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";

import { uploadPortalFile } from "@/lib/portal-upload";
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
} from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/return-workspace-shared";
import { buildSteps, FINAL_STEP_ID } from "../../../../(portal)/org/[orgId]/returns/[returnId]/guided-finish/_components/guided-sidebar";
import { GuidedSidebar } from "../../../../(portal)/org/[orgId]/returns/[returnId]/guided-finish/_components/guided-sidebar";
import { GuidedStepContent } from "../../../../(portal)/org/[orgId]/returns/[returnId]/guided-finish/_components/guided-step-content";

export default function ClientAccessGuidedFinishPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
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
  const accessQuery = api.clientAccess.getAccess.useQuery({ token });
  const selectedReturn = accessQuery.data?.return ?? null;
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
    api.clientAccess.createSubstanceForm.useMutation({
      onSuccess: () => {
        void utils.clientAccess.getSubstanceForm.invalidate({ token });
        void utils.clientAccess.getAccess.invalidate({ token });
      },
    });

  const updateSubstanceFormMutation =
    api.clientAccess.updateSubstanceForm.useMutation({
      onSuccess: () => {
        void utils.clientAccess.getSubstanceForm.invalidate({ token });
        void utils.clientAccess.getAccess.invalidate({ token });
      },
    });

  const addDocumentsMutation = api.clientAccess.addReturnDocuments.useMutation({
    onSuccess: () => {
      void utils.clientAccess.getAccess.invalidate({ token });
    },
  });

  const substanceFormQuery = api.clientAccess.getSubstanceForm.useQuery(
    { token },
    {
      enabled: accessQuery.data?.return.jurisdictionCode === "GG",
    },
  );

  useEffect(() => {
    const sanitized = sanitizeFormData(substanceFormQuery.data);
    if (!sanitized.preparedBy) {
      const accountingName =
        accessQuery.data?.organisation.accountName ??
        accessQuery.data?.organisation.name;
      if (accountingName) sanitized.preparedBy = accountingName;
    }
    setDraftForm(sanitized);
  }, [substanceFormQuery.data, accessQuery.data?.organisation, selectedReturn?.id]);

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
      title: "Financial Pack",
      description: "Upload signed financial statements for the filing.",
      kind: "upload",
    } as const);

  const ensureSubstanceFormExists = async () => {
    if (substanceFormQuery.data) return;

    if (isGuernseyEsrLocked) {
      throw new Error(guernseyLockMessage);
    }

    await createSubstanceFormMutation.mutateAsync({ token });
  };

  const persistFormData = async (
    data: Partial<SubstanceFormData>,
    successMessage?: string,
  ) => {
    if (!selectedReturn) return;
    if (isGuernseyEsrLocked) {
      setWorkspaceMessage(guernseyLockMessage);
      return;
    }

    await ensureSubstanceFormExists();
    await updateSubstanceFormMutation.mutateAsync({
      token,
      data: sanitizeFormData(data),
    });

    if (successMessage) setWorkspaceMessage(successMessage);
  };

  const handleUploadFinancialStatements = async () => {
    const selectedFile =
      financialStatementsIndex !== null
        ? selectedFinancialFiles[financialStatementsIndex]
        : null;

    if (!selectedReturn || !selectedFile) return;
    if (isGuernseyEsrLocked) {
      setWorkspaceMessage(guernseyLockMessage);
      return;
    }

    const uploaded = await uploadPortalFile({
      orgId: selectedReturn.orgId,
      taxReturnId: selectedReturn.id,
      file: selectedFile,
      category: "financial",
      accessToken: token,
    });

    await addDocumentsMutation.mutateAsync({
      token,
      documents: [
        {
          ...uploaded,
          role: "financial_statements",
        },
      ],
    });

    setSelectedFinancialFiles([]);
    setFinancialStatementsIndex(null);
    setWorkspaceMessage("Financial statements uploaded.");
  };

  if (accessQuery.isLoading) {
    return <Skeleton className="h-[680px] rounded-2xl" />;
  }

  if (accessQuery.error || !selectedReturn) {
    return (
      <section className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {accessQuery.error?.message ?? "The return could not be loaded."}
      </section>
    );
  }

  if (selectedReturn.jurisdictionCode !== "GG") {
    return (
      <section className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Guided finish is currently available for Guernsey returns only.
      </section>
    );
  }

  return (
    <main className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <GuidedSidebar
        entityName={selectedReturn.entityName}
        activeStepId={resolvedActiveStep.id}
        steps={steps}
        draftForm={draftForm}
        draftMissingFields={draftMissingFields}
        visibleSections={visibleSections}
        uploadReady={uploadReady}
        assignedFinancialStatementsFile={assignedFinancialStatementsFile}
        selectedFinancialStatementsName={
          financialStatementsIndex !== null
            ? (selectedFinancialFiles[financialStatementsIndex]?.name ?? null)
            : null
        }
        missingFieldsByStep={missingFieldsByStep}
        progressRatio={progressRatio}
        onStepChange={(stepId: string) => {
          setActiveStepId(stepId);
          requestAnimationFrame(() => {
            contentRef.current?.scrollIntoView({ behavior: "smooth" });
          });
        }}
      />

      <section
        ref={contentRef}
        className="rounded-[1.8rem] border bg-card px-6 py-6 shadow-xs"
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Guided finish
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">
                {resolvedActiveStep.title}
              </h1>
              {resolvedActiveStep.description ? (
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  {resolvedActiveStep.description}
                </p>
              ) : null}
            </div>

            <Button
              variant="outline"
              onClick={() => router.push(`/client-access/${token}/workspace`)}
            >
              <ArrowLeft className="size-4" />
              Back to workspace
            </Button>
          </div>

          {workspaceMessage ? (
            <div
              className={cn(
                "rounded-xl border px-4 py-3 text-sm",
                workspaceMessage === guernseyLockMessage
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-800"
                  : "border-border/70 bg-muted/30",
              )}
            >
              {workspaceMessage}
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
            selectedFinancialStatementsName={
              financialStatementsIndex !== null
                ? (selectedFinancialFiles[financialStatementsIndex]?.name ?? null)
                : null
            }
            assignedFinancialStatementsFile={assignedFinancialStatementsFile}
            onStepChange={(stepId: string) => {
              setActiveStepId(stepId);
            }}
            readOnly={isGuernseyEsrLocked}
          />

          {resolvedActiveStep.kind === "upload" ? (
            <div className="border-t pt-4">
              <Button
                disabled={isBusy || !uploadReady || isGuernseyEsrLocked}
                onClick={() => {
                  void handleUploadFinancialStatements();
                }}
              >
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Upload financial statements
              </Button>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <Button
              variant="outline"
              disabled={activeStepIndex <= 0 || isBusy}
              onClick={() => {
                const previousStep = steps[activeStepIndex - 1];
                if (previousStep) setActiveStepId(previousStep.id);
              }}
            >
              <ArrowLeft className="size-4" />
              Previous
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                disabled={isBusy || isGuernseyEsrLocked}
                onClick={() => {
                  const currentSection = visibleSections.find(
                    (section) => section.id === resolvedActiveStep.id,
                  );

                  if (!currentSection) {
                    setWorkspaceMessage("Final review saved.");
                    return;
                  }

                  const patch = Object.fromEntries(
                    currentSection.fields.map((field) => [
                      field,
                      draftForm[field as keyof SubstanceFormData],
                    ]),
                  ) as Partial<SubstanceFormData>;

                  void persistFormData(patch, `${currentSection.title} saved.`);
                }}
              >
                {isBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Check className="size-4" />
                )}
                Save
              </Button>

              <Button
                disabled={activeStepIndex >= steps.length - 1 || isBusy}
                onClick={() => {
                  const nextStep = steps[activeStepIndex + 1];
                  if (nextStep) setActiveStepId(nextStep.id);
                }}
              >
                Next
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
