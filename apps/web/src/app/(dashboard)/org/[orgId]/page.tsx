"use client"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { PageHeader } from "@/components/page-header"
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
      <PageHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <main className="flex-1 overflow-auto">
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6">
          <SectionCards orgId={orgId} />
          <ChartAreaInteractive />
          <ReturnsDataTable orgId={orgId} />
        </div>
      </main>
    </>
  )
}
