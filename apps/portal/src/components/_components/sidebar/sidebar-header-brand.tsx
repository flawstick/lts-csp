import Link from "next/link";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";

export function SidebarHeaderBrand() {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        size="lg"
        className="rounded-xl font-semibold group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:[&>div:last-child]:hidden"
      >
        <Link href="/">
          <div className="flex size-8 items-center justify-center rounded-lg bg-foreground text-background">
            <span className="text-sm font-bold">L</span>
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate">LTS Portal</span>
            <span className="truncate text-xs text-muted-foreground">Client Workspace</span>
          </div>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
