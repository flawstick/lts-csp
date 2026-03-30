"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Sparkles, Users } from "lucide-react";

import { AskAiDialog } from "@/components/ask-ai-dialog";
import { PORTAL_ASK_AI_OPEN_EVENT } from "@/lib/portal-command";

import {
  buildPortalNavigationModel,
  getPortalOrgIdFromPathname,
} from "@/lib/portal-navigation";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  AvatarGroup,
  AvatarGroupCount,
} from "@/components/ui/avatar";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { PortalCommandMenu } from "@/components/portal-command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";

const AVATAR_LIMIT = 6;

function initials(name: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function memberAvatarSrc(member: {
  avatarUrl?: string | null;
  email?: string | null;
  id: string;
}) {
  return (
    member.avatarUrl ?? `https://avatar.vercel.sh/${member.email ?? member.id}`
  );
}

export function PortalHeader() {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar();
  const [mounted, setMounted] = useState(false);
  const [askAiOpen, setAskAiOpen] = useState(false);
  const [askAiInitialPrompt, setAskAiInitialPrompt] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAskAiOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onAskAiOpen = (e: Event) => {
      const prompt = (e as CustomEvent<string | undefined>).detail ?? null;
      setAskAiInitialPrompt(prompt);
      setAskAiOpen(true);
    };
    window.addEventListener(PORTAL_ASK_AI_OPEN_EVENT, onAskAiOpen);
    return () => window.removeEventListener(PORTAL_ASK_AI_OPEN_EVENT, onAskAiOpen);
  }, []);
  const membershipsQuery = api.portalAccess.getMyMemberships.useQuery();
  const currentOrgId = useMemo(
    () => getPortalOrgIdFromPathname(pathname),
    [pathname],
  );

  const currentOrgName = useMemo(() => {
    if (!currentOrgId) return null;

    const memberships = membershipsQuery.data?.memberships ?? [];
    return (
      memberships.find((membership) => membership.orgId === currentOrgId)
        ?.orgName ?? null
    );
  }, [currentOrgId, membershipsQuery.data?.memberships]);

  const defaultOrgId = membershipsQuery.data?.memberships?.[0]?.orgId ?? null;

  const currentReturnId = useMemo(() => {
    if (!currentOrgId) return null;
    const match = /^\/org\/[^/]+\/returns\/([^/]+)/.exec(pathname);
    return match?.[1] ?? null;
  }, [currentOrgId, pathname]);

  const returnsQuery = api.portalReturns.listByOrg.useQuery(
    { orgId: currentOrgId! },
    { enabled: !!currentOrgId && !!currentReturnId },
  );

  const returnEntityName = useMemo(() => {
    if (!currentReturnId || !returnsQuery.data) return null;
    return returnsQuery.data.find((r) => r.id === currentReturnId)?.entityName ?? null;
  }, [currentReturnId, returnsQuery.data]);

  const navigation = useMemo(
    () =>
      buildPortalNavigationModel({
        pathname,
        linkOrgId: currentOrgId ?? defaultOrgId,
        orgName: currentOrgName,
        returnEntityName,
      }),
    [currentOrgId, currentOrgName, defaultOrgId, pathname, returnEntityName],
  );

  const membersOrgId = currentOrgId ?? defaultOrgId;
  const membersQuery = api.portalTeam.listMembers.useQuery(
    { orgId: membersOrgId! },
    { enabled: !!membersOrgId },
  );
  const activeMembers = useMemo(
    () => (membersQuery.data ?? []).filter((m) => m.status === "active"),
    [membersQuery.data],
  );

  const CurrentIcon = navigation.currentIcon;

  return (
    <header className="bg-container sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b px-4">
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
        <div className="min-w-0">
          <div className="text-foreground flex items-center gap-2 sm:hidden">
            <CurrentIcon className="size-4 shrink-0" />
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {navigation.currentTitle}
            </h1>
          </div>

          <nav
            aria-label="Breadcrumb"
            className="text-muted-foreground hidden min-w-0 items-center gap-1.5 text-xs sm:flex"
          >
            {navigation.breadcrumbs.map((crumb, index) => {
              const CrumbIcon = crumb.icon;
              const showIcon =
                index !== 0 || navigation.breadcrumbs.length === 1;
              const content = (
                <span
                  className={cn(
                    "inline-flex max-w-[15rem] items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors",
                    crumb.isCurrent
                      ? "border bg-white text-foreground dark:bg-muted"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {showIcon ? (
                    <CrumbIcon className="size-3.5 shrink-0" />
                  ) : null}
                  <span className="truncate whitespace-nowrap">
                    {crumb.title}
                  </span>
                </span>
              );

              return (
                <Fragment key={`${crumb.key}-${index}`}>
                  {index > 0 ? (
                    <ChevronRight className="text-muted-foreground/70 size-3 shrink-0" />
                  ) : null}
                  {crumb.href ? (
                    <Link href={crumb.href} className="min-w-0">
                      {content}
                    </Link>
                  ) : (
                    content
                  )}
                </Fragment>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {activeMembers.length > 0 ? (
          <HoverCard>
            <HoverCardTrigger asChild>
              <button
                type="button"
                className="hidden items-center outline-none md:flex"
              >
                <AvatarGroup>
                  {activeMembers.slice(0, AVATAR_LIMIT).map((member) => (
                    <Avatar key={member.id} size="sm">
                      <AvatarImage
                        src={memberAvatarSrc(member)}
                        alt={member.fullName ?? member.email ?? ""}
                      />
                      <AvatarFallback className="text-[10px]">
                        {initials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {activeMembers.length > AVATAR_LIMIT ? (
                    <AvatarGroupCount className="text-[10px]">
                      +{activeMembers.length - AVATAR_LIMIT}
                    </AvatarGroupCount>
                  ) : null}
                </AvatarGroup>
              </button>
            </HoverCardTrigger>
            <HoverCardContent align="end" className="w-72 p-0">
              <div className="space-y-1 p-3">
                <p className="text-sm font-semibold">Portal Members</p>
                <p className="text-muted-foreground text-xs">
                  {activeMembers.length}{" "}
                  {activeMembers.length === 1 ? "person" : "people"} with access
                </p>
              </div>
              <div className="max-h-[220px] overflow-y-auto border-t px-3 py-2">
                {activeMembers.slice(0, AVATAR_LIMIT).map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center gap-2.5 rounded-md px-1 py-1.5"
                  >
                    <Avatar size="sm">
                      <AvatarImage
                        src={memberAvatarSrc(member)}
                        alt={member.fullName ?? member.email ?? ""}
                      />
                      <AvatarFallback className="text-[10px]">
                        {initials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">
                        {member.fullName ?? member.email ?? "Unknown"}
                      </p>
                      <p className="text-muted-foreground truncate text-[11px] capitalize">
                        {member.role}
                      </p>
                    </div>
                  </div>
                ))}
                {activeMembers.length > AVATAR_LIMIT ? (
                  <p className="text-muted-foreground px-1 py-1.5 text-xs">
                    +{activeMembers.length - AVATAR_LIMIT} more
                  </p>
                ) : null}
              </div>
              <div className="border-t p-2">
                <Link href="/team">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-full gap-2"
                  >
                    <Users className="size-3.5" />
                    Manage access
                  </Button>
                </Link>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : null}

        <PortalCommandMenu
          navItems={navigation.navItems}
          currentOrgId={currentOrgId}
        />

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

        <AskAiDialog
          open={askAiOpen}
          onOpenChange={(open) => {
            setAskAiOpen(open);
            if (!open) setAskAiInitialPrompt(null);
          }}
          orgId={currentOrgId}
          orgName={currentOrgName}
          userAvatarUrl={membershipsQuery.data?.account?.avatarUrl ?? null}
          userFullName={membershipsQuery.data?.account?.fullName ?? null}
          initialPrompt={askAiInitialPrompt}
        />

        <ThemeToggle />
      </div>
    </header>
  );
}
