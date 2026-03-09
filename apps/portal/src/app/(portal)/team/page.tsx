"use client";

import { useState } from "react";
import {
  Building2,
  Crown,
  Edit3,
  Eye,
  Loader2,
  Mail,
  MoreHorizontal,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

function getInitials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const ROLE_META: Record<string, { label: string; icon: typeof Eye; color: string }> = {
  viewer: {
    label: "Viewer",
    icon: Eye,
    color: "border-border/70 bg-muted/60 text-muted-foreground",
  },
  editor: {
    label: "Editor",
    icon: Edit3,
    color: "border-blue-500/20 bg-blue-500/8 text-blue-700 dark:text-blue-400",
  },
  admin: {
    label: "Admin",
    icon: Crown,
    color: "border-amber-500/20 bg-amber-500/8 text-amber-700 dark:text-amber-400",
  },
};

const STATUS_META: Record<string, { label: string; color: string }> = {
  active: {
    label: "Active",
    color: "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400",
  },
  pending: {
    label: "Pending",
    color: "border-amber-500/20 bg-amber-500/8 text-amber-700 dark:text-amber-400",
  },
  suspended: {
    label: "Suspended",
    color: "border-red-500/20 bg-red-500/8 text-red-700 dark:text-red-400",
  },
  expired: {
    label: "Expired",
    color: "border-border/70 bg-muted/60 text-muted-foreground",
  },
  accepted: {
    label: "Accepted",
    color: "border-emerald-500/20 bg-emerald-500/8 text-emerald-700 dark:text-emerald-400",
  },
};

function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? ROLE_META.viewer!;
  const Icon = meta.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.color}`}
    >
      <Icon className="size-3" />
      {meta.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending!;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.color}`}
    >
      {meta.label}
    </span>
  );
}

export default function TeamPage() {
  const { data, isLoading } = api.portalAccess.getMyMemberships.useQuery();
  const memberships = data?.memberships ?? [];

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="portal-card p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
              <Users className="size-4.5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">Team</h1>
              <p className="text-sm text-muted-foreground">
                Manage your organization members and invitations.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center py-16">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (!memberships.length) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="portal-card p-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
              <Users className="size-4.5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold">Team</h1>
              <p className="text-sm text-muted-foreground">
                Manage your organization members and invitations.
              </p>
            </div>
          </div>
        </div>
        <div className="mt-5 rounded-xl border border-dashed border-border/60 px-4 py-16 text-center text-sm text-muted-foreground">
          You are not a member of any organization yet.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="portal-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
            <Users className="size-4.5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Team</h1>
            <p className="text-sm text-muted-foreground">
              Manage your organization members and invitations.
            </p>
          </div>
        </div>
      </div>

      {memberships.map((membership) => (
        <OrgTeamSection
          key={membership.id}
          orgId={membership.orgId}
          orgName={membership.orgName}
          orgLogoUrl={membership.orgLogoUrl}
          myRole={membership.role}
        />
      ))}
    </div>
  );
}

function OrgTeamSection({
  orgId,
  orgName,
  orgLogoUrl,
  myRole,
}: {
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  myRole: string;
}) {
  const isAdmin = myRole === "admin";
  const utils = api.useUtils();

  const membersQuery = api.portalTeam.listMembers.useQuery({ orgId });
  const invitationsQuery = api.portalTeam.listInvitations.useQuery({ orgId });

  const updateRole = api.portalTeam.updateRole.useMutation({
    onSuccess: () => {
      toast.success("Role updated");
      void utils.portalTeam.listMembers.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const removeMember = api.portalTeam.removeMember.useMutation({
    onSuccess: () => {
      toast.success("Member removed");
      void utils.portalTeam.listMembers.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeInvitation = api.portalTeam.revokeInvitation.useMutation({
    onSuccess: () => {
      toast.success("Invitation revoked");
      void utils.portalTeam.listInvitations.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const inviteMember = api.portalTeam.inviteMember.useMutation({
    onSuccess: () => {
      toast.success("Invitation sent");
      setInviteEmail("");
      setShowInvite(false);
      void utils.portalTeam.listInvitations.invalidate({ orgId });
    },
    onError: (err) => toast.error(err.message),
  });

  const [confirmRemove, setConfirmRemove] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const members = membersQuery.data ?? [];
  const activeMembers = members.filter((m) => m.status === "active");
  const suspendedMembers = members.filter((m) => m.status === "suspended");
  const invitations = invitationsQuery.data ?? [];
  const pendingInvitations = invitations.filter((i) => i.status === "pending");

  return (
    <div className="space-y-3">
      {/* Org header */}
      <div className="rounded-xl border border-border/70 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {orgLogoUrl ? (
              <img
                src={orgLogoUrl}
                alt={orgName}
                className="size-9 rounded-lg object-cover"
              />
            ) : (
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground">
                <Building2 className="size-4" />
              </span>
            )}
            <div>
              <p className="text-sm font-semibold">{orgName}</p>
              <p className="text-xs text-muted-foreground">
                {activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""}
                {pendingInvitations.length > 0
                  ? ` · ${pendingInvitations.length} pending`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge role={myRole} />
            {isAdmin ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowInvite(true)}
              >
                <UserPlus className="size-3.5" />
                Invite
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Active members */}
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
        <p className="text-sm font-semibold">Members</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          People with access to this organization.
        </p>

        {membersQuery.isLoading ? (
          <div className="mt-4 flex items-center justify-center py-8">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : !activeMembers.length ? (
          <p className="mt-4 rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
            No active members.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border/50">
            {activeMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <Avatar size="default">
                    {member.avatarUrl ? (
                      <AvatarImage src={member.avatarUrl} alt={member.fullName ?? ""} />
                    ) : null}
                    <AvatarFallback>{getInitials(member.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {member.fullName ?? "Unnamed user"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {member.joinedAt
                        ? `Joined ${new Date(member.joinedAt).toLocaleDateString()}`
                        : "Pending"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={member.role} />
                  {isAdmin ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="size-8 p-0">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          disabled={member.role === "viewer" || updateRole.isPending}
                          onClick={() =>
                            updateRole.mutate({
                              orgId,
                              membershipId: member.id,
                              role: "viewer",
                            })
                          }
                        >
                          <Eye className="size-3.5" />
                          Set as Viewer
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={member.role === "editor" || updateRole.isPending}
                          onClick={() =>
                            updateRole.mutate({
                              orgId,
                              membershipId: member.id,
                              role: "editor",
                            })
                          }
                        >
                          <Edit3 className="size-3.5" />
                          Set as Editor
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={member.role === "admin" || updateRole.isPending}
                          onClick={() =>
                            updateRole.mutate({
                              orgId,
                              membershipId: member.id,
                              role: "admin",
                            })
                          }
                        >
                          <Crown className="size-3.5" />
                          Set as Admin
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-red-600 dark:text-red-400"
                          onClick={() =>
                            setConfirmRemove({
                              id: member.id,
                              name: member.fullName ?? "this member",
                            })
                          }
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Invitations */}
      <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="size-4 text-muted-foreground" />
              <p className="text-sm font-semibold">Invitations</p>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {pendingInvitations.length
                ? `${pendingInvitations.length} pending invitation${pendingInvitations.length !== 1 ? "s" : ""}`
                : "No pending invitations."}
            </p>
          </div>
          {isAdmin ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowInvite(true)}
            >
              <UserPlus className="size-3.5" />
              Invite member
            </Button>
          ) : null}
        </div>

        {invitationsQuery.isLoading ? (
          <div className="mt-4 flex items-center justify-center py-6">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : !invitations.length ? (
          <p className="mt-4 rounded-lg border border-dashed border-border/60 px-4 py-6 text-center text-sm text-muted-foreground">
            No invitations sent yet.
          </p>
        ) : (
          <div className="mt-4 divide-y divide-border/50">
            {invitations.map((invitation) => (
              <div
                key={invitation.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invitation.email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited by {invitation.invitedByName ?? "unknown"} ·{" "}
                    {new Date(invitation.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={invitation.status} />
                  {isAdmin && invitation.status === "pending" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                      disabled={revokeInvitation.isPending}
                      onClick={() =>
                        revokeInvitation.mutate({
                          orgId,
                          invitationId: invitation.id,
                        })
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Suspended members */}
      {suspendedMembers.length > 0 ? (
        <div className="rounded-xl border border-border/70 bg-card p-5 shadow-xs">
          <p className="text-sm font-semibold text-muted-foreground">
            Suspended members
          </p>
          <div className="mt-4 divide-y divide-border/50">
            {suspendedMembers.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 opacity-60"
              >
                <div className="flex items-center gap-3">
                  <Avatar size="default">
                    {member.avatarUrl ? (
                      <AvatarImage src={member.avatarUrl} alt={member.fullName ?? ""} />
                    ) : null}
                    <AvatarFallback>{getInitials(member.fullName)}</AvatarFallback>
                  </Avatar>
                  <p className="truncate text-sm">
                    {member.fullName ?? "Unnamed user"}
                  </p>
                </div>
                <StatusBadge status="suspended" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Invite dialog */}
      <AlertDialog open={showInvite} onOpenChange={setShowInvite}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Invite a team member</AlertDialogTitle>
            <AlertDialogDescription>
              Send an invitation email to join {orgName}. They will receive a
              link to accept the invitation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Input
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && inviteEmail.trim()) {
                  inviteMember.mutate({ orgId, email: inviteEmail.trim() });
                }
              }}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInviteEmail("")}>
              Cancel
            </AlertDialogCancel>
            <Button
              disabled={!inviteEmail.trim() || inviteMember.isPending}
              onClick={() =>
                inviteMember.mutate({ orgId, email: inviteEmail.trim() })
              }
            >
              {inviteMember.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Send invitation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove confirmation dialog */}
      <AlertDialog
        open={!!confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {confirmRemove?.name} from{" "}
              {orgName}? They will lose access to this organization.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmRemove) {
                  removeMember.mutate({
                    orgId,
                    membershipId: confirmRemove.id,
                  });
                  setConfirmRemove(null);
                }
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
