"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function NavMain({
  label,
  items,
}: {
  label?: string
  items: {
    title: string
    url: string
    icon?: React.ComponentType<{ className?: string }>
    /** Short status shown beside the title, such as "In development". */
    badge?: string
  }[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    for (const item of items) {
      router.prefetch(item.url)
    }
  }, [items, router])

  return (
    <SidebarGroup className="pb-0">
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              tooltip={item.badge ? `${item.title} (${item.badge.toLowerCase()})` : item.title}
              // Only apply isActive prop on the client after mount to prevent hydration errors
              {...(mounted && {
                isActive: pathname === item.url || (
                  item.url !== "/" &&
                  !item.url.match(/^\/org\/[^/]+\/?$/) && // Don't use prefix matching for org root
                  pathname.startsWith(item.url)
                )
              })}
            >
              <Link
                href={item.url}
                prefetch={true}
                onMouseEnter={() => router.prefetch(item.url)}
                onFocus={() => router.prefetch(item.url)}
              >
                {item.icon && <item.icon />}
                <span className="truncate">{item.title}</span>
                {item.badge && (
                  <span className="border-sidebar-border text-sidebar-foreground/70 ml-auto shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap group-data-[collapsible=icon]:hidden">
                    {item.badge}
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
