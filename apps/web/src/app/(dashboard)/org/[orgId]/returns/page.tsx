"use client"

import * as React from "react"
import { useSearchParams, useParams } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { PageHeader } from "@/components/page-header"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, History, Play, Terminal, CheckCircle2, XCircle, Search, X, MoreHorizontal, Trash, FileText } from "@/lib/icons"
import Link from "next/link"
import { api } from "@/trpc/react"
import { Skeleton } from "@/components/ui/skeleton"

type StatusFilter = "pending" | "in_progress" | "review_required" | "completed" | "failed" | "dismissed" | undefined
type JurisdictionFilter = "all" | "GG" | "JE"
type TaxYearFilter = "all" | `${number}`

export default function ReturnsPage() {
  const params = useParams()
  const orgId = params?.orgId as string
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get("status") as StatusFilter
  const currentCalendarYear = React.useMemo(() => new Date().getUTCFullYear(), [])
  const defaultTaxYear = currentCalendarYear - 1

  const [page, setPage] = React.useState(1)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initialStatus ?? undefined)
  const [jurisdictionFilter, setJurisdictionFilter] = React.useState<JurisdictionFilter>("all")
  const [taxYearFilter, setTaxYearFilter] = React.useState<TaxYearFilter>(
    `${defaultTaxYear}` as TaxYearFilter,
  )
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [logsDialogOpen, setLogsDialogOpen] = React.useState(false)
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null)
  const [syncJurisdiction, setSyncJurisdiction] = React.useState<"GG" | "JE">("GG")

  // Selection State
  const [selected, setSelected] = React.useState<Set<string>>(new Set())

  const pageSize = 20

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1) // Reset to first page on search
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset page when filter changes
  React.useEffect(() => {
    setPage(1)
    setSelected(new Set()) // Clear selection on filter change
  }, [jurisdictionFilter, statusFilter, taxYearFilter])

  const utils = api.useUtils()

  const { data, isLoading, refetch } = api.taxReturn.list.useQuery(
    {
      orgId, // Filter by org from URL
      page,
      pageSize,
      jurisdictionCode:
        jurisdictionFilter === "all" ? undefined : jurisdictionFilter,
      taxYear: taxYearFilter === "all" ? undefined : Number(taxYearFilter),
      status: statusFilter,
      search: debouncedSearch || undefined,
    },
    {
      refetchOnWindowFocus: false,
      enabled: !!orgId, // Only run query if we have an orgId
    }
  )

  const taxYearOptions = React.useMemo(() => {
    const recentYears = Array.from({ length: 8 }, (_, index) => currentCalendarYear - index)
    const syncedYears = (data?.returns ?? []).map((item) => item.taxYear)
    return Array.from(new Set([...recentYears, ...syncedYears])).sort(
      (a, b) => b - a,
    )
  }, [currentCalendarYear, data?.returns])

  const deleteMutation = api.taxReturn.delete.useMutation({
    onSuccess: () => {
      setSelected(new Set())
      refetch()
    },
  })

  const dismissMutation = api.taxReturn.dismissReturn.useMutation({
    onSuccess: () => refetch(),
  })

  const undismissMutation = api.taxReturn.undismissReturn.useMutation({
    onSuccess: () => refetch(),
  })

  const { data: activeJob } = api.taxReturn.getActiveSyncJob.useQuery(undefined, {
    refetchInterval: 3000,
  })

  const { data: logsData } = api.taxReturn.getSyncJobLogs.useQuery(
    { jobId: activeJobId! },
    {
      enabled: !!activeJobId,
      refetchInterval: logsDialogOpen ? 2000 : 5000, // Poll slower when dialog closed
    }
  )

  const startSyncMutation = api.taxReturn.startSyncJob.useMutation({
    onSuccess: (data) => {
      setActiveJobId(data.jobId)
      setLogsDialogOpen(true)
    },
    onError: () => {
      // Reset state on error
      setActiveJobId(null)
    },
  })

  // If there's an active job on load, set the jobId but don't auto-open dialog
  React.useEffect(() => {
    if (activeJob && !activeJobId) {
      setActiveJobId(activeJob.id)
    }
  }, [activeJob, activeJobId])

  const handleStartSync = () => {
    startSyncMutation.mutate({
      orgId,
      jurisdictionCode: syncJurisdiction,
    })
  }

  const handleDeleteSelected = () => {
    if (confirm(`Are you sure you want to delete ${selected.size} returns?`)) {
      deleteMutation.mutate(Array.from(selected))
    }
  }

  const handleDeleteSingle = (id: string) => {
     if (confirm("Are you sure you want to delete this return?")) {
      deleteMutation.mutate([id])
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked && data) {
      const allIds = data.returns.map(r => r.id)
      setSelected(new Set(allIds))
    } else {
      setSelected(new Set())
    }
  }

  const toggleSelectRow = (id: string, checked: boolean) => {
    const newSelected = new Set(selected)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelected(newSelected)
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

  const getStatusBadge = (
    status: string,
    isReadyForAutomation: boolean | null | undefined,
  ) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 shadow-none hover:bg-green-500/20">Completed</Badge>
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 shadow-none hover:bg-blue-500/20">In Progress</Badge>
      case "review_required":
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 shadow-none hover:bg-orange-500/20">Review Required</Badge>
      case "failed":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 shadow-none hover:bg-red-500/20">Failed</Badge>
      case "dismissed":
        return <Badge className="bg-zinc-500/10 text-zinc-500 border-zinc-500/20 shadow-none hover:bg-zinc-500/20">Dismissed</Badge>
      default:
        if (isReadyForAutomation) {
          return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 shadow-none hover:bg-yellow-500/20">Awaiting Automation</Badge>
        }

        return <Badge className="bg-slate-500/10 text-slate-700 border-slate-500/20 shadow-none hover:bg-slate-500/20">Pending</Badge>
    }
  }

  const getReadinessBadge = (item: NonNullable<typeof data>["returns"][number]) => {
    if (item.isSubstanceComplete) {
      return (
        <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 shadow-none hover:bg-emerald-500/20">
          Ready
        </Badge>
      )
    }

    if ((item.missingSubstanceFieldCount ?? 0) > 0) {
      return (
        <Badge className="bg-violet-500/10 text-violet-700 border-violet-500/20 shadow-none hover:bg-violet-500/20">
          {item.missingSubstanceFieldCount} Missing
        </Badge>
      )
    }

    return (
      <Badge className="bg-slate-500/10 text-slate-700 border-slate-500/20 shadow-none hover:bg-slate-500/20">
        Needs Form
      </Badge>
    )
  }

  const isJobComplete = logsData?.job?.status === "completed"
  const isJobFailed = logsData?.job?.status === "failed"
  const isJobRunning = activeJob?.status === "running" && logsData?.job?.status === "running"

  // When job finishes (completed/failed), refresh data and clear state
  const jobStatus = logsData?.job?.status
  React.useEffect(() => {
    if (jobStatus === "completed" || jobStatus === "failed") {
      refetch()
      utils.taxReturn.getActiveSyncJob.invalidate()
      if (!logsDialogOpen) {
        setActiveJobId(null)
      }
    }
  }, [jobStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  const isAllSelected = data?.returns.length ? data.returns.every(r => selected.has(r.id)) : false
  const isIndeterminate = selected.size > 0 && !isAllSelected

  return (
    <>
      <PageHeader>
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">LTS</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Tax Returns</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </PageHeader>

        <main className="flex-1 overflow-auto">
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">Tax Returns</h2>
              <p className="text-sm text-muted-foreground">
                Manage and track tax returns synced from the portal.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href={`/org/${orgId}/returns/sync-jobs`}>
                  <History className="mr-2 h-4 w-4" />
                  Sync Jobs
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/org/${orgId}/returns/scrape`}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Manual Sync
                </Link>
              </Button>
              <Select
                value={syncJurisdiction}
                onValueChange={(value) =>
                  setSyncJurisdiction(value as "GG" | "JE")
                }
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Jurisdiction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GG">Guernsey</SelectItem>
                  <SelectItem value="JE">Jersey</SelectItem>
                </SelectContent>
              </Select>
              {isJobRunning ? (
                <Button variant="outline" onClick={() => setLogsDialogOpen(true)}>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </Button>
              ) : (
                <Button onClick={handleStartSync} disabled={startSyncMutation.isPending}>
                  {startSyncMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="mr-2 h-4 w-4" />
                  )}
                  Scrape Returns
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 bg-background p-1 rounded-lg border shadow-sm">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9 border-none shadow-none focus-visible:ring-0 bg-muted"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="h-6 w-px bg-border" />
                <Select
                  value={jurisdictionFilter}
                  onValueChange={(value) =>
                    setJurisdictionFilter(value as JurisdictionFilter)
                  }
                >
                  <SelectTrigger className="w-[160px] border-none shadow-none focus:ring-0 bg-muted">
                    <SelectValue placeholder="All jurisdictions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All jurisdictions</SelectItem>
                    <SelectItem value="GG">Guernsey</SelectItem>
                    <SelectItem value="JE">Jersey</SelectItem>
                  </SelectContent>
                </Select>
                <div className="h-6 w-px bg-border" />
                <Select
                  value={statusFilter ?? "all"}
                  onValueChange={(value) => setStatusFilter(value === "all" ? undefined : value as StatusFilter)}
                >
                  <SelectTrigger className="w-[180px] border-none shadow-none focus:ring-0 bg-muted">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review_required">Review Required</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="dismissed">Dismissed</SelectItem>
                  </SelectContent>
                </Select>
                <div className="h-6 w-px bg-border" />
                <Select
                  value={taxYearFilter}
                  onValueChange={(value) => setTaxYearFilter(value as TaxYearFilter)}
                >
                  <SelectTrigger className="w-[140px] border-none shadow-none focus:ring-0 bg-muted">
                    <SelectValue placeholder="Tax year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All tax years</SelectItem>
                    {taxYearOptions.map((year) => (
                      <SelectItem key={year} value={`${year}`}>
                        {year}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selected.size > 0 && (
                  <>
                     <div className="h-6 w-px bg-border" />
                     <Button 
                        variant="destructive" 
                        size="sm" 
                        className="mr-1"
                        onClick={handleDeleteSelected}
                     >
                       <Trash className="mr-2 h-4 w-4" />
                       Delete ({selected.size})
                     </Button>
                  </>
                )}
            </div>

            <div className="rounded-md border bg-background shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Jurisdiction</TableHead>
                    <TableHead>Tax Year</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Readiness</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 10 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : data?.returns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                        {searchQuery || statusFilter || jurisdictionFilter !== "all" || taxYearFilter !== "all"
                          ? "No returns match your filters."
                          : "No returns found. Run a sync job to import returns."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    data?.returns.map((item) => (
                      <TableRow key={item.id} data-state={selected.has(item.id) && "selected"}>
                         <TableCell>
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={(checked) => toggleSelectRow(item.id, !!checked)}
                            aria-label="Select row"
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <Link
                            href={`/org/${params.orgId}/returns/${item.id}`}
                            className="hover:underline hover:text-primary transition-colors"
                          >
                            {item.entityName}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.jurisdiction?.code || "—"}</Badge>
                        </TableCell>
                        <TableCell>{item.taxYear}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {item.externalId || "—"}
                        </TableCell>
                        <TableCell>
                          {getStatusBadge(item.status, item.isSubstanceComplete)}
                        </TableCell>
                        <TableCell>{getReadinessBadge(item)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {item.status !== "completed" && (
                              <Button size="sm" asChild>
                                <Link href={`/org/${params.orgId}/returns/${item.id}`}>
                                  Process
                                </Link>
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" className="h-8 w-8 p-0">
                                  <span className="sr-only">Open menu</span>
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem asChild>
                                  <Link href={`/org/${params.orgId}/returns/${item.id}`}>
                                    <FileText className="mr-2 h-4 w-4" />
                                    View Details
                                  </Link>
                                </DropdownMenuItem>
                                {item.link && (
                                  <DropdownMenuItem asChild>
                                    <a href={item.link} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="mr-2 h-4 w-4" />
                                      View in Portal
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                                {item.status !== "dismissed" && item.status !== "completed" ? (
                                  <DropdownMenuItem onClick={() => dismissMutation.mutate({ taxReturnId: item.id })}>
                                    <X className="mr-2 h-4 w-4" />
                                    Dismiss
                                  </DropdownMenuItem>
                                ) : item.status === "dismissed" ? (
                                  <DropdownMenuItem onClick={() => undismissMutation.mutate({ taxReturnId: item.id })}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Restore
                                  </DropdownMenuItem>
                                ) : null}
                                <DropdownMenuItem
                                  onClick={() => handleDeleteSingle(item.id)}
                                >
                                  <Trash className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {data && data.totalPages > 1 && (
              <div className="flex items-center justify-between">
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
          </div>
        </div>
        </main>

        {/* Logs Dialog */}
        <Dialog open={logsDialogOpen} onOpenChange={setLogsDialogOpen}>
          <DialogContent className="!max-w-5xl !w-[80vw] max-h-[85vh] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-4 py-4 border-b bg-muted/50">
              <DialogTitle className="flex items-center gap-3 text-base font-medium">
                <div className={`p-2 rounded-md ${
                  isJobComplete ? "bg-green-500/10" : isJobFailed ? "bg-red-500/10" : "bg-primary/10"
                }`}>
                  {isJobComplete ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : isJobFailed ? (
                    <XCircle className="h-4 w-4 text-red-600" />
                  ) : (
                    <Terminal className="h-4 w-4 text-primary" />
                  )}
                </div>
                <div className="flex flex-col gap-0.5">
                  <span>
                    {isJobComplete ? "Sync Complete" : isJobFailed ? "Sync Failed" : "Syncing Returns..."}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">
                    {logsData?.logs?.length || 0} log entries
                    {logsData?.job?.returnsFound && ` • ${logsData.job.returnsFound} returns found`}
                  </span>
                </div>
                {isJobRunning && (
                  <Loader2 className="ml-auto h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </DialogTitle>
            </DialogHeader>
            <ScrollArea className="h-[60vh] bg-muted/30">
              <div className="p-4">
                {logsData?.logs && logsData.logs.length > 0 ? (
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
                ) : (
                  <div className="text-muted-foreground flex flex-col items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin mb-2" />
                    <p className="text-sm">Waiting for logs...</p>
                  </div>
                )}
              </div>
            </ScrollArea>
            {(isJobComplete || isJobFailed) && (
              <div className="px-5 py-3 border-t bg-muted/30 flex justify-end">
                <Button onClick={() => {
                  setLogsDialogOpen(false)
                  setActiveJobId(null)
                }}>
                  Close
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
    </>
  )
}
