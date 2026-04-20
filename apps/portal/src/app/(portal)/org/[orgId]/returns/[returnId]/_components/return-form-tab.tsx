"use client";

import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, Loader2, Save, Sparkles, Trash2 } from "lucide-react";

import {
  FIELD_LABELS,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { ReturnWorkspaceFormSkeleton } from "@/components/return-workspace-skeleton";
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
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { ReturnFormFields } from "./return-form-fields";
import {
  getSectionCompletion,
  previewValue,
  sanitizeFormData,
  type FormSection,
  type PortalSubstanceForm,
  type SectionId,
} from "./return-workspace-shared";

type ReturnFormTabProps = {
  draftForm: Partial<SubstanceFormData>;
  setDraftForm: Dispatch<SetStateAction<Partial<SubstanceFormData>>>;
  visibleSections: FormSection[];
  activeSection: FormSection | null;
  activeSectionId: SectionId;
  setActiveSectionId: Dispatch<SetStateAction<SectionId>>;
  substanceForm: PortalSubstanceForm;
  isSubstanceFormLoading: boolean;
  draftMissingFields: string[];
  isSectionDialogOpen: boolean;
  setIsSectionDialogOpen: Dispatch<SetStateAction<boolean>>;
  savingSection: boolean;
  isUpdating: boolean;
  isInitializing: boolean;
  isReadOnly?: boolean;
  readOnlyMessage?: string;
  certificateType: "Certificate 2" | "Certificate 3" | null;
  showCertificateTypeControl?: boolean;
  isCertificateTypeUpdating?: boolean;
  onSetCertificateType?: (certificateType: "Certificate 2" | "Certificate 3") => void;
  onInitForm: () => void;
  onSaveSection: () => void;
  onClearForm: () => void;
};

export function ReturnFormTab({
  draftForm,
  setDraftForm,
  visibleSections,
  activeSection,
  activeSectionId,
  setActiveSectionId,
  substanceForm,
  isSubstanceFormLoading,
  draftMissingFields: _draftMissingFields,
  isSectionDialogOpen,
  setIsSectionDialogOpen,
  savingSection,
  isUpdating,
  isInitializing,
  isReadOnly = false,
  readOnlyMessage,
  certificateType,
  showCertificateTypeControl = false,
  isCertificateTypeUpdating = false,
  onSetCertificateType,
  onInitForm,
  onSaveSection,
  onClearForm,
}: ReturnFormTabProps) {
  const certificateLabel = certificateType ?? "Certificate 3";

  return (
    <TabsContent value="form">
      <div className="space-y-4">
        {isReadOnly && readOnlyMessage ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800">
            {readOnlyMessage}
          </div>
        ) : null}
        {isSubstanceFormLoading && !substanceForm ? (
          <ReturnWorkspaceFormSkeleton />
        ) : !substanceForm ? (
          <div className="portal-card rounded-[1.75rem] px-6 py-10 text-center">
            <p className="text-lg font-semibold">
              Substance form not initialized
            </p>
            <p className="text-muted-foreground mx-auto mt-2 max-w-xl text-sm">
              Create the form first, then complete the sections manually or use
              the guided finish flow to work through every question.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              {showCertificateTypeControl && onSetCertificateType ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      disabled={isCertificateTypeUpdating || isReadOnly}
                    >
                      {isCertificateTypeUpdating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      {certificateLabel}
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {(["Certificate 2", "Certificate 3"] as const).map((nextType) => (
                      <DropdownMenuItem
                        key={nextType}
                        onSelect={() => onSetCertificateType(nextType)}
                      >
                        Use {nextType}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                onClick={onInitForm}
                disabled={isInitializing || isReadOnly}
                className="px-5 shadow-[0_18px_44px_-26px_rgba(37,99,235,0.85)]"
              >
                {isInitializing ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                Initialize form
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {visibleSections.map((section) => {
                const completion = getSectionCompletion(
                  section.fields,
                  draftForm,
                );
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

                      {completion.missingRequired > 0 ? (
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-amber-700 uppercase">
                          {completion.missingRequired} missing
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold tracking-[0.16em] text-emerald-700 uppercase">
                          Ready
                        </span>
                      )}
                    </div>

                    {previewRows.length ? (
                      <div className="mt-3 space-y-1.5 text-[11px]">
                        {previewRows.map((row) => (
                          <p
                            key={`${section.id}-${row.field}`}
                            className="text-muted-foreground truncate"
                          >
                            <span className="text-foreground font-medium">
                              {FIELD_LABELS[row.field] ?? row.field}:
                            </span>{" "}
                            {row.value}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-muted-foreground mt-3 text-[11px]">
                        No answers captured yet.
                      </p>
                    )}

                    <div className="text-muted-foreground mt-4 flex items-center justify-between text-[11px]">
                      <span>
                        {completion.filled}/{completion.total} answered
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

            {activeSection ? (
              <Dialog
                open={isSectionDialogOpen}
                onOpenChange={setIsSectionDialogOpen}
              >
                <DialogContent className="max-h-[88vh] overflow-y-auto border-0 bg-transparent p-0 shadow-none sm:max-w-4xl">
                  <div className="portal-card bg-background/96 rounded-[1.8rem] py-0">
                    <div className="border-border/70 border-b px-6 py-5">
                      <DialogHeader>
                        <DialogTitle className="text-2xl font-semibold">
                          Editing {activeSection.title}
                        </DialogTitle>
                        <DialogDescription className="mt-2 text-sm">
                          {activeSection.description}
                        </DialogDescription>
                      </DialogHeader>
                    </div>

                    <div className="px-6 py-5">
                      <ReturnFormFields
                        fields={activeSection.fields}
                        draftForm={draftForm}
                        setDraftForm={setDraftForm}
                        showRequiredBadges
                        disabled={isReadOnly}
                      />

                      <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() =>
                            setDraftForm(sanitizeFormData(substanceForm))
                          }
                          disabled={isReadOnly}
                        >
                          Reset
                        </Button>
                        <Button
                          onClick={onSaveSection}
                          disabled={savingSection || isUpdating || isReadOnly}
                          className="shadow-[0_18px_44px_-26px_rgba(37,99,235,0.85)]"
                        >
                          {savingSection || isUpdating ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <Save className="size-4" />
                          )}
                          Save section
                        </Button>
                      </div>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}

            <div className="flex justify-end gap-2 pt-2">
              {showCertificateTypeControl && onSetCertificateType ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isCertificateTypeUpdating || isReadOnly}
                    >
                      {isCertificateTypeUpdating ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : null}
                      {certificateLabel}
                      <ChevronDown className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {(["Certificate 2", "Certificate 3"] as const).map((nextType) => (
                      <DropdownMenuItem
                        key={nextType}
                        onSelect={() => onSetCertificateType(nextType)}
                      >
                        Use {nextType}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    disabled={isReadOnly}
                  >
                    <Trash2 className="size-3.5" />
                    Clear form
                  </Button>
                  </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear all form data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently erase all answers across every section. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={isReadOnly}
                      onClick={onClearForm}
                    >
                      Clear form
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </>
        )}
      </div>
    </TabsContent>
  );
}
