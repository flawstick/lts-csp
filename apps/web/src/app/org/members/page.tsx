"use client"

import { useEffect, useState } from "react"
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
import { useOrgStore } from "@/lib/org-context"
import {
  canManageMembers,
  canEditMemberRoles,
  getRoleLabel,
  getRoleDescription,
  type OrgRole,
} from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { MoreHorizontal, UserPlus, Trash2, Shield } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface Member {
  id: string
  role: OrgRole
  createdAt: string
  account: {
    id: string
    fullName: string | null
    userId: string
  } | null
}

interface MemberInfo {
  role: OrgRole
  memberId: string
  isGlobalAdmin?: boolean
}

export default function OrgMembersPage() {
  const { currentOrg, isLoading: orgLoading } = useOrgStore()
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<OrgRole>("member")
  const [isInviting, setIsInviting] = useState(false)

  useEffect(() => {
    async function fetchData() {
      if (!currentOrg) return
      setIsLoading(true)
      try {
        const [meRes, membersRes] = await Promise.all([
          fetch(`/api/orgs/${currentOrg.id}/me`),
          fetch(`/api/orgs/${currentOrg.id}/members`),
        ])
        if (meRes.ok) {
          const data = await meRes.json()
          setMemberInfo(data)
        }
        if (membersRes.ok) {
          const data = await membersRes.json()
          setMembers(data.members)
        }
      } catch (error) {
        console.error("Failed to fetch data:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchData()
  }, [currentOrg])

  const canInvite = memberInfo && (memberInfo.isGlobalAdmin || canManageMembers(memberInfo.role))
  const canEditRoles = memberInfo && (memberInfo.isGlobalAdmin || canEditMemberRoles(memberInfo.role))
  const canRemove = memberInfo && (memberInfo.isGlobalAdmin || canManageMembers(memberInfo.role))

  async function handleInvite() {
    if (!currentOrg || !canInvite) return
    setIsInviting(true)
    try {
      const res = await fetch(`/api/orgs/${currentOrg.id}/members/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      if (res.ok) {
        setInviteOpen(false)
        setInviteEmail("")
        // Refresh members
        const membersRes = await fetch(`/api/orgs/${currentOrg.id}/members`)
        if (membersRes.ok) {
          const data = await membersRes.json()
          setMembers(data.members)
        }
      }
    } catch (error) {
      console.error("Failed to invite:", error)
    } finally {
      setIsInviting(false)
    }
  }

  async function handleRoleChange(memberId: string, newRole: OrgRole) {
    if (!currentOrg || !canEditRoles) return
    try {
      const res = await fetch(`/api/orgs/${currentOrg.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        setMembers(members.map(m =>
          m.id === memberId ? { ...m, role: newRole } : m
        ))
      }
    } catch (error) {
      console.error("Failed to update role:", error)
    }
  }

  async function handleRemove(memberId: string) {
    if (!currentOrg || !canRemove) return
    if (memberId === memberInfo?.memberId) {
      alert("You cannot remove yourself")
      return
    }
    try {
      const res = await fetch(`/api/orgs/${currentOrg.id}/members/${memberId}`, {
        method: "DELETE",
      })
      if (res.ok) {
        setMembers(members.filter(m => m.id !== memberId))
      }
    } catch (error) {
      console.error("Failed to remove member:", error)
    }
  }

  if (orgLoading || isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              <Skeleton className="h-4 w-48" />
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
            <Skeleton className="h-64 w-full" />
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] duration-300 ease-in-out group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/org/settings">Organisation</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Members</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Members</h1>
              <p className="text-muted-foreground text-sm">
                Manage who has access to your organisation
              </p>
            </div>
            {canInvite && (
              <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <UserPlus className="mr-2 h-4 w-4" />
                    Invite Member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Invite Member</DialogTitle>
                    <DialogDescription>
                      Send an invitation to join your organisation
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="email">Email address</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="colleague@company.com"
                        value={inviteEmail}
                        onChange={(e) => setInviteEmail(e.target.value)}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="role">Role</Label>
                      <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as OrgRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="member">
                            <div className="flex flex-col">
                              <span>Member</span>
                              <span className="text-muted-foreground text-xs">
                                {getRoleDescription("member")}
                              </span>
                            </div>
                          </SelectItem>
                          <SelectItem value="admin">
                            <div className="flex flex-col">
                              <span>Admin</span>
                              <span className="text-muted-foreground text-xs">
                                {getRoleDescription("admin")}
                              </span>
                            </div>
                          </SelectItem>
                          {canEditRoles && (
                            <SelectItem value="owner">
                              <div className="flex flex-col">
                                <span>Owner</span>
                                <span className="text-muted-foreground text-xs">
                                  {getRoleDescription("owner")}
                                </span>
                              </div>
                            </SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setInviteOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleInvite} disabled={isInviting || !inviteEmail}>
                      {isInviting ? "Sending..." : "Send Invite"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Team Members</CardTitle>
              <CardDescription>
                {members.length} member{members.length !== 1 ? "s" : ""} in your organisation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="bg-muted flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium">
                            {(member.account?.fullName ?? "U")[0]?.toUpperCase() ?? "U"}
                          </div>
                          <div>
                            <div className="font-medium">
                              {member.account?.fullName || "Unknown User"}
                            </div>
                            {member.id === memberInfo?.memberId && (
                              <span className="text-muted-foreground text-xs">You</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {canEditRoles && member.id !== memberInfo?.memberId ? (
                          <Select
                            value={member.role}
                            onValueChange={(v) => handleRoleChange(member.id, v as OrgRole)}
                          >
                            <SelectTrigger className="w-[120px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="member">Member</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="owner">Owner</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge
                            variant={
                              member.role === "owner"
                                ? "default"
                                : member.role === "admin"
                                ? "secondary"
                                : "outline"
                            }
                          >
                            <Shield className="mr-1 h-3 w-3" />
                            {getRoleLabel(member.role)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(member.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        {canRemove && member.id !== memberInfo?.memberId && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleRemove(member.id)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Role Permissions</CardTitle>
              <CardDescription>
                Understanding what each role can do
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {(["owner", "admin", "member"] as OrgRole[]).map((role) => (
                  <div key={role} className="flex items-start gap-3">
                    <Badge
                      variant={
                        role === "owner"
                          ? "default"
                          : role === "admin"
                          ? "secondary"
                          : "outline"
                      }
                      className="mt-0.5"
                    >
                      {getRoleLabel(role)}
                    </Badge>
                    <p className="text-muted-foreground text-sm">
                      {getRoleDescription(role)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
