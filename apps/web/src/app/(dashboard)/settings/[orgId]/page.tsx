"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { PageHeader } from "@/components/page-header";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Shield,
  Trash2,
  UserPlus,
  X,
} from "@/lib/icons";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────

interface Organisation {
  id: string;
  name: string;
  accountName: string | null;
  slug: string;
  logoUrl: string | null;
  createdAt: string;
}

interface PortalMember {
  id: string;
  accountId: string;
  orgId: string;
  role: string;
  status: string;
  joinedAt: string | null;
  account?: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
    userId: string;
  };
}

interface PortalInvitation {
  id: string;
  orgId: string;
  email: string;
  token: string;
  status: string;
  expiresAt: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(value?: string | null) {
  if (!value) return "\u2014";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "\u2014";
  return dateFormatter.format(parsed);
}

function getInitials(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_VARIANTS: Record<string, string> = {
  admin: "default",
  editor: "secondary",
  viewer: "outline",
};

const STATUS_VARIANTS: Record<string, string> = {
  active: "default",
  pending: "secondary",
  suspended: "destructive",
  revoked: "outline",
  expired: "outline",
  accepted: "default",
};

// ─── Page ────────────────────────────────────────────────────────────

export default function OrgSettingsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;
  const router = useRouter();

  // State
  const [org, setOrg] = useState<Organisation | null>(null);
  const [members, setMembers] = useState<PortalMember[]>([]);
  const [invitations, setInvitations] = useState<PortalInvitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Accounting name
  const [accountNameDraft, setAccountNameDraft] = useState("");
  const [accountNameEdited, setAccountNameEdited] = useState(false);
  const [isSavingAccountName, setIsSavingAccountName] = useState(false);

  // Invite
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDays, setInviteDays] = useState("7");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<{
    acceptUrl: string;
    token: string;
    expiresAt?: string;
  } | null>(null);
  const [copiedField, setCopiedField] = useState<"url" | "token" | null>(null);

  // Role change
  const [roleChangeTarget, setRoleChangeTarget] = useState<PortalMember | null>(null);
  const [newRole, setNewRole] = useState<string>("");
  const [isChangingRole, setIsChangingRole] = useState(false);

  // Remove member
  const [removeTarget, setRemoveTarget] = useState<PortalMember | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);

  // ─── Data fetching ─────────────────────────────────────────────────

  const fetchAll = useCallback(
    async (opts?: { background?: boolean }) => {
      if (opts?.background) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }

      try {
        const [orgsRes, membersRes, invitationsRes] = await Promise.all([
          fetch("/api/organisations").catch(() => null),
          fetch(`/api/portal-admin/memberships?orgId=${orgId}`).catch(() => null),
          fetch(`/api/portal-admin/invitations?orgId=${orgId}`).catch(() => null),
        ]);

        // Org
        if (orgsRes?.ok) {
          const orgs = (await orgsRes.json()) as Organisation[];
          const found = orgs.find((o) => o.id === orgId);
          if (found) {
            setOrg(found);
            if (!accountNameEdited) {
              setAccountNameDraft(found.accountName ?? "");
            }
          }
        }

        // Members
        if (membersRes?.ok) {
          const data = (await membersRes.json()) as PortalMember[];
          setMembers(data);
        }

        // Invitations
        if (invitationsRes?.ok) {
          const data = (await invitationsRes.json()) as PortalInvitation[];
          setInvitations(data);
        }
      } catch {
        // Silently handle
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [orgId, accountNameEdited],
  );

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // ─── Accounting name ───────────────────────────────────────────────

  async function handleSaveAccountName() {
    setIsSavingAccountName(true);
    try {
      const res = await fetch(`/api/organisations/${orgId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountName: accountNameDraft.trim() || null,
          name: org?.name,
          slug: org?.slug,
        }),
      });
      if (res.ok) {
        const updated = (await res.json()) as Organisation;
        setOrg(updated);
        setAccountNameDraft(updated.accountName ?? "");
        setAccountNameEdited(false);
      }
    } catch {
      // Silently handle
    } finally {
      setIsSavingAccountName(false);
    }
  }

  // ─── Role change ──────────────────────────────────────────────────

  async function handleRoleChange() {
    if (!roleChangeTarget || !newRole) return;
    setIsChangingRole(true);
    try {
      const res = await fetch(
        `/api/portal-admin/memberships/${roleChangeTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        },
      );
      if (res.ok) {
        setRoleChangeTarget(null);
        setNewRole("");
        await fetchAll({ background: true });
      }
    } catch {
      // Silently handle
    } finally {
      setIsChangingRole(false);
    }
  }

  // ─── Remove member ────────────────────────────────────────────────

  async function handleRemoveMember() {
    if (!removeTarget) return;
    setIsRemoving(true);
    try {
      const res = await fetch(
        `/api/portal-admin/memberships/${removeTarget.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "suspended" }),
        },
      );
      if (res.ok) {
        setRemoveTarget(null);
        await fetchAll({ background: true });
      }
    } catch {
      // Silently handle
    } finally {
      setIsRemoving(false);
    }
  }

  // ─── Invite ───────────────────────────────────────────────────────

  async function handleInvite() {
    if (!inviteEmail) return;
    setIsInviting(true);
    setInviteError(null);
    setInviteResult(null);
    setCopiedField(null);

    try {
      const days = Number(inviteDays);
      const expiresInDays = Number.isFinite(days)
        ? Math.max(1, Math.min(30, days))
        : 7;
      const res = await fetch("/api/portal-admin/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orgId,
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
        setInviteError(data.error ?? "Failed to create invitation.");
        return;
      }

      setInviteResult({
        acceptUrl: data.acceptUrl,
        token: data.token,
        expiresAt: data.expiresAt,
      });
      await fetchAll({ background: true });
    } catch {
      setInviteError("Failed to create invitation.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    try {
      await fetch("/api/portal-admin/invitations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId, action: "revoke" }),
      });
      await fetchAll({ background: true });
    } catch {
      // Silently handle
    }
  }

  async function handleCopy(value: string, field: "url" | "token") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(
        () => setCopiedField((c) => (c === field ? null : c)),
        1800,
      );
    } catch {
      setCopiedField(null);
    }
  }

  // ─── Derived ──────────────────────────────────────────────────────

  const activeMembers = useMemo(
    () => members.filter((m) => m.status === "active"),
    [members],
  );

  const pendingInvitations = useMemo(
    () => invitations.filter((i) => i.status === "pending"),
    [invitations],
  );

  // ─── Render ───────────────────────────────────────────────────────

  return (
    <>
      <PageHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/settings">Organizations</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>{org?.name ?? "Loading..."}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
      </PageHeader>

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-6 py-4 md:py-6 px-4 lg:px-6">

            {/* Back + Page header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push("/settings")}
                  className="shrink-0"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                  {isLoading ? (
                    <>
                      <Skeleton className="h-7 w-48" />
                      <Skeleton className="h-4 w-32 mt-1.5" />
                    </>
                  ) : (
                    <>
                      <h1 className="text-2xl font-semibold tracking-tight">
                        {org?.name}
                      </h1>
                      <p className="text-muted-foreground text-sm mt-0.5">
                        Manage portal members, roles, and settings.
                      </p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => void fetchAll({ background: true })}
                  disabled={isRefreshing}
                  aria-label="Refresh"
                >
                  <RefreshCw
                    className={cn("h-4 w-4", isRefreshing && "animate-spin")}
                  />
                </Button>
                <Button
                  onClick={() => {
                    setInviteEmail("");
                    setInviteDays("7");
                    setInviteError(null);
                    setInviteResult(null);
                    setCopiedField(null);
                    setInviteOpen(true);
                  }}
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Invite to Portal
                </Button>
              </div>
            </div>

            {/* ─── Accounting Name ──────────────────────────────── */}
            <section className="rounded-lg border p-4 space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Accounting name</h2>
                <p className="text-muted-foreground text-xs mt-0.5">
                  Used as the &quot;Prepared by&quot; field on tax returns. Defaults to the organisation name if empty.
                </p>
              </div>
              {isLoading ? (
                <Skeleton className="h-9 w-80" />
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={accountNameDraft}
                    onChange={(e) => {
                      setAccountNameDraft(e.target.value);
                      setAccountNameEdited(true);
                    }}
                    placeholder={org?.name ?? "Organisation name"}
                    className="max-w-sm"
                  />
                  {accountNameEdited ? (
                    <Button
                      size="sm"
                      disabled={isSavingAccountName}
                      onClick={() => void handleSaveAccountName()}
                    >
                      {isSavingAccountName ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Save
                    </Button>
                  ) : null}
                </div>
              )}
            </section>

            {/* ─── Portal Members ───────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold">Portal members</h2>
                  <p className="text-muted-foreground text-xs mt-0.5">
                    {activeMembers.length} active member{activeMembers.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              {isLoading ? (
                <div className="rounded-lg border">
                  <div className="space-y-0">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0"
                      >
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-20" />
                        </div>
                        <Skeleton className="h-5 w-16 rounded-full" />
                        <Skeleton className="h-8 w-8 rounded-md" />
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeMembers.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center">
                  <p className="text-muted-foreground text-sm">
                    No portal members yet. Invite someone to get started.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="w-[80px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeMembers.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium">
                                {getInitials(member.account?.fullName)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">
                                  {member.account?.fullName ?? "Unnamed"}
                                </p>
                                <p className="text-muted-foreground text-xs font-mono truncate">
                                  {member.accountId.slice(0, 8)}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                (ROLE_VARIANTS[member.role] ?? "outline") as
                                  | "default"
                                  | "secondary"
                                  | "outline"
                                  | "destructive"
                              }
                            >
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(member.joinedAt)}
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
                                  onClick={() => {
                                    setRoleChangeTarget(member);
                                    setNewRole(member.role);
                                  }}
                                >
                                  <Shield className="mr-2 h-4 w-4" />
                                  Change Role
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setRemoveTarget(member)}
                                  className="text-destructive focus:text-destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  Suspend
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
            </section>

            {/* ─── Pending Invitations ──────────────────────────── */}
            <section className="space-y-3">
              <div>
                <h2 className="text-sm font-semibold">Portal invitations</h2>
                <p className="text-muted-foreground text-xs mt-0.5">
                  {pendingInvitations.length} pending
                </p>
              </div>

              {isLoading ? (
                <div className="rounded-lg border">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-4 px-4 py-3 border-b last:border-b-0"
                    >
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </div>
              ) : invitations.length === 0 ? (
                <div className="rounded-lg border border-dashed py-6 text-center">
                  <p className="text-muted-foreground text-sm">
                    No invitations.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead className="w-[80px] text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invitations.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-sm">
                            {inv.email}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                (STATUS_VARIANTS[inv.status] ?? "outline") as
                                  | "default"
                                  | "secondary"
                                  | "outline"
                                  | "destructive"
                              }
                            >
                              {inv.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">
                            {formatDate(inv.expiresAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            {inv.status === "pending" ? (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() =>
                                  void handleRevokeInvitation(inv.id)
                                }
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* ─── Role Change Dialog ─────────────────────────────────── */}
      <Dialog
        open={!!roleChangeTarget}
        onOpenChange={(open) => {
          if (!open) {
            setRoleChangeTarget(null);
            setNewRole("");
          }
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Change Role</DialogTitle>
            <DialogDescription>
              Update the role for{" "}
              <span className="font-medium text-foreground">
                {roleChangeTarget?.account?.fullName ?? "this member"}
              </span>
              .
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label htmlFor="role-select">Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="mt-1.5">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleChangeTarget(null)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void handleRoleChange()}
              disabled={
                isChangingRole || !newRole || newRole === roleChangeTarget?.role
              }
            >
              {isChangingRole ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Remove Member Dialog ───────────────────────────────── */}
      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend Member</AlertDialogTitle>
            <AlertDialogDescription>
              This will suspend{" "}
              <span className="text-foreground font-medium">
                {removeTarget?.account?.fullName ?? "this member"}
              </span>{" "}
              from the portal. They will lose access until reactivated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleRemoveMember()}
              disabled={isRemoving}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isRemoving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ─── Invite Dialog ──────────────────────────────────────── */}
      <Dialog
        open={inviteOpen}
        onOpenChange={(open) => {
          setInviteOpen(open);
          if (!open) {
            setInviteError(null);
            setInviteResult(null);
            setCopiedField(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Invite to Portal</DialogTitle>
            <DialogDescription>
              Create a portal invitation for{" "}
              <span className="font-medium text-foreground">
                {org?.name}
              </span>
              .
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
                  onChange={(e) => setInviteEmail(e.target.value)}
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
                  onChange={(e) => setInviteDays(e.target.value)}
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
                        void handleCopy(inviteResult.acceptUrl, "url")
                      }
                      className="mt-2"
                    >
                      {copiedField === "url" ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copiedField === "url" ? "Copied" : "Copy URL"}
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
                        void handleCopy(inviteResult.token, "token")
                      }
                      className="mt-2"
                    >
                      {copiedField === "token" ? (
                        <Check className="mr-1.5 h-3.5 w-3.5" />
                      ) : (
                        <Copy className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      {copiedField === "token" ? "Copied" : "Copy Token"}
                    </Button>
                  </div>
                </div>
                {inviteResult.expiresAt ? (
                  <p className="text-muted-foreground text-xs flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Expires{" "}
                    {new Date(inviteResult.expiresAt).toLocaleString()}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => void handleInvite()}
              disabled={isInviting || !inviteEmail}
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
    </>
  );
}
