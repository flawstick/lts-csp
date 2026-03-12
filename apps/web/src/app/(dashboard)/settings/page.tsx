"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertCircle,
  Check,
  Clock,
  Copy,
  Edit,
  ExternalLink,
  Loader2,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  X,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

interface Organisation {
  id: string;
  name: string;
  accountName: string | null;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return dateFormatter.format(parsed);
}

function getOrgInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "OR"
  );
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function Page() {
  const router = useRouter();

  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organisation | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", slug: "" });
  const [search, setSearch] = useState("");
  const [createSlugEdited, setCreateSlugEdited] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDays, setInviteDays] = useState("7");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    acceptUrl: string;
    token: string;
    expiresAt?: string;
  } | null>(null);
  const [copiedInviteField, setCopiedInviteField] = useState<
    "url" | "token" | null
  >(null);

  useEffect(() => {
    void fetchOrganisations();
  }, []);

  async function fetchOrganisations(options?: { background?: boolean }) {
    if (options?.background) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const res = await fetch("/api/organisations");
      if (res.ok) {
        const data = (await res.json()) as Organisation[];
        setOrganisations(data);
        setPageError(null);
      } else if (res.status === 403) {
        setOrganisations([]);
        setPageError("Only global admins can manage organizations.");
      } else {
        setPageError("Failed to load organizations.");
      }
    } catch (error) {
      console.error("Failed to fetch organizations:", error);
      setPageError("Failed to load organizations.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }

  function resetCreateDialog() {
    setFormData({ name: "", slug: "" });
    setDialogError(null);
    setCreateSlugEdited(false);
  }

  function openCreateDialog() {
    resetCreateDialog();
    setCreateOpen(true);
  }

  async function handleCreate() {
    if (!formData.name || !formData.slug) return;

    setIsSaving(true);
    setDialogError(null);

    try {
      const res = await fetch("/api/organisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (!res.ok) {
        setDialogError(data.error || "Failed to create organization.");
        return;
      }

      setCreateOpen(false);
      resetCreateDialog();
      await fetchOrganisations({ background: true });
    } catch (error) {
      console.error("Failed to create organization:", error);
      setDialogError("Failed to create organization.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdate() {
    if (!selectedOrg || !formData.name || !formData.slug) return;

    setIsSaving(true);
    setDialogError(null);

    try {
      const res = await fetch(`/api/organisations/${selectedOrg.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const data = await res.json();

      if (!res.ok) {
        setDialogError(data.error || "Failed to update organization.");
        return;
      }

      setEditOpen(false);
      setSelectedOrg(null);
      setFormData({ name: "", slug: "" });
      await fetchOrganisations({ background: true });
    } catch (error) {
      console.error("Failed to update organization:", error);
      setDialogError("Failed to update organization.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedOrg) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/organisations/${selectedOrg.id}`, {
        method: "DELETE",
      });
      const data = await res.json();

      if (!res.ok) {
        setDeleteError(data.error || "Failed to delete organization.");
        return;
      }

      setDeleteOpen(false);
      setSelectedOrg(null);
      await fetchOrganisations({ background: true });
    } catch (error) {
      console.error("Failed to delete organization:", error);
      setDeleteError("Failed to delete organization.");
    } finally {
      setIsDeleting(false);
    }
  }

  function openEdit(org: Organisation) {
    setSelectedOrg(org);
    setDialogError(null);
    setFormData({ name: org.name, slug: org.slug });
    setEditOpen(true);
  }

  function openDelete(org: Organisation) {
    setSelectedOrg(org);
    setDeleteError(null);
    setDeleteOpen(true);
  }

  function openInvite(org: Organisation) {
    setSelectedOrg(org);
    setInviteEmail("");
    setInviteDays("7");
    setInviteError(null);
    setInviteResult(null);
    setCopiedInviteField(null);
    setInviteOpen(true);
  }

  async function handlePortalInvite() {
    if (!selectedOrg || !inviteEmail) return;

    setIsInviting(true);
    setInviteError(null);
    setInviteResult(null);
    setCopiedInviteField(null);

    try {
      const days = Number(inviteDays);
      const expiresInDays = Number.isFinite(days)
        ? Math.max(1, Math.min(30, days))
        : 7;
      const res = await fetch("/api/portal-admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId: selectedOrg.id,
          email: inviteEmail.trim().toLowerCase(),
          expiresInDays,
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        acceptUrl?: string;
        token?: string;
        expiresAt?: string;
      };

      if (!res.ok || !data.acceptUrl || !data.token) {
        setInviteError(data.error || "Failed to create portal invitation.");
        return;
      }

      setInviteResult({
        acceptUrl: data.acceptUrl,
        token: data.token,
        expiresAt: data.expiresAt,
      });
    } catch (error) {
      console.error("Failed to invite portal user:", error);
      setInviteError("Failed to create portal invitation.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleInviteCopy(value: string, field: "url" | "token") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedInviteField(field);
      window.setTimeout(
        () =>
          setCopiedInviteField((current) =>
            current === field ? null : current,
          ),
        1800,
      );
    } catch {
      setCopiedInviteField(null);
    }
  }

  const filteredOrganisations = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return organisations;

    return organisations.filter((org) => {
      return (
        org.name.toLowerCase().includes(term) ||
        org.slug.toLowerCase().includes(term)
      );
    });
  }, [organisations, search]);

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Organizations</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">

            {/* Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Organizations
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  Manage client organizations, team access, and portal invitations.
                </p>
              </div>
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                New Organization
              </Button>
            </div>

            {/* Search + filter bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative max-w-sm flex-1">
                <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search organizations..."
                  className="pl-9 pr-9"
                />
                {search.trim() ? (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2 transition"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm tabular-nums">
                  {filteredOrganisations.length} of {organisations.length}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() =>
                    void fetchOrganisations({ background: true })
                  }
                  disabled={isRefreshing}
                  aria-label="Refresh"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                  />
                </Button>
              </div>
            </div>

            {/* Error state */}
            {pageError ? (
              <div className="border-destructive/40 bg-destructive/5 rounded-lg border px-4 py-3 flex items-start gap-3">
                <AlertCircle className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Access restricted</p>
                  <p className="text-muted-foreground text-sm mt-0.5">
                    {pageError}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void fetchOrganisations({ background: true })
                  }
                  disabled={isRefreshing}
                >
                  Retry
                </Button>
              </div>
            ) : isLoading ? (
              /* Loading skeleton */
              <div className="rounded-lg border">
                <div className="space-y-0">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0"
                    >
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-8 w-8 rounded-md" />
                    </div>
                  ))}
                </div>
              </div>
            ) : filteredOrganisations.length === 0 ? (
              /* Empty state */
              <div className="rounded-lg border border-dashed py-12 text-center">
                <p className="text-muted-foreground text-sm">
                  {search.trim()
                    ? "No organizations match your search."
                    : "No organizations yet."}
                </p>
                <div className="mt-4 flex justify-center gap-2">
                  {search.trim() ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSearch("")}
                    >
                      Clear Search
                    </Button>
                  ) : null}
                  <Button size="sm" onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Organization
                  </Button>
                </div>
              </div>
            ) : (
              /* Organization table */
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[280px]">Organization</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[100px] text-right">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrganisations.map((org) => (
                      <TableRow key={org.id}>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="bg-muted text-muted-foreground flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                              {getOrgInitials(org.name)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">
                                {org.name}
                              </p>
                              <p className="text-muted-foreground text-xs font-mono truncate">
                                {org.id.slice(0, 8)}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="font-mono">
                            {org.slug}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatDate(org.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(`/settings/${org.id}`)
                                }
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Manage
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() =>
                                  router.push(`/org/${org.id}`)
                                }
                              >
                                <ExternalLink className="mr-2 h-4 w-4" />
                                Open Workspace
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openInvite(org)}
                              >
                                <UserPlus className="mr-2 h-4 w-4" />
                                Invite to Portal
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => openEdit(org)}
                              >
                                <Edit className="mr-2 h-4 w-4" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => openDelete(org)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreateDialog();
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Create Organization</DialogTitle>
            <DialogDescription>
              Add a new client organization. The slug is used as an internal
              identifier.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="NSM Trust Company"
                value={formData.name}
                onChange={(event) => {
                  const nextName = event.target.value;
                  setFormData((current) => ({
                    name: nextName,
                    slug: createSlugEdited ? current.slug : slugify(nextName),
                  }));
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                placeholder="nsm"
                value={formData.slug}
                onChange={(event) => {
                  setCreateSlugEdited(true);
                  setFormData((current) => ({
                    ...current,
                    slug: slugify(event.target.value),
                  }));
                }}
              />
              <p className="text-muted-foreground text-xs">
                Auto-generated from name until manually edited.
              </p>
            </div>

            {dialogError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
                {dialogError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isSaving || !formData.name || !formData.slug}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (!open) {
            setSelectedOrg(null);
            setDialogError(null);
            setFormData({ name: "", slug: "" });
          }
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Edit Organization</DialogTitle>
            <DialogDescription>
              Update the name and slug for{" "}
              {selectedOrg?.name ?? "this organization"}.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(event) => {
                  setFormData((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                }}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="edit-slug">Slug</Label>
              <Input
                id="edit-slug"
                value={formData.slug}
                onChange={(event) => {
                  setFormData((current) => ({
                    ...current,
                    slug: slugify(event.target.value),
                  }));
                }}
              />
            </div>

            {dialogError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
                {dialogError}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={isSaving || !formData.name || !formData.slug}
            >
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite dialog */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteError(null);
            setInviteResult(null);
            setCopiedInviteField(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invite to Portal</DialogTitle>
            <DialogDescription>
              Create a portal invitation for{" "}
              <span className="font-medium text-foreground">
                {selectedOrg?.name}
              </span>
              . The recipient will receive a link to set up their account.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <div className="grid gap-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="user@company.com"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="invite-days">Expires (days)</Label>
                <Input
                  id="invite-days"
                  type="number"
                  min={1}
                  max={30}
                  value={inviteDays}
                  onChange={(event) => setInviteDays(event.target.value)}
                />
              </div>
            </div>

            {inviteError ? (
              <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
                {inviteError}
              </div>
            ) : null}

            {inviteResult ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  Invitation created
                </div>

                <div className="space-y-2">
                  <div className="rounded-md border bg-background p-3">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
                      Accept URL
                    </p>
                    <p className="text-sm break-all font-mono">
                      {inviteResult.acceptUrl}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void handleInviteCopy(inviteResult.acceptUrl, "url")
                      }
                      className="mt-2"
                    >
                      {copiedInviteField === "url" ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copiedInviteField === "url" ? "Copied" : "Copy URL"}
                    </Button>
                  </div>

                  <div className="rounded-md border bg-background p-3">
                    <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider mb-1">
                      Token
                    </p>
                    <p className="text-sm break-all font-mono">
                      {inviteResult.token}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        void handleInviteCopy(inviteResult.token, "token")
                      }
                      className="mt-2"
                    >
                      {copiedInviteField === "token" ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copiedInviteField === "token" ? "Copied" : "Copy Token"}
                    </Button>
                  </div>
                </div>

                {inviteResult.expiresAt ? (
                  <p className="text-muted-foreground text-xs flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Expires {new Date(inviteResult.expiresAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setInviteOpen(false)}
            >
              Close
            </Button>
            <Button
              onClick={handlePortalInvite}
              disabled={isInviting || !inviteEmail || !selectedOrg}
            >
              {isInviting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Create Invite
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setDeleteError(null);
            setSelectedOrg(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete{" "}
              <span className="text-foreground font-medium">
                {selectedOrg?.name}
              </span>
              . This action cannot be undone. Organizations with existing tax
              returns or tasks cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteError ? (
            <div className="border-destructive/40 bg-destructive/5 text-destructive rounded-md border px-3 py-2 text-sm">
              {deleteError}
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
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
  );
}
