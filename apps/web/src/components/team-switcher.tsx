"use client"

import * as React from "react"
import { ChevronsUpDown, Building2, Check } from "@/lib/icons"
import { useOrgFromUrl } from "@/lib/org-context"
import { useRouter, usePathname } from "next/navigation"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

export function TeamSwitcher() {
  const { isMobile } = useSidebar()
  const { orgs, currentOrg, isLoading } = useOrgFromUrl()
  const router = useRouter()
  const pathname = usePathname()

  const getOrgDestination = React.useCallback((orgId: string) => {
    if (pathname.startsWith("/org/")) {
      return pathname.replace(/^\/org\/[^/]+/, `/org/${orgId}`)
    }

    return `/org/${orgId}`
  }, [pathname])

  React.useEffect(() => {
    for (const org of orgs) {
      router.prefetch(getOrgDestination(org.id))
    }
  }, [getOrgDestination, orgs, router])

  if (isLoading) {
    return (
      <SidebarMenu className="h-full">
        <SidebarMenuItem className="h-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
          <SidebarMenuButton
            size="lg"
            disabled
            aria-busy="true"
            className="!h-full w-full rounded-none px-5 group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
          >
            <Skeleton className="h-6 w-6 shrink-0 rounded-md" />
            <div className="grid flex-1 gap-1 group-data-[collapsible=icon]:hidden">
              <Skeleton className="h-3.5 w-24" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  if (!currentOrg) {
    return null
  }

  return (
    <SidebarMenu className="h-full">
      <SidebarMenuItem className="h-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="!h-full w-full cursor-pointer rounded-none px-5 pr-14 transition-[padding,width] duration-200 ease-linear hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:!p-0 group-data-[collapsible=icon]:justify-center"
            >
              {currentOrg.logoUrl ? (
                <img
                  src={currentOrg.logoUrl}
                  alt={currentOrg.name}
                  className="h-6 w-6 shrink-0 rounded-md object-contain"
                />
              ) : (
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-500/15 text-blue-600">
                  <Building2 className="size-3.5" />
                </div>
              )}
              <span className="max-w-[10rem] truncate whitespace-nowrap text-sm font-medium transition-[max-width,opacity] duration-200 ease-linear group-data-[collapsible=icon]:hidden">
                {currentOrg.name}
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 opacity-50 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-xl"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={8}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Switch organisation
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {orgs.map((org) => {
              const selected = org.id === currentOrg.id

              return (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => {
                    router.push(getOrgDestination(org.id))
                  }}
                  onMouseEnter={() => router.prefetch(getOrgDestination(org.id))}
                  onFocus={() => router.prefetch(getOrgDestination(org.id))}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {org.logoUrl ? (
                      <img
                        src={org.logoUrl}
                        alt={org.name}
                        className="h-6 w-6 rounded-md object-contain"
                      />
                    ) : (
                      <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-500/15 text-blue-600">
                        <Building2 className="size-3.5" />
                      </div>
                    )}
                    <span className="truncate whitespace-nowrap font-medium">{org.name}</span>
                  </span>
                  {selected ? <Check className="size-4 text-blue-600" /> : null}
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
