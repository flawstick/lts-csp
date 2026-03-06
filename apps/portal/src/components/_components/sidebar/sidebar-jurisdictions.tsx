"use client";

import Link from "next/link";
import { ArrowRight, Calendar, ChevronDown, Folder } from "lucide-react";

import { cn } from "@/lib/utils";
import { AnimatedLucideIcon } from "@/components/ui/animated-icons";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { getJurisdictionGradient } from "./gradients";
import type { SidebarJurisdiction } from "./types";

type SidebarJurisdictionsProps = {
  isLoading: boolean;
  jurisdictions: SidebarJurisdiction[];
  openJurisdictions: string[];
  onToggleJurisdiction: (jurisdictionId: string) => void;
  sidebarOrgId: string | null;
  returnsUrl: string;
};

export function SidebarJurisdictions({
  isLoading,
  jurisdictions,
  openJurisdictions,
  onToggleJurisdiction,
  sidebarOrgId,
  returnsUrl,
}: SidebarJurisdictionsProps) {
  return (
    <>
      <SidebarGroup className="mt-4 overflow-hidden pb-0 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:h-0 group-data-[collapsible=icon]:opacity-0">
        <SidebarGroupLabel className="px-2 text-[11px] text-muted-foreground">Jurisdictions</SidebarGroupLabel>

        <SidebarMenu>
          {isLoading ? (
            <SidebarMenuItem>
              <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">Loading jurisdictions...</div>
            </SidebarMenuItem>
          ) : null}

          {!isLoading && !jurisdictions.length ? (
            <SidebarMenuItem>
              <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                No jurisdiction returns available.
              </div>
            </SidebarMenuItem>
          ) : null}

          {jurisdictions.map((jurisdiction, index) => {
            const isOpen = openJurisdictions.includes(jurisdiction.jurisdictionId);
            const [from, to] = getJurisdictionGradient(jurisdiction.code, index);

            return (
              <SidebarMenuItem key={jurisdiction.jurisdictionId}>
                <button
                  type="button"
                  onClick={() => onToggleJurisdiction(jurisdiction.jurisdictionId)}
                  className={cn(
                    "group/jurisdiction flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition",
                    isOpen ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70",
                  )}
                >
                  <span
                    className="relative inline-flex size-5 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-white shadow-sm transition-transform duration-300 group-hover/jurisdiction:-rotate-6 group-hover/jurisdiction:scale-105"
                    style={{
                      backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
                    }}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-y-1 -left-5 w-2 rotate-12 bg-white/50 opacity-0 blur-[2px] transition-all duration-500 group-hover/jurisdiction:left-6 group-hover/jurisdiction:opacity-80"
                    />
                  </span>
                  <span className="flex-1 truncate whitespace-nowrap">{jurisdiction.name}</span>
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {jurisdiction.totalReturns}
                  </span>
                  <ChevronDown className={cn("size-3.5 transition", isOpen ? "rotate-180" : "")} />
                </button>

                {isOpen ? (
                  <div className="relative mt-1 ml-2 space-y-1 border-l border-sidebar-border/70 pl-3">
                    {jurisdiction.returns.map((item) => {
                      const focusHref = sidebarOrgId
                        ? `/org/${sidebarOrgId}/returns/${item.id}`
                        : returnsUrl;

                      return (
                        <div key={item.id} className="relative">
                          <span className="absolute -left-3 top-4 h-px w-2 border-t border-sidebar-border/70" />
                          <Link
                            href={focusHref}
                            className="group block rounded-md border border-transparent px-2 py-1.5 text-xs transition hover:border-border hover:bg-muted/60"
                          >
                            <p className="flex items-center gap-1.5 truncate font-medium">
                              <AnimatedLucideIcon
                                icon={Folder}
                                size={13}
                                animation="swing"
                                className="text-muted-foreground group-hover:text-foreground"
                              />
                              <span className="truncate whitespace-nowrap">{item.entityName}</span>
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
                              <Calendar className="size-3" />
                              <span className="truncate whitespace-nowrap">
                                {item.taxYear} • {item.status.replaceAll("_", " ")}
                              </span>
                            </p>
                          </Link>
                        </div>
                      );
                    })}
                    <div className="relative pt-1">
                      <span className="absolute -left-3 top-3 h-px w-2 border-t border-sidebar-border/70" />
                      <Link
                        href={sidebarOrgId ? `/org/${sidebarOrgId}/returns` : returnsUrl}
                        className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-sidebar-border/70 px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-sidebar-border hover:bg-muted/60 hover:text-foreground"
                      >
                        Show all
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>

      <SidebarGroup className="h-0 overflow-hidden pt-2 opacity-0 transition-[opacity,transform] duration-150 ease-linear -translate-y-1 pointer-events-none group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:opacity-100 group-data-[collapsible=icon]:translate-y-0 group-data-[collapsible=icon]:pointer-events-auto">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1.5">
          {jurisdictions.map((jurisdiction, index) => {
            const [from, to] = getJurisdictionGradient(jurisdiction.code, index);
            const href = sidebarOrgId ? `/org/${sidebarOrgId}/returns` : returnsUrl;

            return (
              <SidebarMenuItem
                key={`icon-${jurisdiction.jurisdictionId}`}
                className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
              >
                <Link
                  href={href}
                  title={`${jurisdiction.name} (${jurisdiction.totalReturns})`}
                  className="group/collapsed-jurisdiction flex size-9 items-center justify-center rounded-lg bg-sidebar-accent/20 transition hover:bg-sidebar-accent/60"
                >
                  <span
                    className="relative inline-flex size-5 items-center justify-center overflow-hidden rounded-full text-white shadow-sm transition-transform duration-300 group-hover/collapsed-jurisdiction:-rotate-6 group-hover/collapsed-jurisdiction:scale-105"
                    style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
                  >
                    <span
                      aria-hidden
                      className="pointer-events-none absolute -inset-y-1 -left-5 w-2 rotate-12 bg-white/50 opacity-0 blur-[2px] transition-all duration-500 group-hover/collapsed-jurisdiction:left-6 group-hover/collapsed-jurisdiction:opacity-80"
                    />
                  </span>
                </Link>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
