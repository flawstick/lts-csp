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
    /** Count that needs someone's attention (hidden when 0). */
    attentionCount?: number
    /** Screen-reader / tooltip wording for the count, e.g. "2 tasks need input". */
    attentionLabel?: string
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
        {items.map((item) => {
          const attentionCount = item.attentionCount ?? 0
          const attentionLabel = attentionCount > 0
            ? item.attentionLabel ?? `${attentionCount} need attention`
            : null
          return (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              asChild
              tooltip={
                attentionLabel
                  ? `${item.title} (${attentionLabel})`
                  : item.badge ? `${item.title} (${item.badge.toLowerCase()})` : item.title
              }
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
                className={attentionLabel ? "relative" : undefined}
              >
                {item.icon && <item.icon />}
                <span className="truncate">{item.title}</span>
                {attentionLabel && (
                  <>
                    <span
                      className="ml-auto shrink-0 rounded-full bg-amber-500 px-1.5 py-px text-[11px] leading-4 font-semibold tabular-nums text-amber-950 group-data-[collapsible=icon]:hidden"
                      aria-hidden="true"
                      data-testid={`nav-attention-count-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                    >
                      {attentionCount > 99 ? "99+" : attentionCount}
                    </span>
                    {/* Collapsed sidebar: a dot on the icon instead of the number. */}
                    <span
                      className="absolute top-1 right-1 hidden size-2 rounded-full bg-amber-500 group-data-[collapsible=icon]:block"
                      aria-hidden="true"
                    />
                    <span className="sr-only">{`, ${attentionLabel}`}</span>
                  </>
                )}
                {item.badge && (
                  <span className="border-sidebar-border text-sidebar-foreground/70 ml-auto shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4 font-medium whitespace-nowrap group-data-[collapsible=icon]:hidden">
                    {item.badge}
                  </span>
                )}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
