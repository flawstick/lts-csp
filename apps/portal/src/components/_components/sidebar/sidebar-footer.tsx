"use client";

import Link from "next/link";
import { ChevronsUpDown, LogOut } from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SidebarIcon } from "@/components/ui/animated-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { cn } from "@/lib/utils";

type SidebarFooterSectionProps = {
  returnsUrl: string;
  email?: string | null;
  onLogout: () => Promise<void>;
};

export function SidebarFooterSection({ returnsUrl, email, onLogout }: SidebarFooterSectionProps) {
  return (
    <SidebarFooter className="px-2.5 pb-3 group-data-[collapsible=icon]:px-0">
      <div className="portal-card max-h-40 overflow-hidden rounded-xl p-3 text-sm transition-[max-height,opacity,padding,margin,border,box-shadow] duration-200 ease-linear group-data-[collapsible=icon]:max-h-0 group-data-[collapsible=icon]:opacity-0 group-data-[collapsible=icon]:border-transparent group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:shadow-none">
        <p className="truncate whitespace-nowrap text-base font-semibold leading-tight">LTS Client Workspace</p>
        <p className="mt-1 truncate whitespace-nowrap text-xs text-muted-foreground">
          Last accessed returns are pinned per jurisdiction. Open any return to update the list.
        </p>
        <Link
          href={returnsUrl}
          className="mt-3 inline-flex w-full items-center justify-center rounded-lg border px-2 py-1.5 text-xs font-medium hover:bg-muted/50"
        >
          Open Returns
        </Link>
      </div>

      <SidebarMenu className="group-data-[collapsible=icon]:items-center">
        <SidebarMenuItem className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className={cn(
                  "rounded-xl transition-[padding,width] duration-200 ease-linear data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-9 group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center",
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 rounded-lg">
                  <AvatarFallback className="rounded-lg">U</AvatarFallback>
                </Avatar>
                <div className="grid max-w-[10rem] flex-1 overflow-hidden text-left text-sm leading-tight transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">{email ?? "Authenticated User"}</span>
                  <span className="truncate text-xs">Authenticated</span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:hidden" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
              side="right"
              align="end"
              sideOffset={4}
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <SidebarIcon icon={LogOut} iconKey="logout" size={16} className="mr-2 size-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
