"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  CheckCircle2,
  ExternalLink,
  File,
  FileText,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";

import {
  JERSEY_CIGA_OPTIONS,
  JERSEY_CONSOLIDATED_REVENUE_OPTIONS,
  JERSEY_ENTITY_STATUS_OPTIONS,
  JERSEY_RELEVANT_ACTIVITY_OPTIONS,
  JERSEY_RESIDENCE_OPTIONS,
  JERSEY_YES_NO_OPTIONS,
  createEmptyJerseyCompanyReturnFormData,
  getJerseyCompanyReturnMissingFields,
  isJerseyCompanyReturnComplete,
  type JerseyCompanyReturnFormData,
  type JerseyConnectedPersonDeduction,
  type JerseyDistributionShareholder,
  type JerseyOutsourcingProvider,
  type JerseyRelevantActivity,
  type JerseyRelevantActivityDetail,
} from "@repo/database/jersey-company-return";

import { api, type RouterOutputs } from "@/trpc/react";
import { sanitizeJerseyCompanyReturnData } from "@/lib/schemas/jersey-company-return";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type TaxReturnRecord = NonNullable<RouterOutputs["taxReturn"]["getById"]>;
type SectionKey = keyof JerseyCompanyReturnFormData;
type WorkspaceTab = "form" | "files" | "automation";

type FileInfo = {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  role?: "financial_statements";
};

type FieldShellProps = {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

type SectionCardProps = {
  title: string;
  description: string;
  missingCount?: number;
  children: ReactNode;
};

function FieldShell({ label, hint, className, children }: FieldShellProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="space-y-1">
        <Label className="text-sm font-medium">{label}</Label>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

function SectionCard({
  title,
  description,
  missingCount = 0,
  children,
}: SectionCardProps) {
  return (
    <section className="bg-card rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          <p className="text-muted-foreground max-w-3xl text-sm">
            {description}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
            missingCount === 0
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
              : "border-amber-500/30 bg-amber-500/10 text-amber-700",
          )}
        >
          {missingCount === 0 ? "Ready" : `${missingCount} missing`}
        </span>
      </div>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  );
}

function formatMissingFieldPath(field: string) {
  return field
    .replace(/\.\w+\[(\d+)\]/g, (_match, index: string) => ` item ${Number(index) + 1}`)
    .replace(/\[(\d+)\]/g, (_match, index: string) => ` ${Number(index) + 1}`)
    .replace(/\./g, " / ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function emptyActivity(): JerseyRelevantActivityDetail {
  return {
    cigaSelections: [],
    premisesAddresses: [],
    outsourcingProviders: [],
    ultimateBeneficialOwners: [],
  };
}

function emptyProvider(): JerseyOutsourcingProvider {
  return {};
}

function emptyShareholder(): JerseyDistributionShareholder {
  return {};
}

function emptyDeduction(): JerseyConnectedPersonDeduction {
  return {};
}

function stringArrayFromTextarea(value: string) {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function textareaFromStringArray(value: string[] | undefined) {
  return (value ?? []).join("\n");
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function uploadLabel(isUploading: boolean) {
  if (isUploading) {
    return "Uploading files...";
  }
  return "Upload files";
}

export function JerseyCompanyReturnWorkspace({
  orgId,
  taxReturn,
}: {
  orgId: string;
  taxReturn: TaxReturnRecord;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("form");
  const [draftForm, setDraftForm] = useState<Partial<JerseyCompanyReturnFormData>>(
    createEmptyJerseyCompanyReturnFormData(),
  );
  const [isUploading, setIsUploading] = useState(false);

  const formQuery = api.taxReturn.getJerseyCompanyReturnForm.useQuery(
    { taxReturnId: taxReturn.id },
    { enabled: true },
  );

  const createFormMutation = api.taxReturn.createJerseyCompanyReturnForm.useMutation({
    onSuccess: () => {
      void utils.taxReturn.getJerseyCompanyReturnForm.invalidate({
        taxReturnId: taxReturn.id,
      });
      void utils.taxReturn.getById.invalidate({ id: taxReturn.id });
    },
  });

  const updateFormMutation = api.taxReturn.updateJerseyCompanyReturnForm.useMutation({
    onSuccess: () => {
      void utils.taxReturn.getJerseyCompanyReturnForm.invalidate({
        taxReturnId: taxReturn.id,
      });
      void utils.taxReturn.getById.invalidate({ id: taxReturn.id });
    },
  });

  const addFileMutation = api.taxReturn.addFile.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id: taxReturn.id }),
  });

  const removeFileMutation = api.taxReturn.removeFile.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id: taxReturn.id }),
  });

  const assignFileRoleMutation = api.taxReturn.assignFileRole.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id: taxReturn.id }),
  });

  useEffect(() => {
    setDraftForm(sanitizeJerseyCompanyReturnData(formQuery.data));
  }, [formQuery.data, taxReturn.id]);

  const normalizedDraft = useMemo(
    () => sanitizeJerseyCompanyReturnData(draftForm),
    [draftForm],
  );
  const missingFields = useMemo(
    () => getJerseyCompanyReturnMissingFields(normalizedDraft),
    [normalizedDraft],
  );
  const isDraftComplete = useMemo(
    () => isJerseyCompanyReturnComplete(normalizedDraft),
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

  const updateSection = <K extends SectionKey>(
    section: K,
    patch: Partial<JerseyCompanyReturnFormData[K]>,
  ) => {
    setDraftForm((current) =>
      sanitizeJerseyCompanyReturnData({
        ...current,
        [section]: {
          ...(current[section] ?? {}),
          ...patch,
        },
      }),
    );
  };

  const updateActivity = (
    index: number,
    patch: Partial<JerseyRelevantActivityDetail>,
  ) => {
    const nextActivities = [
      ...(normalizedDraft.economicSubstance?.relevantActivities ?? []),
    ];
    nextActivities[index] = {
      ...emptyActivity(),
      ...nextActivities[index],
      ...patch,
    };

    updateSection("economicSubstance", {
      relevantActivities: nextActivities,
    });
  };

  const removeActivity = (index: number) => {
    updateSection("economicSubstance", {
      relevantActivities: (
        normalizedDraft.economicSubstance?.relevantActivities ?? []
      ).filter((_, activityIndex) => activityIndex !== index),
    });
  };

  const addActivity = () => {
    updateSection("economicSubstance", {
      relevantActivities: [
        ...(normalizedDraft.economicSubstance?.relevantActivities ?? []),
        emptyActivity(),
      ],
    });
  };

  const addProvider = (activityIndex: number) => {
    const activity =
      normalizedDraft.economicSubstance?.relevantActivities?.[activityIndex];
    updateActivity(activityIndex, {
      outsourcingProviders: [
        ...(activity?.outsourcingProviders ?? []),
        emptyProvider(),
      ],
    });
  };

  const updateProvider = (
    activityIndex: number,
    providerIndex: number,
    patch: Partial<JerseyOutsourcingProvider>,
  ) => {
    const activity =
      normalizedDraft.economicSubstance?.relevantActivities?.[activityIndex];
    const nextProviders = [...(activity?.outsourcingProviders ?? [])];
    nextProviders[providerIndex] = {
      ...nextProviders[providerIndex],
      ...patch,
    };
    updateActivity(activityIndex, { outsourcingProviders: nextProviders });
  };

  const removeProvider = (activityIndex: number, providerIndex: number) => {
    const activity =
      normalizedDraft.economicSubstance?.relevantActivities?.[activityIndex];
    updateActivity(activityIndex, {
      outsourcingProviders: (activity?.outsourcingProviders ?? []).filter(
        (_provider, currentIndex) => currentIndex !== providerIndex,
      ),
    });
  };

  const addShareholder = () => {
    updateSection("distributions", {
      shareholders: [
        ...(normalizedDraft.distributions?.shareholders ?? []),
        emptyShareholder(),
      ],
    });
  };

  const updateShareholder = (
    index: number,
    patch: Partial<JerseyDistributionShareholder>,
  ) => {
    const nextShareholders = [
      ...(normalizedDraft.distributions?.shareholders ?? []),
    ];
    nextShareholders[index] = {
      ...nextShareholders[index],
      ...patch,
    };
    updateSection("distributions", {
      shareholders: nextShareholders,
    });
  };

  const removeShareholder = (index: number) => {
    updateSection("distributions", {
      shareholders: (normalizedDraft.distributions?.shareholders ?? []).filter(
        (_shareholder, currentIndex) => currentIndex !== index,
      ),
    });
  };

  const addDeduction = () => {
    updateSection("compliance", {
      connectedPersonDeductions: [
        ...(normalizedDraft.compliance?.connectedPersonDeductions ?? []),
        emptyDeduction(),
      ],
    });
  };

  const updateDeduction = (
    index: number,
    patch: Partial<JerseyConnectedPersonDeduction>,
  ) => {
    const nextDeductions = [
      ...(normalizedDraft.compliance?.connectedPersonDeductions ?? []),
    ];
    nextDeductions[index] = {
      ...nextDeductions[index],
      ...patch,
    };
    updateSection("compliance", {
      connectedPersonDeductions: nextDeductions,
    });
  };

  const removeDeduction = (index: number) => {
    updateSection("compliance", {
      connectedPersonDeductions: (
        normalizedDraft.compliance?.connectedPersonDeductions ?? []
      ).filter((_deduction, currentIndex) => currentIndex !== index),
    });
  };

  const ensureFormExists = async () => {
    if (formQuery.data) {
      return;
    }

    await createFormMutation.mutateAsync({
      taxReturnId: taxReturn.id,
    });
  };

  const handleSave = async () => {
    await ensureFormExists();
    await updateFormMutation.mutateAsync({
      taxReturnId: taxReturn.id,
      data: normalizedDraft,
    });
  };

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = event.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    const filesToUpload = Array.from(selectedFiles).slice(0, 10);
    setIsUploading(true);

    try {
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
      }
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleAssignFinancialStatements = async (file: FileInfo) => {
    await assignFileRoleMutation.mutateAsync({
      taxReturnId: taxReturn.id,
      fileUrl: file.url,
      role: file.role === "financial_statements" ? null : "financial_statements",
    });
  };

  const files = (taxReturn.files ?? []) as FileInfo[];
  const section1 = normalizedDraft.section1 ?? {};
  const scheduleA = normalizedDraft.scheduleA ?? {};
  const distributions = normalizedDraft.distributions ?? {};
  const compliance = normalizedDraft.compliance ?? {};
  const economicSubstance = normalizedDraft.economicSubstance ?? {
    relevantActivities: [],
  };
  const relevantActivities = economicSubstance.relevantActivities ?? [];
  const additionalInfo = normalizedDraft.additionalInfo ?? {};

  return (
    <>
      <header className="bg-background/95 sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b px-4 backdrop-blur">
        <SidebarTrigger className="-ml-1" />
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
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-6xl space-y-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/org/${orgId}/returns`)}
            className="w-fit"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>

          <section className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div className="max-w-3xl space-y-3">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {taxReturn.entityName}
                  </h1>
                  <span className="inline-flex rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-700">
                    Jersey company return
                  </span>
                </div>

                <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Building2 className="size-3.5" />
                    {taxReturn.jurisdiction?.name} ({taxReturn.jurisdiction?.code})
                  </span>
                  <span>•</span>
                  <span>Tax year {taxReturn.taxYear}</span>
                  {taxReturn.externalId ? (
                    <>
                      <span>•</span>
                      <span className="font-mono">{taxReturn.externalId}</span>
                    </>
                  ) : null}
                </p>

                <p className="text-muted-foreground max-w-2xl text-sm">
                  Jersey company returns use a different workflow from Guernsey
                  ESR. Complete the company return sections here and attach the
                  signed financial statements before filing review.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {taxReturn.link ? (
                  <Button variant="outline" asChild>
                    <a href={taxReturn.link} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Portal
                    </a>
                  </Button>
                ) : null}
                <Button
                  onClick={() => {
                    void handleSave();
                  }}
                  disabled={
                    updateFormMutation.isPending || createFormMutation.isPending
                  }
                >
                  {updateFormMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save Jersey form
                </Button>
              </div>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border bg-card px-5 py-4 shadow-sm">
              <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                Filing state
              </p>
              <div className="mt-3 flex items-center gap-3">
                {isDraftComplete ? (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                ) : (
                  <AlertCircle className="size-5 text-amber-600" />
                )}
                <div>
                  <p className="font-medium">
                    {isDraftComplete ? "Ready to review" : "Action required"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {missingFields.length} required field
                    {missingFields.length === 1 ? "" : "s"} missing
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card px-5 py-4 shadow-sm">
              <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                Documents
              </p>
              <div className="mt-3 flex items-center gap-3">
                <FileText className="size-5 text-blue-600" />
                <div>
                  <p className="font-medium">
                    {files.length} uploaded file{files.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {files.some((file) => file.role === "financial_statements")
                      ? "Signed financial statements assigned"
                      : "Signed financial statements still needed"}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-card px-5 py-4 shadow-sm">
              <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                Automation
              </p>
              <div className="mt-3 flex items-center gap-3">
                <ShieldAlert className="size-5 text-orange-600" />
                <div>
                  <p className="font-medium">Browser filing disabled</p>
                  <p className="text-muted-foreground text-sm">
                    Jersey automation is not implemented yet.
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                    {activeTab === "form"
                      ? "Jersey company return"
                      : activeTab === "files"
                        ? "Return documents"
                        : "Automation"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-semibold tracking-tight">
                      {activeTab === "form"
                        ? "Return form"
                        : activeTab === "files"
                          ? "Files & documents"
                          : "Automation"}
                    </h2>
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
                        isDraftComplete
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-700",
                      )}
                    >
                      {isDraftComplete ? "Complete" : "In progress"}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {activeTab === "form"
                      ? "Capture the Jersey-specific company return and embedded economic substance answers."
                      : activeTab === "files"
                        ? "Upload signed financial statements and supporting evidence."
                        : "Jersey browser automation is currently blocked in the platform."}
                  </p>
                </div>

                <TabsList>
                  <TabsTrigger value="form">Return form</TabsTrigger>
                  <TabsTrigger value="files">Files & documents</TabsTrigger>
                  <TabsTrigger value="automation">Automation</TabsTrigger>
                </TabsList>
              </div>

              {activeTab === "automation" ? (
                <div className="mt-6 rounded-2xl border border-orange-500/20 bg-orange-500/5 p-6">
                  <div className="flex items-start gap-3">
                    <ShieldAlert className="mt-0.5 size-5 text-orange-600" />
                    <div className="space-y-2">
                      <p className="font-medium text-orange-900 dark:text-orange-100">
                        Jersey automation is not available yet
                      </p>
                      <p className="text-sm text-orange-800/80 dark:text-orange-200/80">
                        The Guernsey browser runner is intentionally blocked for
                        Jersey company returns. Complete the Jersey form and use
                        the portal link for filing review until the Jersey task
                        runner is implemented.
                      </p>
                      {taxReturn.tasks?.length ? (
                        <Button variant="outline" asChild>
                          <Link href={`/org/${orgId}/tasks/${taxReturn.tasks[0]?.id}`}>
                            View existing task
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}

              {activeTab === "files" ? (
                <div className="mt-6 space-y-6">
                  <div className="bg-card rounded-lg border shadow-sm">
                    <div className="bg-muted/20 flex items-center justify-between border-b p-4">
                      <div>
                        <h2 className="font-medium">Attached files</h2>
                        <p className="text-muted-foreground text-sm">
                          Upload signed financial statements, schedules, and
                          Jersey support documents.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.xlsx,.xls,.doc,.docx,.csv,.zip"
                          multiple
                          className="hidden"
                          onChange={handleFileUpload}
                          disabled={isUploading}
                        />
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          {isUploading ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Plus className="mr-2 h-4 w-4" />
                          )}
                          {uploadLabel(isUploading)}
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
                          Upload the signed financial statements and any supporting schedules for the Jersey filing.
                        </p>
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Plus className="mr-2 h-4 w-4" />
                          Select files
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
                                  {file.role === "financial_statements" ? (
                                    <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700">
                                      Financial statements
                                    </span>
                                  ) : null}
                                </div>
                                <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-xs">
                                  <span>{formatBytes(file.size)}</span>
                                  <span>•</span>
                                  <span>
                                    {new Date(file.uploadedAt).toLocaleDateString()}
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
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    disabled={
                                      assignFileRoleMutation.isPending ||
                                      removeFileMutation.isPending
                                    }
                                    onSelect={() => {
                                      void handleAssignFinancialStatements(file);
                                    }}
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    {file.role === "financial_statements"
                                      ? "Clear financials assignment"
                                      : "Assign as signed financials"}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-red-600 focus:text-red-600"
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
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove file
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              {activeTab === "form" ? (
                <div className="mt-6 space-y-5">
                  {!formQuery.data ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center">
                      <p className="text-lg font-semibold">
                        Jersey return form not initialized
                      </p>
                      <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
                        Create the Jersey company return form first, then fill
                        in the return sections and embedded economic substance
                        questions here.
                      </p>
                      <Button
                        className="mt-5"
                        onClick={() => {
                          void ensureFormExists();
                        }}
                        disabled={createFormMutation.isPending}
                      >
                        {createFormMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Plus className="mr-2 h-4 w-4" />
                        )}
                        Initialize form
                      </Button>
                    </div>
                  ) : (
                    <>
                      <div
                        className={cn(
                          "rounded-2xl border px-5 py-4",
                          isDraftComplete
                            ? "border-emerald-500/25 bg-emerald-500/5"
                            : "border-amber-500/25 bg-amber-500/5",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div className="space-y-2">
                            <p className="text-base font-semibold">
                              {isDraftComplete
                                ? "The Jersey filing data is complete."
                                : "The Jersey filing still needs attention."}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {isDraftComplete
                                ? "All currently required fields are filled based on the Jersey company return rules."
                                : `The form is missing ${missingFields.length} required field${missingFields.length === 1 ? "" : "s"}.`}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setDraftForm(
                                sanitizeJerseyCompanyReturnData(formQuery.data),
                              )
                            }
                          >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Reset draft
                          </Button>
                        </div>

                        {!isDraftComplete && missingFields.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {missingFields.slice(0, 8).map((field) => (
                              <span
                                key={field}
                                className="inline-flex items-center rounded-full border border-amber-500/30 bg-background px-2.5 py-1 text-[11px] text-amber-800"
                              >
                                {formatMissingFieldPath(field)}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <SectionCard
                        title="Section 1"
                        description="Residency, statement attachments, SIC code, profit figures, and Schedule A gating."
                        missingCount={missingBySection.section1.length}
                      >
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <FieldShell label="Residence">
                            <Select
                              value={section1.residence ?? ""}
                              onValueChange={(value) =>
                                updateSection("section1", {
                                  residence:
                                    value as JerseyCompanyReturnFormData["section1"]["residence"],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select residence" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_RESIDENCE_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Jersey branch or PE">
                            <Select
                              value={
                                section1.hasJerseyBranchOrPermanentEstablishment ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("section1", {
                                  hasJerseyBranchOrPermanentEstablishment:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Accounting date ends in YOA">
                            <Select
                              value={
                                section1.accountingDateEndsInYearOfAssessment ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("section1", {
                                  accountingDateEndsInYearOfAssessment:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Signed financial statements attached">
                            <Select
                              value={
                                section1.areSignedFinancialStatementsAttached ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("section1", {
                                  areSignedFinancialStatementsAttached:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Branch financial statements attached">
                            <Select
                              value={
                                section1.areBranchFinancialStatementsAttached ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("section1", {
                                  areBranchFinancialStatementsAttached:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Schedule A income">
                            <Select
                              value={section1.receivesScheduleAIncome ?? ""}
                              onValueChange={(value) =>
                                updateSection("section1", {
                                  receivesScheduleAIncome:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell
                            label="Activity description"
                            className="md:col-span-2 xl:col-span-3"
                          >
                            <Textarea
                              value={section1.activityDescription ?? ""}
                              onChange={(event) =>
                                updateSection("section1", {
                                  activityDescription: event.target.value,
                                })
                              }
                              rows={3}
                            />
                          </FieldShell>

                          <FieldShell label="SIC code">
                            <Input
                              value={section1.sicCode ?? ""}
                              onChange={(event) =>
                                updateSection("section1", {
                                  sicCode: event.target.value,
                                })
                              }
                              placeholder="5-digit SIC"
                            />
                          </FieldShell>

                          <FieldShell label="Gross turnover">
                            <Input
                              value={section1.grossTurnover ?? ""}
                              onChange={(event) =>
                                updateSection("section1", {
                                  grossTurnover: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>

                          <FieldShell label="Accounting profit or loss">
                            <Input
                              value={section1.accountingProfitOrLoss ?? ""}
                              onChange={(event) =>
                                updateSection("section1", {
                                  accountingProfitOrLoss: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>

                          <FieldShell label="Jersey resident individual owns >2%">
                            <Select
                              value={
                                section1.jerseyResidentIndividualOwnsOverTwoPercent ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("section1", {
                                  jerseyResidentIndividualOwnsOverTwoPercent:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>
                        </div>

                        <FieldShell
                          label="Entity status"
                          hint="Select every status that applies to this company."
                        >
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {JERSEY_ENTITY_STATUS_OPTIONS.map((status) => {
                              const checked =
                                section1.entityStatuses?.includes(status) ??
                                false;

                              return (
                                <label
                                  key={status}
                                  className="flex items-start gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-3 text-sm"
                                >
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(nextChecked) => {
                                      const current =
                                        section1.entityStatuses ?? [];
                                      updateSection("section1", {
                                        entityStatuses: nextChecked
                                          ? [...current, status]
                                          : current.filter((entry) => entry !== status),
                                      });
                                    }}
                                  />
                                  <span>{status}</span>
                                </label>
                              );
                            })}
                          </div>
                        </FieldShell>
                      </SectionCard>

                      <SectionCard
                        title="Economic substance"
                        description="Multi-national group flags, relevant activities, CIGA, outsourcing, and board management."
                        missingCount={missingBySection.economicSubstance.length}
                      >
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <FieldShell label="Part of multi-national group">
                            <Select
                              value={economicSubstance.partOfMultiNationalGroup ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  partOfMultiNationalGroup:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Consolidated revenue category">
                            <Select
                              value={economicSubstance.consolidatedRevenueCategory ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  consolidatedRevenueCategory:
                                    value as typeof JERSEY_CONSOLIDATED_REVENUE_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select category" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_CONSOLIDATED_REVENUE_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Financial periods start after 2018">
                            <Select
                              value={economicSubstance.financialPeriodsStartAfter2018 ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  financialPeriodsStartAfter2018:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="No relevant activities">
                            <Select
                              value={economicSubstance.noRelevantActivities ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  noRelevantActivities:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Adequate board meetings frequency">
                            <Select
                              value={economicSubstance.adequateFrequencyBoardMeetings ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  adequateFrequencyBoardMeetings:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Board meeting count">
                            <Input
                              value={economicSubstance.boardMeetingCount ?? ""}
                              onChange={(event) =>
                                updateSection("economicSubstance", {
                                  boardMeetingCount: event.target.value,
                                })
                              }
                              placeholder="0"
                            />
                          </FieldShell>

                          <FieldShell label="Strategic decisions made at meetings">
                            <Select
                              value={economicSubstance.strategicDecisionsMadeAtMeetings ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  strategicDecisionsMadeAtMeetings:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Board minutes kept in Jersey">
                            <Select
                              value={economicSubstance.boardMinutesKeptInJersey ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  boardMinutesKeptInJersey:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Board has sufficient expertise">
                            <Select
                              value={economicSubstance.boardHasSufficientExpertiseAndKnowledge ?? ""}
                              onValueChange={(value) =>
                                updateSection("economicSubstance", {
                                  boardHasSufficientExpertiseAndKnowledge:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>
                        </div>

                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">Relevant activities</p>
                              <p className="text-muted-foreground text-xs">
                                Add one card per relevant activity disclosed in the Jersey return.
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              onClick={addActivity}
                              className="shrink-0"
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add activity
                            </Button>
                          </div>

                          {!relevantActivities.length ? (
                            <div className="rounded-xl border border-dashed border-border/70 px-4 py-6 text-sm text-muted-foreground">
                              No relevant activities added yet.
                            </div>
                          ) : null}

                          {relevantActivities.map((activity, index) => {
                            const availableCiga =
                              activity.activity && activity.activity in JERSEY_CIGA_OPTIONS
                                ? JERSEY_CIGA_OPTIONS[
                                    activity.activity as JerseyRelevantActivity
                                  ]
                                : [];

                            return (
                              <div
                                key={`activity-${index}`}
                                className="rounded-[1.35rem] border border-border/70 bg-background/65 p-4"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="font-medium">
                                      Activity {index + 1}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                      Fill out the gross income, CIGA, expenditure, and outsourcing evidence for this activity.
                                    </p>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeActivity(index)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
                                  </Button>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                  <FieldShell label="Relevant activity">
                                    <Select
                                      value={activity.activity ?? ""}
                                      onValueChange={(value) =>
                                        updateActivity(index, {
                                          activity:
                                            value as JerseyRelevantActivity,
                                          cigaSelections: [],
                                        })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select activity" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {JERSEY_RELEVANT_ACTIVITY_OPTIONS.map(
                                          (option) => (
                                            <SelectItem key={option} value={option}>
                                              {option}
                                            </SelectItem>
                                          ),
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </FieldShell>

                                  <FieldShell label="Gross income">
                                    <Input
                                      value={activity.grossIncome ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          grossIncome: event.target.value,
                                        })
                                      }
                                      placeholder="0.00"
                                    />
                                  </FieldShell>

                                  <FieldShell label="Attributable accounting profits">
                                    <Input
                                      value={activity.attributableAccountingProfits ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          attributableAccountingProfits:
                                            event.target.value,
                                        })
                                      }
                                      placeholder="0.00"
                                    />
                                  </FieldShell>

                                  <FieldShell label="Employee count">
                                    <Input
                                      value={activity.employeeCount ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          employeeCount: event.target.value,
                                        })
                                      }
                                      placeholder="0"
                                    />
                                  </FieldShell>

                                  <FieldShell label="Qualified employee count">
                                    <Input
                                      value={activity.qualifiedEmployeeCount ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          qualifiedEmployeeCount:
                                            event.target.value,
                                        })
                                      }
                                      placeholder="0"
                                    />
                                  </FieldShell>

                                  <FieldShell label="Total Jersey gross expenditure">
                                    <Input
                                      value={activity.totalGrossExpenditureInJersey ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          totalGrossExpenditureInJersey:
                                            event.target.value,
                                        })
                                      }
                                      placeholder="0.00"
                                    />
                                  </FieldShell>

                                  <FieldShell label="Outsourcing gross expenditure">
                                    <Input
                                      value={activity.outsourcingGrossExpenditureInJersey ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          outsourcingGrossExpenditureInJersey:
                                            event.target.value,
                                        })
                                      }
                                      placeholder="0.00"
                                    />
                                  </FieldShell>

                                  <FieldShell label="Meets substance test">
                                    <Select
                                      value={activity.meetsSubstanceTest ?? ""}
                                      onValueChange={(value) =>
                                        updateActivity(index, {
                                          meetsSubstanceTest:
                                            value as typeof JERSEY_YES_NO_OPTIONS[number],
                                        })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {JERSEY_YES_NO_OPTIONS.map((option) => (
                                          <SelectItem key={option} value={option}>
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FieldShell>

                                  <FieldShell label="CIGA outsourced">
                                    <Select
                                      value={activity.hasCigaBeenOutsourced ?? ""}
                                      onValueChange={(value) =>
                                        updateActivity(index, {
                                          hasCigaBeenOutsourced:
                                            value as typeof JERSEY_YES_NO_OPTIONS[number],
                                        })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {JERSEY_YES_NO_OPTIONS.map((option) => (
                                          <SelectItem key={option} value={option}>
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FieldShell>

                                  <FieldShell label="Outsourcing provider count">
                                    <Input
                                      value={activity.outsourcingProviderCount ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          outsourcingProviderCount:
                                            event.target.value,
                                        })
                                      }
                                      placeholder="0"
                                    />
                                  </FieldShell>

                                  <FieldShell label="High-risk IP company">
                                    <Select
                                      value={activity.highRiskIpCompany ?? ""}
                                      onValueChange={(value) =>
                                        updateActivity(index, {
                                          highRiskIpCompany:
                                            value as typeof JERSEY_YES_NO_OPTIONS[number],
                                        })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {JERSEY_YES_NO_OPTIONS.map((option) => (
                                          <SelectItem key={option} value={option}>
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FieldShell>

                                  <FieldShell label="Evidence attached">
                                    <Select
                                      value={activity.evidenceAttached ?? ""}
                                      onValueChange={(value) =>
                                        updateActivity(index, {
                                          evidenceAttached:
                                            value as typeof JERSEY_YES_NO_OPTIONS[number],
                                        })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {JERSEY_YES_NO_OPTIONS.map((option) => (
                                          <SelectItem key={option} value={option}>
                                            {option}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </FieldShell>

                                  <FieldShell
                                    label="Premises addresses"
                                    className="md:col-span-2 xl:col-span-3"
                                    hint="Enter one address per line."
                                  >
                                    <Textarea
                                      value={textareaFromStringArray(activity.premisesAddresses)}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          premisesAddresses: stringArrayFromTextarea(
                                            event.target.value,
                                          ),
                                        })
                                      }
                                      rows={3}
                                    />
                                  </FieldShell>

                                  {availableCiga.length ? (
                                    <FieldShell
                                      label="CIGA selections"
                                      className="md:col-span-2 xl:col-span-3"
                                    >
                                      <div className="grid gap-3 md:grid-cols-2">
                                        {availableCiga.map((option) => {
                                          const checked =
                                            activity.cigaSelections?.includes(option) ??
                                            false;

                                          return (
                                            <label
                                              key={option}
                                              className="flex items-start gap-3 rounded-xl border border-border/70 bg-card px-3 py-3 text-sm"
                                            >
                                              <Checkbox
                                                checked={checked}
                                                onCheckedChange={(nextChecked) => {
                                                  const current =
                                                    activity.cigaSelections ?? [];
                                                  updateActivity(index, {
                                                    cigaSelections: nextChecked
                                                      ? [...current, option]
                                                      : current.filter(
                                                          (entry) => entry !== option,
                                                        ),
                                                  });
                                                }}
                                              />
                                              <span>{option}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </FieldShell>
                                  ) : null}

                                  <FieldShell
                                    label="Other CIGA details"
                                    className="md:col-span-2 xl:col-span-3"
                                  >
                                    <Textarea
                                      value={activity.otherCiga ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          otherCiga: event.target.value,
                                        })
                                      }
                                      rows={2}
                                    />
                                  </FieldShell>

                                  <FieldShell label="Immediate parent name">
                                    <Input
                                      value={activity.immediateParentName ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          immediateParentName: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>

                                  <FieldShell label="Immediate parent address">
                                    <Input
                                      value={activity.immediateParentAddress ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          immediateParentAddress:
                                            event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>

                                  <FieldShell label="Ultimate parent name">
                                    <Input
                                      value={activity.ultimateParentName ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          ultimateParentName: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>

                                  <FieldShell label="Ultimate parent address">
                                    <Input
                                      value={activity.ultimateParentAddress ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          ultimateParentAddress:
                                            event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>

                                  <FieldShell label="Tangible assets NBV">
                                    <Input
                                      value={activity.tangibleAssetsNetBookValue ?? ""}
                                      onChange={(event) =>
                                        updateActivity(index, {
                                          tangibleAssetsNetBookValue:
                                            event.target.value,
                                        })
                                      }
                                      placeholder="0.00"
                                    />
                                  </FieldShell>
                                </div>

                                <div className="mt-5 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-semibold">
                                        Outsourcing providers
                                      </p>
                                      <p className="text-muted-foreground text-xs">
                                        Add each Jersey provider referenced for this activity.
                                      </p>
                                    </div>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => addProvider(index)}
                                    >
                                      <Plus className="mr-2 h-4 w-4" />
                                      Add provider
                                    </Button>
                                  </div>

                                  {(activity.outsourcingProviders ?? []).map(
                                    (provider, providerIndex) => (
                                      <div
                                        key={`provider-${index}-${providerIndex}`}
                                        className="rounded-xl border border-border/70 bg-card px-4 py-4"
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <p className="text-sm font-medium">
                                            Provider {providerIndex + 1}
                                          </p>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              removeProvider(index, providerIndex)
                                            }
                                          >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Remove
                                          </Button>
                                        </div>

                                        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                                          <FieldShell label="Name">
                                            <Input
                                              value={provider.name ?? ""}
                                              onChange={(event) =>
                                                updateProvider(index, providerIndex, {
                                                  name: event.target.value,
                                                })
                                              }
                                            />
                                          </FieldShell>
                                          <FieldShell label="Expenditure value">
                                            <Input
                                              value={provider.expenditureValue ?? ""}
                                              onChange={(event) =>
                                                updateProvider(index, providerIndex, {
                                                  expenditureValue:
                                                    event.target.value,
                                                })
                                              }
                                            />
                                          </FieldShell>
                                          <FieldShell label="TIN">
                                            <Input
                                              value={provider.tin ?? ""}
                                              onChange={(event) =>
                                                updateProvider(index, providerIndex, {
                                                  tin: event.target.value,
                                                })
                                              }
                                            />
                                          </FieldShell>
                                          <FieldShell label="Address">
                                            <Input
                                              value={provider.address ?? ""}
                                              onChange={(event) =>
                                                updateProvider(index, providerIndex, {
                                                  address: event.target.value,
                                                })
                                              }
                                            />
                                          </FieldShell>
                                          <FieldShell label="Employee figures included">
                                            <Select
                                              value={provider.employeeFiguresIncluded ?? ""}
                                              onValueChange={(value) =>
                                                updateProvider(index, providerIndex, {
                                                  employeeFiguresIncluded:
                                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                                })
                                              }
                                            >
                                              <SelectTrigger>
                                                <SelectValue placeholder="Select" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {JERSEY_YES_NO_OPTIONS.map(
                                                  (option) => (
                                                    <SelectItem
                                                      key={option}
                                                      value={option}
                                                    >
                                                      {option}
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </FieldShell>
                                          <FieldShell label="Premises provided">
                                            <Select
                                              value={provider.premisesProvided ?? ""}
                                              onValueChange={(value) =>
                                                updateProvider(index, providerIndex, {
                                                  premisesProvided:
                                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                                })
                                              }
                                            >
                                              <SelectTrigger>
                                                <SelectValue placeholder="Select" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {JERSEY_YES_NO_OPTIONS.map(
                                                  (option) => (
                                                    <SelectItem
                                                      key={option}
                                                      value={option}
                                                    >
                                                      {option}
                                                    </SelectItem>
                                                  ),
                                                )}
                                              </SelectContent>
                                            </Select>
                                          </FieldShell>
                                        </div>
                                      </div>
                                    ),
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </SectionCard>

                      <SectionCard
                        title="Schedule A"
                        description="Complete this when the company receives Jersey Schedule A income or premiums."
                        missingCount={missingBySection.scheduleA.length}
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <FieldShell label="Schedule A financial statements attached">
                            <Select
                              value={
                                scheduleA.areScheduleAFinancialStatementsAttached ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("scheduleA", {
                                  areScheduleAFinancialStatementsAttached:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Gross income or premiums">
                            <Input
                              value={scheduleA.grossIncomeOrPremiums ?? ""}
                              onChange={(event) =>
                                updateSection("scheduleA", {
                                  grossIncomeOrPremiums: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>
                        </div>
                      </SectionCard>

                      <SectionCard
                        title="Distributions"
                        description="Track distributions made to Jersey-resident shareholders."
                        missingCount={missingBySection.distributions.length}
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <FieldShell label="Distributions to Jersey-resident shareholders">
                            <Select
                              value={
                                distributions.hasDistributionsToJerseyResidentShareholders ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("distributions", {
                                  hasDistributionsToJerseyResidentShareholders:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>

                          <FieldShell label="Total distributions amount">
                            <Input
                              value={distributions.totalDistributionsAmount ?? ""}
                              onChange={(event) =>
                                updateSection("distributions", {
                                  totalDistributionsAmount: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>
                        </div>

                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">Shareholders</p>
                              <p className="text-muted-foreground text-xs">
                                Add any Jersey-resident shareholders receiving distributions.
                              </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={addShareholder}>
                              <Plus className="mr-2 h-4 w-4" />
                              Add shareholder
                            </Button>
                          </div>

                          {(distributions.shareholders ?? []).map(
                            (shareholder, index) => (
                              <div
                                key={`shareholder-${index}`}
                                className="rounded-xl border border-border/70 bg-background/65 px-4 py-4"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium">
                                    Shareholder {index + 1}
                                  </p>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeShareholder(index)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
                                  </Button>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                  <FieldShell label="Name">
                                    <Input
                                      value={shareholder.name ?? ""}
                                      onChange={(event) =>
                                        updateShareholder(index, {
                                          name: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                  <FieldShell label="TIN">
                                    <Input
                                      value={shareholder.tin ?? ""}
                                      onChange={(event) =>
                                        updateShareholder(index, {
                                          tin: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                  <FieldShell label="Amount">
                                    <Input
                                      value={shareholder.amount ?? ""}
                                      onChange={(event) =>
                                        updateShareholder(index, {
                                          amount: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                  <FieldShell label="Address">
                                    <Input
                                      value={shareholder.address ?? ""}
                                      onChange={(event) =>
                                        updateShareholder(index, {
                                          address: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </SectionCard>

                      <SectionCard
                        title="Compliance"
                        description="Ultimate parent, connected-person deductions, and statement metrics."
                        missingCount={missingBySection.compliance.length}
                      >
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          <FieldShell label="Has ultimate parent company">
                            <Select
                              value={compliance.hasUltimateParentCompany ?? ""}
                              onValueChange={(value) =>
                                updateSection("compliance", {
                                  hasUltimateParentCompany:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>
                          <FieldShell label="Ultimate parent country">
                            <Input
                              value={compliance.ultimateParentCountry ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  ultimateParentCountry: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Ultimate parent name">
                            <Input
                              value={compliance.ultimateParentName ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  ultimateParentName: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Ultimate parent address" className="md:col-span-2 xl:col-span-3">
                            <Input
                              value={compliance.ultimateParentAddress ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  ultimateParentAddress: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Gross profit">
                            <Input
                              value={compliance.grossProfit ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  grossProfit: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>
                          <FieldShell label="Employment costs">
                            <Input
                              value={compliance.employmentCosts ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  employmentCosts: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>
                          <FieldShell label="Directors remuneration">
                            <Input
                              value={compliance.directorsRemuneration ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  directorsRemuneration: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>
                          <FieldShell label="Finance costs">
                            <Input
                              value={compliance.financeCosts ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  financeCosts: event.target.value,
                                })
                              }
                              placeholder="0.00"
                            />
                          </FieldShell>
                          <FieldShell label="Connected person deductions above threshold">
                            <Select
                              value={
                                compliance.hasConnectedPersonDeductionsAboveThreshold ??
                                ""
                              }
                              onValueChange={(value) =>
                                updateSection("compliance", {
                                  hasConnectedPersonDeductionsAboveThreshold:
                                    value as typeof JERSEY_YES_NO_OPTIONS[number],
                                })
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {JERSEY_YES_NO_OPTIONS.map((option) => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FieldShell>
                          <FieldShell label="Stock value">
                            <Input
                              value={compliance.stockValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  stockValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Land value">
                            <Input
                              value={compliance.landValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  landValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Fixed assets other than land">
                            <Input
                              value={compliance.fixedAssetsOtherThanLandValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  fixedAssetsOtherThanLandValue:
                                    event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Intangible assets value">
                            <Input
                              value={compliance.intangibleAssetsValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  intangibleAssetsValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Finance assets value">
                            <Input
                              value={compliance.financeAssetsValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  financeAssetsValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Finance liabilities value">
                            <Input
                              value={compliance.financeLiabilitiesValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  financeLiabilitiesValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Trade debtors value">
                            <Input
                              value={compliance.tradeDebtorsValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  tradeDebtorsValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Trade creditors value">
                            <Input
                              value={compliance.tradeCreditorsValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  tradeCreditorsValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                          <FieldShell label="Fund value">
                            <Input
                              value={compliance.fundValue ?? ""}
                              onChange={(event) =>
                                updateSection("compliance", {
                                  fundValue: event.target.value,
                                })
                              }
                            />
                          </FieldShell>
                        </div>

                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">
                                Connected person deductions
                              </p>
                              <p className="text-muted-foreground text-xs">
                                Add each connected person deduction where the threshold is met.
                              </p>
                            </div>
                            <Button variant="outline" size="sm" onClick={addDeduction}>
                              <Plus className="mr-2 h-4 w-4" />
                              Add deduction
                            </Button>
                          </div>

                          {(compliance.connectedPersonDeductions ?? []).map(
                            (deduction, index) => (
                              <div
                                key={`deduction-${index}`}
                                className="rounded-xl border border-border/70 bg-background/65 px-4 py-4"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-sm font-medium">
                                    Deduction {index + 1}
                                  </p>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeDeduction(index)}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Remove
                                  </Button>
                                </div>

                                <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                                  <FieldShell label="Country of residence">
                                    <Input
                                      value={deduction.countryOfResidence ?? ""}
                                      onChange={(event) =>
                                        updateDeduction(index, {
                                          countryOfResidence: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                  <FieldShell label="Name">
                                    <Input
                                      value={deduction.name ?? ""}
                                      onChange={(event) =>
                                        updateDeduction(index, {
                                          name: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                  <FieldShell label="Amount">
                                    <Input
                                      value={deduction.amount ?? ""}
                                      onChange={(event) =>
                                        updateDeduction(index, {
                                          amount: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                  <FieldShell label="Address">
                                    <Input
                                      value={deduction.address ?? ""}
                                      onChange={(event) =>
                                        updateDeduction(index, {
                                          address: event.target.value,
                                        })
                                      }
                                    />
                                  </FieldShell>
                                </div>
                              </div>
                            ),
                          )}
                        </div>
                      </SectionCard>

                      <SectionCard
                        title="Additional information"
                        description="Internal notes and evidence context for the Jersey filing."
                        missingCount={missingBySection.additionalInfo.length}
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <FieldShell label="Notes">
                            <Textarea
                              value={additionalInfo.notes ?? ""}
                              onChange={(event) =>
                                updateSection("additionalInfo", {
                                  notes: event.target.value,
                                })
                              }
                              rows={5}
                            />
                          </FieldShell>
                          <FieldShell label="Evidence notes">
                            <Textarea
                              value={additionalInfo.evidenceNotes ?? ""}
                              onChange={(event) =>
                                updateSection("additionalInfo", {
                                  evidenceNotes: event.target.value,
                                })
                              }
                              rows={5}
                            />
                          </FieldShell>
                        </div>
                      </SectionCard>

                      <div className="flex justify-end">
                        <Button
                          onClick={() => {
                            void handleSave();
                          }}
                          disabled={
                            updateFormMutation.isPending ||
                            createFormMutation.isPending
                          }
                        >
                          {updateFormMutation.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Save className="mr-2 h-4 w-4" />
                          )}
                          Save Jersey form
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </Tabs>
          </section>
        </div>
      </div>
    </>
  );
}
