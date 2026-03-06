"use client"

import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { SectionCards } from "@/components/section-cards"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { ReturnsDataTable } from "@/components/returns-data-table"
import { MainDashboardSkeleton } from "@/components/main-dashboard-skeleton"
import { useOrgFromUrl } from "@/lib/org-context"

export default function DashboardPage() {
  const { currentOrg, isLoading } = useOrgFromUrl()

  if (isLoading || !currentOrg) {
    return <MainDashboardSkeleton />
  }

  const orgId = currentOrg.id

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-4">
        <SidebarTrigger className="-ml-1" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <SectionCards orgId={orgId} />
            <div className="px-4 lg:px-6">
              <ChartAreaInteractive />
            </div>
            <ReturnsDataTable orgId={orgId} />
          </div>
        </div>
      </div>
    </>
  )
}
