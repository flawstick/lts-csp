"use client"

import Link from "next/link"

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/page-header"
import { SectionCards } from "@/components/section-cards"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { ReturnsDataTable } from "@/components/returns-data-table"
import { MainDashboardSkeleton } from "@/components/main-dashboard-skeleton"
import { ArrowRight, RefreshCw, Zap } from "@/lib/icons"
import { processReturnsHref, returnsListHref, syncReturnsHref } from "@/lib/dashboard-links"
import { useOrgFromUrl } from "@/lib/org-context"

export default function DashboardPage() {
  const { currentOrg, isLoading } = useOrgFromUrl()

  if (isLoading || !currentOrg) {
    return <MainDashboardSkeleton />
  }

  const orgId = currentOrg.id

  return (
    <>
      <PageHeader
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8" asChild>
              <Link href={syncReturnsHref(orgId)} prefetch aria-label="Sync returns from the portal">
                <RefreshCw className="size-3.5" />
                <span className="hidden sm:inline">Sync</span>
              </Link>
            </Button>
            <Button size="sm" className="h-8" asChild>
              <Link href={processReturnsHref(orgId)} prefetch>
                <Zap className="size-3.5" />
                Process returns
              </Link>
            </Button>
          </>
        }
      >
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Dashboard</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <main className="flex-1 overflow-auto">
        <div className="@container/main mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{currentOrg.name}</h1>
            <p className="text-muted-foreground text-sm">
              Where every return stands, from sync through signoff to filing.
            </p>
          </div>

          <SectionCards orgId={orgId} />
          <ChartAreaInteractive orgId={orgId} />

          <section aria-labelledby="dashboard-returns-heading" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dashboard-returns-heading" className="text-base leading-none font-semibold">
                Returns
              </h2>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground -mr-2 h-8" asChild>
                <Link href={returnsListHref(orgId)} prefetch>
                  View all
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>
            <ReturnsDataTable orgId={orgId} />
          </section>
        </div>
      </main>
    </>
  )
}
