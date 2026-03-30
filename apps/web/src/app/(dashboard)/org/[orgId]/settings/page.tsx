"use client"

import { useEffect, useState, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/page-header"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { canEditOrgSettings, type OrgRole } from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Upload, Trash2, Building2, Copy, Check } from "@/lib/icons"

interface MemberInfo {
  role: OrgRole
  isGlobalAdmin?: boolean
}

interface Organisation {
  id: string
  name: string
  slug: string
  logoUrl: string | null
}

export default function OrgSettingsPage() {
  const params = useParams()
  const router = useRouter()
  const orgId = params?.orgId as string

  const [org, setOrg] = useState<Organisation | null>(null)
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingLogo, setIsUploadingLogo] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
  })

  useEffect(() => {
    if (orgId) {
      fetchOrg()
      fetchMemberInfo()
    }
  }, [orgId])

  async function fetchOrg() {
    try {
      const res = await fetch(`/api/orgs/${orgId}`)
      if (res.ok) {
        const data = await res.json()
        setOrg(data)
        setFormData({
          name: data.name,
          slug: data.slug,
        })
        setLogoUrl(data.logoUrl)
      } else if (res.status === 404) {
        router.push("/")
      }
    } catch (error) {
      console.error("Failed to fetch org:", error)
    }
  }

  async function fetchMemberInfo() {
    try {
      const res = await fetch(`/api/orgs/${orgId}/me`)
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

  const canEdit = memberInfo && (memberInfo.isGlobalAdmin || canEditOrgSettings(memberInfo.role))

  async function handleSave() {
    if (!org || !canEdit) return
    setIsSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      const res = await fetch(`/api/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      if (res.ok) {
        await fetchOrg()
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        const data = await res.json()
        setSaveError(data.error || "Failed to save changes")
      }
    } catch (error) {
      console.error("Failed to save:", error)
      setSaveError("Failed to save changes")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !org || !canEdit) return

    setIsUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(`/api/orgs/${org.id}/logo`, {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setLogoUrl(data.logoUrl)
        fetchOrg()
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
    if (!org || !canEdit) return
    if (!confirm("Are you sure you want to remove the logo?")) return

    setIsUploadingLogo(true)
    try {
      const res = await fetch(`/api/orgs/${org.id}/logo`, {
        method: "DELETE",
      })

      if (res.ok) {
        setLogoUrl(null)
        fetchOrg()
      }
    } catch (error) {
      console.error("Failed to delete logo:", error)
    } finally {
      setIsUploadingLogo(false)
    }
  }

  function copyOrgId() {
    if (org?.id) {
      navigator.clipboard.writeText(org.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading || !org) {
    return (
      <>
        <PageHeader>
          <Skeleton className="h-4 w-32" />
        </PageHeader>
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
      </>
    )
  }

  return (
    <>
      <PageHeader>
        <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{org.name} Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </PageHeader>

        <div className="flex flex-1 flex-col p-6">
          <div className="mx-auto w-full max-w-2xl space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold">{org.name} Settings</h1>
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
                    value={org?.id ?? ""}
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
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    {saveError && (
                      <span className="text-destructive">{saveError}</span>
                    )}
                    {saveSuccess && (
                      <span className="text-green-600">Changes saved successfully</span>
                    )}
                  </div>
                  <Button onClick={handleSave} disabled={isSaving} size="sm">
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
    </>
  )
}
