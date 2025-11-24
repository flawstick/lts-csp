"use client"

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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
import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useOrgStore } from "@/lib/org-context"
import { Upload, X, FileText, Loader2, Rocket } from "lucide-react"
import type { Jurisdiction } from "@repo/database"

interface UploadedFile {
  name: string
  url: string
  size: number
}

export default function NewTaskPage() {
  const router = useRouter()
  const { currentOrg } = useOrgStore()
  const [jurisdictions, setJurisdictions] = useState<Jurisdiction[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])

  // Form state
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [taskType, setTaskType] = useState("tax_return")
  const [jurisdictionId, setJurisdictionId] = useState("")
  const [launchImmediately, setLaunchImmediately] = useState(false)

  useEffect(() => {
    // Fetch jurisdictions
    fetch("/api/jurisdictions")
      .then((res) => res.json())
      .then((data) => {
        if (data.jurisdictions) {
          setJurisdictions(data.jurisdictions)
          if (data.jurisdictions.length > 0) {
            setJurisdictionId(data.jurisdictions[0].id)
          }
        }
      })
      .catch(console.error)
  }, [])

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploading(true)
    const newFiles: UploadedFile[] = []

    for (const file of Array.from(files)) {
      if (!file.type.includes("pdf")) {
        alert(`${file.name} is not a PDF file`)
        continue
      }

      const formData = new FormData()
      formData.append("file", file)

      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        })

        const data = await res.json()
        if (data.success) {
          newFiles.push({
            name: data.name,
            url: data.url,
            size: data.size,
          })
        } else {
          alert(`Failed to upload ${file.name}: ${data.error}`)
        }
      } catch (err) {
        console.error("Upload error:", err)
        alert(`Failed to upload ${file.name}`)
      }
    }

    setUploadedFiles((prev) => [...prev, ...newFiles])
    setUploading(false)
  }, [])

  const removeFile = (url: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.url !== url))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!currentOrg) {
      alert("Please select an organisation")
      return
    }

    if (!jurisdictionId) {
      alert("Please select a jurisdiction")
      return
    }

    if (!name.trim()) {
      alert("Please enter a task name")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          taskType,
          orgId: currentOrg.id,
          jurisdictionId,
          pdfUrls: uploadedFiles.map((f) => f.url),
          launchEcs: launchImmediately,
        }),
      })

      const data = await res.json()

      if (data.success) {
        router.push(`/tasks?taskId=${data.task.id}`)
      } else {
        alert(`Failed to create task: ${data.error}`)
      }
    } catch (err) {
      console.error("Create task error:", err)
      alert("Failed to create task")
    } finally {
      setLoading(false)
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/tasks">Tasks</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>New Task</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 max-w-3xl">
          <Card>
            <CardHeader>
              <CardTitle>Create New Task</CardTitle>
              <CardDescription>
                Create a new automation task for tax return submission
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Task Name */}
                <div className="space-y-2">
                  <Label htmlFor="name">Task Name *</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Aurora Trust - 2024 Annual Return"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Optional description..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Task Type */}
                <div className="space-y-2">
                  <Label htmlFor="taskType">Task Type</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tax_return">Tax Return</SelectItem>
                      <SelectItem value="validation">Validation</SelectItem>
                      <SelectItem value="submission">Submission</SelectItem>
                      <SelectItem value="amendment">Amendment</SelectItem>
                      <SelectItem value="inquiry">Inquiry</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Jurisdiction */}
                <div className="space-y-2">
                  <Label htmlFor="jurisdiction">Jurisdiction *</Label>
                  <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select jurisdiction" />
                    </SelectTrigger>
                    <SelectContent>
                      {jurisdictions.map((j) => (
                        <SelectItem key={j.id} value={j.id}>
                          {j.name} ({j.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* PDF Upload */}
                <div className="space-y-2">
                  <Label>PDF Documents</Label>
                  <div
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => document.getElementById("file-input")?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault()
                      handleFileUpload(e.dataTransfer.files)
                    }}
                  >
                    <input
                      id="file-input"
                      type="file"
                      accept=".pdf"
                      multiple
                      className="hidden"
                      onChange={(e) => handleFileUpload(e.target.files)}
                    />
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Uploading...</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <Upload className="h-8 w-8 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          Click or drag PDFs here to upload
                        </span>
                        <span className="text-xs text-muted-foreground">Max 10MB per file</span>
                      </div>
                    )}
                  </div>

                  {/* Uploaded files list */}
                  {uploadedFiles.length > 0 && (
                    <div className="space-y-2 mt-4">
                      {uploadedFiles.map((file) => (
                        <div
                          key={file.url}
                          className="flex items-center justify-between p-2 rounded-lg border bg-accent/30"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-red-500" />
                            <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                            <span className="text-xs text-muted-foreground">
                              ({Math.round(file.size / 1024)}KB)
                            </span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeFile(file.url)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Launch options */}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="launchImmediately"
                    checked={launchImmediately}
                    onChange={(e) => setLaunchImmediately(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <Label htmlFor="launchImmediately" className="text-sm font-normal cursor-pointer">
                    Launch task immediately on ECS
                  </Label>
                </div>

                {/* Submit */}
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/tasks")}
                    disabled={loading}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading || !currentOrg}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Rocket className="h-4 w-4 mr-2" />
                        Create Task
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
