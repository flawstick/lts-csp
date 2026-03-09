"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";

import { SidebarIcon } from "@/components/ui/animated-icons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

import type { SidebarMembership } from "./types";

type SidebarOrgSwitcherProps = {
  isLoading?: boolean;
  memberships: SidebarMembership[];
  activeOrg: SidebarMembership | null;
  onSwitchOrg: (orgId: string) => void;
};

export function SidebarOrgSwitcher({
  isLoading = false,
  memberships,
  activeOrg,
  onSwitchOrg,
}: SidebarOrgSwitcherProps) {
  if (isLoading && memberships.length === 0) {
    return (
      <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
        <SidebarMenuButton
          size="lg"
          disabled
          aria-busy="true"
          className="portal-card !bg-muted/40 rounded-xl transition-[padding,width] duration-200 ease-linear group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:shadow-[0_0_0_2px_#edeff3,0_8px_16px_-14px_rgb(15_23_42/14%)] dark:group-data-[collapsible=icon]:shadow-[0_0_0_2px_rgba(255,255,255,0.08),0_8px_16px_-14px_rgb(0_0_0/32%)]"
        >
          <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
          <div className="grid max-w-[10rem] flex-1 overflow-hidden text-left text-sm leading-tight transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]:hidden">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-1 h-3 w-20" />
          </div>
          <Skeleton className="ml-auto size-4 rounded-sm transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:hidden" />
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  if (!memberships.length) {
    return null;
  }

  return (
    <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            className="portal-card !bg-muted/40 rounded-xl transition-[padding,width] duration-200 ease-linear data-[state=open]:!bg-muted/40 data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:shadow-[0_0_0_2px_#edeff3,0_8px_16px_-14px_rgb(15_23_42/14%)] dark:group-data-[collapsible=icon]:shadow-[0_0_0_2px_rgba(255,255,255,0.08),0_8px_16px_-14px_rgb(0_0_0/32%)]"
          >
            <Avatar className="h-6 w-6 shrink-0 rounded-md">
              <AvatarImage src={activeOrg?.orgLogoUrl ?? undefined} alt={activeOrg?.orgName ?? "Organization"} />
              <AvatarFallback className="rounded-md bg-blue-500/15 text-blue-600">
                <SidebarIcon icon={Building2} iconKey="company" size={14} className="size-3.5" />
              </AvatarFallback>
            </Avatar>
            <div className="grid max-w-[10rem] flex-1 overflow-hidden text-left text-sm leading-tight transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]:hidden">
              <span className="truncate whitespace-nowrap font-medium">{activeOrg?.orgName ?? "Select org"}</span>
              <span className="truncate text-xs text-muted-foreground">
                {activeOrg?.orgSlug ?? "Organization"}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto size-4 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:hidden" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-xl"
          side="right"
          align="start"
          sideOffset={8}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">Switch organization</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {memberships.map((membership) => {
            const selected = membership.orgId === activeOrg?.orgId;

            return (
              <DropdownMenuItem
                key={membership.id}
                onClick={() => onSwitchOrg(membership.orgId)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <Avatar className="h-6 w-6 rounded-md">
                    <AvatarImage src={membership.orgLogoUrl ?? undefined} alt={membership.orgName} />
                    <AvatarFallback className="rounded-md bg-blue-500/15 text-blue-600">
                      <Building2 className="size-3.5" />
                    </AvatarFallback>
                  </Avatar>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate whitespace-nowrap font-medium">{membership.orgName}</span>
                    <span className="truncate whitespace-nowrap text-xs text-muted-foreground">{membership.orgSlug}</span>
                  </span>
                </span>
                {selected ? <Check className="size-4 text-blue-600" /> : null}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}
