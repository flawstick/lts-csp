"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { DatePicker } from "@/components/ui/date-picker"
import {
  FIELD_LABELS,
  FORM_SECTIONS,
  CIGA_BY_ACTIVITY,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form"

type SectionId = typeof FORM_SECTIONS[number]["id"]

interface SubstanceFormEditorProps {
  sectionId: SectionId
  formData: Partial<SubstanceFormData> | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (data: Partial<SubstanceFormData>) => Promise<void>
  isSaving: boolean
}

const ENTITY_TYPES = ["Company", "Partnership"] as const
const YES_NO = ["Yes", "No"] as const
const YES_NO_NA = ["Yes", "No", "N/A"] as const
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
] as const

export function SubstanceFormEditor({
  sectionId,
  formData,
  open,
  onOpenChange,
  onSave,
  isSaving,
}: SubstanceFormEditorProps) {
  const section = FORM_SECTIONS.find((s) => s.id === sectionId)
  const [localData, setLocalData] = useState<Partial<SubstanceFormData>>(formData ?? {})

  // Sync local state when dialog opens or formData changes
  useEffect(() => {
    if (open) {
      setLocalData(formData ?? {})
    }
  }, [open, formData])

  if (!section) return null

  const updateField = (field: string, value: unknown) => {
    setLocalData((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    await onSave(localData)
    onOpenChange(false)
  }

  const renderField = (field: string) => {
    const label = FIELD_LABELS[field] ?? field
    const value = localData[field as keyof SubstanceFormData]

    // Yes/No fields
    if (
      field === "isCollectiveInvestmentVehicle" ||
      field === "areFinancialStatementsConsolidated" ||
      field === "isGuernseyFiFatca" ||
      field === "isGuernseyFiCrs" ||
      field === "hasMultipleRelevantActivities" ||
      field === "allBoardMeetingsInGuernsey"
    ) {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => updateField(field, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {YES_NO.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    // Yes/No/N/A fields
    if (
      field === "hasCigaOutsourcing" ||
      field === "adequateMeetingFrequency" ||
      field === "enoughDirectorsPresent" ||
      field === "directorsHaveExpertise" ||
      field === "strategicDecisionsMadeInGuernsey" ||
      field === "recordsMaintainedInGuernsey"
    ) {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => updateField(field, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {YES_NO_NA.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    // Entity type
    if (field === "entityType") {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => updateField(field, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              {ENTITY_TYPES.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    // Relevant activity
    if (field === "relevantActivity") {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <Select
            value={(value as string) ?? ""}
            onValueChange={(v) => updateField(field, v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select activity..." />
            </SelectTrigger>
            <SelectContent>
              {RELEVANT_ACTIVITIES.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )
    }

    // Number fields
    if (
      field === "totalBoardMeetings" ||
      field === "boardMeetingsInGuernsey" ||
      field === "totalFte" ||
      field === "totalQualifiedFte"
    ) {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <Input
            id={field}
            type="number"
            value={(value as number) ?? ""}
            onChange={(e) => updateField(field, e.target.value ? Number(e.target.value) : undefined)}
          />
        </div>
      )
    }

    // Date fields
    if (
      field === "accountingPeriodStart" ||
      field === "accountingPeriodEnd" ||
      field === "preparedDate" ||
      field === "managerSignOffDate"
    ) {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <DatePicker
            id={field}
            value={(value as string) ?? ""}
            onChange={(v) => updateField(field, v)}
            placeholder="Select date..."
          />
        </div>
      )
    }

    // Textarea for long text fields
    if (
      field === "registeredAddress" ||
      field === "principalPlaceOfBusiness" ||
      field === "cigaPerformed" ||
      field === "cigaDetails" ||
      field === "outsourcingDetails"
    ) {
      return (
        <div key={field} className="space-y-2">
          <Label htmlFor={field}>{label}</Label>
          <Textarea
            id={field}
            value={(value as string) ?? ""}
            onChange={(e) => updateField(field, e.target.value)}
            rows={3}
          />
        </div>
      )
    }

    // Array fields (complex - simplified for now)
    if (
      field === "employees" ||
      field === "immediateParents" ||
      field === "ultimateParents" ||
      field === "ultimateBeneficialOwners" ||
      field === "directors" ||
      field === "boardMeetings"
    ) {
      return (
        <div key={field} className="space-y-2">
          <Label>{label}</Label>
          <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
            Complex array field - use AI extraction or edit JSON directly.
            {Array.isArray(value) && value.length > 0 && (
              <div className="mt-2 text-xs">
                Current: {value.length} item(s)
              </div>
            )}
          </div>
        </div>
      )
    }

    // Default: text input
    return (
      <div key={field} className="space-y-2">
        <Label htmlFor={field}>{label}</Label>
        <Input
          id={field}
          value={(value as string) ?? ""}
          onChange={(e) => updateField(field, e.target.value)}
        />
      </div>
    )
  }

  // Show CIGA options if we're in CIGA section and have a relevant activity
  const showCigaOptions = sectionId === "ciga" && localData.relevantActivity
  const cigaOptions = showCigaOptions
    ? CIGA_BY_ACTIVITY[localData.relevantActivity as string] ?? []
    : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{section.title}</DialogTitle>
          <DialogDescription>{section.description}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {section.fields.map(renderField)}

          {showCigaOptions && cigaOptions.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              <Label>CIGA Options for {localData.relevantActivity}</Label>
              <div className="space-y-2">
                {cigaOptions.map((option, idx) => (
                  <label
                    key={idx}
                    className="flex items-start gap-2 text-sm p-2 rounded-md hover:bg-muted cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={(localData.cigaPerformed ?? "").includes(option)}
                      onChange={(e) => {
                        const current = localData.cigaPerformed ?? ""
                        const selected = current.split("; ").filter(Boolean)
                        if (e.target.checked) {
                          selected.push(option)
                        } else {
                          const idx = selected.indexOf(option)
                          if (idx > -1) selected.splice(idx, 1)
                        }
                        updateField("cigaPerformed", selected.join("; "))
                      }}
                    />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
