"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { format, parse } from "date-fns";
import { AlertCircle, CalendarIcon } from "lucide-react";

import {
  CIGA_BY_ACTIVITY,
  FIELD_LABELS,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import {
  isFieldRequired,
  normalizeEntityType,
  normalizeRelevantActivity,
} from "./return-workspace-shared";

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
  "adequacyPhysicalPresenceDetails",
  "additionalInformation",
  "igorNotRegisteredReason",
]);

const DATE_FIELDS = new Set([
  "accountingPeriodStart",
  "accountingPeriodEnd",
  "preparedDate",
  "managerSignOffDate",
  "c42SubmissionDate",
  "mneAccountingPeriodStart",
  "mneAccountingPeriodEnd",
]);

const NUMBER_FIELDS = new Set([
  "totalBoardMeetings",
  "boardMeetingsInGuernsey",
  "totalFte",
  "totalQualifiedFte",
  "outsourcerCount",
]);

const MONEY_FIELDS = new Set([
  "activityGrossIncome",
  "adequacyExpenditureDetails",
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
  "isIncorporatedInGuernsey",
  "isGuernseyTaxResident",
  "hasRegisteredWithGrs",
  "isSolelyGuernseyPartners",
  "partnershipActivitiesWhollyInGuernsey",
  "partnershipPoeMOutsideGuernsey",
  "isRegisteredOnIgor",
  "hasFailedEconomicSubstance",
  "isPillar2InScope",
  "expectConstituentEntityNextPeriod",
]);

const YES_NO_NA_FIELDS = new Set([
  "hasAdequatePhysicalPresence",
  "hasCigaOutsourcing",
  "adequateMeetingFrequency",
  "enoughDirectorsPresent",
  "directorsHaveExpertise",
  "strategicDecisionsMadeInGuernsey",
  "recordsMaintainedInGuernsey",
  "hasAdequateEmployees",
]);

const ARRAY_FIELDS = new Set([
  "employees",
  "immediateParents",
  "ultimateParents",
  "ultimateBeneficialOwners",
  "directors",
  "boardMeetings",
  "outsourcers",
]);

type ReturnFormFieldsProps = {
  fields: readonly string[];
  draftForm: Partial<SubstanceFormData>;
  setDraftForm: Dispatch<SetStateAction<Partial<SubstanceFormData>>>;
  columnsClassName?: string;
  surface?: boolean;
  showRequiredBadges?: boolean;
  disabled?: boolean;
};

function FieldShell({
  label,
  fieldId,
  required,
  surface,
  children,
}: {
  label: string;
  fieldId: string;
  required: boolean;
  surface: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "space-y-2",
        surface && "portal-card rounded-[1.25rem] bg-background/85 p-4",
      )}
    >
      <Label
        htmlFor={fieldId}
        className="text-muted-foreground flex flex-wrap items-center gap-2 text-[11px] font-semibold tracking-[0.18em] uppercase"
      >
        <span>{label}</span>
        {required ? (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] tracking-[0.16em] text-amber-700 uppercase dark:text-amber-400">
            Required
          </span>
        ) : null}
      </Label>
      {children}
    </div>
  );
}

function DatePickerField({
  fieldId,
  value,
  onChange,
}: {
  fieldId: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const date = value
    ? parse(value, "yyyy-MM-dd", new Date())
    : undefined;
  const isValid = date && !isNaN(date.getTime());

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          id={fieldId}
          variant="outline"
          className={cn(
            "h-9 w-full justify-start text-left font-normal",
            !isValid && "text-muted-foreground",
          )}
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {isValid ? format(date, "dd MMM yyyy") : "Select date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={isValid ? date : undefined}
          onSelect={(selected) => {
            onChange(selected ? format(selected, "yyyy-MM-dd") : undefined);
          }}
          defaultMonth={isValid ? date : undefined}
        />
      </PopoverContent>
    </Popover>
  );
}

function SelectField({
  fieldId,
  value,
  options,
  placeholder,
  onChange,
}: {
  fieldId: string;
  value: string | undefined;
  options: readonly string[];
  placeholder: string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ""}
      onValueChange={(v) => onChange(v || undefined)}
    >
      <SelectTrigger id={fieldId} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ReturnFormFields({
  fields,
  draftForm,
  setDraftForm,
  columnsClassName,
  surface = false,
  showRequiredBadges = false,
  disabled = false,
}: ReturnFormFieldsProps) {
  const renderField = (field: string) => {
    const label = FIELD_LABELS[field] ?? field;
    const value = draftForm[field as keyof SubstanceFormData];
    const required = showRequiredBadges && isFieldRequired(field, draftForm);
    const fieldId = `portal-return-field-${field}`;

    if (ARRAY_FIELDS.has(field)) {
      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 px-3.5 py-3 text-sm">
            <p className="font-medium text-foreground">
              Structured data is managed from uploaded ESR data.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload the ESR for AI extraction or use the internal `/web`
              workflow if you need to edit detailed lists manually.
            </p>
            {Array.isArray(value) ? (
              <p className="mt-2 text-[11px] font-medium text-muted-foreground">
                Current entries: {value.length}
              </p>
            ) : null}
          </div>
        </FieldShell>
      );
    }

    if (field === "entityType") {
      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <SelectField
            fieldId={fieldId}
            value={value as string | undefined}
            options={ENTITY_TYPES}
            placeholder="Select entity type"
            onChange={(v) =>
              setDraftForm((prev) => ({
                ...prev,
                entityType: normalizeEntityType(v ?? ""),
              }))
            }
          />
        </FieldShell>
      );
    }

    if (field === "relevantActivity" || field === "secondRelevantActivity") {
      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <SelectField
            fieldId={fieldId}
            value={value as string | undefined}
            options={RELEVANT_ACTIVITIES}
            placeholder="Select activity"
            onChange={(v) =>
              setDraftForm((prev) => ({
                ...prev,
                [field]: field === "relevantActivity"
                  ? normalizeRelevantActivity(v ?? "")
                  : v ?? undefined,
              }))
            }
          />
        </FieldShell>
      );
    }

    if (field === "cigaCheckboxes" || field === "secondCigaCheckboxes") {
      const activityKey =
        field === "cigaCheckboxes"
          ? draftForm.relevantActivity
          : draftForm.secondRelevantActivity;
      const options = activityKey ? (CIGA_BY_ACTIVITY[activityKey] ?? []) : [];
      const selected = (value as string[] | undefined) ?? [];

      if (!options.length) {
        return (
          <FieldShell
            key={field}
            label={label}
            fieldId={fieldId}
            required={required}
            surface={surface}
          >
            <p className="text-sm text-muted-foreground">
              Select a relevant activity first to see CIGA options.
            </p>
          </FieldShell>
        );
      }

      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <div className="grid gap-2">
            {options.map((option) => {
              const checked = selected.includes(option);
              return (
                <label
                  key={option}
                  className="flex items-start gap-3 rounded-lg border border-border/60 bg-background px-3.5 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(isChecked) => {
                      const next = isChecked
                        ? [...selected, option]
                        : selected.filter((v) => v !== option);
                      setDraftForm((prev) => ({
                        ...prev,
                        [field]: next.length ? next : undefined,
                      }));
                    }}
                    className="mt-0.5"
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        </FieldShell>
      );
    }

    if (YES_NO_FIELDS.has(field) || YES_NO_NA_FIELDS.has(field)) {
      const options = YES_NO_NA_FIELDS.has(field) ? YES_NO_NA : YES_NO;

      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <SelectField
            fieldId={fieldId}
            value={value as string | undefined}
            options={options}
            placeholder="Select"
            onChange={(v) =>
              setDraftForm((prev) => {
                if (field === "hasMultipleRelevantActivities" && v !== "Yes") {
                  return {
                    ...prev,
                    hasMultipleRelevantActivities: (v ?? undefined) as
                      | SubstanceFormData["hasMultipleRelevantActivities"]
                      | undefined,
                    secondRelevantActivity: undefined,
                    secondCigaCheckboxes: undefined,
                  };
                }

                return { ...prev, [field]: v ?? undefined };
              })
            }
          />
        </FieldShell>
      );
    }

    if (MONEY_FIELDS.has(field)) {
      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <Input
            id={fieldId}
            type="text"
            inputMode="decimal"
            value={(value as string | undefined) ?? ""}
            onChange={(e) =>
              setDraftForm((prev) => ({
                ...prev,
                [field]: e.target.value || undefined,
              }))
            }
          />
        </FieldShell>
      );
    }

    if (NUMBER_FIELDS.has(field)) {
      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <Input
            id={fieldId}
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) =>
              setDraftForm((prev) => ({
                ...prev,
                [field]: e.target.value ? Number(e.target.value) : undefined,
              }))
            }
          />
        </FieldShell>
      );
    }

    if (DATE_FIELDS.has(field)) {
      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <DatePickerField
            fieldId={fieldId}
            value={value as string | undefined}
            onChange={(v) =>
              setDraftForm((prev) => ({ ...prev, [field]: v }))
            }
          />
        </FieldShell>
      );
    }

    if (LONG_TEXT_FIELDS.has(field)) {
      return (
        <FieldShell
          key={field}
          label={label}
          fieldId={fieldId}
          required={required}
          surface={surface}
        >
          <Textarea
            id={fieldId}
            value={(value as string | undefined) ?? ""}
            onChange={(e) =>
              setDraftForm((prev) => ({
                ...prev,
                [field]: e.target.value || undefined,
              }))
            }
            rows={4}
          />
        </FieldShell>
      );
    }

    return (
      <FieldShell
        key={field}
        label={label}
        fieldId={fieldId}
        required={required}
        surface={surface}
      >
        <Input
          id={fieldId}
          type="text"
          value={(value as string | undefined) ?? ""}
          onChange={(e) =>
            setDraftForm((prev) => ({
              ...prev,
              [field]: e.target.value || undefined,
            }))
          }
        />
      </FieldShell>
    );
  };

  return (
    <div
      className={cn(
        "space-y-4",
        disabled && "pointer-events-none opacity-70 select-none",
      )}
      aria-disabled={disabled}
    >
      <div className={cn("grid gap-3 md:grid-cols-2", columnsClassName)}>
        {fields.map((field) => renderField(field))}
      </div>

      {fields.includes("cigaPerformed") && draftForm.relevantActivity ? (
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/[0.04] p-4 dark:border-blue-500/15">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex rounded-full bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
              <AlertCircle className="size-4" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">
                Suggested CIGA activities
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Based on the selected relevant activity, these are the common
                CIGA items you may want reflected in the ESR.
              </p>

              <div className="mt-3 grid gap-2">
                {(CIGA_BY_ACTIVITY[draftForm.relevantActivity] ?? []).map(
                  (option) => {
                    const current =
                      typeof draftForm.cigaPerformed === "string"
                        ? draftForm.cigaPerformed
                        : "";
                    const checked = current.includes(option);

                    return (
                      <label
                        key={option}
                        className="flex items-start gap-3 rounded-lg border border-border/60 bg-background px-3.5 py-3 text-sm transition-colors hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(isChecked) => {
                            const selected = current
                              .split("; ")
                              .filter(Boolean);

                            if (isChecked) {
                              if (!selected.includes(option)) {
                                selected.push(option);
                              }
                            } else {
                              const next = selected.filter(
                                (v) => v !== option,
                              );
                              selected.splice(0, selected.length, ...next);
                            }

                            setDraftForm((prev) => ({
                              ...prev,
                              cigaPerformed: selected.join("; ") || undefined,
                            }));
                          }}
                          className="mt-0.5"
                        />
                        <span>{option}</span>
                      </label>
                    );
                  },
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
