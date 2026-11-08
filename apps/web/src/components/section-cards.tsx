"use client"

import type { ReactNode } from "react"
import Link from "next/link"

import { ArrowRight, CheckCircle2, Clock, Terminal, Zap } from "@/lib/icons"
import { Meter } from "@/components/ui/meter"
import { Skeleton } from "@/components/ui/skeleton"
import { processReturnsHref, returnsListHref, tasksHref } from "@/lib/dashboard-links"
import { cn } from "@/lib/utils"
import { api } from "@/trpc/react"

interface SectionCardsProps {
  orgId: string
}

const numberFormat = new Intl.NumberFormat("en-GB")

/**
 * The return pipeline at a glance. Each tile opens the returns or tasks
 * list already filtered to what it counts, so the number always matches
 * the page behind it.
 */
export function SectionCards({ orgId }: SectionCardsProps) {
  const statsQuery = api.analytics.getDashboardStats.useQuery({ orgId })
  // Display-status counts come from the same query the returns list uses,
  // since "awaiting automation" depends on signoff, not only on status.
  const countOptions = { refetchOnWindowFocus: false } as const
  const awaitingQuery = api.taxReturn.list.useQuery(
    { orgId, status: "awaiting_automation", page: 1, pageSize: 1 },
    countOptions,
  )
  const pendingQuery = api.taxReturn.list.useQuery(
    { orgId, status: "pending", page: 1, pageSize: 1 },
    countOptions,
  )

  const stats = statsQuery.data
  const totalReturns = stats?.returns.total ?? 0
  const completedReturns = stats?.returns.completed ?? 0
  const completionRate = totalReturns > 0 ? Math.round((completedReturns / totalReturns) * 100) : 0
  const runningTasks = stats?.tasks.running ?? 0
  const queuedTasks = stats?.tasks.pending ?? 0
  const failedTasks = stats?.tasks.failed ?? 0

  return (
    <section aria-label="Return pipeline" className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <StatTile
        href={processReturnsHref(orgId)}
        label="Awaiting automation"
        icon={<Zap className="size-4" />}
        value={awaitingQuery.data?.total}
        loading={awaitingQuery.isLoading}
        hint="Signed off and ready to file"
        tone="primary"
      />
      <StatTile
        href={returnsListHref(orgId, "pending")}
        label="Pending"
        icon={<Clock className="size-4" />}
        value={pendingQuery.data?.total}
        loading={pendingQuery.isLoading}
        hint="Waiting on form data or signoff"
      />
      <StatTile
        href={returnsListHref(orgId, "completed")}
        label="Completed"
        icon={<CheckCircle2 className="size-4" />}
        value={completedReturns}
        loading={statsQuery.isLoading}
        hint={
          totalReturns > 0
            ? `${completionRate}% of ${numberFormat.format(totalReturns)} returns`
            : "No returns yet"
        }
      >
        <Meter
          value={completionRate}
          aria-label="Returns completed"
          getAriaValueText={(formatted) => `${formatted} of returns completed`}
          className="mt-3"
          indicatorClassName="bg-emerald-500"
        />
      </StatTile>
      <StatTile
        href={tasksHref(orgId)}
        label="Automation tasks"
        icon={<Terminal className="size-4" />}
        value={runningTasks + queuedTasks}
        loading={statsQuery.isLoading}
        hint={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className={cn(
                  "size-1.5 rounded-full bg-blue-500",
                  runningTasks > 0 && "animate-pulse",
                )}
              />
              {numberFormat.format(runningTasks)} running
            </span>
            <span>{numberFormat.format(queuedTasks)} queued</span>
            {failedTasks > 0 && (
              <span className="text-rose-600 dark:text-rose-400">
                {numberFormat.format(failedTasks)} failed
              </span>
            )}
          </span>
        }
      />
    </section>
  )
}

function StatTile({
  href,
  label,
  icon,
  value,
  loading,
  hint,
  tone = "default",
  children,
}: {
  href: string
  label: string
  icon: ReactNode
  value: number | undefined
  loading: boolean
  hint: ReactNode
  tone?: "default" | "primary"
  children?: ReactNode
}) {
  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "group bg-card text-card-foreground relative flex min-h-36 flex-col rounded-xl border p-4 shadow-xs transition-[border-color,box-shadow,background-color] outline-none",
        "hover:border-foreground/20 hover:shadow-sm focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        tone === "primary" &&
          "border-primary/30 bg-primary/[0.04] hover:border-primary/50 dark:bg-primary/[0.08]",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground flex items-center gap-2 text-sm font-medium">
          <span
            aria-hidden
            className={cn(
              "bg-muted text-foreground/70 flex size-7 items-center justify-center rounded-md",
              tone === "primary" && "bg-primary/10 text-primary",
            )}
          >
            {icon}
          </span>
          {label}
        </span>
        <ArrowRight
          aria-hidden
          className="text-muted-foreground size-4 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        />
      </div>

      <div className="mt-auto pt-4">
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-3xl leading-none font-semibold tracking-tight tabular-nums">
            {numberFormat.format(value ?? 0)}
          </p>
        )}
        <div className="text-muted-foreground mt-2 text-xs">
          {loading ? <Skeleton className="h-3.5 w-36" /> : hint}
        </div>
        {!loading && children}
      </div>
    </Link>
  )
}
