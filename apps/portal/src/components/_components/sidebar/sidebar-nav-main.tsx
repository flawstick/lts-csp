"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { PORTAL_COMMAND_OPEN_EVENT } from "@/lib/portal-command";
import { SidebarIcon } from "@/components/ui/animated-icons";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { PortalNavItem } from "@/lib/portal-navigation";

export function SidebarNavMain({ items }: { items: PortalNavItem[] }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const openCommandMenu = () => {
    window.dispatchEvent(new CustomEvent(PORTAL_COMMAND_OPEN_EVENT));
  };

  return (
    <SidebarGroup className="pb-0">
      <SidebarMenu>
        {items.map((item) => {
          const isActive = mounted && item.isActive;
          const isSearchItem = item.key === "search";

          if (isSearchItem) {
            return (
              <SidebarMenuItem key={item.key}>
                <SidebarMenuButton
                  type="button"
                  tooltip={item.title}
                  onClick={openCommandMenu}
                  className="h-9 rounded-xl border border-sidebar-border/70 bg-sidebar-accent/30 text-[15px] transition data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium hover:bg-sidebar-accent/80 group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
                >
                  <span className="flex shrink-0 items-center justify-center">
                    <SidebarIcon
                      icon={item.icon}
                      iconKey={item.iconKey}
                      active={isActive}
                      size={18}
                      className="size-4.5 shrink-0"
                    />
                  </span>
                  <span className="min-w-0 max-w-[10rem] truncate whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-linear group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:ml-0">
                    {item.title}
                  </span>
                  <span className="ml-auto inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-muted-foreground shadow-[0_0_0_2px_#edeff3,0_6px_12px_-10px_rgb(15_23_42/26%)] transition-opacity duration-200 ease-linear dark:shadow-[0_0_0_2px_#171a20,0_6px_12px_-10px_rgb(0_0_0/46%)] group-data-[collapsible=icon]:hidden">
                    /
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          }

          return (
            <SidebarMenuItem key={item.key}>
              <SidebarMenuButton
                asChild
                tooltip={item.title}
                className="h-9 rounded-lg text-[15px] transition data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium hover:bg-sidebar-accent/80"
                isActive={isActive}
              >
                <Link
                  href={item.href}
                  prefetch
                  className="flex w-full min-w-0 items-center gap-2 overflow-hidden transition-[gap] duration-200 ease-linear group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0"
                >
                  <span className="flex shrink-0 items-center justify-center">
                    <SidebarIcon
                      icon={item.icon}
                      iconKey={item.iconKey}
                      active={isActive}
                      size={18}
                      className="size-4.5 shrink-0"
                    />
                  </span>
                  <span className="min-w-0 max-w-[10rem] truncate whitespace-nowrap transition-[max-width,opacity,margin] duration-200 ease-linear group-data-[collapsible=icon]:max-w-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:ml-0">
                    {item.title}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
