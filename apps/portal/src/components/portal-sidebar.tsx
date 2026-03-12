"use client";

import type { ComponentProps } from "react";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { buildPortalNavigationModel, getPortalOrgIdFromPathname } from "@/lib/portal-navigation";
import { api } from "@/trpc/react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarRail,
} from "@/components/ui/sidebar";
import { SidebarFooterSection } from "@/components/_components/sidebar/sidebar-footer";
import { SidebarJurisdictions } from "@/components/_components/sidebar/sidebar-jurisdictions";
import { SidebarNavMain } from "@/components/_components/sidebar/sidebar-nav-main";
import { SidebarOrgSwitcher } from "@/components/_components/sidebar/sidebar-org-switcher";
import type { SidebarMembership } from "@/components/_components/sidebar/types";

export function PortalSidebar(props: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const membershipsQuery = api.portalAccess.getMyMemberships.useQuery();

  const currentOrgId = useMemo(() => getPortalOrgIdFromPathname(pathname), [pathname]);

  const memberships = useMemo<SidebarMembership[]>(() => {
    return (membershipsQuery.data?.memberships ?? []).map((membership) => ({
      id: membership.id,
      orgId: membership.orgId,
      orgName: membership.orgName,
      orgSlug: membership.orgSlug ?? null,
      orgLogoUrl: membership.orgLogoUrl ?? null,
    }));
  }, [membershipsQuery.data?.memberships]);

  const activeOrg = useMemo(() => {
    if (!memberships.length) return null;
    if (!currentOrgId) return memberships[0] ?? null;
    return memberships.find((membership) => membership.orgId === currentOrgId) ?? memberships[0] ?? null;
  }, [currentOrgId, memberships]);

  const linkOrgId = currentOrgId;
  const returnsUrl = linkOrgId ? `/org/${linkOrgId}/returns` : "/returns";

  const sidebarDataQuery = api.portalReturns.sidebarJurisdictions.useQuery(
    { orgId: activeOrg?.orgId },
    { enabled: !!activeOrg },
  );

  const sidebarOrgId = sidebarDataQuery.data?.orgId ?? activeOrg?.orgId ?? null;
  const jurisdictions = useMemo(
    () => sidebarDataQuery.data?.jurisdictions ?? [],
    [sidebarDataQuery.data?.jurisdictions],
  );

  const [openJurisdictions, setOpenJurisdictions] = useState<string[]>([]);

  useEffect(() => {
    if (!jurisdictions.length) {
      setOpenJurisdictions((previous) => (previous.length ? [] : previous));
      return;
    }

    setOpenJurisdictions((previous) => {
      const validIds = new Set(jurisdictions.map((jurisdiction) => jurisdiction.jurisdictionId));
      const stillExisting = previous.filter((item) => validIds.has(item));

      if (!stillExisting.length) {
        const firstJurisdictionId = jurisdictions[0]?.jurisdictionId;
        if (!firstJurisdictionId) {
          return previous.length ? [] : previous;
        }

        if (previous.length === 1 && previous[0] === firstJurisdictionId) {
          return previous;
        }

        return [firstJurisdictionId];
      }

      const unchanged =
        stillExisting.length === previous.length &&
        stillExisting.every((jurisdictionId, index) => jurisdictionId === previous[index]);

      return unchanged ? previous : stillExisting;
    });
  }, [jurisdictions]);

  const navItems = useMemo(
    () =>
      buildPortalNavigationModel({
        pathname,
        linkOrgId,
        orgName: activeOrg?.orgName ?? null,
      }).navItems,
    [activeOrg?.orgName, linkOrgId, pathname],
  );

  // Eagerly prefetch all sidebar routes + org-scoped pages
  useEffect(() => {
    const routes = navItems
      .filter((item) => item.key !== "search" && item.href !== "#search")
      .map((item) => item.href);

    if (linkOrgId) {
      routes.push(
        `/org/${linkOrgId}`,
        `/org/${linkOrgId}/returns`,
        `/org/${linkOrgId}/tasks`,
        `/org/${linkOrgId}/settings`,
      );
    }

    routes.push("/team", "/documents");

    const unique = [...new Set(routes)];
    for (const route of unique) {
      router.prefetch(route);
    }
  }, [navItems, linkOrgId, router]);

  const logout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const switchOrg = (orgId: string) => {
    const nextPath = pathname.includes("/returns")
      ? `/org/${orgId}/returns`
      : pathname.includes("/tasks")
        ? `/org/${orgId}/tasks`
        : `/org/${orgId}`;
    router.push(nextPath);
  };

  const toggleJurisdiction = (jurisdictionId: string) => {
    setOpenJurisdictions((previous) => {
      if (previous.includes(jurisdictionId)) {
        return previous.filter((item) => item !== jurisdictionId);
      }

      return [...previous, jurisdictionId];
    });
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/70 bg-sidebar" {...props}>
      <SidebarHeader className="px-2.5 py-3 transition-[padding] duration-200 ease-linear group-data-[collapsible=icon]:px-0">
        <SidebarMenu>
          <SidebarOrgSwitcher
            isLoading={membershipsQuery.isLoading}
            memberships={memberships}
            activeOrg={activeOrg}
            onSwitchOrg={switchOrg}
          />
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-2.5 transition-[padding] duration-200 ease-linear group-data-[collapsible=icon]:px-0">
        <SidebarNavMain items={navItems} />
        <SidebarJurisdictions
          isLoading={sidebarDataQuery.isLoading}
          jurisdictions={jurisdictions}
          openJurisdictions={openJurisdictions}
          onToggleJurisdiction={toggleJurisdiction}
          sidebarOrgId={sidebarOrgId}
          returnsUrl={returnsUrl}
        />
      </SidebarContent>

      <SidebarFooterSection
        email={membershipsQuery.data?.account.email ?? null}
        fullName={membershipsQuery.data?.account.fullName ?? null}
        avatarUrl={membershipsQuery.data?.account.avatarUrl ?? null}
        settingsHref={(linkOrgId ?? activeOrg?.orgId) ? `/org/${linkOrgId ?? activeOrg?.orgId}/settings` : null}
        onLogout={logout}
      />

      <SidebarRail />
    </Sidebar>
  );
}
