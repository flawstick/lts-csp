"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar"

interface PageHeaderProps {
  children: ReactNode
  actions?: ReactNode
}

export function PageHeader({ children, actions }: PageHeaderProps) {
  const { state: sidebarState } = useSidebar()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  return (
    <header className="bg-container sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b px-4">
      <div className="flex min-w-0 items-center gap-3">
        {mounted && sidebarState === "collapsed" && (
          <>
            <SidebarTrigger className="-ml-1 rounded-lg" />
            <Separator
              orientation="vertical"
              className="mr-1 h-4 data-vertical:self-center"
            />
          </>
        )}
        {children}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  )
}
