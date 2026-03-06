"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  CalendarClock,
  FileSpreadsheet,
  Loader2,
  Save,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";

import { uploadPortalFile } from "@/lib/portal-upload";
import { trackPortalRecentReturn } from "@/lib/portal-recent";
import {
  CIGA_BY_ACTIVITY,
  FIELD_LABELS,
  FORM_SECTIONS,
  getMissingFields,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { api } from "@/trpc/react";
import {
  ReturnWorkspaceFormSkeleton,
  ReturnWorkspacePageSkeleton,
} from "@/components/return-workspace-skeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ReturnStatusTone = "pending" | "in_progress" | "completed" | "failed" | "review_required";
type WorkspaceTab = "form" | "files";
type SectionId = (typeof FORM_SECTIONS)[number]["id"];
type PendingFiles = Record<string, File[]>;

type VaultFile = {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt?: string;
};

const YES_NO = ["Yes", "No"] as const;
const YES_NO_NA = ["Yes", "No", "N/A"] as const;
const ENTITY_TYPES = ["Company", "Partnership"] as const;
const RELEVANT_ACTIVITIES = [
  "Banking",
  "Insurance",
  "Fund management",
  "Financing and leasing",
  "Distribution and Service Centre",
  "Headquarters",
  "Shipping",
  "Self-managed fund",
  "Intellectual Property Holding Company",
  "Pure Equity Holding Company",
  "None of the above",
] as const;

const STATUS_LABEL: Record<ReturnStatusTone, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
  review_required: "Review Required",
};

const STATUS_CLASS: Record<ReturnStatusTone, string> = {
  pending: "bg-amber-500/15 text-amber-700 ring-amber-500/30",
  in_progress: "bg-blue-500/15 text-blue-700 ring-blue-500/30",
  completed: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30",
  failed: "bg-rose-500/15 text-rose-700 ring-rose-500/30",
  review_required: "bg-violet-500/15 text-violet-700 ring-violet-500/30",
};

const LONG_TEXT_FIELDS = new Set([
  "registeredAddress",
  "principalPlaceOfBusiness",
  "cigaPerformed",
  "cigaDetails",
  "outsourcingDetails",
  "highRiskRebuttalNarrative",
  "postBalanceSheetEventDetails",
  "c42AssociatedCompanies",
  "contractInformation",
]);

const DATE_FIELDS = new Set([
  "accountingPeriodStart",
  "accountingPeriodEnd",
  "preparedDate",
  "managerSignOffDate",
]);

const NUMBER_FIELDS = new Set([
  "totalBoardMeetings",
  "boardMeetingsInGuernsey",
  "totalFte",
  "totalQualifiedFte",
]);

const YES_NO_FIELDS = new Set([
  "isCollectiveInvestmentVehicle",
  "areFinancialStatementsConsolidated",
  "isGuernseyFiFatca",
  "isGuernseyFiCrs",
  "hasMultipleRelevantActivities",
  "hasIntellectualPropertyHolding",
  "isHighRiskIpEntity",
  "wantsToRebutHighRiskStatus",
  "allBoardMeetingsInGuernsey",
  "isConstituentEntity",
  "hasPostBalanceSheetEvent",
  "hasC42Association",
]);

const YES_NO_NA_FIELDS = new Set([
  "hasAdequateExpenditure",
  "hasAdequatePhysicalPresence",
  "hasCigaOutsourcing",
  "adequateMeetingFrequency",
  "enoughDirectorsPresent",
  "directorsHaveExpertise",
  "strategicDecisionsMadeInGuernsey",
  "recordsMaintainedInGuernsey",
]);

const ARRAY_FIELDS = new Set([
  "employees",
  "immediateParents",
  "ultimateParents",
  "ultimateBeneficialOwners",
  "directors",
  "boardMeetings",
]);

const SUBSTANCE_FORM_KEYS = new Set<keyof SubstanceFormData>(
  Object.keys(FIELD_LABELS) as Array<keyof SubstanceFormData>,
);

function normalizeStatus(status: string): ReturnStatusTone {
  if (status === "pending") return "pending";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  return "review_required";
}

function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(2)}MB`;
}

function isFilled(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "boolean") return true;
  return Boolean(value);
}

function asVaultFiles(files: unknown): VaultFile[] {
  if (!Array.isArray(files)) return [];

  const parsed: VaultFile[] = [];
  for (const entry of files) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    if (typeof row.url !== "string" || typeof row.name !== "string") continue;
    parsed.push({
      url: row.url,
      name: row.name,
      size: typeof row.size === "number" ? row.size : 0,
      type: typeof row.type === "string" ? row.type : "application/octet-stream",
      uploadedAt: typeof row.uploadedAt === "string" ? row.uploadedAt : undefined,
    });
  }

  return parsed;
}

function sanitizeFormData(form: unknown): Partial<SubstanceFormData> {
  if (!form || typeof form !== "object") {
    return {};
  }

  const source = form as Record<string, unknown>;
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (!SUBSTANCE_FORM_KEYS.has(key as keyof SubstanceFormData)) {
      continue;
    }

    if (value === null) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized as Partial<SubstanceFormData>;
}

function normalizeEntityType(value: string): SubstanceFormData["entityType"] | undefined {
  if (value === "Company") return "Company";
  if (value === "Partnership") return "Partnership";
  return undefined;
}

function normalizeRelevantActivity(value: string): SubstanceFormData["relevantActivity"] | undefined {
  if (RELEVANT_ACTIVITIES.includes(value as (typeof RELEVANT_ACTIVITIES)[number])) {
    return value as SubstanceFormData["relevantActivity"];
  }
  return undefined;
}

function previewValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? `${value.length} entries` : null;
  return null;
}

export default function ReturnWorkspacePage() {
  const params = useParams<{ orgId: string; returnId: string }>();
  const orgId = params.orgId;
  const returnId = params.returnId;
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("form");
  const [activeSectionId, setActiveSectionId] = useState<SectionId>(FORM_SECTIONS[0].id);
  const [draftForm, setDraftForm] = useState<Partial<SubstanceFormData>>({});
  const [pendingEsrFiles, setPendingEsrFiles] = useState<PendingFiles>({});
  const [pendingFinancialFiles, setPendingFinancialFiles] = useState<PendingFiles>({});
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [savingSection, setSavingSection] = useState(false);
  const [isSectionDialogOpen, setIsSectionDialogOpen] = useState(false);

  const recentTrackedRef = useRef<string | null>(null);

  const utils = api.useUtils();
  const returnsQuery = api.portalReturns.listByOrg.useQuery({ orgId }, { enabled: !!orgId });

  const selectedReturn = useMemo(
    () => (returnsQuery.data ?? []).find((row) => row.id === returnId) ?? null,
    [returnId, returnsQuery.data],
  );

  const createSubstanceFormMutation = api.portalReturns.createSubstanceForm.useMutation({
    onSuccess: () => {
      if (!selectedReturn) return;
      void utils.portalReturns.getSubstanceForm.invalidate({ orgId, taxReturnId: selectedReturn.id });
      void utils.portalReturns.listByOrg.invalidate({ orgId });
    },
  });

  const updateSubstanceFormMutation = api.portalReturns.updateSubstanceForm.useMutation({
    onSuccess: () => {
      if (!selectedReturn) return;
      void utils.portalReturns.getSubstanceForm.invalidate({ orgId, taxReturnId: selectedReturn.id });
      void utils.portalReturns.listByOrg.invalidate({ orgId });
    },
  });

  const addDocumentsMutation = api.portalReturns.addReturnDocuments.useMutation({
    onSuccess: () => {
      void utils.portalReturns.listByOrg.invalidate({ orgId });
    },
  });

  const extractSubstanceFormMutation = api.portalReturns.extractSubstanceFormFromFiles.useMutation({
    onSuccess: () => {
      void utils.portalReturns.listByOrg.invalidate({ orgId });
      if (!selectedReturn) return;
      void utils.portalReturns.getSubstanceForm.invalidate({ orgId, taxReturnId: selectedReturn.id });
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
    void trackPortalRecentReturn({ orgId, returnId: selectedReturn.id }).finally(() => {
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
    () => visibleSections.find((section) => section.id === activeSectionId) ?? null,
    [activeSectionId, visibleSections],
  );

  const selectedFiles = asVaultFiles(selectedReturn?.files);
  const selectedStatus = selectedReturn ? normalizeStatus(selectedReturn.status) : "pending";
  const draftMissingFields = useMemo(() => getMissingFields(draftForm), [draftForm]);

  const showMessage = (message: string) => {
    setWorkspaceMessage(message);
  };

  const handleUploadEsr = async () => {
    if (!selectedReturn) return;

    const selectedEsr = pendingEsrFiles[selectedReturn.id]?.[0];
    if (!selectedEsr) {
      showMessage("Choose an ESR file before starting AI processing.");
      return;
    }

    try {
      showMessage("Uploading ESR and starting AI processing...");
      const uploaded = await uploadPortalFile({
        orgId,
        taxReturnId: selectedReturn.id,
        file: selectedEsr,
        category: "esr",
      });

      await addDocumentsMutation.mutateAsync({
        orgId,
        taxReturnId: selectedReturn.id,
        documents: [uploaded],
      });

      const extractionUrls = Array.from(new Set([...selectedFiles.map((file) => file.url), uploaded.url]));
      const result = await extractSubstanceFormMutation.mutateAsync({
        orgId,
        taxReturnId: selectedReturn.id,
        fileUrls: extractionUrls,
      });

      setPendingEsrFiles((previous) => ({ ...previous, [selectedReturn.id]: [] }));
      setActiveTab("form");
      showMessage(`ESR uploaded. AI extracted ${result.extractedFields.length} field(s).`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to process ESR right now.");
    }
  };

  const handleUploadFinancials = async () => {
    if (!selectedReturn) return;

    const files = pendingFinancialFiles[selectedReturn.id] ?? [];
    if (!files.length) {
      showMessage("Choose at least one financial document.");
      return;
    }

    try {
      showMessage("Uploading financial documents...");
      const uploaded = await Promise.all(
        files.map((file) =>
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
        documents: uploaded,
      });

      setPendingFinancialFiles((previous) => ({ ...previous, [selectedReturn.id]: [] }));
      showMessage("Financial pack uploaded to vault.");
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to upload financial files.");
    }
  };

  const handleRunAiExtraction = async () => {
    if (!selectedReturn) return;

    const extractionUrls = selectedFiles.map((file) => file.url);
    if (!extractionUrls.length) {
      showMessage("Upload ESR or financial files before running extraction.");
      return;
    }

    try {
      showMessage("Running AI extraction across workspace files...");
      const result = await extractSubstanceFormMutation.mutateAsync({
        orgId,
        taxReturnId: selectedReturn.id,
        fileUrls: extractionUrls,
      });
      setActiveTab("form");
      showMessage(`AI extraction complete. Updated ${result.extractedFields.length} field(s).`);
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Unable to run AI extraction right now.");
    }
  };

  const handleInitForm = async () => {
    if (!selectedReturn) return;
    await createSubstanceFormMutation.mutateAsync({
      orgId,
      taxReturnId: selectedReturn.id,
    });
  };

  const handleSaveSection = async () => {
    if (!selectedReturn || !activeSection) return;

    const sectionPatch: Record<string, unknown> = {};
    for (const field of activeSection.fields) {
      sectionPatch[field] = draftForm[field as keyof SubstanceFormData];
    }

    setSavingSection(true);
    try {
      await updateSubstanceFormMutation.mutateAsync({
        orgId,
        taxReturnId: selectedReturn.id,
        data: sectionPatch as Partial<SubstanceFormData>,
      });
      showMessage(`${activeSection.title} saved.`);
      setIsSectionDialogOpen(false);
    } finally {
      setSavingSection(false);
    }
  };

  const renderField = (field: string) => {
    const label = FIELD_LABELS[field] ?? field;
    const value = draftForm[field as keyof SubstanceFormData];

    if (ARRAY_FIELDS.has(field)) {
      return (
        <div
          key={field}
          className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
        >
          <p className="font-medium text-foreground">{label}</p>
          <p className="mt-1">
            Complex list field. Upload ESR for AI extraction or edit in internal `/web` workflow.
          </p>
          {Array.isArray(value) ? <p className="mt-1 text-[11px]">Current entries: {value.length}</p> : null}
        </div>
      );
    }

    if (field === "entityType") {
      return (
        <label key={field} className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <select
            value={(value as string | undefined) ?? ""}
            onChange={(event) =>
              setDraftForm((previous) => ({
                ...previous,
                entityType: normalizeEntityType(event.target.value),
              }))
            }
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
          >
            <option value="">Select entity type</option>
            {ENTITY_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (field === "relevantActivity") {
      return (
        <label key={field} className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <select
            value={(value as string | undefined) ?? ""}
            onChange={(event) =>
              setDraftForm((previous) => ({
                ...previous,
                relevantActivity: normalizeRelevantActivity(event.target.value),
              }))
            }
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
          >
            <option value="">Select activity</option>
            {RELEVANT_ACTIVITIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (YES_NO_FIELDS.has(field) || YES_NO_NA_FIELDS.has(field)) {
      const options = YES_NO_NA_FIELDS.has(field) ? YES_NO_NA : YES_NO;
      return (
        <label key={field} className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <select
            value={(value as string | undefined) ?? ""}
            onChange={(event) =>
              setDraftForm((previous) => ({
                ...previous,
                [field]: event.target.value || undefined,
              }))
            }
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
          >
            <option value="">Select</option>
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      );
    }

    if (NUMBER_FIELDS.has(field)) {
      return (
        <label key={field} className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(event) =>
              setDraftForm((previous) => ({
                ...previous,
                [field]: event.target.value ? Number(event.target.value) : undefined,
              }))
            }
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
          />
        </label>
      );
    }

    if (DATE_FIELDS.has(field)) {
      return (
        <label key={field} className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <input
            type="date"
            value={(value as string | undefined) ?? ""}
            onChange={(event) =>
              setDraftForm((previous) => ({
                ...previous,
                [field]: event.target.value || undefined,
              }))
            }
            className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
          />
        </label>
      );
    }

    if (LONG_TEXT_FIELDS.has(field)) {
      return (
        <label key={field} className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
          <textarea
            value={(value as string | undefined) ?? ""}
            onChange={(event) =>
              setDraftForm((previous) => ({
                ...previous,
                [field]: event.target.value || undefined,
              }))
            }
            rows={3}
            className="w-full rounded-md border bg-background px-2.5 py-2 text-sm"
          />
        </label>
      );
    }

    return (
      <label key={field} className="space-y-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <input
          type="text"
          value={(value as string | undefined) ?? ""}
          onChange={(event) =>
            setDraftForm((previous) => ({
              ...previous,
              [field]: event.target.value || undefined,
            }))
          }
          className="h-9 w-full rounded-md border bg-background px-2.5 text-sm"
        />
      </label>
    );
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
        <section className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-sm font-medium">Return not found in this organization.</p>
          <p className="mt-1 text-xs text-muted-foreground">It may have been removed or you may not have access.</p>
          <Button className="mt-4" variant="outline" onClick={() => router.push(`/org/${orgId}/returns`)}>
            <ArrowLeft className="mr-2 size-4" />
            Back to returns
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-8">
      <Card className="rounded-2xl py-0">
        <CardHeader className="px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-semibold tracking-tight">{selectedReturn.entityName}</h1>
              {activeTab === "form" && activeSection ? (
                <span className="inline-flex items-center rounded-full border bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {activeSection.title}
                </span>
              ) : null}
            </div>
            <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Building2 className="size-3.5" />
                {selectedReturn.jurisdictionName} ({selectedReturn.jurisdictionCode})
              </span>
              <span>•</span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3.5" />
                Tax year {selectedReturn.taxYear}
              </span>
              {selectedReturn.externalId ? (
                <>
                  <span>•</span>
                  <span className="font-mono">{selectedReturn.externalId}</span>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ring-1 ${STATUS_CLASS[selectedStatus]}`}
            >
              {STATUS_LABEL[selectedStatus]}
            </span>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ring-1",
                substanceFormQuery.data?.isComplete
                  ? "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30"
                  : "bg-violet-500/15 text-violet-700 ring-violet-500/30",
              )}
            >
              {substanceFormQuery.data?.isComplete ? <BadgeCheck className="size-3.5" /> : <ShieldCheck className="size-3.5" />}
              {substanceFormQuery.data?.isComplete ? "Form complete" : "Form in progress"}
            </span>
          </div>
        </div>
        </CardHeader>

        <CardContent className="px-5 pb-5 pt-0">
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as WorkspaceTab)}
          className="mt-0"
        >
          <TabsList className="w-fit">
            <TabsTrigger value="form">Substance Form</TabsTrigger>
            <TabsTrigger value="files">Files & Documents</TabsTrigger>
          </TabsList>

          {(addDocumentsMutation.isPending || extractSubstanceFormMutation.isPending) && activeTab === "files" ? (
            <div className="mt-4 rounded-md border border-blue-500/20 bg-blue-500/10 px-4 py-3 text-sm text-blue-700">
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                Processing uploaded files...
              </div>
            </div>
          ) : null}

          <TabsContent value="form">
            <div className="space-y-4">
              {substanceFormQuery.isLoading && !substanceFormQuery.data ? (
                <ReturnWorkspaceFormSkeleton />
              ) : !substanceFormQuery.data ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="text-sm font-medium">Substance form not initialized</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Create the form, then complete sections or upload files for AI extraction.
                  </p>
                  <Button onClick={() => void handleInitForm()} disabled={createSubstanceFormMutation.isPending} className="mt-4">
                    {createSubstanceFormMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    Initialize form
                  </Button>
                </div>
              ) : (
                <>
                  <div
                    className={cn(
                      "rounded-lg border px-4 py-3",
                      draftMissingFields.length === 0
                        ? "border-emerald-500/30 bg-emerald-500/10"
                        : "border-amber-500/30 bg-amber-500/10",
                    )}
                  >
                    <p className="text-sm font-semibold">
                      {draftMissingFields.length === 0
                        ? "Form Complete"
                        : `${draftMissingFields.length} required fields are missing`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select a card to edit section details.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {visibleSections.map((section) => {
                      const filled = section.fields.filter((field) =>
                        isFilled(draftForm[field as keyof SubstanceFormData]),
                      ).length;
                      const total = section.fields.length;
                      const isActive = section.id === activeSectionId;
                      const previewRows = section.fields.reduce<Array<{ field: string; label: string; value: string }>>(
                        (rows, field) => {
                          if (rows.length >= 2) return rows;
                          const label = FIELD_LABELS[field as keyof typeof FIELD_LABELS] ?? field;
                          const value = previewValue(draftForm[field as keyof SubstanceFormData]);
                          if (value) {
                            rows.push({ field, label, value });
                          }
                          return rows;
                        },
                        [],
                      );

                      return (
                        <button
                          key={section.id}
                          type="button"
                          onClick={() => {
                            setActiveSectionId(section.id);
                            setIsSectionDialogOpen(true);
                          }}
                          className={cn(
                            "group rounded-xl border bg-background p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md",
                            isActive ? "border-primary/45 ring-1 ring-primary/25" : "",
                          )}
                        >
                          <p className="text-sm font-semibold">{section.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{section.description}</p>
                          {previewRows.length ? (
                            <div className="mt-2.5 space-y-1 text-[11px]">
                              {previewRows.map((row) => (
                                <p key={`${section.id}-${row.field}`} className="truncate text-muted-foreground">
                                  <span className="font-medium text-foreground">{row.label}:</span> {row.value}
                                </p>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-2.5 text-[11px] text-muted-foreground">No values yet</p>
                          )}
                          <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>
                              {filled}/{total} fields
                            </span>
                            <span className={cn("font-medium", isActive ? "text-primary" : "")}>
                              {isActive ? "Editing" : "Edit"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {activeSection ? (
                    <Dialog open={isSectionDialogOpen} onOpenChange={setIsSectionDialogOpen}>
                      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Editing {activeSection.title}</DialogTitle>
                          <DialogDescription>{activeSection.description}</DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-3 md:grid-cols-2">
                          {activeSection.fields.map((field) => renderField(field))}
                        </div>

                        {activeSection.id === "ciga" && draftForm.relevantActivity ? (
                          <div className="mt-1 rounded-lg border bg-muted/30 p-3">
                            <p className="text-xs font-medium">Suggested CIGA activities</p>
                            <div className="mt-2 grid gap-1.5">
                              {(CIGA_BY_ACTIVITY[draftForm.relevantActivity] ?? []).map((option) => {
                                const current = typeof draftForm.cigaPerformed === "string" ? draftForm.cigaPerformed : "";
                                const checked = current.includes(option);
                                return (
                                  <label key={option} className="flex items-start gap-2 text-xs">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={(event) => {
                                        const selected = current.split("; ").filter(Boolean);
                                        if (event.target.checked) {
                                          if (!selected.includes(option)) selected.push(option);
                                        } else {
                                          const next = selected.filter((value) => value !== option);
                                          selected.splice(0, selected.length, ...next);
                                        }
                                        setDraftForm((previous) => ({
                                          ...previous,
                                          cigaPerformed: selected.join("; ") || undefined,
                                        }));
                                      }}
                                      className="mt-0.5"
                                    />
                                    <span>{option}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}

                        <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                          <Button variant="outline" onClick={() => setDraftForm(sanitizeFormData(substanceFormQuery.data))}>
                            Reset
                          </Button>
                          <Button
                            onClick={() => void handleSaveSection()}
                            disabled={savingSection || updateSubstanceFormMutation.isPending}
                          >
                            {savingSection || updateSubstanceFormMutation.isPending ? (
                              <Loader2 className="mr-2 size-4 animate-spin" />
                            ) : (
                              <Save className="mr-2 size-4" />
                            )}
                            Save section
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  ) : null}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="files">
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="rounded-xl bg-background py-0">
                <CardContent className="p-4">
                <p className="text-sm font-semibold">Upload ESR</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload one ESR file and run extraction.
                </p>
                <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground transition hover:border-blue-500/40 hover:bg-blue-500/5">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      setPendingEsrFiles((previous) => ({
                        ...previous,
                        [selectedReturn.id]: file ? [file] : [],
                      }));
                    }}
                  />
                  <span className="inline-flex items-center gap-2">
                    <UploadCloud className="size-4" />
                    {pendingEsrFiles[selectedReturn.id]?.[0]?.name ?? "Choose ESR file"}
                  </span>
                </label>
                <Button
                  className="mt-3 w-full"
                  onClick={() => void handleUploadEsr()}
                  disabled={addDocumentsMutation.isPending || extractSubstanceFormMutation.isPending}
                >
                  {addDocumentsMutation.isPending || extractSubstanceFormMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <Sparkles className="mr-2 size-4" />
                  )}
                  Upload ESR + Extract
                </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl bg-background py-0">
                <CardContent className="p-4">
                <p className="text-sm font-semibold">Upload Supporting Files</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Upload additional financial/supporting files.
                </p>
                <label className="mt-3 flex cursor-pointer items-center justify-center rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground transition hover:border-emerald-500/40 hover:bg-emerald-500/5">
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.xlsx,.xls,.csv,.zip,.doc,.docx"
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      setPendingFinancialFiles((previous) => ({
                        ...previous,
                        [selectedReturn.id]: files,
                      }));
                    }}
                  />
                  <span className="inline-flex items-center gap-2">
                    <UploadCloud className="size-4" />
                    {(pendingFinancialFiles[selectedReturn.id]?.length ?? 0) > 0
                      ? `${pendingFinancialFiles[selectedReturn.id]?.length ?? 0} files selected`
                      : "Choose files"}
                  </span>
                </label>
                <Button
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => void handleUploadFinancials()}
                  disabled={addDocumentsMutation.isPending || extractSubstanceFormMutation.isPending}
                >
                  {addDocumentsMutation.isPending || extractSubstanceFormMutation.isPending ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <UploadCloud className="mr-2 size-4" />
                  )}
                  Upload files
                </Button>
                </CardContent>
              </Card>

              <Card className="rounded-xl bg-background py-0 lg:col-span-2">
                <CardContent className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">Uploaded Files</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void handleRunAiExtraction()}
                    disabled={!selectedFiles.length || extractSubstanceFormMutation.isPending}
                  >
                    {extractSubstanceFormMutation.isPending ? (
                      <Loader2 className="mr-2 size-4 animate-spin" />
                    ) : (
                      <Sparkles className="mr-2 size-4" />
                    )}
                    Run AI extraction
                  </Button>
                </div>

                {!selectedFiles.length ? (
                  <p className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">
                    No uploaded files yet.
                  </p>
                ) : (
                  <div className="divide-y rounded-xl border bg-background/70">
                    {selectedFiles.map((file) => (
                      <a
                        key={`${file.url}-${file.uploadedAt ?? file.name}`}
                        href={file.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between gap-3 p-3 transition hover:bg-muted/40"
                      >
                        <div className="flex items-center gap-3">
                          <span className="rounded-md bg-muted p-2">
                            <FileSpreadsheet className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatBytes(file.size)} • {file.uploadedAt ? new Date(file.uploadedAt).toLocaleString() : "Uploaded"}
                            </p>
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground">Open</span>
                      </a>
                    ))}
                  </div>
                )}
                </CardContent>
              </Card>

            </div>
          </TabsContent>
        </Tabs>

        {workspaceMessage ? (
          <div className="mt-4 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            {workspaceMessage}
          </div>
        ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
