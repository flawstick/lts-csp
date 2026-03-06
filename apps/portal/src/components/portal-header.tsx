"use client";

import { Fragment, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Share2, Sparkles } from "lucide-react";

import { buildPortalNavigationModel, getPortalOrgIdFromPathname } from "@/lib/portal-navigation";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";
import { PortalCommandMenu } from "@/components/portal-command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

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
        <div className="hidden items-center -space-x-2.5 rounded-full bg-background/70 px-2.5 py-1.5 md:flex">
          <span className="size-5 rounded-full bg-cyan-300" />
          <span className="size-5 rounded-full bg-emerald-300" />
          <span className="size-5 rounded-full bg-fuchsia-300" />
        </div>

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
