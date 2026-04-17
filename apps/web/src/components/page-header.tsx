"use client"

import { useEffect, useState, type ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import { Sparkles } from "@/lib/icons"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { AskAiDialog } from "@/components/ask-ai-dialog"
import { useOrgFromUrl } from "@/lib/org-context"

function initials(name: string | null | undefined) {
  if (!name) return "?"
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

type Member = {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  role: string
}

interface PageHeaderProps {
  children: ReactNode
  actions?: ReactNode
}

export function PageHeader({ children, actions }: PageHeaderProps) {
  const { state: sidebarState } = useSidebar()
  const { currentOrg } = useOrgFromUrl()
  const [mounted, setMounted] = useState(false)
  const [askAiOpen, setAskAiOpen] = useState(false)

  useEffect(() => setMounted(true), [])

  // Cmd+K shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setAskAiOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const { data: members = [], isLoading: membersLoading } = useQuery<Member[]>({
    queryKey: ["members"],
    queryFn: async () => {
      const res = await fetch("/api/members")
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    },
    staleTime: 5 * 60 * 1000,
  })

  // Find current user from members
  const currentUser = members.length > 0 ? members[0] : null

  const AVATAR_LIMIT = 3

  return (
    <>
      <header
        className="bg-container z-20 flex h-14 shrink-0 items-center justify-between border-b px-4"
        style={{ viewTransitionName: "web-header" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          {mounted && sidebarState === "collapsed" && (
            <>
              <SidebarTrigger className="-ml-1 rounded-lg" />
              <Separator
                orientation="vertical"
                className="mr-1 h-4 data-vertical:self-center"
              />
            </>
          )}
          {children}
        </div>

        <div className="flex items-center gap-2">
          {actions}

          <div className="hidden items-center md:flex">
            {membersLoading ? (
              <div className="flex -space-x-2">
                {Array.from({ length: AVATAR_LIMIT }).map((_, i) => (
                  <Skeleton key={i} className="size-7 rounded-full border-2 border-container" />
                ))}
              </div>
            ) : members.length > 0 ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex -space-x-2">
                    {members.slice(0, AVATAR_LIMIT).map((member) => (
                      <Avatar key={member.id} className="size-7 border-2 border-container">
                        <AvatarImage
                          src={member.avatarUrl ?? `https://avatar.vercel.sh/${member.email}`}
                          alt={member.fullName ?? member.email}
                        />
                        <AvatarFallback className="text-[10px]">
                          {initials(member.fullName)}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {members.length > AVATAR_LIMIT && (
                      <div className="flex size-7 items-center justify-center rounded-full border-2 border-container bg-muted text-[10px] font-medium text-muted-foreground">
                        +{members.length - AVATAR_LIMIT}
                      </div>
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{members.length} team {members.length === 1 ? "member" : "members"}</p>
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>

          <Button
            variant="outline"
            size="sm"
            className="hidden h-8 gap-1.5 sm:inline-flex"
            onClick={() => setAskAiOpen(true)}
          >
            <Sparkles className="size-3.5" />
            Ask AI
            <span className="rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              ⌘K
            </span>
          </Button>
        </div>
      </header>

      <AskAiDialog
        open={askAiOpen}
        onOpenChange={setAskAiOpen}
        orgName={currentOrg?.name ?? null}
        userAvatarUrl={currentUser?.avatarUrl ?? null}
        userFullName={currentUser?.fullName ?? null}
      />
    </>
  )
}
