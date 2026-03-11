"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Share2, Sparkles, Users } from "lucide-react";

import { buildPortalNavigationModel, getPortalOrgIdFromPathname } from "@/lib/portal-navigation";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { Avatar, AvatarFallback, AvatarImage, AvatarGroup, AvatarGroupCount } from "@/components/ui/avatar";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { PortalCommandMenu } from "@/components/portal-command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

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

export function PortalHeader() {
  const pathname = usePathname();
  const membershipsQuery = api.portalAccess.getMyMemberships.useQuery();
  const currentOrgId = useMemo(() => getPortalOrgIdFromPathname(pathname), [pathname]);

  const currentOrgName = useMemo(() => {
    if (!currentOrgId) return null;

    const memberships = membershipsQuery.data?.memberships ?? [];
    return memberships.find((membership) => membership.orgId === currentOrgId)?.orgName ?? null;
  }, [currentOrgId, membershipsQuery.data?.memberships]);

  const defaultOrgId = membershipsQuery.data?.memberships?.[0]?.orgId ?? null;
  const navigation = useMemo(
    () =>
      buildPortalNavigationModel({
        pathname,
        linkOrgId: currentOrgId ?? defaultOrgId,
        orgName: currentOrgName,
      }),
    [currentOrgId, currentOrgName, defaultOrgId, pathname],
  );

  const membersQuery = api.portalTeam.listMembers.useQuery(
    { orgId: currentOrgId! },
    { enabled: !!currentOrgId },
  );
  const activeMembers = useMemo(
    () => (membersQuery.data ?? []).filter((m) => m.status === "active"),
    [membersQuery.data],
  );

  const CurrentIcon = navigation.currentIcon;

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b bg-card/95 px-4 backdrop-blur-xl">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger className="-ml-1 rounded-lg" />
        <Separator orientation="vertical" className="mr-1 h-4 data-vertical:self-center" />
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-foreground sm:hidden">
            <CurrentIcon className="size-4 shrink-0" />
            <h1 className="truncate text-sm font-semibold tracking-tight">{navigation.currentTitle}</h1>
          </div>

          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
            {navigation.breadcrumbs.map((crumb, index) => {
              const CrumbIcon = crumb.icon;
              const showIcon = index !== 0 || navigation.breadcrumbs.length === 1;
              const content = (
                <span
                  className={cn(
                    "inline-flex max-w-[15rem] items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors",
                    crumb.isCurrent
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground",
                  )}
                >
                  {showIcon ? <CrumbIcon className="size-3.5 shrink-0" /> : null}
                  <span className="truncate whitespace-nowrap">{crumb.title}</span>
                </span>
              );

              return (
                <Fragment key={`${crumb.key}-${index}`}>
                  {index > 0 ? <ChevronRight className="size-3 shrink-0 text-muted-foreground/70" /> : null}
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
              <button type="button" className="hidden items-center outline-none md:flex">
                <AvatarGroup>
                  {activeMembers.slice(0, AVATAR_LIMIT).map((member) => (
                    <Avatar key={member.id} size="sm">
                      {member.avatarUrl ? (
                        <AvatarImage src={member.avatarUrl} alt={member.fullName ?? ""} />
                      ) : null}
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
                <p className="text-xs text-muted-foreground">
                  {activeMembers.length} {activeMembers.length === 1 ? "person" : "people"} with access
                </p>
              </div>
              <div className="max-h-[220px] overflow-y-auto border-t px-3 py-2">
                {activeMembers.slice(0, AVATAR_LIMIT).map((member) => (
                  <div key={member.id} className="flex items-center gap-2.5 rounded-md px-1 py-1.5">
                    <Avatar size="sm">
                      {member.avatarUrl ? (
                        <AvatarImage src={member.avatarUrl} alt={member.fullName ?? ""} />
                      ) : null}
                      <AvatarFallback className="text-[10px]">
                        {initials(member.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{member.fullName ?? "Unknown"}</p>
                      <p className="truncate text-[11px] text-muted-foreground capitalize">{member.role}</p>
                    </div>
                  </div>
                ))}
                {activeMembers.length > AVATAR_LIMIT ? (
                  <p className="px-1 py-1.5 text-xs text-muted-foreground">
                    +{activeMembers.length - AVATAR_LIMIT} more
                  </p>
                ) : null}
              </div>
              <div className="border-t p-2">
                <Link href="/team">
                  <Button variant="ghost" size="sm" className="h-8 w-full gap-2">
                    <Users className="size-3.5" />
                    Manage access
                  </Button>
                </Link>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : null}

        <PortalCommandMenu navItems={navigation.navItems} currentOrgId={currentOrgId} />

        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 gap-1.5 sm:inline-flex"
        >
          <Sparkles className="size-3.5" />
          Ask AI
        </Button>

        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 gap-1.5 sm:inline-flex"
        >
          <Share2 className="size-3.5" />
          Share
        </Button>

        <ThemeToggle />
      </div>
    </header>
  );
}
