"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  CalendarClock,
  ExternalLink,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

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

import { uploadPortalFile } from "@/lib/portal-upload";
import { sanitizeJerseyCompanyReturnData } from "@/lib/schemas/jersey-company-return";
import { api } from "@/trpc/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import Magnet from "@/components/Magnet";

import { ReturnFilesTab } from "./return-files-tab";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  asVaultFiles,
  type PortalReturnRecord,
  type ReturnStatusTone,
  type WorkspaceTab,
} from "./return-workspace-shared";

type JerseyReturnWorkspaceProps = {
  orgId: string;
  selectedReturn: PortalReturnRecord;
  selectedStatus: ReturnStatusTone;
  onDismiss?: () => void;
  onUndismiss?: () => void;
  isDismissing?: boolean;
  accessToken?: string;
  onNavigateToGuidedFinish?: () => void;
};

type SectionKey = keyof JerseyCompanyReturnFormData;

type FieldShellProps = {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

type JerseySection = {
  id: string;
  title: string;
  description: string;
};

const JERSEY_SECTIONS: JerseySection[] = [
  {
    id: "section1",
    title: "Section 1",
    description: "Residency, statement attachments, SIC code, profit figures, and Schedule A gating.",
  },
  {
    id: "economicSubstance",
    title: "Economic substance",
    description: "Multi-national group flags, relevant activities, CIGA, outsourcing, and board management.",
  },
  {
    id: "scheduleA",
    title: "Schedule A",
    description: "Assessment basis, income computation, and tax charge calculations.",
  },
  {
    id: "distributions",
    title: "Distributions",
    description: "Shareholder dividends, distribution details, and withholding amounts.",
  },
  {
    id: "compliance",
    title: "Compliance",
    description: "Connected person deductions, FATCA/CRS, and declaration statements.",
  },
  {
    id: "additionalInfo",
    title: "Additional information",
    description: "Supplementary notes and any extra information for the filing.",
  },
];

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

export function JerseyReturnWorkspace({
  orgId,
  selectedReturn,
  selectedStatus,
  onDismiss,
  onUndismiss,
  isDismissing,
  accessToken,
  onNavigateToGuidedFinish,
}: JerseyReturnWorkspaceProps) {
  const router = useRouter();
  const utils = api.useUtils();
  const isClientAccessMode = Boolean(accessToken);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("form");
  const [draftForm, setDraftForm] = useState<Partial<JerseyCompanyReturnFormData>>(
    createEmptyJerseyCompanyReturnFormData(),
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);
  const [uploadedFileUrls, setUploadedFileUrls] = useState<
    Array<{ name: string; url: string; type: string }> | null
  >(null);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);

  const portalFormQuery = api.portalReturns.getJerseyCompanyReturnForm.useQuery(
    {
      orgId,
      taxReturnId: selectedReturn.id,
    },
    {
      enabled:
        !isClientAccessMode &&
        selectedReturn.jurisdictionCode === "JE" &&
        selectedReturn.returnType === "company",
    },
  );
  const clientFormQuery = api.clientAccess.getJerseyCompanyReturnForm.useQuery(
    {
      token: accessToken ?? "",
    },
    {
      enabled:
        isClientAccessMode &&
        selectedReturn.jurisdictionCode === "JE" &&
        selectedReturn.returnType === "company",
    },
  );
  const formQuery = isClientAccessMode ? clientFormQuery : portalFormQuery;

  const portalCreateFormMutation =
    api.portalReturns.createJerseyCompanyReturnForm.useMutation({
      onSuccess: () => {
        void utils.portalReturns.getJerseyCompanyReturnForm.invalidate({
          orgId,
          taxReturnId: selectedReturn.id,
        });
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });
  const clientCreateFormMutation =
    api.clientAccess.createJerseyCompanyReturnForm.useMutation({
      onSuccess: () => {
        if (!accessToken) return;
        void utils.clientAccess.getJerseyCompanyReturnForm.invalidate({
          token: accessToken,
        });
        void utils.clientAccess.getAccess.invalidate({ token: accessToken });
      },
    });

  const portalUpdateFormMutation =
    api.portalReturns.updateJerseyCompanyReturnForm.useMutation({
      onSuccess: () => {
        void utils.portalReturns.getJerseyCompanyReturnForm.invalidate({
          orgId,
          taxReturnId: selectedReturn.id,
        });
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });
  const clientUpdateFormMutation =
    api.clientAccess.updateJerseyCompanyReturnForm.useMutation({
      onSuccess: () => {
        if (!accessToken) return;
        void utils.clientAccess.getJerseyCompanyReturnForm.invalidate({
          token: accessToken,
        });
        void utils.clientAccess.getAccess.invalidate({ token: accessToken });
      },
    });

  const portalAddDocumentsMutation =
    api.portalReturns.addReturnDocuments.useMutation({
      onSuccess: () => {
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });
  const clientAddDocumentsMutation = api.clientAccess.addReturnDocuments.useMutation(
    {
      onSuccess: () => {
        if (!accessToken) return;
        void utils.clientAccess.getAccess.invalidate({ token: accessToken });
      },
    },
  );

  const portalAssignDocumentRoleMutation =
    api.portalReturns.assignReturnDocumentRole.useMutation({
      onSuccess: () => {
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });
  const clientAssignDocumentRoleMutation =
    api.clientAccess.assignReturnDocumentRole.useMutation({
      onSuccess: () => {
        if (!accessToken) return;
        void utils.clientAccess.getAccess.invalidate({ token: accessToken });
      },
    });

  const portalRemoveDocumentMutation =
    api.portalReturns.removeReturnDocument.useMutation({
      onSuccess: () => {
        void utils.portalReturns.listByOrg.invalidate({ orgId });
      },
    });
  const clientRemoveDocumentMutation =
    api.clientAccess.removeReturnDocument.useMutation({
      onSuccess: () => {
        if (!accessToken) return;
        void utils.clientAccess.getAccess.invalidate({ token: accessToken });
      },
    });

  useEffect(() => {
    setDraftForm(sanitizeJerseyCompanyReturnData(formQuery.data));
  }, [formQuery.data, selectedReturn.id]);

  const selectedFiles = asVaultFiles(selectedReturn.files);
  const hasFinancialStatements = selectedFiles.some(
    (file) => file.role === "financial_statements",
  );

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

  const showMessage = (message: string, mode: "success" | "error" = "success") => {
    toast.dismiss();
    if (mode === "error") {
      toast.error(message);
      return;
    }
    toast.success(message);
  };

  const isCreateFormPending = isClientAccessMode
    ? clientCreateFormMutation.isPending
    : portalCreateFormMutation.isPending;
  const isUpdateFormPending = isClientAccessMode
    ? clientUpdateFormMutation.isPending
    : portalUpdateFormMutation.isPending;

  const ensureFormExists = async () => {
    if (formQuery.data) {
      return;
    }

    if (isClientAccessMode) {
      await clientCreateFormMutation.mutateAsync({
        token: accessToken!,
      });
      return;
    }

    await portalCreateFormMutation.mutateAsync({
      orgId,
      taxReturnId: selectedReturn.id,
    });
  };

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
    updateActivity(activityIndex, {
      outsourcingProviders: nextProviders,
    });
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

  const handleSave = async () => {
    try {
      await ensureFormExists();
      if (isClientAccessMode) {
        await clientUpdateFormMutation.mutateAsync({
          token: accessToken!,
          data: normalizedDraft,
        });
      } else {
        await portalUpdateFormMutation.mutateAsync({
          orgId,
          taxReturnId: selectedReturn.id,
          data: normalizedDraft,
        });
      }
      showMessage("Jersey return form saved.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to save Jersey return form.",
        "error",
      );
    }
  };

  const handleUploadFiles = async (files: File[]) => {
    if (!files.length) {
      return;
    }

    setIsUploadingFiles(true);
    setUploadedFileUrls(null);

    try {
      toast.loading("Uploading files...");
      const uploaded = await Promise.all(
        files.map((file) =>
          uploadPortalFile({
            orgId,
            taxReturnId: selectedReturn.id,
            file,
            category: file.type.includes("pdf") ? "financial" : "supporting",
            accessToken,
          }),
        ),
      );

      if (isClientAccessMode) {
        await clientAddDocumentsMutation.mutateAsync({
          token: accessToken!,
          documents: uploaded,
        });
      } else {
        await portalAddDocumentsMutation.mutateAsync({
          orgId,
          taxReturnId: selectedReturn.id,
          documents: uploaded,
        });
      }

      toast.dismiss();
      toast.success(`${uploaded.length} file(s) uploaded.`);
      setUploadedFileUrls(
        uploaded.map((file) => ({
          name: file.name,
          url: file.url,
          type: file.type,
        })),
      );
    } catch (error) {
      toast.dismiss();
      showMessage(
        error instanceof Error ? error.message : "Unable to upload files.",
        "error",
      );
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const handleAssignFinancialStatements = async (fileUrl: string) => {
    try {
      if (isClientAccessMode) {
        await clientAssignDocumentRoleMutation.mutateAsync({
          token: accessToken!,
          fileUrl,
          role: "financial_statements",
        });
      } else {
        await portalAssignDocumentRoleMutation.mutateAsync({
          orgId,
          taxReturnId: selectedReturn.id,
          fileUrl,
          role: "financial_statements",
        });
      }
      setUploadedFileUrls(null);
      showMessage("Signed financial statements assigned.");
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to assign financial statements.",
        "error",
      );
    }
  };

  const handleUnassignFinancialStatements = async (fileUrl: string) => {
    try {
      if (isClientAccessMode) {
        await clientAssignDocumentRoleMutation.mutateAsync({
          token: accessToken!,
          fileUrl,
          role: null,
        });
      } else {
        await portalAssignDocumentRoleMutation.mutateAsync({
          orgId,
          taxReturnId: selectedReturn.id,
          fileUrl,
          role: null,
        });
      }
      showMessage("Signed financial statements unassigned.");
    } catch (error) {
      showMessage(
        error instanceof Error
          ? error.message
          : "Unable to clear financial statement assignment.",
        "error",
      );
    }
  };

  const handleRemoveDocument = async (fileUrl: string) => {
    try {
      if (isClientAccessMode) {
        await clientRemoveDocumentMutation.mutateAsync({
          token: accessToken!,
          fileUrl,
        });
      } else {
        await portalRemoveDocumentMutation.mutateAsync({
          orgId,
          taxReturnId: selectedReturn.id,
          fileUrl,
        });
      }
      showMessage("File removed.");
    } catch (error) {
      showMessage(
        error instanceof Error ? error.message : "Unable to remove file.",
        "error",
      );
    }
  };

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
    <main className="mx-auto max-w-6xl space-y-5 pb-8">
      <div className="portal-card overflow-hidden rounded-[1.95rem]">
        <div className="px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-3xl space-y-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-3xl font-semibold tracking-tight">
                  {selectedReturn.entityName}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ring-1 ${STATUS_CLASS[selectedStatus]}`}
                >
                  {STATUS_LABEL[selectedStatus]}
                </span>
              </div>

              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {selectedReturn.jurisdictionName} ({selectedReturn.jurisdictionCode})
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  Tax year {selectedReturn.taxYear}
                </span>
                {selectedReturn.externalId ? (
                  <>
                    <span>·</span>
                    <span className="font-mono">{selectedReturn.externalId}</span>
                  </>
                ) : null}
              </p>

              <p className="text-muted-foreground max-w-2xl text-sm">
                Complete the Jersey company return sections, attach signed
                financial statements, and review before filing.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selectedStatus === "dismissed" && onUndismiss ? (
                <Button
                  variant="outline"
                  onClick={onUndismiss}
                  disabled={isDismissing}
                >
                  <RotateCcw className="size-4" />
                  Restore
                </Button>
              ) : selectedStatus !== "completed" && onDismiss ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isDismissing}>
                      <XCircle className="size-4" />
                      Dismiss
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Dismiss this return?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will mark the return as dismissed. You can restore it later from the returns list.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className={buttonVariants({ variant: "destructive" })}
                        onClick={onDismiss}
                      >
                        Dismiss
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : null}
              {selectedReturn.link ? (
                <Button variant="outline" asChild>
                  <a
                    href={selectedReturn.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    Portal
                  </a>
                </Button>
              ) : null}
              <Magnet padding={60} magnetStrength={3} wrapperClassName="cursor-pointer" innerClassName="cursor-pointer">
                <HoverCard openDelay={300} closeDelay={100}>
                  <HoverCardTrigger asChild>
                    <Button
                      className="cursor-pointer px-5"
                      onClick={() => {
                        if (onNavigateToGuidedFinish) {
                          onNavigateToGuidedFinish();
                          return;
                        }

                        router.push(
                          `/org/${orgId}/returns/${selectedReturn.id}/jersey-guided-finish`,
                        );
                      }}
                    >
                      <Sparkles className="size-4" />
                      Guided finish
                    </Button>
                  </HoverCardTrigger>
                  <HoverCardContent align="end" side="bottom" className="w-72 space-y-2 p-4">
                    <p className="text-sm font-semibold">Guided Finish Flow</p>
                    <p className="text-xs leading-relaxed text-muted-foreground">
                      Walk through every section step by step, fill in remaining fields, upload your financial statements, and review everything before marking the return as complete.
                    </p>
                    <ol className="space-y-1 text-[11px] text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <span className="mt-px font-semibold text-foreground">1.</span>
                        Complete each return section
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-px font-semibold text-foreground">2.</span>
                        Upload financial statements PDF
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="mt-px font-semibold text-foreground">3.</span>
                        Review and finalize the return
                      </li>
                    </ol>
                  </HoverCardContent>
                </HoverCard>
              </Magnet>
            </div>
          </div>
        </div>
      </div>

      <div className="portal-card overflow-hidden rounded-[1.95rem]">
        <div className="px-5 py-5">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-muted-foreground text-[11px] font-semibold tracking-[0.18em] uppercase">
                  {activeTab === "form" ? "Jersey company return" : "Return documents"}
                </p>
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-xl font-semibold tracking-tight">
                    {activeTab === "form" ? "Return form" : "Files & documents"}
                  </h2>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1",
                      isDraftComplete
                        ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30"
                        : "bg-amber-500/15 text-amber-700 ring-amber-500/30",
                    )}
                  >
                    {isDraftComplete ? "Complete" : "In progress"}
                  </span>
                </div>
                <p className="text-muted-foreground text-sm">
                  {activeTab === "form"
                    ? "Capture the Jersey-specific company return and embedded economic substance answers."
                    : "Upload signed financial statements and any supporting schedules or evidence for the Jersey filing."}
                </p>
              </div>

              <TabsList className="w-fit border-none bg-transparent p-0">
                <TabsTrigger value="form">Return form</TabsTrigger>
                <TabsTrigger value="files">Files & documents</TabsTrigger>
              </TabsList>
            </div>

            {activeTab === "form" ? (
              <div className="mt-6 space-y-5">
                {!formQuery.data ? (
                  <div className="rounded-[1.6rem] border border-dashed border-border/70 px-6 py-10 text-center">
                    <p className="text-lg font-semibold">
                      Jersey return form not initialized
                    </p>
                    <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
                      Create the Jersey company return form first, then complete
                      the filing sections and embedded economic substance
                      questions here.
                    </p>
                    <Button
                      className="mt-5"
                      onClick={() => {
                        void ensureFormExists()
                          .then(() => showMessage("Jersey form initialized."))
                          .catch((error) =>
                            showMessage(
                              error instanceof Error
                                ? error.message
                                : "Unable to initialize Jersey form.",
                              "error",
                            ),
                          );
                      }}
                      disabled={isCreateFormPending}
                    >
                      {isCreateFormPending ? (
                        "Initializing..."
                      ) : (
                        <>
                          <Plus className="size-4" />
                          Initialize form
                        </>
                      )}
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {JERSEY_SECTIONS.map((section) => {
                        const sectionMissing = missingBySection[section.id as keyof typeof missingBySection]?.length ?? 0;
                        const isActive = activeSectionId === section.id;

                        return (
                          <button
                            key={section.id}
                            type="button"
                            onClick={() => {
                              setActiveSectionId(section.id);
                              setIsSectionDialogOpen(true);
                            }}
                            className={cn(
                              "group cursor-pointer rounded-xl border border-border/70 bg-card p-4 text-left shadow-xs transition duration-200 hover:-translate-y-0.5 hover:shadow-sm",
                              isActive && "border-primary/30 ring-2 ring-primary/8",
                            )}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{section.title}</p>
                                <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                                  {section.description}
                                </p>
                              </div>

                              {sectionMissing > 0 ? (
                                <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-amber-700 uppercase">
                                  {sectionMissing} missing
                                </span>
                              ) : (
                                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-emerald-700 uppercase">
                                  Ready
                                </span>
                              )}
                            </div>

                            <div className="text-muted-foreground mt-4 flex items-center justify-between text-[11px]">
                              <span>
                                {sectionMissing === 0
                                  ? "All fields complete"
                                  : `${sectionMissing} field${sectionMissing === 1 ? "" : "s"} remaining`}
                              </span>
                              <span
                                className={cn(
                                  "font-semibold transition",
                                  isActive
                                    ? "text-blue-700"
                                    : "group-hover:text-foreground",
                                )}
                              >
                                {isActive ? "Last opened" : "Open section"}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
                      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
                        <DialogHeader className="shrink-0 border-b px-6 py-4">
                          <DialogTitle>
                            {JERSEY_SECTIONS.find((s) => s.id === activeSectionId)?.title ?? "Section"}
                          </DialogTitle>
                          <DialogDescription>
                            {JERSEY_SECTIONS.find((s) => s.id === activeSectionId)?.description}
                          </DialogDescription>
                        </DialogHeader>
                        <div className="flex-1 overflow-y-auto px-6 py-5">

                        {activeSectionId === "section1" ? (
                      <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
                        <FieldShell label="Residence">
                          <Select
                            value={section1.residence ?? ""}
                            onValueChange={(value) =>
                              updateSection("section1", {
                                residence: value as JerseyCompanyReturnFormData["section1"]["residence"],
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
                              section1.accountingDateEndsInYearOfAssessment ?? ""
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
                              section1.areSignedFinancialStatementsAttached ?? ""
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
                              section1.areBranchFinancialStatementsAttached ?? ""
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
                          className="md:col-span-2"
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
                        <div className="grid gap-3 md:grid-cols-2">
                          {JERSEY_ENTITY_STATUS_OPTIONS.map((status) => {
                            const checked =
                              section1.entityStatuses?.includes(status) ?? false;

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
                      </div>
                        ) : activeSectionId === "economicSubstance" ? (
                      <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
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
                            <Plus className="size-4" />
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
                              ? JERSEY_CIGA_OPTIONS[activity.activity]
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
                                  <Trash2 className="size-4" />
                                  Remove
                                </Button>
                              </div>

                              <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                                  className="md:col-span-2"
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
                                    className="md:col-span-2"
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
                                  className="md:col-span-2"
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
                                    <Plus className="size-4" />
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
                                          <Trash2 className="size-4" />
                                          Remove
                                        </Button>
                                      </div>

                                      <div className="mt-4 grid gap-4 md:grid-cols-2">
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
                      </div>
                        ) : activeSectionId === "scheduleA" ? (
                      <div className="space-y-5">
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
                      </div>
                        ) : activeSectionId === "distributions" ? (
                      <div className="space-y-5">
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
                            <Plus className="size-4" />
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
                                  <Trash2 className="size-4" />
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
                      </div>
                        ) : activeSectionId === "compliance" ? (
                      <div className="space-y-5">
                      <div className="grid gap-4 md:grid-cols-2">
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
                        <FieldShell label="Ultimate parent address" className="md:col-span-2">
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
                            <Plus className="size-4" />
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
                                  <Trash2 className="size-4" />
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
                      </div>
                        ) : activeSectionId === "additionalInfo" ? (
                      <div className="space-y-5">
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
                      </div>
                        ) : null}
                        </div>

                        <div className="shrink-0 border-t bg-muted/30 px-6 py-3 flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsSectionDialogOpen(false)}
                          >
                            Close
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              void handleSave();
                            }}
                            disabled={
                              isUpdateFormPending ||
                              isCreateFormPending
                            }
                          >
                            {isUpdateFormPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Save className="size-4" />
                            )}
                            Save
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </>
                )}
              </div>
            ) : (
              <div className="mt-6">
                <ReturnFilesTab
                  selectedReturnId={selectedReturn.id}
              selectedFiles={selectedFiles}
              hasFinancialStatements={hasFinancialStatements}
              isUploading={isUploadingFiles}
              isExtractPending={false}
              isAssignPending={
                isClientAccessMode
                  ? clientAssignDocumentRoleMutation.isPending
                  : portalAssignDocumentRoleMutation.isPending
              }
                  uploadedFileUrls={uploadedFileUrls}
                  showAiExtraction={false}
                  uploadDescription="Upload signed financial statements, Jersey schedules, and supporting evidence files."
                  uploadedFilesDescription="Review uploaded documents, open them, or assign the signed financial statements PDF used for the Jersey filing."
                  onUploadFiles={(files) => {
                    void handleUploadFiles(files);
                  }}
                  onAssignFinancialStatements={(fileUrl) => {
                    void handleAssignFinancialStatements(fileUrl);
                  }}
                  onDismissAssignment={() => setUploadedFileUrls(null)}
                  onRunAiExtraction={() => undefined}
                  onRemoveDocument={(fileUrl) => {
                    void handleRemoveDocument(fileUrl);
                  }}
                  onUnassignFinancialStatements={(fileUrl) => {
                    void handleUnassignFinancialStatements(fileUrl);
                  }}
                />
              </div>
            )}
          </Tabs>
        </div>
      </div>
    </main>
  );
}
