"use client"

import * as React from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { PageHeader } from "@/components/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { ExternalLink, RefreshCw, Terminal } from "@/lib/icons"
import { api } from "@/trpc/react"
import { SyncJobStatusBadge } from "@/components/sync-job-status-badge"

function formatTimestamp(value: number | undefined) {
  if (!value) {
    return ""
  }

  return new Date(value).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
}

function getTriggerLabel(trigger: string | null | undefined) {
  return trigger === "scheduler" ? "Scheduler" : "Manual"
}

function getLogClass(level: string | null | undefined) {
  if (level === "error") {
    return "text-rose-700 dark:text-rose-400"
  }

  if (level === "warn") {
    return "text-amber-700 dark:text-amber-400"
  }

  return "text-foreground"
}

export default function SyncJobDetailPage() {
  const params = useParams()
  const orgId = params?.orgId as string
  const jobId = params?.jobId as string

  const { data, isLoading, refetch } = api.taxReturn.getSyncJobLogs.useQuery(
    { jobId },
    {
      refetchOnWindowFocus: false,
      refetchInterval: 2000,
    },
  )

  const job = data?.job
  const logs = data?.logs ?? []

  return (
    <>
      <PageHeader>
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href="/">LTS</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:block">
              <BreadcrumbLink href={`/org/${orgId}/returns?dialog=sync-jobs`}>
                Sync Jobs
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem>
              <BreadcrumbPage>Sync Job Details</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </PageHeader>

      <main className="flex-1 overflow-auto">
        <div className="flex flex-col gap-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold tracking-tight">Sync Job Details</h2>
              <p className="text-muted-foreground text-sm">
                Inspect one sync run, its source, and the full persisted log stream.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href={`/org/${orgId}/returns?dialog=sync-jobs`}>
                  Back to Sync Jobs
                </Link>
              </Button>
              <Button variant="outline" onClick={() => void refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>

          {isLoading || !job ? (
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Skeleton className="h-72 w-full" />
              <Skeleton className="h-[36rem] w-full" />
            </div>
          ) : (
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <SyncJobStatusBadge status={job.status} />
                    <Badge variant="outline">{job.jurisdiction?.code || "\u2014"}</Badge>
                    <Badge variant="secondary">{getTriggerLabel(job.trigger)}</Badge>
                  </CardTitle>
                  <CardDescription>{job.id}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        Organisation
                      </div>
                      <div className="mt-1 font-medium">
                        {job.organisation?.name || "\u2014"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        Returns Found
                      </div>
                      <div className="mt-1 font-medium">
                        {job.returnsFound ?? "\u2014"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        Created
                      </div>
                      <div className="mt-1 font-medium">
                        {new Date(job.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        Started
                      </div>
                      <div className="mt-1 font-medium">
                        {job.startedAt ? new Date(job.startedAt).toLocaleString() : "\u2014"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        Completed
                      </div>
                      <div className="mt-1 font-medium">
                        {job.completedAt
                          ? new Date(job.completedAt).toLocaleString()
                          : "\u2014"}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        Source
                      </div>
                      <div className="mt-1 font-medium">
                        {job.metadata?.requestedVia === "platform"
                          ? "Platform"
                          : getTriggerLabel(job.trigger)}
                      </div>
                    </div>
                  </div>

                  {job.errorMessage && (
                    <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-700 dark:text-rose-400">
                      {job.errorMessage}
                    </div>
                  )}

                  {job.metadata && (
                    <div className="space-y-2">
                      <div className="text-muted-foreground text-xs uppercase tracking-wide">
                        Metadata
                      </div>
                      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                        {JSON.stringify(job.metadata, null, 2)}
                      </pre>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                      <Link href={`/org/${orgId}/returns?dialog=sync-jobs`}>
                        Return to Dialog
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/org/${orgId}/returns`}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Returns
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="min-h-[36rem]">
                <CardHeader>
                  <CardTitle>Log Stream</CardTitle>
                  <CardDescription>
                    Persisted sync logs from the worker and scheduler.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-[34rem]">
                  <ScrollArea className="h-full">
                    {logs.length ? (
                      <div className="space-y-2">
                        {logs.map((log) => (
                          <div
                            key={log.id}
                            className="rounded-md border px-3 py-2"
                          >
                            <div className="flex items-start gap-3">
                              <span className="text-muted-foreground min-w-16 font-mono text-xs">
                                {formatTimestamp(log.timestamp)}
                              </span>
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className={`text-sm ${getLogClass(log.level)}`}>
                                  {log.message}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {log.scope && <span>{log.scope}</span>}
                                  {log.level && (
                                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] uppercase">
                                      {log.level}
                                    </Badge>
                                  )}
                                </div>
                                {log.payload && (
                                  <pre className="overflow-x-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">
                                    {JSON.stringify(log.payload, null, 2)}
                                  </pre>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
                        <Terminal className="h-6 w-6" />
                        <p className="text-sm">No logs recorded yet.</p>
                      </div>
                    )}
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
