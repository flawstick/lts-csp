"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { uploadPortalFile } from "@/lib/portal-upload";
import { trackPortalRecentReturn } from "@/lib/portal-recent";
import {
  FORM_SECTIONS,
  getMissingFields,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { api } from "@/trpc/react";
import { ReturnWorkspacePageSkeleton } from "@/components/return-workspace-skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { ReturnFilesTab } from "./_components/return-files-tab";
import { ReturnFormTab } from "./_components/return-form-tab";
import { JerseyReturnWorkspace } from "./_components/jersey-return-workspace";
import { ReturnWorkspaceHeader } from "./_components/return-workspace-header";
import {
  asVaultFiles,
  isPdfLike,
  normalizeStatus,
  sanitizeFormData,
  type SectionId,
  type WorkspaceTab,
} from "./_components/return-workspace-shared";

export default function ReturnWorkspacePage() {
  const params = useParams<{ orgId: string; returnId: string }>();
  const orgId = params.orgId;
  const returnId = params.returnId;
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
  const [uploadedFileUrls, setUploadedFileUrls] = useState<Array<{
    name: string;
    url: string;
    type: string;
  }> | null>(null);

  const recentTrackedRef = useRef<string | null>(null);
  const aiExtractionLockRef = useRef(false);

  const utils = api.useUtils();
  const returnsQuery = api.portalReturns.listByOrg.useQuery(
    { orgId },
    { enabled: !!orgId },
  );

  const dismissMutation = api.portalReturns.dismissReturn.useMutation({
    onSuccess: () => {
      void utils.portalReturns.listByOrg.invalidate({ orgId });
      toast.success("Return dismissed");
    },
  });

  const undismissMutation = api.portalReturns.undismissReturn.useMutation({
    onSuccess: () => {
      void utils.portalReturns.listByOrg.invalidate({ orgId });
      toast.success("Return restored");
    },
  });

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

  const assignDocumentRoleMutation =
    api.portalReturns.assignReturnDocumentRole.useMutation({
      onSuccess: () => {
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });

  const removeDocumentMutation =
    api.portalReturns.removeReturnDocument.useMutation({
      onSuccess: () => {
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });

  const extractSubstanceFormMutation =
    api.portalReturns.extractSubstanceFormFromFiles.useMutation({
      onSuccess: () => {
        void utils.portalReturns.listByOrg.invalidate({ orgId });
        if (!selectedReturn) return;
        void utils.portalReturns.getSubstanceForm.invalidate({
          orgId,
          taxReturnId: selectedReturn.id,
        });
      },
    });

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
    if (!selectedReturn?.id || recentTrackedRef.current === selectedReturn.id) {
      return;
    }

    recentTrackedRef.current = selectedReturn.id;
    void trackPortalRecentReturn({
      orgId,
      returnId: selectedReturn.id,
    }).finally(() => {
      void utils.portalReturns.sidebarJurisdictions.invalidate({ orgId });
    });
  }, [orgId, selectedReturn?.id, utils.portalReturns.sidebarJurisdictions]);

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
            orgId,
            taxReturnId: selectedReturn.id,
            file,
            category: isPdfLike(file) ? "financial" : "supporting",
          }),
        ),
      );

      await addDocumentsMutation.mutateAsync({
        orgId,
        taxReturnId: selectedReturn.id,
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
        orgId,
        taxReturnId: selectedReturn.id,
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
        orgId,
        taxReturnId: selectedReturn.id,
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
        orgId,
        taxReturnId: selectedReturn.id,
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
        orgId,
        taxReturnId: selectedReturn.id,
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
        orgId,
        taxReturnId: selectedReturn.id,
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

  if (returnsQuery.isLoading) {
    return <ReturnWorkspacePageSkeleton />;
  }

  if (returnsQuery.error) {
    return <p className="text-sm text-red-600">{returnsQuery.error.message}</p>;
  }

  if (!selectedReturn) {
    return (
      <main className="mx-auto max-w-3xl space-y-4">
        <section className="portal-card rounded-[1.8rem] px-8 py-10 text-center">
          <p className="text-lg font-semibold">
            Return not found in this organization.
          </p>
          <p className="text-muted-foreground mt-2 text-sm">
            It may have been removed or you may not have access.
          </p>
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => router.push(`/org/${orgId}/returns`)}
          >
            <ArrowLeft className="size-4" />
            Back to returns
          </Button>
        </section>
      </main>
    );
  }

  if (
    selectedReturn.jurisdictionCode === "JE" &&
    selectedReturn.returnType === "company"
  ) {
    return (
      <JerseyReturnWorkspace
        orgId={orgId}
        selectedReturn={selectedReturn}
        selectedStatus={selectedStatus}
        onDismiss={() =>
          dismissMutation.mutate({ orgId, taxReturnId: selectedReturn.id })
        }
        onUndismiss={() =>
          undismissMutation.mutate({ orgId, taxReturnId: selectedReturn.id })
        }
        isDismissing={dismissMutation.isPending || undismissMutation.isPending}
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
            router.push(`/org/${orgId}/returns/${returnId}/guided-finish`);
          }}
          isReadOnly={isGuernseyEsrLocked}
          readOnlyMessage={guernseyLockMessage}
          onDismiss={() =>
            dismissMutation.mutate({ orgId, taxReturnId: returnId })
          }
          onUndismiss={() =>
            undismissMutation.mutate({ orgId, taxReturnId: returnId })
          }
          isDismissing={
            dismissMutation.isPending || undismissMutation.isPending
          }
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
