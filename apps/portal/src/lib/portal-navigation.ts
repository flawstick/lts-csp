import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FileSpreadsheet,
  FolderOpen,
  LayoutDashboard,
  Search,
  Settings,
  SquareCheck,
  Users,
} from "lucide-react";

export type PortalNavKey =
  | "search"
  | "dashboard"
  | "tasks"
  | "returns"
  | "documents"
  | "team";

type PortalNavIconKey = "search" | "dashboard" | "tasks" | "documents" | "teams";

export type PortalNavItem = {
  key: PortalNavKey;
  title: string;
  href: string;
  icon: LucideIcon;
  iconKey?: PortalNavIconKey;
  isActive: boolean;
};

export type PortalBreadcrumbItem = {
  key: string;
  title: string;
  icon: LucideIcon;
  href?: string;
  isCurrent: boolean;
};

type PortalNavigationModel = {
  navItems: PortalNavItem[];
  breadcrumbs: PortalBreadcrumbItem[];
  activeNavKey: PortalNavKey | null;
  currentTitle: string;
  currentIcon: LucideIcon;
};

type BuildPortalNavigationInput = {
  pathname: string;
  linkOrgId?: string | null;
  orgName?: string | null;
  returnEntityName?: string | null;
};

const NAV_PRIORITY: PortalNavKey[] = [
  "search",
  "tasks",
  "documents",
  "team",
  "returns",
  "dashboard",
];

function normalizePathname(pathname: string) {
  if (!pathname) return "/";
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function pathMatches(pathname: string, basePath: string) {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

export function getPortalOrgIdFromPathname(pathname: string) {
  const match = /^\/org\/([^/]+)(?:\/|$)/.exec(normalizePathname(pathname));
  return match?.[1] ?? null;
}

function buildBaseNavItems(linkOrgId: string | null): Omit<PortalNavItem, "isActive">[] {
  const dashboardHref = linkOrgId ? `/org/${linkOrgId}` : "/";
  const tasksHref = linkOrgId ? `/org/${linkOrgId}/tasks` : "/tasks";
  const returnsHref = linkOrgId ? `/org/${linkOrgId}/returns` : "/returns";

  return [
    {
      key: "search",
      title: "Search",
      href: "#search",
      icon: Search,
      iconKey: "search",
    },
    {
      key: "dashboard",
      title: "Dashboard",
      href: dashboardHref,
      icon: LayoutDashboard,
      iconKey: "dashboard",
    },
    {
      key: "tasks",
      title: "Tasks",
      href: tasksHref,
      icon: SquareCheck,
      iconKey: "tasks",
    },
    {
      key: "returns",
      title: "Returns",
      href: returnsHref,
      icon: FileSpreadsheet,
    },
    {
      key: "documents",
      title: "Documents",
      href: "/documents",
      icon: FolderOpen,
      iconKey: "documents",
    },
    {
      key: "team",
      title: "Team",
      href: "/team",
      icon: Users,
      iconKey: "teams",
    },
  ];
}

function isNavActive(key: PortalNavKey, pathname: string, pathOrgId: string | null) {
  // Search opens the command palette and does not map to a route.
  if (key === "search") return false;
  if (key === "tasks") {
    if (pathMatches(pathname, "/tasks")) return true;
    if (!pathOrgId) return false;
    return pathMatches(pathname, `/org/${pathOrgId}/tasks`);
  }
  if (key === "documents") return pathMatches(pathname, "/documents");
  if (key === "team") return pathMatches(pathname, "/team");

  if (key === "returns") {
    if (pathMatches(pathname, "/returns")) return true;
    if (!pathOrgId) return false;
    return pathMatches(pathname, `/org/${pathOrgId}/returns`);
  }

  if (key === "dashboard") {
    if (pathname === "/") return true;
    if (!pathOrgId) return false;

    const orgBase = `/org/${pathOrgId}`;
    if (pathname === orgBase) return true;

    return (
      pathMatches(pathname, orgBase) &&
      !pathMatches(pathname, `${orgBase}/tasks`) &&
      !pathMatches(pathname, `${orgBase}/returns`)
    );
  }

  return false;
}

function titleFromSegment(segment: string) {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }

  return decoded
    .replaceAll("-", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function titleFromClientSlug(segment: string) {
  const decoded = titleFromSegment(segment);
  const match = /^(.+)\s+[a-z0-9]{8}\s+[a-z0-9]{4,}$/i.exec(decoded);
  if (!match) {
    return decoded;
  }
  return match[1]!;
}

export function buildPortalNavigationModel({
  pathname,
  linkOrgId,
  returnEntityName,
}: BuildPortalNavigationInput): PortalNavigationModel {
  const normalizedPath = normalizePathname(pathname);
  const pathOrgId = getPortalOrgIdFromPathname(normalizedPath);
  const resolvedLinkOrgId = linkOrgId ?? pathOrgId ?? null;

  const baseNavItems = buildBaseNavItems(resolvedLinkOrgId);
  const activeNavKey =
    NAV_PRIORITY.find((key) => isNavActive(key, normalizedPath, pathOrgId)) ?? null;

  const navItems = baseNavItems.map((item) => ({
    ...item,
    isActive: item.key === activeNavKey,
  }));

  const activeNavItem = activeNavKey
    ? navItems.find((item) => item.key === activeNavKey) ?? null
    : null;

  const breadcrumbs: PortalBreadcrumbItem[] = [];

  if (activeNavItem) {
    breadcrumbs.push({
      key: activeNavItem.key,
      title: activeNavItem.title,
      icon: activeNavItem.icon,
      href: activeNavItem.href,
      isCurrent: false,
    });

    const trailingSegments = pathMatches(normalizedPath, activeNavItem.href)
      ? normalizedPath
          .slice(activeNavItem.href.length)
          .split("/")
          .filter(Boolean)
      : [];

    if (activeNavItem.key === "documents" && trailingSegments[0] === "client") {
      const clientSegment = trailingSegments[1];
      if (clientSegment) {
        const clientPath = `${activeNavItem.href}/client/${clientSegment}`;
        breadcrumbs.push({
          key: `documents-client-${clientSegment}`,
          title: titleFromClientSlug(clientSegment),
          icon: FolderOpen,
          href: clientPath,
          isCurrent: false,
        });
      }

      if (clientSegment && trailingSegments[2] === "return" && trailingSegments[3]) {
        const returnPath = `${activeNavItem.href}/client/${clientSegment}/return/${trailingSegments[3]}`;
        breadcrumbs.push({
          key: `documents-return-${trailingSegments[3]}`,
          title: "Files",
          icon: FileText,
          href: returnPath,
          isCurrent: false,
        });
      }
    } else {
      trailingSegments.forEach((segment, index) => {
        const partialPath = trailingSegments.slice(0, index + 1).join("/");
        const useEntityName =
          activeNavItem.key === "returns" &&
          index === 0 &&
          returnEntityName;
        breadcrumbs.push({
          key: `${activeNavItem.key}-${index}-${segment}`,
          title: useEntityName || titleFromSegment(segment),
          icon: useEntityName ? FileSpreadsheet : LayoutDashboard,
          href: `${activeNavItem.href}/${partialPath}`,
          isCurrent: false,
        });
      });
    }
  } else if (normalizedPath !== "/") {
    const segments = normalizedPath.split("/").filter(Boolean);
    const isOrgScoped = segments[0] === "org" && typeof segments[1] === "string";
    const basePrefix = isOrgScoped ? `/org/${segments[1]}` : "";
    const contentSegments = isOrgScoped ? segments.slice(2) : segments;

    // Settings is a standalone page, not nested under dashboard
    if (contentSegments.length === 1 && contentSegments[0] === "settings") {
      breadcrumbs.push({
        key: "settings",
        title: "Settings",
        icon: Settings,
        href: `${basePrefix}/settings`,
        isCurrent: false,
      });
    } else {
      contentSegments.forEach((segment, index) => {
        const partialPath = contentSegments.slice(0, index + 1).join("/");
        breadcrumbs.push({
          key: `${segment}-${index}`,
          title: titleFromSegment(segment),
          icon: LayoutDashboard,
          href: `${basePrefix}/${partialPath}`,
          isCurrent: false,
        });
      });
    }
  }

  if (breadcrumbs.length === 0) {
    breadcrumbs.push({
      key: "dashboard",
      title: "Dashboard",
      icon: LayoutDashboard,
      href: "/",
      isCurrent: false,
    });
  }

  const withCurrent = breadcrumbs.map((crumb, index) => ({
    ...crumb,
    isCurrent: index === breadcrumbs.length - 1,
    href: index === breadcrumbs.length - 1 ? undefined : crumb.href,
  }));

  const current = withCurrent[withCurrent.length - 1]!;

  return {
    navItems,
    breadcrumbs: withCurrent,
    activeNavKey,
    currentTitle: current.title,
    currentIcon: current.icon,
  };
}
