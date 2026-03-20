import type { LucideIcon } from "lucide-react";

import type { SidebarIconKey } from "@/components/ui/animated-icons";

export type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  iconKey?: SidebarIconKey;
};

export type SidebarMembership = {
  id: string;
  orgId: string;
  orgName: string;
  orgSlug: string | null;
  orgLogoUrl: string | null;
};

export type SidebarJurisdictionReturn = {
  id: string;
  entityName: string;
  taxYear: string | number;
  status: string;
};

export type SidebarJurisdiction = {
  jurisdictionId: string;
  code: string;
  name: string;
  totalReturns: number;
  hasFocusReturn: boolean;
  returns: SidebarJurisdictionReturn[];
};
