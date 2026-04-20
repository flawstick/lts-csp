"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";

import {
  JERSEY_FORM_SECTION_LABELS,
  getJerseyCompanyReturnMissingFields,
  sanitizeJerseyCompanyReturnData,
} from "@/lib/schemas/jersey-company-return";
import {
  FIELD_LABELS,
  FORM_SECTIONS,
  getMissingFields,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { resolveGuernseyCertificateType } from "@repo/database/guernsey-filing";
import { uploadPortalFile } from "@/lib/portal-upload";
import { api } from "@/trpc/react";
import { ReturnWorkspacePageSkeleton } from "@/components/return-workspace-skeleton";
import { Button } from "@/components/ui/button";
import { ReturnFormFields } from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/return-form-fields";
import {
  asVaultFiles,
  formatBytes,
  getSectionCompletion,
  isPdfLike,
  normalizeStatus,
  previewValue,
  sanitizeFormData,
  STATUS_CLASS,
  STATUS_LABEL,
  type SectionId,
  type VaultFile,
} from "../../../../(portal)/org/[orgId]/returns/[returnId]/_components/return-workspace-shared";

type WorkspaceTab = "form" | "documents";

function StatusBadge({ status }: { status: string }) {
  const normalized = normalizeStatus(status);

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1 ${STATUS_CLASS[normalized]}`}
    >
      {STATUS_LABEL[normalized]}
    </span>
  );
}

function RoleBadge({ file }: { file: VaultFile }) {
  const isSupersededFiledReturnPdf =
    file.role !== "filed_return_pdf" &&
    file.metadata?.kind === "filed_return_pdf" &&
    typeof file.metadata?.supersededAt === "string";

  if (file.role === "financial_statements") {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        Financial statements
      </span>
    );
  }

  if (file.role === "filed_return_pdf") {
    return (
      <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
        Filed return PDF
      </span>
    );
  }

  if (isSupersededFiledReturnPdf) {
    return (
      <span className="inline-flex items-center rounded-full border border-border bg-background px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
        Superseded filed PDF
      </span>
    );
  }

  return null;
}

function StatCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string | number;
  helper?: string;
}) {
  return (
    <div className="client-access-stat">
      <p className="client-access-stat-label">{label}</p>
      <p className="client-access-stat-value">{value}</p>
      {helper ? <p className="mt-1 text-xs text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function EmptyFormState({
  title,
  description,
  onInitialize,
  isPending,
  primaryActionLabel = "Initialize form",
}: {
  title: string;
  description: string;
  onInitialize: () => void;
  isPending: boolean;
  primaryActionLabel?: string;
}) {
  return (
    <section className="client-access-card">
      <div className="max-w-2xl space-y-3">
        <p className="client-access-kicker">Form setup</p>
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button onClick={onInitialize} disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {primaryActionLabel}
        </Button>
      </div>
    </section>
  );
}

function DocumentsPanel({
  guidedFinishHref,
  selectedFiles,
  isReadOnly,
  readOnlyMessage,
  isUploadingFiles,
  isExtractPending,
  showAiExtraction,
  requireFinancialStatements,
  uploadDescription,
  uploadedFilesDescription,
  onUploadFiles,
  onRunAiExtraction,
  onAssignFinancialStatements,
  onUnassignFinancialStatements,
  onRemoveDocument,
}: {
  guidedFinishHref: string | null;
  selectedFiles: VaultFile[];
  isReadOnly: boolean;
  readOnlyMessage?: string;
  isUploadingFiles: boolean;
  isExtractPending: boolean;
  showAiExtraction: boolean;
  requireFinancialStatements: boolean;
  uploadDescription?: string;
  uploadedFilesDescription?: string;
  onUploadFiles: (files: File[]) => void;
  onRunAiExtraction: () => void;
  onAssignFinancialStatements: (fileUrl: string) => void;
  onUnassignFinancialStatements: (fileUrl: string) => void;
  onRemoveDocument: (fileUrl: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isReadOnly) return;

    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) {
      onUploadFiles(files);
    }
  };

  const hasFinancialStatements = selectedFiles.some(
    (file) => file.role === "financial_statements",
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <section className="client-access-card">
        <div className="space-y-4">
          <div>
            <p className="client-access-kicker">Documents</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              Upload and organise return files
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {uploadDescription ??
                "Add signed accounts, ESR documents, and supporting material for this return."}
            </p>
          </div>

          {isReadOnly && readOnlyMessage ? (
            <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
              {readOnlyMessage}
            </div>
          ) : null}

          <label
            className={`client-access-upload ${isDragging ? "border-foreground bg-muted/40" : ""} ${isReadOnly ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget as Node)) return;
              setIsDragging(false);
            }}
            onDrop={handleDrop}
          >
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.xlsx,.xls,.csv,.zip,.doc,.docx"
              className="hidden"
              disabled={isReadOnly}
              onChange={(event) => {
                if (isReadOnly) {
                  event.target.value = "";
                  return;
                }

                const files = Array.from(event.target.files ?? []);
                if (files.length) {
                  onUploadFiles(files);
                }
                event.target.value = "";
              }}
            />

            <div className="mx-auto max-w-sm space-y-4">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-border bg-card">
                {isUploadingFiles ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <UploadCloud className="size-5" />
                )}
              </div>
              <div>
                <p className="text-sm font-semibold">
                  {isUploadingFiles
                    ? "Uploading files..."
                    : isReadOnly
                      ? "Uploads locked"
                      : "Drop files here or browse"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  PDF, Excel, CSV, ZIP, DOC and DOCX files are accepted.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={(event) => {
                  event.preventDefault();
                  inputRef.current?.click();
                }}
                disabled={isUploadingFiles || isReadOnly}
              >
                Choose files
              </Button>
            </div>
          </label>

          <div className="grid gap-2 text-xs text-muted-foreground">
            {requireFinancialStatements ? (
              <div className="rounded-xl border border-border bg-background px-3 py-3">
                Pick one PDF as the financial statements before filing.
              </div>
            ) : null}
            {showAiExtraction ? (
              <Button
                variant="outline"
                className="justify-start"
                disabled={!selectedFiles.length || isExtractPending || isReadOnly}
                onClick={onRunAiExtraction}
              >
                {isExtractPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Run AI extraction
              </Button>
            ) : null}
            {guidedFinishHref ? (
              <Link
                href={guidedFinishHref}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
              >
                Open guided finish
                <ArrowRight className="size-4" />
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <section className="client-access-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="client-access-kicker">Attached files</p>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">
              Current documents on this return
            </h2>
            {uploadedFilesDescription ? (
              <p className="mt-1 text-sm text-muted-foreground">
                {uploadedFilesDescription}
              </p>
            ) : null}
          </div>
          <span className="client-access-chip">{selectedFiles.length} file(s)</span>
        </div>

        {!selectedFiles.length ? (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-background px-4 py-10 text-center text-sm text-muted-foreground">
            No files uploaded yet.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {selectedFiles.map((file) => {
              const isManagedFiledReturnPdf =
                file.role === "filed_return_pdf" ||
                (file.metadata?.kind === "filed_return_pdf" &&
                  typeof file.metadata?.supersededAt === "string");

              return (
                <div
                  key={`${file.url}-${file.uploadedAt ?? file.name}`}
                  className="rounded-2xl border border-border bg-background px-4 py-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold">{file.name}</p>
                        <RoleBadge file={file} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatBytes(file.size)} ·{" "}
                        {file.uploadedAt
                          ? new Date(file.uploadedAt).toLocaleString()
                          : "Uploaded"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" asChild>
                        <a href={file.url} target="_blank" rel="noreferrer">
                          <ExternalLink className="size-4" />
                          View
                        </a>
                      </Button>

                      {!isManagedFiledReturnPdf && isPdfLike(file) ? (
                        file.role === "financial_statements" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isReadOnly}
                            onClick={() => onUnassignFinancialStatements(file.url)}
                          >
                            Unset financials
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={isReadOnly}
                            onClick={() => onAssignFinancialStatements(file.url)}
                          >
                            <Check className="size-4" />
                            Set as financials
                          </Button>
                        )
                      ) : null}

                      {!isManagedFiledReturnPdf ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={isReadOnly}
                          onClick={() => onRemoveDocument(file.url)}
                        >
                          <Trash2 className="size-4" />
                          Remove
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!hasFinancialStatements ? (
          <div className="mt-4 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
            Select one PDF as the financial statements so the filing workflow can use it.
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function ClientAccessWorkspacePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("form");
  const [activeSectionId, setActiveSectionId] = useState<SectionId>(
    FORM_SECTIONS[0].id,
  );
  const [draftForm, setDraftForm] = useState<Partial<SubstanceFormData>>({});
  const [savingSection, setSavingSection] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isAiExtractionRunning, setIsAiExtractionRunning] = useState(false);

  const aiExtractionLockRef = useRef(false);

  const utils = api.useUtils();
  const accessQuery = api.clientAccess.getAccess.useQuery({ token });
  const selectedReturn = accessQuery.data?.return ?? null;

  const substanceFormQuery = api.clientAccess.getSubstanceForm.useQuery(
    { token },
    {
      enabled: selectedReturn?.jurisdictionCode === "GG",
    },
  );

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

  const jerseyFormQuery = api.clientAccess.getJerseyCompanyReturnForm.useQuery(
    { token },
    {
      enabled:
        selectedReturn?.jurisdictionCode === "JE" &&
        selectedReturn.returnType === "company",
    },
  );

  const createJerseyFormMutation =
    api.clientAccess.createJerseyCompanyReturnForm.useMutation({
      onSuccess: () => {
        void utils.clientAccess.getJerseyCompanyReturnForm.invalidate({ token });
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

  useEffect(() => {
    setDraftForm(sanitizeFormData(substanceFormQuery.data));
  }, [substanceFormQuery.data, selectedReturn?.id]);

  const certificateResolution = useMemo(
    () =>
      resolveGuernseyCertificateType({
        metadata:
          selectedReturn?.metadata && typeof selectedReturn.metadata === "object"
            ? (selectedReturn.metadata as Record<string, unknown>)
            : null,
        savedCertificateType: substanceFormQuery.data?.certificateType ?? null,
      }),
    [selectedReturn?.metadata, substanceFormQuery.data?.certificateType],
  );

  const selectedFiles = asVaultFiles(selectedReturn?.files);
  const selectedStatus = selectedReturn
    ? normalizeStatus(selectedReturn.status)
    : "pending";
  const isGuernsey = selectedReturn?.jurisdictionCode === "GG";
  const isJerseyCompany =
    selectedReturn?.jurisdictionCode === "JE" &&
    selectedReturn.returnType === "company";
  const isGuernseyCertificateUnresolved =
    isGuernsey &&
    selectedReturn?.returnType === "economic_substance" &&
    certificateResolution.unresolved;
  const isCertificateTwo =
    certificateResolution.certificateType === "Certificate 2";
  const requiresFinancialStatements = isGuernsey && !isCertificateTwo;
  const isGuernseyEsrLocked = Boolean(
    selectedReturn?.jurisdictionCode === "GG" &&
      selectedReturn?.returnType === "economic_substance" &&
      selectedStatus === "completed",
  );
  const guernseyLockMessage =
    "This Guernsey ESR is locked because the return is already completed in the Guernsey Tax Portal.";

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

  const activeSection =
    visibleSections.find((section) => section.id === activeSectionId) ?? null;
  const draftMissingFields = useMemo(() => getMissingFields(draftForm), [draftForm]);
  const sectionReadyCount = visibleSections.filter(
    (section) => getSectionCompletion(section.fields, draftForm).missingRequired === 0,
  ).length;

  const jerseyForm = useMemo(
    () => sanitizeJerseyCompanyReturnData(jerseyFormQuery.data),
    [jerseyFormQuery.data],
  );
  const jerseyMissingFields = useMemo(
    () => getJerseyCompanyReturnMissingFields(jerseyForm),
    [jerseyForm],
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
      toast.error(message, { id: "client-access-workspace" });
    } else if (isLoading) {
      toast.loading(message, { id: "client-access-workspace" });
    } else {
      toast.success(message, {
        id: "client-access-workspace",
        duration: 3000,
      });
    }
  };

  const ensureSubstanceFormExists = async () => {
    if (!selectedReturn || substanceFormQuery.data) {
      return;
    }

    if (isGuernseyCertificateUnresolved) {
      throw new Error(
        "This return is still being prepared. LTS Tax must confirm whether it is Certificate 2 or Certificate 3 before the form can be initialized.",
      );
    }

    if (isGuernseyEsrLocked) {
      throw new Error(guernseyLockMessage);
    }

    await createSubstanceFormMutation.mutateAsync({ token });
  };

  const ensureJerseyFormExists = async () => {
    if (!selectedReturn || jerseyFormQuery.data) {
      return;
    }

    await createJerseyFormMutation.mutateAsync({ token });
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

      showMessage(`${uploaded.length} file(s) uploaded.`);
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
      isCertificateTwo ||
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
      showMessage("Financial statements assigned.");
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
      showMessage("Financial statements unassigned.");
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
      await removeDocumentMutation.mutateAsync({ token, fileUrl });
      showMessage("File removed.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to remove file.",
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
    } finally {
      setSavingSection(false);
    }
  };

  if (accessQuery.isLoading) {
    return <ReturnWorkspacePageSkeleton />;
  }

  if (accessQuery.error) {
    return (
      <section className="client-access-card text-sm text-red-600">
        {accessQuery.error.message}
      </section>
    );
  }

  if (!selectedReturn) {
    return (
      <section className="client-access-card text-sm text-muted-foreground">
        Return not found for this access link.
      </section>
    );
  }

  const guidedFinishHref = isGuernsey
    ? `/client-access/${token}/guided-finish`
    : isJerseyCompany
      ? `/client-access/${token}/jersey-guided-finish`
      : null;

  return (
    <main className="space-y-4 pb-8">
      <section className="client-access-card">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="client-access-kicker">Workspace</p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold tracking-tight">
                  {isGuernsey
                    ? "Complete the Guernsey return"
                    : isJerseyCompany
                      ? "Complete the Jersey return"
                      : "Manage this return"}
                </h2>
                <StatusBadge status={selectedReturn.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {isGuernseyCertificateUnresolved
                  ? "Upload supporting documents while LTS Tax confirms the correct Guernsey certificate type."
                  : isCertificateTwo
                    ? "Certificate 2 uses a reduced Guernsey flow with fixed defaults and no accounts upload requirement."
                    : "Use this workspace to manage documents and complete the return form."}
              </p>
            </div>

            <div className="client-access-stat-grid">
              <StatCard
                label="Files"
                value={selectedFiles.length}
                helper="Attached to this return"
              />
              <StatCard
                label={isGuernsey ? "Sections ready" : "Form state"}
                value={
                  isGuernsey
                    ? `${sectionReadyCount}/${visibleSections.length}`
                    : jerseyFormQuery.data
                      ? "Initialized"
                      : "Not started"
                }
                helper={
                  isGuernsey
                    ? `${draftMissingFields.length} required field(s) remaining`
                    : `${jerseyMissingFields.length} missing field(s)`
                }
              />
              <StatCard
                label="Return"
                value={selectedReturn.taxYear}
                helper={selectedReturn.jurisdictionName ?? "Jurisdiction"}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={`client-access-nav-link rounded-xl border ${activeTab === "form" ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted hover:text-foreground"}`}
              onClick={() => setActiveTab("form")}
            >
              <FileText className="size-4" />
              Form
            </button>
            <button
              type="button"
              className={`client-access-nav-link rounded-xl border ${activeTab === "documents" ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted hover:text-foreground"}`}
              onClick={() => setActiveTab("documents")}
            >
              <UploadCloud className="size-4" />
              Documents
            </button>
            {guidedFinishHref ? (
              <Button variant="outline" asChild>
                <Link href={guidedFinishHref}>
                  <FolderOpen className="size-4" />
                  Guided finish
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </section>

      {activeTab === "documents" ? (
        <DocumentsPanel
          guidedFinishHref={guidedFinishHref}
          selectedFiles={selectedFiles}
          isReadOnly={isGuernseyEsrLocked}
          readOnlyMessage={guernseyLockMessage}
          isUploadingFiles={isUploadingFiles}
          isExtractPending={isAiExtractionRunning || extractSubstanceFormMutation.isPending}
          showAiExtraction={isGuernsey && !isCertificateTwo}
          requireFinancialStatements={Boolean(requiresFinancialStatements)}
          uploadDescription={
            isCertificateTwo
              ? "Upload supporting documents if needed. Certificate 2 filings do not require financial statements upload."
              : undefined
          }
          uploadedFilesDescription={
            isCertificateTwo
              ? "Review supporting return documents. AI extraction is not required for Certificate 2."
              : undefined
          }
          onUploadFiles={handleUploadFiles}
          onRunAiExtraction={handleRunAiExtraction}
          onAssignFinancialStatements={handleAssignFinancialStatements}
          onUnassignFinancialStatements={handleUnassignFinancialStatements}
          onRemoveDocument={handleRemoveDocument}
        />
      ) : isGuernsey ? (
        isGuernseyCertificateUnresolved ? (
          <section className="client-access-card text-sm text-amber-900 dark:text-amber-200">
            LTS Tax is still confirming whether this filing is Certificate 2 or Certificate 3. You can upload documents from the Documents tab while that confirmation is completed.
          </section>
        ) : !substanceFormQuery.data ? (
          <EmptyFormState
            title="Create the Guernsey substance form"
            description={
              isCertificateTwo
                ? "Initialize the reduced Certificate 2 form here, then review the prefilled answers."
                : "Initialize the form first, then complete sections here or use the guided finish flow."
            }
            onInitialize={() => {
              void ensureSubstanceFormExists()
                .then(() => showMessage("Substance form initialized."))
                .catch((error) =>
                  showMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to initialize the substance form.",
                  ),
                );
            }}
            isPending={createSubstanceFormMutation.isPending}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,310px)_minmax(0,1fr)]">
            <section className="client-access-card xl:sticky xl:top-6 xl:self-start">
              <div className="space-y-4">
                <div>
                  <p className="client-access-kicker">Sections</p>
                  <h2 className="mt-2 text-lg font-semibold tracking-tight">
                    Return form
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {isCertificateTwo
                      ? "Review the reduced Certificate 2 defaults and only adjust anything exceptional."
                      : "Work section by section, then use guided finish for the final pass."}
                  </p>
                </div>

                <div className="client-access-section-list">
                  {visibleSections.map((section) => {
                    const completion = getSectionCompletion(section.fields, draftForm);
                    const isActive = section.id === activeSectionId;
                    const previewRows = section.fields.reduce<
                      Array<{ field: string; value: string }>
                    >((rows, field) => {
                      if (rows.length >= 2) return rows;
                      const preview = previewValue(
                        draftForm[field as keyof SubstanceFormData],
                      );
                      if (preview) {
                        rows.push({ field, value: preview });
                      }
                      return rows;
                    }, []);

                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSectionId(section.id)}
                        className={`client-access-section-button ${isActive ? "border-foreground bg-foreground text-background" : "hover:bg-muted"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{section.title}</p>
                            <p
                              className={`mt-1 text-xs ${isActive ? "text-background/75" : "text-muted-foreground"}`}
                            >
                              {section.description}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${completion.missingRequired === 0 ? isActive ? "bg-background/15 text-background" : "bg-emerald-500/10 text-emerald-700" : isActive ? "bg-background/15 text-background" : "bg-amber-500/10 text-amber-700"}`}
                          >
                            {completion.missingRequired === 0
                              ? "Ready"
                              : `${completion.missingRequired} missing`}
                          </span>
                        </div>

                        {previewRows.length ? (
                          <div
                            className={`mt-3 space-y-1 text-[11px] ${isActive ? "text-background/85" : "text-muted-foreground"}`}
                          >
                            {previewRows.map((row) => (
                              <p key={`${section.id}-${row.field}`} className="truncate">
                                <span className="font-medium">
                                  {FIELD_LABELS[row.field] ?? row.field}:
                                </span>{" "}
                                {row.value}
                              </p>
                            ))}
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="client-access-card">
              {isGuernseyEsrLocked ? (
                <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
                  {guernseyLockMessage}
                </div>
              ) : null}
              {isCertificateTwo ? (
                <div className="mb-4 rounded-2xl border border-blue-500/25 bg-blue-500/10 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
                  Certificate 2 uses fixed defaults: dormant activity, no economic substance, no FATCA/CRS/IGOR, no CbCR, and no accounts upload requirement.
                </div>
              ) : null}

              {activeSection ? (
                <div className="space-y-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <p className="client-access-kicker">{activeSection.title}</p>
                      <h2 className="text-xl font-semibold tracking-tight">
                        Edit this section
                      </h2>
                      <p className="text-sm text-muted-foreground">
                        {activeSection.description}
                      </p>
                    </div>
                    <div className="client-access-chip">
                      {
                        getSectionCompletion(activeSection.fields, draftForm).filled
                      }
                      /{getSectionCompletion(activeSection.fields, draftForm).total} answered
                    </div>
                  </div>

                  <ReturnFormFields
                    fields={activeSection.fields}
                    draftForm={draftForm}
                    setDraftForm={setDraftForm}
                    surface
                    showRequiredBadges
                    disabled={isGuernseyEsrLocked}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={isGuernseyEsrLocked}
                        onClick={() =>
                          setDraftForm(sanitizeFormData(substanceFormQuery.data))
                        }
                      >
                        Reset section
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={isGuernseyEsrLocked}
                        onClick={handleClearForm}
                      >
                        <Trash2 className="size-4" />
                        Clear form
                      </Button>
                    </div>
                    <Button
                      disabled={
                        savingSection ||
                        updateSubstanceFormMutation.isPending ||
                        isGuernseyEsrLocked
                      }
                      onClick={handleSaveSection}
                    >
                      {savingSection || updateSubstanceFormMutation.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      Save section
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        )
      ) : isJerseyCompany ? (
        !jerseyFormQuery.data ? (
          <EmptyFormState
            title="Create the Jersey company return form"
            description="Initialize the return form first, then complete it through the guided finish flow."
            onInitialize={() => {
              void ensureJerseyFormExists()
                .then(() => showMessage("Jersey form initialized."))
                .catch((error) =>
                  showMessage(
                    error instanceof Error
                      ? error.message
                      : "Unable to initialize the Jersey form.",
                  ),
                );
            }}
            isPending={createJerseyFormMutation.isPending}
          />
        ) : (
          <section className="client-access-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <p className="client-access-kicker">Jersey form</p>
                <h2 className="text-xl font-semibold tracking-tight">
                  Complete the return section by section
                </h2>
                <p className="text-sm text-muted-foreground">
                  Jersey returns are handled through the guided form. The section list below shows where information is still missing.
                </p>
              </div>
              {guidedFinishHref ? (
                <Button asChild>
                  <Link href={guidedFinishHref}>
                    Open guided finish
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : null}
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-2">
              {JERSEY_FORM_SECTION_LABELS.map((section) => {
                const missingForSection = jerseyMissingFields.filter((field) =>
                  field.startsWith(`${section.id}.`),
                );

                return (
                  <div
                    key={section.id}
                    className="rounded-[1.35rem] border border-border bg-background px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{section.title}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {section.description}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${missingForSection.length === 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}
                      >
                        {missingForSection.length === 0
                          ? "Ready"
                          : `${missingForSection.length} missing`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )
      ) : (
        <section className="client-access-card text-sm text-muted-foreground">
          This return type is not available through the client workspace yet.
        </section>
      )}
    </main>
  );
}
