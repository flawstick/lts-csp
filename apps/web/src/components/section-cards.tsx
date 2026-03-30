"use client"

import { RefreshCw, FileText, Settings, Terminal, CheckCircle2, Clock, AlertCircle } from "@/lib/icons"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { api } from "@/trpc/react"

interface SectionCardsProps {
  orgId: string
}

export function SectionCards({ orgId }: SectionCardsProps) {
  const { data: stats, isLoading } = api.analytics.getDashboardStats.useQuery({ orgId })

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:border @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="@container/card @xl/main:col-span-2">
        <CardHeader className="pb-0">
          <CardDescription>Quick Actions</CardDescription>
          <CardTitle className="text-lg font-semibold">Get things done</CardTitle>
        </CardHeader>
        <CardFooter className="grid grid-cols-2 gap-2 -mt-2">
          <Button variant="default" size="sm" className="justify-start" asChild>
            <Link href={`/org/${orgId}/returns?status=pending`} prefetch={true}>
              <Clock className="mr-2 h-3 w-3" />
              Process Returns
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="justify-start" asChild>
            <Link href={`/org/${orgId}/returns?dialog=sync-jobs`} prefetch={true}>
              <RefreshCw className="mr-2 h-3 w-3" />
              Sync
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="justify-start" asChild>
            <Link href={`/org/${orgId}/returns`} prefetch={true}>
              <FileText className="mr-2 h-3 w-3" />
              Returns
            </Link>
          </Button>
          <Button variant="outline" size="sm" className="justify-start" asChild>
            <Link href={`/org/${orgId}/settings`} prefetch={true}>
              <Settings className="mr-2 h-3 w-3" />
              Settings
            </Link>
          </Button>
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Tax Returns</CardDescription>
          {isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {stats?.returns.total ?? 0}
            </CardTitle>
          )}
          <CardAction>
            <Badge variant="outline" className="gap-1">
              <FileText className="h-3 w-3" />
              Total
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-4 text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-yellow-500" />
                  {stats?.returns.pending ?? 0} pending
                </span>
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {stats?.returns.completed ?? 0} completed
                </span>
              </div>
              <div className="text-muted-foreground">
                {stats?.returns.total && stats.returns.total > 0
                  ? `${Math.round(((stats?.returns.completed ?? 0) / stats.returns.total) * 100)}% completion rate`
                  : "No returns yet"}
              </div>
            </>
          )}
        </CardFooter>
      </Card>
      <Card className="@container/card">
        <CardHeader>
          <CardDescription>Processing Tasks</CardDescription>
          {isLoading ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {stats?.tasks.total ?? 0}
            </CardTitle>
          )}
          <CardAction>
            <Badge variant="outline" className="gap-1">
              <Terminal className="h-3 w-3" />
              Total
            </Badge>
          </CardAction>
        </CardHeader>
        <CardFooter className="flex-col items-start gap-1.5 text-sm">
          {isLoading ? (
            <>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-24" />
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
                {(stats?.tasks.running ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    {stats?.tasks.running} running
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3 text-yellow-500" />
                  {stats?.tasks.pending ?? 0} pending
                </span>
                {(stats?.tasks.failed ?? 0) > 0 && (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3 text-red-500" />
                    {stats?.tasks.failed} failed
                  </span>
                )}
              </div>
              <div className="text-muted-foreground">
                {stats?.tasks.completed ?? 0} tasks completed
              </div>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
