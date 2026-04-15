"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";

import { uploadPortalFile } from "@/lib/portal-upload";
import {
  FORM_SECTIONS,
  getMissingFields,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { api } from "@/trpc/react";
import { ReturnWorkspacePageSkeleton } from "@/components/return-workspace-skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { JerseyReturnWorkspace } from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/jersey-return-workspace";
import { ReturnFilesTab } from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/return-files-tab";
import { ReturnFormTab } from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/return-form-tab";
import { ReturnWorkspaceHeader } from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/return-workspace-header";
import {
  asVaultFiles,
  normalizeStatus,
  sanitizeFormData,
  type PortalReturnRecord,
  type SectionId,
  type WorkspaceTab,
} from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/return-workspace-shared";

export default function ClientAccessWorkspacePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("form");
  const [activeSectionId, setActiveSectionId] = useState<SectionId>(
    FORM_SECTIONS[0].id,
  );
  const [draftForm, setDraftForm] = useState<Partial<SubstanceFormData>>({});
  const [savingSection, setSavingSection] = useState(false);
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isAiExtractionRunning, setIsAiExtractionRunning] = useState(false);
  const [uploadedFileUrls, setUploadedFileUrls] = useState<
    Array<{ name: string; url: string; type: string }> | null
  >(null);

  const aiExtractionLockRef = useRef(false);

  const accessQuery = api.clientAccess.getAccess.useQuery({ token });
  const utils = api.useUtils();

  const selectedReturn = (accessQuery.data?.return ?? null) as
    | PortalReturnRecord
    | null;

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

  const assignDocumentRoleMutation =
    api.clientAccess.assignReturnDocumentRole.useMutation({
      onSuccess: () => {
        void utils.clientAccess.getAccess.invalidate({ token });
      },
    });

  const removeDocumentMutation =
    api.clientAccess.removeReturnDocument.useMutation({
      onSuccess: () => {
        void utils.clientAccess.getAccess.invalidate({ token });
      },
    });

  const extractSubstanceFormMutation =
    api.clientAccess.extractSubstanceFormFromFiles.useMutation({
      onSuccess: () => {
        void utils.clientAccess.getAccess.invalidate({ token });
        void utils.clientAccess.getSubstanceForm.invalidate({ token });
      },
    });

  const substanceFormQuery = api.clientAccess.getSubstanceForm.useQuery(
    { token },
    {
      enabled: accessQuery.data?.return.jurisdictionCode === "GG",
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

  useEffect(() => {
    if (visibleSections.some((section) => section.id === activeSectionId)) {
      return;
    }

    setActiveSectionId(visibleSections[0]?.id ?? FORM_SECTIONS[0].id);
  }, [activeSectionId, visibleSections]);

  const activeSection = useMemo(
    () =>
      visibleSections.find((section) => section.id === activeSectionId) ?? null,
    [activeSectionId, visibleSections],
  );

  const selectedFiles = asVaultFiles(selectedReturn?.files);
  const isAiExtractionPending =
    isAiExtractionRunning || extractSubstanceFormMutation.isPending;
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
  const draftMissingFields = useMemo(
    () => getMissingFields(draftForm),
    [draftForm],
  );

  const showMessage = (message: string) => {
    const isError =
      message.toLowerCase().includes("unable") ||
      message.toLowerCase().includes("error");
    const isLoading =
      message.endsWith("...") ||
      message.toLowerCase().includes("saving") ||
      message.toLowerCase().includes("clearing") ||
      message.toLowerCase().includes("uploading") ||
      message.toLowerCase().includes("running") ||
      message.toLowerCase().includes("processing");
    if (isError) {
      toast.error(message, { id: "return-action" });
    } else if (isLoading) {
      toast.loading(message, { id: "return-action" });
    } else {
      toast.success(message, { id: "return-action", duration: 3000 });
    }
  };

  const ensureSubstanceFormExists = async () => {
    if (!selectedReturn || substanceFormQuery.data) {
      return;
    }

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
      showMessage(guernseyLockMessage);
      return;
    }

    await ensureSubstanceFormExists();
    await updateSubstanceFormMutation.mutateAsync({
      token,
      data: sanitizeFormData(data),
    });

    if (successMessage) {
      showMessage(successMessage);
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!selectedReturn || !files.length) return;
    if (isGuernseyEsrLocked) {
      showMessage(guernseyLockMessage);
      return;
    }

    setIsUploadingFiles(true);
    setUploadedFileUrls(null);

    try {
      showMessage("Uploading files...");

      const uploaded = await Promise.all(
        files.map((file) =>
          uploadPortalFile({
            orgId: selectedReturn.orgId,
            taxReturnId: selectedReturn.id,
            file,
            category: file.type.includes("pdf") ? "financial" : "supporting",
            accessToken: token,
          }),
        ),
      );

      await addDocumentsMutation.mutateAsync({
        token,
        documents: uploaded,
      });

      toast.dismiss();
      toast.success(`${uploaded.length} file(s) uploaded.`);

      setUploadedFileUrls(
        uploaded.map((f) => ({ name: f.name, url: f.url, type: f.type })),
      );
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to upload files.",
      );
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const handleRunAiExtraction = async () => {
    if (
      !selectedReturn ||
      isGuernseyEsrLocked ||
      aiExtractionLockRef.current ||
      extractSubstanceFormMutation.isPending
    ) {
      if (isGuernseyEsrLocked) {
        showMessage(guernseyLockMessage);
      }
      return;
    }

    const extractionUrls = selectedFiles.map((file) => file.url);
    if (!extractionUrls.length) {
      showMessage("Upload ESR or financial files before running extraction.");
      return;
    }

    aiExtractionLockRef.current = true;
    setIsAiExtractionRunning(true);

    try {
      showMessage("Running AI extraction across workspace files...");
      const result = await extractSubstanceFormMutation.mutateAsync({
        token,
        fileUrls: extractionUrls,
      });
      setActiveTab("form");
      showMessage(
        `AI extraction complete. Updated ${result.extractedFields.length} field(s).`,
      );
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to run AI extraction right now.",
      );
    } finally {
      aiExtractionLockRef.current = false;
      setIsAiExtractionRunning(false);
    }
  };

  const handleAssignFinancialStatements = async (fileUrl: string) => {
    if (!selectedReturn) return;
    if (isGuernseyEsrLocked) {
      showMessage(guernseyLockMessage);
      return;
    }

    try {
      await assignDocumentRoleMutation.mutateAsync({
        token,
        fileUrl,
        role: "financial_statements",
      });
      setUploadedFileUrls(null);
      toast.dismiss();
      toast.success("Financial statements assigned.");
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to update file assignment.",
      );
    }
  };

  const handleUnassignFinancialStatements = async (fileUrl: string) => {
    if (!selectedReturn) return;
    if (isGuernseyEsrLocked) {
      showMessage(guernseyLockMessage);
      return;
    }

    try {
      await assignDocumentRoleMutation.mutateAsync({
        token,
        fileUrl,
        role: null,
      });
      toast.dismiss();
      toast.success("Financial statements unassigned.");
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to update file assignment.",
      );
    }
  };

  const handleRemoveDocument = async (fileUrl: string) => {
    if (!selectedReturn) return;
    if (isGuernseyEsrLocked) {
      showMessage(guernseyLockMessage);
      return;
    }

    try {
      await removeDocumentMutation.mutateAsync({
        token,
        fileUrl,
      });
      toast.dismiss();
      toast.success("File removed.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to remove file.",
      );
    }
  };

  const handleInitForm = async () => {
    try {
      await ensureSubstanceFormExists();
      showMessage("Substance form initialized.");
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to initialize the substance form.",
      );
    }
  };

  const handleClearForm = async () => {
    if (!selectedReturn) return;

    try {
      showMessage("Clearing form...");
      await ensureSubstanceFormExists();
      await updateSubstanceFormMutation.mutateAsync({
        token,
        data: {},
        clearForm: true,
      });
      setDraftForm({});
      showMessage("Form cleared.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to clear form.",
      );
    }
  };

  const handleSaveSection = async () => {
    if (!activeSection) return;

    const sectionPatch = Object.fromEntries(
      activeSection.fields.map((field) => [
        field,
        draftForm[field as keyof SubstanceFormData],
      ]),
    ) as Partial<SubstanceFormData>;

    setSavingSection(true);
    try {
      await persistFormData(sectionPatch, `${activeSection.title} saved.`);
      setIsSectionDialogOpen(false);
    } finally {
      setSavingSection(false);
    }
  };

  if (accessQuery.isLoading) {
    return <ReturnWorkspacePageSkeleton />;
  }

  if (accessQuery.error) {
    return <p className="text-sm text-red-600">{accessQuery.error.message}</p>;
  }

  if (!selectedReturn) {
    return (
      <section className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        Return not found for this access link.
      </section>
    );
  }

  if (
    selectedReturn.jurisdictionCode === "JE" &&
    selectedReturn.returnType === "company"
  ) {
    return (
      <JerseyReturnWorkspace
        orgId={selectedReturn.orgId}
        selectedReturn={selectedReturn}
        selectedStatus={selectedStatus}
        accessToken={token}
        onNavigateToGuidedFinish={() => {
          router.push(`/client-access/${token}/jersey-guided-finish`);
        }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-8">
      <div className="portal-card overflow-hidden rounded-[1.95rem]">
        <ReturnWorkspaceHeader
          activeSectionTitle={activeSection?.title ?? null}
          selectedReturn={selectedReturn}
          selectedStatus={selectedStatus}
          onOpenFinishSheet={() => {
            router.push(`/client-access/${token}/guided-finish`);
          }}
          isReadOnly={isGuernseyEsrLocked}
          readOnlyMessage={guernseyLockMessage}
        />
      </div>

      <div className="portal-card overflow-hidden rounded-[1.95rem]">
        <div className="px-5 py-5">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
            className="mt-0"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                  {activeTab === "form" ? "Structured ESR" : "Return documents"}
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {activeTab === "form"
                      ? "Substance Form"
                      : "Files & Documents"}
                  </h2>
                  {activeTab === "form" ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1",
                        Boolean(substanceFormQuery.data?.isComplete)
                          ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400"
                          : "bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-400",
                      )}
                    >
                      {Boolean(substanceFormQuery.data?.isComplete)
                        ? "Complete"
                        : "In progress"}
                    </span>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {activeTab === "form"
                    ? "Review extracted answers, edit the ESR sections, and finish the remaining required fields."
                    : "Upload the ESR, assign the financial statements PDF, and manage supporting return documents."}
                </p>
              </div>

              <TabsList className="w-fit border-none bg-transparent p-0">
                <TabsTrigger value="form">Substance Form</TabsTrigger>
                <TabsTrigger value="files">Files & Documents</TabsTrigger>
              </TabsList>
            </div>

            <ReturnFormTab
              draftForm={draftForm}
              setDraftForm={setDraftForm}
              visibleSections={visibleSections}
              activeSection={activeSection}
              activeSectionId={activeSectionId}
              setActiveSectionId={setActiveSectionId}
              substanceForm={substanceFormQuery.data ?? null}
              isSubstanceFormLoading={substanceFormQuery.isLoading}
              draftMissingFields={draftMissingFields}
              isSectionDialogOpen={isSectionDialogOpen}
              setIsSectionDialogOpen={setIsSectionDialogOpen}
              savingSection={savingSection}
              isUpdating={updateSubstanceFormMutation.isPending}
              isInitializing={createSubstanceFormMutation.isPending}
              isReadOnly={isGuernseyEsrLocked}
              readOnlyMessage={guernseyLockMessage}
              onInitForm={() => {
                void handleInitForm();
              }}
              onSaveSection={() => {
                void handleSaveSection();
              }}
              onClearForm={() => {
                void handleClearForm();
              }}
            />

            <ReturnFilesTab
              selectedReturnId={selectedReturn.id}
              selectedFiles={selectedFiles}
              hasFinancialStatements={selectedFiles.some(
                (f) => f.role === "financial_statements",
              )}
              isUploading={isUploadingFiles}
              isExtractPending={isAiExtractionPending}
              isAssignPending={assignDocumentRoleMutation.isPending}
              uploadedFileUrls={uploadedFileUrls}
              isReadOnly={isGuernseyEsrLocked}
              readOnlyMessage={guernseyLockMessage}
              onUploadFiles={(files) => {
                void handleUploadFiles(files);
              }}
              onAssignFinancialStatements={(fileUrl) => {
                void handleAssignFinancialStatements(fileUrl);
              }}
              onDismissAssignment={() => setUploadedFileUrls(null)}
              onRunAiExtraction={() => {
                void handleRunAiExtraction();
              }}
              onRemoveDocument={(fileUrl) => {
                void handleRemoveDocument(fileUrl);
              }}
              onUnassignFinancialStatements={(fileUrl) => {
                void handleUnassignFinancialStatements(fileUrl);
              }}
            />
          </Tabs>
        </div>
      </div>
    </main>
  );
}
