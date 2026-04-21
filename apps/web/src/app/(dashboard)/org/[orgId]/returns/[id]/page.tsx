"use client";

import { useParams, useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Sparkles,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Loader2,
  File,
  Building2,
  ChevronDown,
  Pencil,
  Play,
  Bot,
  MoreHorizontal,
} from "@/lib/icons";
import { useState, useCallback, useRef } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/page-header";
import {
  FIELD_LABELS,
  FORM_SECTIONS,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import {
  hasMeaningfulGuernseyFormData,
  resolveGuernseyCertificateType,
} from "@repo/database/guernsey-filing";
import { JerseyCompanyReturnWorkspace } from "@/components/jersey-company-return-workspace";
import { SubstanceFormEditor } from "@/components/substance-form-editor";
import { DirectionalTransition } from "@/components/view-transition";
import { useNavigateWithTransition } from "@/lib/navigate-with-transition";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FileInfo = {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  role?: "financial_statements" | "filed_return_pdf";
  metadata?: Record<string, unknown>;
};

type SectionId = (typeof FORM_SECTIONS)[number]["id"];

function isSupersededFiledReturnPdf(file: FileInfo): boolean {
  return (
    file.role !== "filed_return_pdf" &&
    file.metadata?.kind === "filed_return_pdf" &&
    typeof file.metadata?.supersededAt === "string"
  );
}

function isManagedFiledReturnPdf(file: FileInfo): boolean {
  return file.role === "filed_return_pdf" || isSupersededFiledReturnPdf(file);
}

export default function ReturnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const navigateWithTransition = useNavigateWithTransition();
  const orgId = params?.orgId as string;
  const id = params.id as string;

  const [isUploading, setIsUploading] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [activeTab, setActiveTab] = useState<"form" | "files" | "automation">(
    "form",
  );
  const [editingSection, setEditingSection] = useState<SectionId | null>(null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [pendingCertificateType, setPendingCertificateType] = useState<
    "Certificate 2" | "Certificate 3" | null
  >(null);
  const [isCertificateDialogOpen, setIsCertificateDialogOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const utils = api.useUtils();

  const {
    data: taxReturn,
    isLoading,
    error,
  } = api.taxReturn.getById.useQuery({ id }, { enabled: !!id });

  const { data: substanceFormData } =
    api.substanceForm.getByTaxReturnId.useQuery(
      { taxReturnId: id },
      { enabled: !!id },
    );

  const addFileMutation = api.taxReturn.addFile.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id }),
  });

  const removeFileMutation = api.taxReturn.removeFile.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id }),
  });

  const assignFileRoleMutation = api.taxReturn.assignFileRole.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id }),
  });

  const createFormMutation = api.substanceForm.createForTaxReturn.useMutation({
    onSuccess: () => {
      utils.taxReturn.getById.invalidate({ id });
      utils.substanceForm.getByTaxReturnId.invalidate({ taxReturnId: id });
    },
  });

  const updateFormMutation = api.substanceForm.update.useMutation({
    onSuccess: () => {
      utils.substanceForm.getByTaxReturnId.invalidate({ taxReturnId: id });
    },
  });

  const extractMutation = api.substanceForm.extractFromFiles.useMutation({
    onSuccess: () => {
      utils.taxReturn.getById.invalidate({ id });
      utils.substanceForm.getByTaxReturnId.invalidate({ taxReturnId: id });
      setActiveTab("form");
    },
  });

  const createTaskMutation = api.taxReturn.createTask.useMutation();
  const setCertificateTypeMutation =
    api.substanceForm.setCertificateType.useMutation({
      onSuccess: () => {
        utils.taxReturn.getById.invalidate({ id });
        utils.substanceForm.getByTaxReturnId.invalidate({ taxReturnId: id });
      },
    });

  // Auto-extract when files are uploaded
  const runExtraction = useCallback(
    async (fileUrls: string[]) => {
      if (!taxReturn || fileUrls.length === 0) return;

      setIsExtracting(true);
      try {
        await extractMutation.mutateAsync({
          taxReturnId: taxReturn.id,
          fileUrls,
        });
      } catch (err) {
        console.error("Extraction error:", err);
      } finally {
        setIsExtracting(false);
      }
    },
    [taxReturn, substanceFormData, createFormMutation, extractMutation],
  );

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = e.target.files;
      if (!selectedFiles || selectedFiles.length === 0 || !taxReturn) return;

      // Limit to 2 files max
      const filesToUpload = Array.from(selectedFiles).slice(0, 2);

      setIsUploading(true);
      try {
        const uploadedUrls: string[] = [];

        // Upload all selected files
        for (const file of filesToUpload) {
          const formData = new FormData();
          formData.append("file", file);

          const response = await fetch("/api/upload", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || "Upload failed");
          }

          const result = await response.json();

          await addFileMutation.mutateAsync({
            taxReturnId: taxReturn.id,
            file: {
              url: result.url,
              name: result.name,
              size: result.size,
              type: file.type,
            },
          });

          uploadedUrls.push(result.url);
        }

        // Get current files plus the new ones for extraction
        const currentFiles = (taxReturn.files ?? []) as FileInfo[];
        const allFileUrls = [
          ...currentFiles.map((f) => f.url),
          ...uploadedUrls,
        ];

        // Auto-trigger extraction with all files
        await runExtraction(allFileUrls);
      } catch (err) {
        console.error("Upload error:", err);
        alert(err instanceof Error ? err.message : "Failed to upload file");
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [taxReturn, addFileMutation, runExtraction],
  );

  const handleManualExtract = useCallback(async () => {
    if (!taxReturn) return;
    const files = (taxReturn.files ?? []) as FileInfo[];
    if (files.length === 0) return;
    await runExtraction(files.map((f) => f.url));
  }, [taxReturn, runExtraction]);

  const handleCreateForm = useCallback(async () => {
    if (!taxReturn) return;
    const certificateResolution = resolveGuernseyCertificateType({
      metadata:
        taxReturn.metadata && typeof taxReturn.metadata === "object"
          ? (taxReturn.metadata as Record<string, unknown>)
          : null,
      savedCertificateType: substanceFormData?.certificateType ?? null,
    });
    if (
      taxReturn.jurisdiction?.code === "GG" &&
      taxReturn.returnType === "economic_substance" &&
      certificateResolution.unresolved
    ) {
      const initializedCertificateType =
        await setCertificateTypeMutation.mutateAsync({
        taxReturnId: taxReturn.id,
        certificateType: "Certificate 3",
        overwriteExisting: false,
      });
      utils.substanceForm.getByTaxReturnId.setData(
        { taxReturnId: taxReturn.id },
        initializedCertificateType,
      );
    }
    await createFormMutation.mutateAsync({ taxReturnId: taxReturn.id });
    router.refresh();
  }, [
    taxReturn,
    substanceFormData?.certificateType,
    createFormMutation,
    setCertificateTypeMutation,
    utils.substanceForm.getByTaxReturnId,
    router,
  ]);

  const handleSetCertificateType = useCallback(
    async (
      nextCertificateType: "Certificate 2" | "Certificate 3",
      overwriteExisting: boolean,
    ) => {
      if (!taxReturn) return;

      const nextForm = await setCertificateTypeMutation.mutateAsync({
        taxReturnId: taxReturn.id,
        certificateType: nextCertificateType,
        overwriteExisting,
      });

      utils.substanceForm.getByTaxReturnId.setData(
        { taxReturnId: taxReturn.id },
        nextForm,
      );
      setPendingCertificateType(null);
      setIsCertificateDialogOpen(false);
      router.refresh();
    },
    [
      taxReturn,
      setCertificateTypeMutation,
      utils.substanceForm.getByTaxReturnId,
      router,
    ],
  );

  const requestCertificateTypeChange = useCallback(
    async (nextCertificateType: "Certificate 2" | "Certificate 3") => {
      const overwriteExisting =
        substanceFormData != null &&
        hasMeaningfulGuernseyFormData(
          substanceFormData as Partial<SubstanceFormData>,
        );

      if (overwriteExisting) {
        setPendingCertificateType(nextCertificateType);
        setIsCertificateDialogOpen(true);
        return;
      }

      await handleSetCertificateType(nextCertificateType, false);
    },
    [handleSetCertificateType, substanceFormData],
  );

  const handleSaveSection = useCallback(
    async (data: Partial<SubstanceFormData>) => {
      if (!taxReturn) return;
      await updateFormMutation.mutateAsync({
        taxReturnId: taxReturn.id,
        data,
      });
    },
    [taxReturn, updateFormMutation],
  );

  const handleAssignFinancialStatements = useCallback(
    async (file: FileInfo) => {
      if (!taxReturn) return;
      if (isManagedFiledReturnPdf(file)) return;

      await assignFileRoleMutation.mutateAsync({
        taxReturnId: taxReturn.id,
        fileUrl: file.url,
        role:
          file.role === "financial_statements" ? null : "financial_statements",
      });
    },
    [taxReturn, assignFileRoleMutation],
  );

  if (isLoading) {
    return (
      <DirectionalTransition>
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
        </div>
      </DirectionalTransition>
    );
  }

  if (error || !taxReturn) {
    return (
      <DirectionalTransition>
        <div className="flex min-h-screen flex-col items-center justify-center gap-4">
          <AlertCircle className="text-destructive h-12 w-12" />
          <h2 className="text-xl font-semibold">Tax Return Not Found</h2>
          <Button
            variant="outline"
            onClick={() => navigateWithTransition(`/org/${orgId}/returns`, "nav-back")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Returns
          </Button>
        </div>
      </DirectionalTransition>
    );
  }

  if (
    taxReturn.jurisdiction?.code === "JE" &&
    taxReturn.returnType === "company"
  ) {
    return (
      <DirectionalTransition>
        <JerseyCompanyReturnWorkspace orgId={orgId} taxReturn={taxReturn} />
      </DirectionalTransition>
    );
  }

  const files = (taxReturn.files ?? []) as FileInfo[];
  const assignedFinancialStatementsFile =
    files.find((file) => file.role === "financial_statements") ?? null;
  const substanceForm = substanceFormData;
  const certificateResolution = resolveGuernseyCertificateType({
    metadata:
      taxReturn.metadata && typeof taxReturn.metadata === "object"
        ? (taxReturn.metadata as Record<string, unknown>)
        : null,
    savedCertificateType: substanceForm?.certificateType ?? null,
  });
  const effectiveSubstanceForm = substanceForm
    ? ({
        ...substanceForm,
        certificateType:
          certificateResolution.certificateType ??
          substanceForm.certificateType ??
          undefined,
      } as typeof substanceForm)
    : null;
  const missingFields =
    (effectiveSubstanceForm?.missingFields as string[]) ?? [];
  const isGuernseyCertificateUnresolved =
    taxReturn.jurisdiction?.code === "GG" &&
    taxReturn.returnType === "economic_substance" &&
    certificateResolution.unresolved;
  const isCertificateTwo =
    certificateResolution.certificateType === "Certificate 2";
  const visibleSections = FORM_SECTIONS.filter((section) => {
    if (!("conditional" in section) || !section.conditional) {
      return true;
    }

    return section.conditional(
      (effectiveSubstanceForm ?? {}) as Partial<SubstanceFormData>,
    );
  });

  const statusConfig = {
    pending: { bg: "bg-amber-500/10", text: "text-amber-600" },
    in_progress: { bg: "bg-blue-500/10", text: "text-blue-600" },
    completed: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    failed: { bg: "bg-red-500/10", text: "text-red-600" },
    review_required: { bg: "bg-orange-500/10", text: "text-orange-600" },
  } as const;

  const status =
    statusConfig[taxReturn.status as keyof typeof statusConfig] ??
    statusConfig.pending;

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <DirectionalTransition>
      <AlertDialog
        open={isCertificateDialogOpen}
        onOpenChange={(open) => {
          setIsCertificateDialogOpen(open);
          if (!open) {
            setPendingCertificateType(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch certificate type?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCertificateType
                ? `Switching this return to ${pendingCertificateType} will update the Guernsey form defaults while preserving shared answers where possible.`
                : "Switching the certificate type will update the Guernsey form defaults."}{" "}
              Review the form after switching in case any certificate-specific answers need adjustment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setCertificateTypeMutation.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={
                !pendingCertificateType || setCertificateTypeMutation.isPending
              }
              onClick={(event) => {
                event.preventDefault();
                if (!pendingCertificateType) {
                  return;
                }
                void handleSetCertificateType(pendingCertificateType, true);
              }}
            >
              {setCertificateTypeMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PageHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href={`/org/${orgId}/returns`}>
                Tax Returns
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>{taxReturn.entityName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-8">
          {/* Back Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateWithTransition(`/org/${orgId}/returns`, "nav-back")}
            className="w-fit"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          {/* Header Section */}
          <div className="flex items-start justify-between">
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight">
                {taxReturn.entityName}
              </h1>
              <div className="text-muted-foreground flex items-center gap-3 text-sm">
                <Badge variant="outline" className="font-normal">
                  {taxReturn.jurisdictionId}
                </Badge>
                <span>•</span>
                <span>Tax Year {taxReturn.taxYear}</span>
                <span>•</span>
                <span className="font-mono">{taxReturn.externalId}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge
                className={`${status.bg} ${status.text} border-0 px-3 py-1 text-sm`}
              >
                {taxReturn.status.replace("_", " ")}
              </Badge>
              {taxReturn.link && (
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={taxReturn.link}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    Portal
                  </a>
                </Button>
              )}
              {taxReturn.tasks && taxReturn.tasks.length > 0 ? (
                <Button size="sm" className="cursor-pointer" asChild>
                  <Link href={`/org/${orgId}/tasks/${taxReturn.tasks[0]?.id}`}>
                    <Play className="mr-2 h-4 w-4" />
                    View Task
                  </Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="cursor-pointer"
                  onClick={async () => {
                    setIsCreatingTask(true);
                    try {
                      const task = await createTaskMutation.mutateAsync({
                        taxReturnId: id,
                      });
                      if (task) {
                        router.push(`/org/${orgId}/tasks/${task.id}`);
                      }
                    } catch (err) {
                      console.error("Failed to create task:", err);
                    } finally {
                      setIsCreatingTask(false);
                    }
                  }}
                  disabled={
                    !substanceForm || isCreatingTask || isGuernseyCertificateUnresolved
                  }
                >
                  {isCreatingTask ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 h-4 w-4" />
                  )}
                  Process
                </Button>
              )}
            </div>
          </div>

          {/* Extraction Progress Banner */}
          {isExtracting && (
            <div className="animate-in fade-in slide-in-from-top-2 flex items-center gap-3 rounded-md border border-blue-500/20 bg-blue-500/10 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
              <span className="text-sm font-medium text-blue-600">
                Extracting data from documents...
              </span>
            </div>
          )}

          {isGuernseyCertificateUnresolved ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Confirm the Guernsey certificate type before initializing the return
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm text-amber-800 dark:text-amber-300">
                    This return has not been confidently identified as Certificate 2 or Certificate 3.
                    Pick the filing mode here before creating the Guernsey form or starting browser automation.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["Certificate 2", "Certificate 3"] as const).map((certificateType) => (
                    <Button
                      key={certificateType}
                      variant={certificateType === "Certificate 2" ? "outline" : "default"}
                      disabled={setCertificateTypeMutation.isPending}
                      onClick={() => {
                        void requestCertificateTypeChange(certificateType);
                      }}
                    >
                      {setCertificateTypeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Use {certificateType}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Main Content Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={(value) =>
              setActiveTab(value as "form" | "files" | "automation")
            }
            defaultValue="form"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList>
                <TabsTrigger value="form">Substance Form</TabsTrigger>
                <TabsTrigger value="files">Files & Documents</TabsTrigger>
                <TabsTrigger value="automation">
                  <Bot className="h-4 w-4" />
                  Automation
                </TabsTrigger>
              </TabsList>
              {taxReturn.jurisdiction?.code === "GG" &&
              taxReturn.returnType === "economic_substance" ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={setCertificateTypeMutation.isPending}
                    >
                      {setCertificateTypeMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {certificateResolution.certificateType ?? "Certificate 3"}
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {(["Certificate 2", "Certificate 3"] as const).map((nextType) => (
                      <DropdownMenuItem
                        key={nextType}
                        onSelect={() => {
                          void requestCertificateTypeChange(nextType);
                        }}
                      >
                        Use {nextType}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>

            <TabsContent value="automation">
              <div className="space-y-6">
                <div className="bg-card rounded-lg border p-12 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10">
                    <Bot className="h-8 w-8 text-orange-500" />
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">
                    AI-Powered Tax Return Filing
                  </h3>
                  <p className="text-muted-foreground mx-auto mb-6 max-w-md text-sm">
                    Create a processing task to automatically fill out the tax
                    return on the government portal using the substance form
                    data.
                  </p>

                  {!substanceForm ? (
                    <div className="mb-4 text-sm text-amber-600">
                      <AlertCircle className="mr-1 inline h-4 w-4" />
                      Please create a substance form first before running
                      automation.
                    </div>
                  ) : !substanceForm.isComplete ? (
                    <div className="mb-4 text-sm text-amber-600">
                      <AlertCircle className="mr-1 inline h-4 w-4" />
                      Substance form is incomplete. The AI may need to pause for
                      missing information.
                    </div>
                  ) : (
                    <div className="mb-4 text-sm text-green-600">
                      <CheckCircle className="mr-1 inline h-4 w-4" />
                      Substance form is complete. Ready to create automation
                      task.
                    </div>
                  )}

                  {assignedFinancialStatementsFile ? (
                    <div className="mb-4 text-sm text-blue-600">
                      <FileText className="mr-1 inline h-4 w-4" />
                      Financial statements PDF assigned:{" "}
                      {assignedFinancialStatementsFile.name}
                    </div>
                  ) : (
                    <div className="mb-4 text-sm text-amber-600">
                      <AlertCircle className="mr-1 inline h-4 w-4" />
                      No financial statements PDF assigned yet. Browser
                      automation will fall back to filename matching.
                    </div>
                  )}

                  {taxReturn.tasks && taxReturn.tasks.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-muted-foreground text-sm">
                        This tax return already has {taxReturn.tasks.length}{" "}
                        task(s)
                      </p>
                      <Button
                        size="lg"
                        className="bg-orange-600 hover:bg-orange-700"
                        asChild
                      >
                        <Link
                          href={`/org/${orgId}/tasks/${taxReturn.tasks[0]?.id}`}
                        >
                          <Play className="mr-2 h-4 w-4" />
                          Open Task
                        </Link>
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="lg"
                      className="bg-orange-600 hover:bg-orange-700"
                      onClick={async () => {
                        setIsCreatingTask(true);
                        try {
                          const task = await createTaskMutation.mutateAsync({
                            taxReturnId: id,
                          });
                          if (task) {
                            router.push(`/org/${orgId}/tasks/${task.id}`);
                          }
                        } catch (err) {
                          console.error("Failed to create task:", err);
                        } finally {
                          setIsCreatingTask(false);
                        }
                      }}
                      disabled={
                        !substanceForm || isCreatingTask || isGuernseyCertificateUnresolved
                      }
                    >
                      {isCreatingTask ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="mr-2 h-4 w-4" />
                      )}
                      Create & Open Task
                    </Button>
                  )}

                  {taxReturn.link && (
                    <p className="text-muted-foreground mt-4 text-xs">
                      Target:{" "}
                      <a
                        href={taxReturn.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline"
                      >
                        {taxReturn.link}
                      </a>
                    </p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="files">
              <div className="space-y-6">
                <div className="bg-card rounded-lg border shadow-sm">
                  <div className="bg-muted/20 flex items-center justify-between border-b p-4">
                    <div>
                      <h2 className="font-medium">Attached Files</h2>
                      <p className="text-muted-foreground text-sm">
                        Upload documents for automatic data extraction
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.xlsx,.xls,.doc,.docx"
                        multiple
                        className="hidden"
                        onChange={handleFileUpload}
                        disabled={isUploading || isExtracting}
                      />
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploading || isExtracting}
                      >
                        {isUploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="mr-2 h-4 w-4" />
                        )}
                        Upload Files
                      </Button>
                    </div>
                  </div>

                  {files.length === 0 ? (
                    <div className="p-16 text-center">
                      <div className="bg-muted/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                        <FileText className="text-muted-foreground/50 h-6 w-6" />
                      </div>
                      <h3 className="mb-1 font-medium">No files attached</h3>
                      <p className="text-muted-foreground mx-auto mb-6 max-w-sm text-sm">
                        Upload PDF or Excel files (up to 2 at a time). AI will
                        automatically process them to fill out the substance
                        form.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Select Files
                      </Button>
                    </div>
                  ) : (
                    <div className="divide-y">
                      {files.map((file) => (
                        <div
                          key={file.url}
                          className="hover:bg-muted/50 flex items-center justify-between p-4 transition-colors"
                        >
                          <div className="flex items-center gap-4">
                            <div className="bg-primary/10 rounded-lg p-2.5">
                              <File className="text-primary h-5 w-5" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">
                                  {file.name}
                                </p>
                                {file.role === "financial_statements" && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px] tracking-wide uppercase"
                                  >
                                    Financial statements PDF
                                  </Badge>
                                )}
                                {file.role === "filed_return_pdf" && (
                                  <Badge className="border-blue-500/20 bg-blue-500/10 text-[10px] tracking-wide uppercase text-blue-700 hover:bg-blue-500/10">
                                    Filed return PDF
                                  </Badge>
                                )}
                                {isSupersededFiledReturnPdf(file) && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] tracking-wide uppercase"
                                  >
                                    Superseded filed PDF
                                  </Badge>
                                )}
                              </div>
                              <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                                <span>{formatBytes(file.size)}</span>
                                <span>•</span>
                                <span>
                                  {new Date(
                                    file.uploadedAt,
                                  ).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" asChild>
                              <a
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                View
                              </a>
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Open actions for ${file.name}`}
                                >
                                  <MoreHorizontal className="h-4 w-4 rotate-90" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {!isManagedFiledReturnPdf(file) ? (
                                  <DropdownMenuItem
                                    disabled={
                                      assignFileRoleMutation.isPending ||
                                      removeFileMutation.isPending
                                    }
                                    onSelect={() => {
                                      void handleAssignFinancialStatements(file);
                                    }}
                                  >
                                    <FileText className="h-4 w-4" />
                                    {file.role === "financial_statements"
                                      ? "Clear financials assignment"
                                      : "Assign as Financials"}
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                  variant="destructive"
                                  disabled={
                                    assignFileRoleMutation.isPending ||
                                    removeFileMutation.isPending
                                  }
                                  onSelect={() => {
                                    removeFileMutation.mutate({
                                      taxReturnId: taxReturn.id,
                                      fileUrl: file.url,
                                    });
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Remove file
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {files.length > 0 && !isCertificateTwo && (
                    <div className="bg-muted/20 flex justify-end border-t p-4">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleManualExtract}
                        disabled={isExtracting || isCertificateTwo}
                      >
                        {isExtracting ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="mr-2 h-4 w-4" />
                        )}
                        Run AI Extraction
                      </Button>
                    </div>
                  )}
                </div>

                {taxReturn.pdfUrl && (
                  <div className="bg-card flex items-center justify-between rounded-lg border p-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-muted rounded-md p-2">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          Official Instructions
                        </p>
                        <p className="text-muted-foreground text-xs">
                          PDF from tax portal
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" asChild>
                      <a
                        href={taxReturn.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View PDF <ExternalLink className="ml-2 h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="form">
              <div className="space-y-6">
                {!substanceForm ? (
                  <div className="bg-card rounded-lg border p-12 text-center">
                    {isGuernseyCertificateUnresolved ? (
                      <>
                        <div className="bg-muted/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                          <AlertCircle className="text-muted-foreground/50 h-6 w-6" />
                        </div>
                        <h3 className="mb-1 font-medium">
                          Certificate type confirmation required
                        </h3>
                        <p className="text-muted-foreground mb-6 text-sm">
                          Confirm whether this is Certificate 2 or Certificate 3 above before initializing the form.
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="bg-muted/50 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
                          <Building2 className="text-muted-foreground/50 h-6 w-6" />
                        </div>
                        <h3 className="mb-1 font-medium">Form Not Initialized</h3>
                        <p className="text-muted-foreground mb-6 text-sm">
                          Create a substance form to start tracking data for this
                          return.
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          {taxReturn.jurisdiction?.code === "GG" &&
                          taxReturn.returnType === "economic_substance" ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  disabled={setCertificateTypeMutation.isPending}
                                >
                                  {setCertificateTypeMutation.isPending ? (
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  ) : null}
                                  {certificateResolution.certificateType ?? "Certificate 3"}
                                  <ChevronDown className="ml-2 h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="center" className="w-44">
                                {(["Certificate 2", "Certificate 3"] as const).map((nextType) => (
                                  <DropdownMenuItem
                                    key={nextType}
                                    onSelect={() => {
                                      void requestCertificateTypeChange(nextType);
                                    }}
                                  >
                                    Use {nextType}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                          <Button
                            onClick={handleCreateForm}
                            disabled={createFormMutation.isPending}
                          >
                            {createFormMutation.isPending && (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            Initialize Form
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Form Status Card */}
                    <div
                      className={`flex items-start gap-4 rounded-lg border p-4 ${
                        substanceForm.isComplete
                          ? "border-emerald-500/20 bg-emerald-500/5"
                          : "border-amber-500/20 bg-amber-500/5"
                      }`}
                    >
                      {substanceForm.isComplete ? (
                        <CheckCircle className="mt-0.5 h-5 w-5 text-emerald-600" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-5 w-5 text-amber-600" />
                      )}
                      <div>
                        <h3
                          className={`font-medium ${
                            substanceForm.isComplete
                              ? "text-emerald-900 dark:text-emerald-200"
                              : "text-amber-900 dark:text-amber-200"
                          }`}
                        >
                          {substanceForm.isComplete
                            ? "Form Complete"
                            : "Action Required"}
                        </h3>
                        <p
                          className={`mt-1 text-sm ${
                            substanceForm.isComplete
                              ? "text-emerald-700 dark:text-emerald-300"
                              : "text-amber-700 dark:text-amber-300"
                          }`}
                        >
                          {substanceForm.isComplete
                            ? "All required fields have been filled. Ready for submission."
                            : `${((substanceForm.missingFields as string[]) || []).length} fields are missing information.`}
                        </p>

                        {!substanceForm.isComplete &&
                          missingFields.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-1.5">
                              {missingFields.slice(0, 5).map((field) => (
                                <span
                                  key={field}
                                  className="inline-flex items-center rounded border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                                >
                                  {FIELD_LABELS[
                                    field as keyof typeof FIELD_LABELS
                                  ] ?? field}
                                </span>
                              ))}
                              {missingFields.length > 5 && (
                                <span className="inline-flex items-center rounded border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                                  +{missingFields.length - 5} more
                                </span>
                              )}
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Sections Grid */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {visibleSections.map((section) => {
                        const filledFields = section.fields.filter((f) => {
                          const val =
                            effectiveSubstanceForm?.[
                              f as keyof typeof effectiveSubstanceForm
                            ];
                          return (
                            val !== undefined && val !== null && val !== ""
                          );
                        });

                        return (
                          <div
                            key={section.id}
                            className="group bg-card cursor-pointer rounded-lg border transition-all hover:shadow-md"
                            onClick={() => setEditingSection(section.id)}
                          >
                            <div className="p-4">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                                  <h3 className="text-sm font-semibold">
                                    {section.title}
                                  </h3>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <p className="text-muted-foreground mb-3 line-clamp-2 text-xs">
                                {section.description}
                              </p>

                              {filledFields.length > 0 && (
                                <div className="space-y-1.5 border-t pt-3">
                                  {section.fields.slice(0, 3).map((field) => {
                                    const value =
                                      effectiveSubstanceForm?.[
                                        field as keyof typeof effectiveSubstanceForm
                                      ];
                                    if (
                                      value === undefined ||
                                      value === null ||
                                      value === ""
                                    )
                                      return null;

                                    const label =
                                      FIELD_LABELS[
                                        field as keyof typeof FIELD_LABELS
                                      ] ?? field;
                                    let displayValue = String(value);
                                    if (typeof value === "object")
                                      displayValue = Array.isArray(value)
                                        ? `${value.length} items`
                                        : "...";

                                    return (
                                      <div
                                        key={field}
                                        className="truncate text-xs"
                                      >
                                        <span className="text-muted-foreground">
                                          {label}:
                                        </span>{" "}
                                        <span className="text-foreground font-medium">
                                          {displayValue}
                                        </span>
                                      </div>
                                    );
                                  })}
                                  {filledFields.length > 3 && (
                                    <span className="text-muted-foreground text-xs">
                                      +{filledFields.length - 3} more fields
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Section Editor Dialog */}
      {editingSection && effectiveSubstanceForm && (
        <SubstanceFormEditor
          sectionId={editingSection}
          formData={effectiveSubstanceForm as Partial<SubstanceFormData>}
          open={!!editingSection}
          onOpenChange={(open) => !open && setEditingSection(null)}
          onSave={handleSaveSection}
          isSaving={updateFormMutation.isPending}
        />
      )}
    </DirectionalTransition>
  );
}
