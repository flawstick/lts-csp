"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Building2, Edit, Trash2, Loader2, UserPlus } from "@/lib/icons"

interface Organisation {
  id: string
  name: string
  slug: string
  logoUrl: string | null
  createdAt: string
}

export default function Page() {
  const [organisations, setOrganisations] = useState<Organisation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: "", slug: "" })
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteDays, setInviteDays] = useState("7")
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<{
    acceptUrl: string
    token: string
    expiresAt?: string
  } | null>(null)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetchOrganisations()
  }, [])

  async function fetchOrganisations() {
    setIsLoading(true)
    try {
      const res = await fetch("/api/organisations")
      if (res.ok) {
        const data = await res.json()
        setOrganisations(data)
      } else if (res.status === 403) {
        setError("Only global admins can manage organizations")
      }
    } catch (error) {
      console.error("Failed to fetch organizations:", error)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleCreate() {
    if (!formData.name || !formData.slug) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (res.ok) {
        setCreateOpen(false)
        setFormData({ name: "", slug: "" })
        fetchOrganisations()
      } else {
        setError(data.error || "Failed to create organization")
      }
    } catch (error) {
      console.error("Failed to create organization:", error)
      setError("Failed to create organization")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleUpdate() {
    if (!selectedOrg || !formData.name || !formData.slug) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/organisations/${selectedOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (res.ok) {
        setEditOpen(false)
        setSelectedOrg(null)
        setFormData({ name: "", slug: "" })
        fetchOrganisations()
      } else {
        setError(data.error || "Failed to update organization")
      }
    } catch (error) {
      console.error("Failed to update organization:", error)
      setError("Failed to update organization")
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedOrg) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/organisations/${selectedOrg.id}`, {
        method: "DELETE",
      })
      const data = await res.json()
      if (res.ok) {
        setDeleteOpen(false)
        setSelectedOrg(null)
        fetchOrganisations()
      } else {
        alert(data.error || "Failed to delete organization")
      }
    } catch (error) {
      console.error("Failed to delete organization:", error)
      alert("Failed to delete organization")
    } finally {
      setIsDeleting(false)
    }
  }

  function openEdit(org: Organisation) {
    setSelectedOrg(org)
    setFormData({ name: org.name, slug: org.slug })
    setError(null)
    setEditOpen(true)
  }

  function openDelete(org: Organisation) {
    setSelectedOrg(org)
    setDeleteOpen(true)
  }

  function openInvite(org: Organisation) {
    setSelectedOrg(org)
    setInviteEmail("")
    setInviteDays("7")
    setInviteError(null)
    setInviteResult(null)
    setInviteOpen(true)
  }

  async function handlePortalInvite() {
    if (!selectedOrg || !inviteEmail) return
    setIsInviting(true)
    setInviteError(null)
    setInviteResult(null)

    try {
      const days = Number(inviteDays)
      const expiresInDays = Number.isFinite(days) ? Math.max(1, Math.min(30, days)) : 7
      const res = await fetch("/api/portal-admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: selectedOrg.id,
          email: inviteEmail.trim().toLowerCase(),
          expiresInDays,
        }),
      })

      const data = (await res.json()) as {
        error?: string
        acceptUrl?: string
        token?: string
        expiresAt?: string
      }

      if (!res.ok || !data.acceptUrl || !data.token) {
        setInviteError(data.error || "Failed to create portal invitation")
        return
      }

      setInviteResult({
        acceptUrl: data.acceptUrl,
        token: data.token,
        expiresAt: data.expiresAt,
      })
    } catch (e) {
      console.error("Failed to invite portal user:", e)
      setInviteError("Failed to create portal invitation")
    } finally {
      setIsInviting(false)
    }
  }

  const filteredOrganisations = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return organisations

    return organisations.filter((org) => {
      return org.name.toLowerCase().includes(term) || org.slug.toLowerCase().includes(term)
    })
  }, [organisations, search])

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>
      <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
        <Card className="overflow-hidden border-none bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-100/80">Admin Console</p>
                <h2 className="mt-2 text-2xl font-semibold">Client Organizations</h2>
                <p className="mt-2 text-sm text-blue-100">
                  Create organizations, manage details, and invite portal users directly to each org.
                </p>
              </div>
              <div className="grid w-full max-w-md grid-cols-2 gap-3 md:w-auto">
                <div className="rounded-lg border border-white/20 bg-white/10 p-3">
                  <p className="text-xs text-blue-100/80">Total Orgs</p>
                  <p className="text-xl font-semibold">{organisations.length}</p>
                </div>
                <div className="rounded-lg border border-white/20 bg-white/10 p-3">
                  <p className="text-xs text-blue-100/80">Visible</p>
                  <p className="text-xl font-semibold">{filteredOrganisations.length}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Client Organizations</CardTitle>
                <CardDescription>
                  Manage organizations that LTS provides tax services for
                </CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or slug..."
                  className="md:w-64"
                />
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Add Organization
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Organization</DialogTitle>
                      <DialogDescription>
                        Add a new client organization to the platform
                      </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="name">Name</Label>
                        <Input
                          id="name"
                          placeholder="NSM Trust Company"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="slug">Slug</Label>
                        <Input
                          id="slug"
                          placeholder="nsm"
                          value={formData.slug}
                          onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                        />
                      </div>
                      {error ? (
                        <p className="text-sm text-destructive">{error}</p>
                      ) : null}
                    </div>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCreateOpen(false)
                          setFormData({ name: "", slug: "" })
                          setError(null)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button onClick={handleCreate} disabled={isSaving || !formData.name || !formData.slug}>
                        {isSaving ? "Creating..." : "Create"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : error ? (
              <div className="rounded-xl border border-dashed p-8 text-center">
                <p className="text-destructive font-medium">{error}</p>
                <p className="text-muted-foreground mt-2 text-sm">
                  You need global admin privileges to create or manage client organizations.
                </p>
              </div>
            ) : filteredOrganisations.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-12 text-center">
                <Building2 className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="text-muted-foreground">No organizations yet</p>
                <p className="text-sm text-muted-foreground">
                  {search
                    ? "No organization matches your search."
                    : "Add your first client organization to get started."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {filteredOrganisations.map((org) => (
                  <div
                    key={org.id}
                    className="rounded-xl border bg-card p-4 transition hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold">{org.name}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge variant="outline">{org.slug}</Badge>
                          <p className="text-muted-foreground text-xs">
                            Created {new Date(org.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => openInvite(org)}>
                        <UserPlus className="mr-2 h-4 w-4" />
                        Invite to Portal
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => openEdit(org)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => openDelete(org)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update organization details
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
              />
            </div>
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditOpen(false)
                setSelectedOrg(null)
                setFormData({ name: "", slug: "" })
                setError(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdate} disabled={isSaving || !formData.name || !formData.slug}>
              {isSaving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Portal Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite To Portal</DialogTitle>
            <DialogDescription>
              Send a portal invitation for <strong>{selectedOrg?.name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="user@trustcompany.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="invite-days">Expires in days</Label>
              <Input
                id="invite-days"
                type="number"
                min={1}
                max={30}
                value={inviteDays}
                onChange={(e) => setInviteDays(e.target.value)}
              />
            </div>
            {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
            {inviteResult ? (
              <div className="space-y-2 rounded-md border p-3 text-sm">
                <p className="font-medium">Invitation created</p>
                <p className="break-all text-muted-foreground">
                  Token: <code>{inviteResult.token}</code>
                </p>
                <p className="break-all text-muted-foreground">
                  Accept URL: <code>{inviteResult.acceptUrl}</code>
                </p>
                {inviteResult.expiresAt ? (
                  <p className="text-muted-foreground">
                    Expires: {new Date(inviteResult.expiresAt).toLocaleString()}
                  </p>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(inviteResult.acceptUrl)
                    } catch {
                      // Ignore clipboard failures
                    }
                  }}
                >
                  Copy invite URL
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setInviteOpen(false)
                setInviteError(null)
                setInviteResult(null)
              }}
            >
              Close
            </Button>
            <Button
              onClick={handlePortalInvite}
              disabled={isInviting || !inviteEmail || !selectedOrg}
            >
              {isInviting ? "Creating..." : "Create Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{selectedOrg?.name}</strong>?
              This action cannot be undone. You cannot delete an organization with existing tax returns or tasks.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedOrg(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
