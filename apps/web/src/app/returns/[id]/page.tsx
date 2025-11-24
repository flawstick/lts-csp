"use client"

import { useParams, useRouter } from "next/navigation"
import { api } from "@/trpc/react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
  Pencil,
  Play,
  Bot,
} from "lucide-react"
import { useState, useCallback, useRef } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { FIELD_LABELS, FORM_SECTIONS, type SubstanceFormData } from "@/lib/schemas/substance-form"
import { SubstanceFormEditor } from "@/components/substance-form-editor"
import Link from "next/link"

type FileInfo = {
  url: string
  name: string
  size: number
  type: string
  uploadedAt: string
}

type SectionId = typeof FORM_SECTIONS[number]["id"]

export default function ReturnDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [isUploading, setIsUploading] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)
  const [activeTab, setActiveTab] = useState<"form" | "files" | "automation">("form")
  const [editingSection, setEditingSection] = useState<SectionId | null>(null)
  const [isCreatingTask, setIsCreatingTask] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const utils = api.useUtils()

  const { data: taxReturn, isLoading, error } = api.taxReturn.getById.useQuery(
    { id },
    { enabled: !!id }
  )

  const { data: substanceFormData } = api.substanceForm.getByTaxReturnId.useQuery(
    { taxReturnId: id },
    { enabled: !!id }
  )

  const addFileMutation = api.taxReturn.addFile.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id }),
  })

  const removeFileMutation = api.taxReturn.removeFile.useMutation({
    onSuccess: () => utils.taxReturn.getById.invalidate({ id }),
  })

  const createFormMutation = api.substanceForm.createForTaxReturn.useMutation({
    onSuccess: () => {
      utils.taxReturn.getById.invalidate({ id })
      utils.substanceForm.getByTaxReturnId.invalidate({ taxReturnId: id })
    },
  })

  const updateFormMutation = api.substanceForm.update.useMutation({
    onSuccess: () => {
      utils.substanceForm.getByTaxReturnId.invalidate({ taxReturnId: id })
    },
  })

  const extractMutation = api.substanceForm.extractFromFiles.useMutation({
    onSuccess: () => {
      utils.taxReturn.getById.invalidate({ id })
      utils.substanceForm.getByTaxReturnId.invalidate({ taxReturnId: id })
      setActiveTab("form")
    },
  })

  const createTaskMutation = api.taxReturn.createTask.useMutation()

  // Auto-extract when files are uploaded
  const runExtraction = useCallback(async (fileUrls: string[]) => {
    if (!taxReturn || fileUrls.length === 0) return

    setIsExtracting(true)
    try {
      // Ensure form exists first
      if (!substanceFormData) {
        await createFormMutation.mutateAsync({ taxReturnId: taxReturn.id })
      }

      await extractMutation.mutateAsync({
        taxReturnId: taxReturn.id,
        fileUrls,
      })
    } catch (err) {
      console.error("Extraction error:", err)
    } finally {
      setIsExtracting(false)
    }
  }, [taxReturn, substanceFormData, createFormMutation, extractMutation])

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !taxReturn) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || "Upload failed")
      }

      const result = await response.json()

      await addFileMutation.mutateAsync({
        taxReturnId: taxReturn.id,
        file: {
          url: result.url,
          name: result.name,
          size: result.size,
          type: file.type,
        },
      })

      // Get current files plus the new one for extraction
      const currentFiles = (taxReturn.files ?? []) as FileInfo[]
      const allFileUrls = [...currentFiles.map(f => f.url), result.url]

      // Auto-trigger extraction
      await runExtraction(allFileUrls)
    } catch (err) {
      console.error("Upload error:", err)
      alert(err instanceof Error ? err.message : "Failed to upload file")
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }, [taxReturn, addFileMutation, runExtraction])

  const handleManualExtract = useCallback(async () => {
    if (!taxReturn) return
    const files = (taxReturn.files ?? []) as FileInfo[]
    if (files.length === 0) return
    await runExtraction(files.map(f => f.url))
  }, [taxReturn, runExtraction])

  const handleCreateForm = useCallback(async () => {
    if (!taxReturn) return
    await createFormMutation.mutateAsync({ taxReturnId: taxReturn.id })
  }, [taxReturn, createFormMutation])

  const handleSaveSection = useCallback(async (data: Partial<SubstanceFormData>) => {
    if (!taxReturn) return
    await updateFormMutation.mutateAsync({
      taxReturnId: taxReturn.id,
      data,
    })
  }, [taxReturn, updateFormMutation])

  if (isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex items-center justify-center min-h-screen">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (error || !taxReturn) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-col items-center justify-center min-h-screen gap-4">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h2 className="text-xl font-semibold">Tax Return Not Found</h2>
            <Button variant="outline" onClick={() => router.push("/returns")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Returns
            </Button>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  const files = (taxReturn.files ?? []) as FileInfo[]
  const substanceForm = substanceFormData
  const missingFields = (substanceForm?.missingFields as string[]) ?? []

  const statusConfig = {
    pending: { bg: "bg-amber-500/10", text: "text-amber-600" },
    in_progress: { bg: "bg-blue-500/10", text: "text-blue-600" },
    completed: { bg: "bg-emerald-500/10", text: "text-emerald-600" },
    failed: { bg: "bg-red-500/10", text: "text-red-600" },
    review_required: { bg: "bg-orange-500/10", text: "text-orange-600" },
  } as const

  const status = statusConfig[taxReturn.status as keyof typeof statusConfig] ?? statusConfig.pending

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B"
    const k = 1024
    const sizes = ["B", "KB", "MB", "GB"]
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i]
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-4">
          <SidebarTrigger className="-ml-1" />
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="mr-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/returns">Tax Returns</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{taxReturn.entityName}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto space-y-8">
            
            {/* Header Section */}
            <div className="flex items-start justify-between">
              <div className="space-y-1.5">
                <h1 className="text-3xl font-bold tracking-tight">{taxReturn.entityName}</h1>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
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
                <Badge className={`${status.bg} ${status.text} border-0 text-sm px-3 py-1`}>
                  {taxReturn.status.replace("_", " ")}
                </Badge>
                {taxReturn.link && (
                  <Button variant="outline" size="sm" asChild>
                    <a href={taxReturn.link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Portal
                    </a>
                  </Button>
                )}
              </div>
            </div>

            {/* Extraction Progress Banner */}
            {isExtracting && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-md px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                <span className="text-sm text-blue-600 font-medium">
                  Extracting data from documents...
                </span>
              </div>
            )}

            {/* Main Content Tabs */}
            <div className="space-y-6">
              <div className="flex items-center border-b">
                <button
                  onClick={() => setActiveTab("form")}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "form" 
                      ? "border-primary text-foreground" 
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Substance Form
                </button>
                <button
                  onClick={() => setActiveTab("files")}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === "files"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Files & Documents
                </button>
                <button
                  onClick={() => setActiveTab("automation")}
                  className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === "automation"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Bot className="h-4 w-4" />
                  Automation
                </button>
              </div>

              {activeTab === "automation" ? (
                /* Automation Tab */
                <div className="space-y-6">
                  <div className="rounded-lg border bg-card p-12 text-center">
                    <div className="mx-auto w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
                      <Bot className="h-8 w-8 text-orange-500" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2">AI-Powered Tax Return Filing</h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
                      Create a processing task to automatically fill out the tax return on the government portal using the substance form data.
                    </p>

                    {!substanceForm ? (
                      <div className="text-amber-600 text-sm mb-4">
                        <AlertCircle className="h-4 w-4 inline mr-1" />
                        Please create a substance form first before running automation.
                      </div>
                    ) : !substanceForm.isComplete ? (
                      <div className="text-amber-600 text-sm mb-4">
                        <AlertCircle className="h-4 w-4 inline mr-1" />
                        Substance form is incomplete. The AI may need to pause for missing information.
                      </div>
                    ) : (
                      <div className="text-green-600 text-sm mb-4">
                        <CheckCircle className="h-4 w-4 inline mr-1" />
                        Substance form is complete. Ready to create automation task.
                      </div>
                    )}

                    {taxReturn.tasks && taxReturn.tasks.length > 0 ? (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">
                          This tax return already has {taxReturn.tasks.length} task(s)
                        </p>
                        <Button
                          size="lg"
                          className="bg-orange-600 hover:bg-orange-700"
                          asChild
                        >
                          <Link href={`/tasks/${taxReturn.tasks[0]?.id}`}>
                            <Play className="h-4 w-4 mr-2" />
                            Open Task
                          </Link>
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="lg"
                        className="bg-orange-600 hover:bg-orange-700"
                        onClick={async () => {
                          setIsCreatingTask(true)
                          try {
                            const task = await createTaskMutation.mutateAsync({ taxReturnId: id })
                            if (task) {
                              router.push(`/tasks/${task.id}`)
                            }
                          } catch (err) {
                            console.error("Failed to create task:", err)
                          } finally {
                            setIsCreatingTask(false)
                          }
                        }}
                        disabled={!substanceForm || isCreatingTask}
                      >
                        {isCreatingTask ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4 mr-2" />
                        )}
                        Create & Open Task
                      </Button>
                    )}

                    {taxReturn.link && (
                      <p className="text-xs text-muted-foreground mt-4">
                        Target: <a href={taxReturn.link} target="_blank" rel="noopener noreferrer" className="underline">{taxReturn.link}</a>
                      </p>
                    )}
                  </div>
                </div>
              ) : activeTab === "files" ? (
                <div className="space-y-6">
                  <div className="rounded-lg border bg-card shadow-sm">
                    <div className="p-4 border-b flex items-center justify-between bg-muted/20">
                      <div>
                        <h2 className="font-medium">Attached Files</h2>
                        <p className="text-sm text-muted-foreground">
                          Upload documents for automatic data extraction
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.xlsx,.xls,.doc,.docx"
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
                          {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                          Upload
                        </Button>
                      </div>
                    </div>

                    {files.length === 0 ? (
                      <div className="p-16 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                          <FileText className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                        <h3 className="font-medium mb-1">No files attached</h3>
                        <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                          Upload PDF or Excel files. AI will automatically process them to fill out the substance form.
                        </p>
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                          <Upload className="h-4 w-4 mr-2" />
                          Select File
                        </Button>
                      </div>
                    ) : (
                      <div className="divide-y">
                        {files.map((file) => (
                          <div key={file.url} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex items-center gap-4">
                              <div className="p-2.5 bg-primary/10 rounded-lg">
                                <File className="h-5 w-5 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{file.name}</p>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                  <span>{formatBytes(file.size)}</span>
                                  <span>•</span>
                                  <span>{new Date(file.uploadedAt).toLocaleDateString()}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="sm" asChild>
                                <a href={file.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4 mr-2" />
                                  View
                                </a>
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-muted-foreground hover:text-destructive"
                                onClick={() => removeFileMutation.mutate({ taxReturnId: taxReturn.id, fileUrl: file.url })}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {files.length > 0 && (
                       <div className="p-4 border-t bg-muted/20 flex justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleManualExtract}
                            disabled={isExtracting}
                          >
                            {isExtracting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                            Run AI Extraction
                          </Button>
                       </div>
                    )}
                  </div>

                  {taxReturn.pdfUrl && (
                    <div className="rounded-lg border bg-card p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-muted rounded-md">
                          <FileText className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Official Instructions</p>
                          <p className="text-xs text-muted-foreground">PDF from tax portal</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" asChild>
                        <a href={taxReturn.pdfUrl} target="_blank" rel="noopener noreferrer">
                          View PDF <ExternalLink className="h-4 w-4 ml-2" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6">
                  {!substanceForm ? (
                    <div className="rounded-lg border bg-card p-12 text-center">
                      <div className="mx-auto w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                        <Building2 className="h-6 w-6 text-muted-foreground/50" />
                      </div>
                      <h3 className="font-medium mb-1">Form Not Initialized</h3>
                      <p className="text-sm text-muted-foreground mb-6">
                        Create a substance form to start tracking data for this return.
                      </p>
                      <Button onClick={handleCreateForm} disabled={createFormMutation.isPending}>
                        {createFormMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Initialize Form
                      </Button>
                    </div>
                  ) : (
                    <>
                      {/* Form Status Card */}
                      <div className={`rounded-lg border p-4 flex items-start gap-4 ${
                        substanceForm.isComplete 
                          ? "bg-emerald-500/5 border-emerald-500/20" 
                          : "bg-amber-500/5 border-amber-500/20"
                      }`}>
                        {substanceForm.isComplete ? (
                          <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
                        )}
                        <div>
                          <h3 className={`font-medium ${
                            substanceForm.isComplete ? "text-emerald-900 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200"
                          }`}>
                            {substanceForm.isComplete ? "Form Complete" : "Action Required"}
                          </h3>
                          <p className={`text-sm mt-1 ${
                            substanceForm.isComplete ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"
                          }`}>
                            {substanceForm.isComplete 
                              ? "All required fields have been filled. Ready for submission." 
                              : `${((substanceForm.missingFields as string[]) || []).length} fields are missing information.`}
                          </p>
                          
                          {!substanceForm.isComplete && missingFields.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3">
                              {missingFields.slice(0, 5).map((field) => (
                                <span key={field} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                  {FIELD_LABELS[field as keyof typeof FIELD_LABELS] ?? field}
                                </span>
                              ))}
                              {missingFields.length > 5 && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
                                  +{missingFields.length - 5} more
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Sections Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {FORM_SECTIONS.map((section) => {
                          const filledFields = section.fields.filter(f => {
                            const val = substanceForm[f as keyof typeof substanceForm]
                            return val !== undefined && val !== null && val !== ""
                          })

                          return (
                            <div
                              key={section.id}
                              className="group rounded-lg border bg-card transition-all hover:shadow-md cursor-pointer"
                              onClick={() => setEditingSection(section.id)}
                            >
                              <div className="p-4">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                                    <h3 className="font-semibold text-sm">{section.title}</h3>
                                  </div>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{section.description}</p>

                                {filledFields.length > 0 && (
                                  <div className="space-y-1.5 border-t pt-3">
                                    {section.fields.slice(0, 3).map((field) => {
                                      const value = substanceForm[field as keyof typeof substanceForm]
                                      if (value === undefined || value === null || value === "") return null

                                      const label = FIELD_LABELS[field as keyof typeof FIELD_LABELS] ?? field
                                      let displayValue = String(value)
                                      if (typeof value === "object") displayValue = Array.isArray(value) ? `${value.length} items` : "..."

                                      return (
                                        <div key={field} className="text-xs truncate">
                                          <span className="text-muted-foreground">{label}:</span>{" "}
                                          <span className="font-medium text-foreground">{displayValue}</span>
                                        </div>
                                      )
                                    })}
                                    {filledFields.length > 3 && (
                                      <span className="text-xs text-muted-foreground">+{filledFields.length - 3} more fields</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Section Editor Dialog */}
        {editingSection && substanceForm && (
          <SubstanceFormEditor
            sectionId={editingSection}
            formData={substanceForm as Partial<SubstanceFormData>}
            open={!!editingSection}
            onOpenChange={(open) => !open && setEditingSection(null)}
            onSave={handleSaveSection}
            isSaving={updateFormMutation.isPending}
          />
        )}
      </SidebarInset>
    </SidebarProvider>
  )
}