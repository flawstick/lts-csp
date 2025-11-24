"use client"

import { useEffect, useState, useRef } from "react"
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
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useOrgStore } from "@/lib/org-context"
import { canEditOrgSettings, type OrgRole } from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Upload, Trash2, Building2, Copy, Check } from "lucide-react"

interface MemberInfo {
  role: OrgRole
  isGlobalAdmin?: boolean
}

export default function OrgSettingsPage() {
  const { currentOrg, isLoading: orgLoading, fetchOrgs } = useOrgStore()
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
  })

  useEffect(() => {
    if (currentOrg) {
      setFormData({
        name: currentOrg.name,
        slug: currentOrg.slug,
      })
      setLogoUrl(currentOrg.logoUrl)
    }
  }, [currentOrg])

  useEffect(() => {
    async function fetchMemberInfo() {
      if (!currentOrg) return
      try {
        const res = await fetch(`/api/orgs/${currentOrg.id}/me`)
        if (res.ok) {
          const data = await res.json()
          setMemberInfo(data)
        }
      } catch (error) {
        console.error("Failed to fetch member info:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchMemberInfo()
  }, [currentOrg])

  const canEdit = memberInfo && (memberInfo.isGlobalAdmin || canEditOrgSettings(memberInfo.role))

  async function handleSave() {
    if (!currentOrg || !canEdit) return
    setIsSaving(true)
    try {
      const res = await fetch(`/api/orgs/${currentOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        fetchOrgs()
      }
    } catch (error) {
      console.error("Failed to save:", error)
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentOrg || !canEdit) return

    setIsUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/orgs/${currentOrg.id}/logo`, {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setLogoUrl(data.logoUrl)
        fetchOrgs()
      } else {
        const error = await res.json()
        alert(error.error || "Failed to upload logo")
      }
    } catch (error) {
      console.error("Failed to upload logo:", error)
      alert("Failed to upload logo")
    } finally {
      setIsUploadingLogo(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  async function handleLogoDelete() {
    if (!currentOrg || !canEdit) return
    if (!confirm("Are you sure you want to remove the logo?")) return

    setIsUploadingLogo(true)
    try {
      const res = await fetch(`/api/orgs/${currentOrg.id}/logo`, {
        method: "DELETE",
      })

      if (res.ok) {
        setLogoUrl(null)
        fetchOrgs()
      }
    } catch (error) {
      console.error("Failed to delete logo:", error)
    } finally {
      setIsUploadingLogo(false)
    }
  }

  function copyOrgId() {
    if (currentOrg?.id) {
      navigator.clipboard.writeText(currentOrg.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (orgLoading || isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Skeleton className="h-4 w-32" />
          </header>
          <div className="flex flex-1 flex-col p-6">
            <div className="mx-auto w-full max-w-2xl space-y-6">
              <div className="space-y-1">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-4 w-64" />
              </div>
              <Separator />
              <div className="flex items-center gap-4">
                <Skeleton className="h-16 w-16 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-9 w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Organisation Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col p-6">
          <div className="mx-auto w-full max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">Organisation Settings</h1>
                <p className="text-muted-foreground text-sm">
                  Manage your organisation profile
                </p>
              </div>
              {memberInfo && (
                <Badge variant={memberInfo.role === "owner" ? "default" : "secondary"}>
                  {memberInfo.role.charAt(0).toUpperCase() + memberInfo.role.slice(1)}
                </Badge>
              )}
            </div>

            <Separator />

            {/* Logo Section */}
            <div className="flex items-center gap-4">
              <div
                className={`relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed ${
                  canEdit ? "cursor-pointer hover:border-primary/50 hover:bg-muted/50" : ""
                }`}
                onClick={() => canEdit && fileInputRef.current?.click()}
              >
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt="Logo"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <Building2 className="text-muted-foreground h-8 w-8" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">Organisation Logo</p>
                <p className="text-muted-foreground text-xs">
                  Square image recommended. Max 5MB.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
                  onChange={handleLogoUpload}
                  className="hidden"
                  disabled={!canEdit || isUploadingLogo}
                />
                {canEdit && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingLogo}
                    >
                      <Upload className="mr-1.5 h-3 w-3" />
                      {isUploadingLogo ? "Uploading..." : "Upload"}
                    </Button>
                    {logoUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={handleLogoDelete}
                        disabled={isUploadingLogo}
                      >
                        <Trash2 className="mr-1.5 h-3 w-3" />
                        Remove
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Form Fields */}
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-sm">Name</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    disabled={!canEdit}
                    className="h-9"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slug" className="text-sm">Slug</Label>
                  <Input
                    id="slug"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    disabled={!canEdit}
                    className="h-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Organisation ID</Label>
                <div className="flex gap-2">
                  <Input
                    value={currentOrg?.id ?? ""}
                    readOnly
                    className="h-9 font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 shrink-0"
                    onClick={copyOrgId}
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                  Use this ID for API integrations
                </p>
              </div>
            </div>

            {/* Save Button */}
            {canEdit && (
              <>
                <Separator />
                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={isSaving} size="sm">
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
