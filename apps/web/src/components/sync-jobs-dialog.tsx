"use client"

import * as React from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { api } from "@/trpc/react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ExternalLink, Loader2, RefreshCw, Terminal } from "@/lib/icons"
import { SyncJobStatusBadge } from "@/components/sync-job-status-badge"

type JurisdictionFilter = "all" | "GG" | "JE"

interface SyncJobsDialogProps {
  orgId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initialJobId?: string | null
}

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

  if (level === "info") {
    return "text-foreground"
  }

  return "text-foreground"
}

export function SyncJobsDialog({
  orgId,
  open,
  onOpenChange,
  initialJobId,
}: SyncJobsDialogProps) {
  const [page, setPage] = React.useState(1)
  const [pageSize] = React.useState(20)
  const [jurisdictionFilter, setJurisdictionFilter] =
    React.useState<JurisdictionFilter>("all")
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(initialJobId ?? null)

  React.useEffect(() => {
    if (!open) {
      return
    }

    if (initialJobId) {
      setSelectedJobId(initialJobId)
    }
  }, [open, initialJobId])

  React.useEffect(() => {
    setPage(1)
  }, [jurisdictionFilter])

  const { data, isLoading, refetch } = api.taxReturn.listSyncJobs.useQuery(
    {
      orgId,
      page,
      pageSize,
      jurisdictionCode:
        jurisdictionFilter === "all" ? undefined : jurisdictionFilter,
    },
    {
      enabled: open,
      refetchOnWindowFocus: false,
      refetchInterval: open ? 5000 : false,
    },
  )

  React.useEffect(() => {
    if (!data?.jobs?.length) {
      return
    }

    if (!selectedJobId) {
      setSelectedJobId(data.jobs[0]?.id ?? null)
      return
    }

    const selectedStillVisible = data.jobs.some((job) => job.id === selectedJobId)
    if (!selectedStillVisible) {
      setSelectedJobId(data.jobs[0]?.id ?? null)
    }
  }, [data?.jobs, selectedJobId])

  const { data: details, isLoading: detailsLoading } = api.taxReturn.getSyncJobLogs.useQuery(
    { jobId: selectedJobId! },
    {
      enabled: open && !!selectedJobId,
      refetchOnWindowFocus: false,
      refetchInterval: open && selectedJobId ? 2000 : false,
    },
  )

  const currentJob = details?.job
  const currentLogs = details?.logs ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] max-w-[96rem] overflow-hidden p-0">
        <DialogHeader className="border-b bg-muted/40 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <DialogTitle className="text-lg">Sync Jobs</DialogTitle>
              <p className="text-muted-foreground text-sm">
                Manual and scheduled sync runs with live logs and details.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={jurisdictionFilter}
                onValueChange={(value) =>
                  setJurisdictionFilter(value as JurisdictionFilter)
                }
              >
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All jurisdictions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All jurisdictions</SelectItem>
                  <SelectItem value="GG">Guernsey</SelectItem>
                  <SelectItem value="JE">Jersey</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="grid max-h-[82vh] min-h-[70vh] grid-cols-1 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="border-r">
            <div className="overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Jurisdiction</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Returns</TableHead>
                    <TableHead>Started</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, index) => (
                      <TableRow key={index}>
                        <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="ml-auto h-8 w-20" /></TableCell>
                      </TableRow>
                    ))
                  ) : data?.jobs?.length ? (
                    data.jobs.map((job) => (
                      <TableRow
                        key={job.id}
                        className={`cursor-pointer ${selectedJobId === job.id ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedJobId(job.id)}
                      >
                        <TableCell>
                          <SyncJobStatusBadge status={job.status} />
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {job.jurisdiction?.code || "\u2014"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {getTriggerLabel(job.trigger)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {job.returnsFound ?? "\u2014"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {job.startedAt
                            ? formatDistanceToNow(new Date(job.startedAt), {
                                addSuffix: true,
                              })
                            : formatDistanceToNow(new Date(job.createdAt), {
                                addSuffix: true,
                              })}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" asChild onClick={(e) => e.stopPropagation()}>
                            <Link href={`/org/${orgId}/returns/sync-jobs/${job.id}`}>
                              <ExternalLink className="mr-2 h-4 w-4" />
                              Open
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        No sync jobs found yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            {selectedJobId && (detailsLoading || currentJob) ? (
              <>
                <div className="border-b bg-muted/20 px-6 py-4">
                  {detailsLoading || !currentJob ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-40" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <SyncJobStatusBadge status={currentJob.status} />
                        <Badge variant="outline">
                          {currentJob.jurisdiction?.code || "\u2014"}
                        </Badge>
                        <Badge variant="secondary">
                          {getTriggerLabel(currentJob.trigger)}
                        </Badge>
                      </div>
                      <div className="grid gap-3 text-sm sm:grid-cols-2">
                        <div>
                          <div className="text-muted-foreground">Organisation</div>
                          <div className="font-medium">
                            {currentJob.organisation?.name || "\u2014"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Returns Found</div>
                          <div className="font-medium">
                            {currentJob.returnsFound ?? "\u2014"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Started</div>
                          <div className="font-medium">
                            {currentJob.startedAt
                              ? new Date(currentJob.startedAt).toLocaleString()
                              : "\u2014"}
                          </div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Completed</div>
                          <div className="font-medium">
                            {currentJob.completedAt
                              ? new Date(currentJob.completedAt).toLocaleString()
                              : "\u2014"}
                          </div>
                        </div>
                      </div>
                      {currentJob.errorMessage && (
                        <div className="rounded-md border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-700 dark:text-rose-400">
                          {currentJob.errorMessage}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <ScrollArea className="min-h-0 flex-1">
                  <div className="space-y-1 p-4">
                    {detailsLoading ? (
                      Array.from({ length: 12 }).map((_, index) => (
                        <Skeleton key={index} className="h-8 w-full" />
                      ))
                    ) : currentLogs.length ? (
                      currentLogs.map((log) => (
                        <div
                          key={log.id}
                          className="hover:bg-muted/60 rounded-md px-3 py-2 transition-colors"
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
                      ))
                    ) : (
                      <div className="text-muted-foreground flex h-full min-h-[12rem] flex-col items-center justify-center gap-2">
                        <Terminal className="h-6 w-6" />
                        <p className="text-sm">No logs recorded yet.</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </>
            ) : (
              <div className="text-muted-foreground flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 p-6">
                <Terminal className="h-6 w-6" />
                <p className="text-sm">Select a sync job to inspect logs and details.</p>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
