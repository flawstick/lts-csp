"use client";

import type { ComponentProps } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  buildPortalNavigationModel,
  getPortalOrgIdFromPathname,
} from "@/lib/portal-navigation";
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

function getPortalReturnIdFromPathname(pathname: string) {
  const match = /^\/org\/[^/]+\/returns\/([^/]+)(?:\/|$)/.exec(pathname);
  return match?.[1] ?? null;
}

export function PortalSidebar(props: ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const membershipsQuery = api.portalAccess.getMyMemberships.useQuery();

  const currentOrgId = useMemo(
    () => getPortalOrgIdFromPathname(pathname),
    [pathname],
  );
  const currentReturnId = useMemo(
    () => getPortalReturnIdFromPathname(pathname),
    [pathname],
  );

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
    return (
      memberships.find((membership) => membership.orgId === currentOrgId) ??
      memberships[0] ??
      null
    );
  }, [currentOrgId, memberships]);

  const linkOrgId = currentOrgId;
  const returnsUrl = linkOrgId ? `/org/${linkOrgId}/returns` : "/returns";

  const sidebarDataQuery = api.portalReturns.sidebarJurisdictions.useQuery(
    { orgId: activeOrg?.orgId, focusReturnId: currentReturnId ?? undefined },
    { enabled: !!activeOrg, placeholderData: (prev) => prev },
  );

  const sidebarOrgId = sidebarDataQuery.data?.orgId ?? activeOrg?.orgId ?? null;
  const jurisdictions = useMemo(
    () => sidebarDataQuery.data?.jurisdictions ?? [],
    [sidebarDataQuery.data?.jurisdictions],
  );
  const focusedJurisdictionId = useMemo(
    () =>
      jurisdictions.find((jurisdiction) => jurisdiction.hasFocusReturn)
        ?.jurisdictionId ?? null,
    [jurisdictions],
  );

  const openJurisdictionsStorageKey = `open-jurisdictions${sidebarOrgId ? `-${sidebarOrgId}` : ""}`;
  const [openJurisdictions, setOpenJurisdictions] = useState<string[]>([]);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);
  const hasRestoredRef = useRef(false);

  // Persist open state to localStorage on every change (skip initial empty state)
  const persistOpenState = useCallback(
    (ids: string[]) => {
      try {
        localStorage.setItem(openJurisdictionsStorageKey, JSON.stringify(ids));
      } catch {
        // ignore
      }
    },
    [openJurisdictionsStorageKey],
  );

  // Restore from localStorage once on mount when jurisdictions arrive
  useEffect(() => {
    if (hasRestoredRef.current || !jurisdictions.length) return;
    hasRestoredRef.current = true;

    let saved: string[] | null = null;
    try {
      const raw = localStorage.getItem(openJurisdictionsStorageKey);
      if (raw) saved = JSON.parse(raw);
    } catch {
      // ignore
    }

    if (saved && saved.length > 0) {
      // Filter to only valid jurisdiction IDs
      const validIds = new Set(jurisdictions.map((j) => j.jurisdictionId));
      const restored = saved.filter((id) => validIds.has(id));

      // Also include focused jurisdiction if navigating to a specific return
      if (focusedJurisdictionId && !restored.includes(focusedJurisdictionId)) {
        restored.unshift(focusedJurisdictionId);
      }

      setOpenJurisdictions(restored.length > 0 ? restored : [jurisdictions[0]?.jurisdictionId ?? ""]);
    } else {
      // No saved state — open focused or first
      const defaultId = focusedJurisdictionId ?? jurisdictions[0]?.jurisdictionId;
      setOpenJurisdictions(defaultId ? [defaultId] : []);
    }

    setRestoredFromStorage(true);
  }, [jurisdictions, focusedJurisdictionId, openJurisdictionsStorageKey]);

  // When jurisdictions change (e.g. org switch), prune invalid IDs
  useEffect(() => {
    if (!restoredFromStorage || !jurisdictions.length) return;

    setOpenJurisdictions((previous) => {
      const validIds = new Set(jurisdictions.map((j) => j.jurisdictionId));
      const stillValid = previous.filter((id) => validIds.has(id));
      if (stillValid.length === previous.length) return previous;
      return stillValid;
    });
  }, [jurisdictions, restoredFromStorage]);

  // Ensure focused jurisdiction is open when navigating to a return
  useEffect(() => {
    if (!focusedJurisdictionId || !restoredFromStorage) return;

    setOpenJurisdictions((previous) => {
      if (previous.includes(focusedJurisdictionId)) return previous;
      const next = [focusedJurisdictionId, ...previous];
      persistOpenState(next);
      return next;
    });
  }, [focusedJurisdictionId, restoredFromStorage, persistOpenState]);

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
      const next = previous.includes(jurisdictionId)
        ? previous.filter((item) => item !== jurisdictionId)
        : [...previous, jurisdictionId];
      persistOpenState(next);
      return next;
    });
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-sidebar-border/70 bg-sidebar border-r"
      {...props}
    >
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
          isLoading={sidebarDataQuery.isLoading || !sidebarDataQuery.isFetched || !restoredFromStorage}
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
        settingsHref={
          (linkOrgId ?? activeOrg?.orgId)
            ? `/org/${linkOrgId ?? activeOrg?.orgId}/settings`
            : null
        }
        onLogout={logout}
      />

      <SidebarRail />
    </Sidebar>
  );
}
