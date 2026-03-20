"use client"

import * as React from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, ChevronLeft, ChevronRight, Terminal, ArrowLeft, Clock, CheckCircle2, XCircle, PlayCircle, Trash2 } from "@/lib/icons"
import Link from "next/link"
import { api } from "@/trpc/react"
import { formatDistanceToNow } from "date-fns"
import { useParams } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"

type JurisdictionFilter = "all" | "GG" | "JE"

export default function SyncJobsPage() {
  const params = useParams()
  const orgId = params?.orgId as string
  const [page, setPage] = React.useState(1)
  const [selectedJobId, setSelectedJobId] = React.useState<string | null>(null)
  const [jurisdictionFilter, setJurisdictionFilter] =
    React.useState<JurisdictionFilter>("all")
  const pageSize = 20

  React.useEffect(() => {
    setPage(1)
  }, [jurisdictionFilter])

  const { data, isLoading } = api.taxReturn.listSyncJobs.useQuery(
    {
      orgId,
      page,
      pageSize,
      jurisdictionCode:
        jurisdictionFilter === "all" ? undefined : jurisdictionFilter,
    },
    { refetchOnWindowFocus: false, refetchInterval: 5000 }
  )

  const { data: logsData, isLoading: logsLoading } = api.taxReturn.getSyncJobLogs.useQuery(
    { jobId: selectedJobId! },
    { enabled: !!selectedJobId }
  )

  const utils = api.useUtils()
  const deleteFailedMutation = api.taxReturn.deleteFailedSyncJobs.useMutation({
    onSuccess: () => {
      utils.taxReturn.listSyncJobs.invalidate()
    },
  })

  const failedCount = data?.jobs.filter((j) => j.status === "failed").length ?? 0

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        )
      case "running":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">
            <PlayCircle className="mr-1 h-3 w-3 animate-pulse" />
            Running
          </Badge>
        )
      case "failed":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      default:
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
    }
  }

  const formatLogTime = (timestamp: number | undefined) => {
    if (!timestamp) return ""
    return new Date(timestamp).toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">LTS</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href={`/org/${orgId}/returns`}>Tax Returns</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Sync Jobs</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-6 bg-muted/10">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" asChild className="-ml-2">
                  <Link href={`/org/${orgId}/returns`}>
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                </Button>
                <h2 className="text-2xl font-bold tracking-tight">Sync Jobs</h2>
              </div>
              <p className="text-muted-foreground">
                {data ? `${data.total} sync jobs recorded.` : "Loading..."}
              </p>
            </div>
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
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Job History</CardTitle>
                <CardDescription>
                  Tax return sync executions with logs.
                </CardDescription>
              </div>
              {failedCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteFailedMutation.mutate()}
                  disabled={deleteFailedMutation.isPending}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  {deleteFailedMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete Failed ({failedCount})
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Jurisdiction</TableHead>
                      <TableHead>Returns Found</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead className="text-right">Logs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-8" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <>
                        {data?.jobs.map((job) => {
                          const duration = job.startedAt && job.completedAt
                            ? Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000)
                            : null
                          const hasLogs = job.cloudwatchLogGroup && job.cloudwatchLogStream

                          return (
                            <TableRow key={job.id}>
                              <TableCell>{getStatusBadge(job.status)}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{job.jurisdiction?.code || "—"}</Badge>
                              </TableCell>
                              <TableCell className="font-mono">
                                {job.returnsFound ?? "—"}
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {job.startedAt
                                  ? formatDistanceToNow(new Date(job.startedAt), { addSuffix: true })
                                  : job.createdAt
                                    ? formatDistanceToNow(new Date(job.createdAt), { addSuffix: true })
                                    : "—"
                                }
                              </TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {duration !== null ? `${duration}s` : job.status === "running" ? "..." : "—"}
                              </TableCell>
                              <TableCell className="text-right">
                                {hasLogs ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setSelectedJobId(job.id)}
                                  >
                                    <Terminal className="h-4 w-4 mr-1" />
                                    View Logs
                                  </Button>
                                ) : (
                                  <span className="text-muted-foreground text-sm">—</span>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                        {data?.jobs.length === 0 && (
                          <TableRow>
                            <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                              No sync jobs found. Start a manual sync to create one.
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>

              {data && data.totalPages > 1 && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {data.page} of {data.totalPages}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.max(1, p - 1))}
                          disabled={page <= 1}
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                          disabled={page >= data.totalPages}
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
            </CardContent>
          </Card>
        </div>

        {/* Logs Dialog */}
        <Dialog open={!!selectedJobId} onOpenChange={(open) => !open && setSelectedJobId(null)}>
          <DialogContent className="!max-w-5xl !w-[80vw] max-h-[85vh] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-5 py-4 border-b bg-muted/50">
              <DialogTitle className="flex items-center gap-3 text-base font-medium">
                <div className="p-2 rounded-md bg-primary/10">
                  <Terminal className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span>Sync Job Logs</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {logsData?.logs?.length || 0} log entries
                  </span>
                </div>
                {logsData?.job && (
                  <Badge
                    className={`ml-auto ${
                      logsData.job.status === "completed"
                        ? "bg-green-500/10 text-green-600 border-green-500/20"
                        : logsData.job.status === "failed"
                          ? "bg-red-500/10 text-red-600 border-red-500/20"
                          : "bg-blue-500/10 text-blue-600 border-blue-500/20"
                    }`}
                  >
                    {logsData.job.status}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[60vh] bg-muted/30">
              <div className="p-4">
                {logsLoading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : logsData?.logs && logsData.logs.length > 0 ? (
                  <div className="space-y-0.5">
                    {logsData.logs.map((log, i) => (
                      <div
                        key={i}
                        className="flex gap-4 py-1.5 px-3 -mx-1 rounded-md hover:bg-muted/50 transition-colors"
                      >
                        <span className="text-xs text-muted-foreground shrink-0 tabular-nums pt-0.5">
                          {formatLogTime(log.timestamp)}
                        </span>
                        <span className={`text-sm break-all ${
                          log.message.includes("Error") || log.message.includes("error")
                            ? "text-red-600 dark:text-red-400"
                            : log.message.includes("Done") || log.message.includes("Success") || log.message.includes("Synced")
                              ? "text-green-600 dark:text-green-400"
                              : "text-foreground"
                        }`}>
                          {log.message}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : logsData?.pending ? (
                  <div className="text-muted-foreground flex flex-col items-center justify-center h-32">
                    <Loader2 className="h-8 w-8 mb-2 animate-spin opacity-50" />
                    <p className="text-sm">Waiting for task to start logging...</p>
                    <p className="text-xs mt-1 opacity-60">This may take a few seconds</p>
                  </div>
                ) : (
                  <div className="text-muted-foreground flex flex-col items-center justify-center h-32">
                    <Terminal className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">No logs available</p>
                    {logsData?.error && (
                      <p className="text-red-500 text-xs mt-2">{logsData.error}</p>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
    </>
  )
}
