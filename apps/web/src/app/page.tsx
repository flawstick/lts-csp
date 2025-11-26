"use client"

import { AppSidebar } from "@/components/app-sidebar"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  FileText,
  CheckCircle2,
  Clock,
  Zap,
  Activity,
  ArrowRight,
  TrendingUp,
  Building2,
} from "lucide-react"
import Link from "next/link"
import { api } from "@/trpc/react"

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = api.analytics.getStats.useQuery()
  const { data: recentActivity, isLoading: activityLoading } = api.analytics.getRecentActivity.useQuery()
  const { data: jurisdictionStats } = api.analytics.getJurisdictionStats.useQuery()

  const statCards = [
    {
      title: "Active Returns",
      value: stats?.totalActiveReturns ?? 0,
      icon: FileText,
      delay: "0ms",
    },
    {
      title: "Completion Rate",
      value: `${stats?.autoApprovalRate ?? 0}%`,
      icon: CheckCircle2,
      delay: "50ms",
    },
    {
      title: "Avg. Processing",
      value: stats?.avgProcessingTime ?? "—",
      icon: Clock,
      delay: "100ms",
    },
    {
      title: "System Status",
      value: stats?.systemHealth ?? "—",
      icon: Activity,
      delay: "150ms",
    },
  ]

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string }> = {
      pending: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-400" },
      in_progress: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-400" },
      completed: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-400" },
      failed: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-400" },
    }
    const config = configs[status] ?? configs.pending!
    return (
      <Badge className={`${config.bg} ${config.text} border-0 font-medium`}>
        {status.replace("_", " ")}
      </Badge>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
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

        <div className="flex-1 overflow-auto p-6">
          <div className="max-w-6xl mx-auto space-y-8">
            {/* Welcome Section */}
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
              <p className="text-muted-foreground mt-1">
                Here's an overview of your tax return processing pipeline.
              </p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {statsLoading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="rounded-xl border p-5 space-y-3">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-8 w-16" />
                    </div>
                  ))}
                </>
              ) : (
                statCards.map((card, i) => (
                  <div
                    key={card.title}
                    className="group rounded-xl border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-4 duration-500"
                    style={{ animationDelay: card.delay }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-2">
                        <p className="text-sm font-medium text-muted-foreground">{card.title}</p>
                        <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                      </div>
                      <div className="p-2.5 rounded-lg bg-muted transition-transform group-hover:scale-110">
                        <card.icon className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Recent Activity */}
              <div
                className="lg:col-span-2 rounded-xl border bg-card animate-in fade-in slide-in-from-bottom-4 duration-500"
                style={{ animationDelay: "200ms" }}
              >
                <div className="p-5 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-muted-foreground" />
                    <h3 className="font-semibold">Recent Activity</h3>
                  </div>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/returns">
                      View all
                      <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
                    </Link>
                  </Button>
                </div>
                <div className="divide-y">
                  {activityLoading ? (
                    <>
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="p-4 flex items-center gap-4">
                          <Skeleton className="h-10 w-10 rounded-lg" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-48" />
                            <Skeleton className="h-3 w-32" />
                          </div>
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                      ))}
                    </>
                  ) : recentActivity && recentActivity.length > 0 ? (
                    recentActivity.map((item, i) => (
                      <Link
                        key={item.id}
                        href={`/returns/${item.id}`}
                        className="p-4 flex items-center gap-4 hover:bg-muted/50 transition-colors animate-in fade-in slide-in-from-left-2 duration-300"
                        style={{ animationDelay: `${250 + i * 50}ms` }}
                      >
                        <div className="p-2.5 rounded-lg bg-muted">
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{item.entityName}</p>
                          <p className="text-sm text-muted-foreground">
                            {item.jurisdiction?.name ?? "Unknown"} • {item.taxYear}
                          </p>
                        </div>
                        {getStatusBadge(item.status)}
                      </Link>
                    ))
                  ) : (
                    <div className="p-12 text-center text-muted-foreground">
                      <FileText className="h-10 w-10 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No recent activity</p>
                      <p className="text-sm mt-1">Tax returns will appear here once synced</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Jurisdiction Breakdown */}
              <div
                className="rounded-xl border bg-card animate-in fade-in slide-in-from-bottom-4 duration-500"
                style={{ animationDelay: "250ms" }}
              >
                <div className="p-5 border-b flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-blue-500" />
                  <h3 className="font-semibold">By Jurisdiction</h3>
                </div>
                <div className="p-4 space-y-3">
                  {jurisdictionStats && jurisdictionStats.length > 0 ? (
                    jurisdictionStats.map((stat, i) => (
                      <div
                        key={stat.jurisdiction ?? i}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50 animate-in fade-in slide-in-from-right-2 duration-300"
                        style={{ animationDelay: `${300 + i * 50}ms` }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-500" />
                          <span className="font-medium text-sm">{stat.jurisdiction ?? "Unknown"}</span>
                        </div>
                        <span className="text-sm text-muted-foreground font-medium">{stat.count}</span>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-muted-foreground">
                      <Building2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">No data yet</p>
                    </div>
                  )}
                </div>

                {/* Quick Actions */}
                <div className="p-4 border-t space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Quick Actions</p>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/returns">
                      <TrendingUp className="h-4 w-4 mr-2" />
                      View All Returns
                    </Link>
                  </Button>
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link href="/tasks">
                      <Zap className="h-4 w-4 mr-2" />
                      View Tasks
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
