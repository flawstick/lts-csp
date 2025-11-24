"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
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
  DialogDescription,
  DialogFooter,
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
import { Label } from "@/components/ui/label"
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
import { Loader2, ChevronLeft, ChevronRight, ExternalLink, RefreshCw, History, Play, Terminal, CheckCircle2, XCircle, Search, X, MoreHorizontal, Trash, FileText } from "lucide-react"
import Link from "next/link"
import { api } from "@/trpc/react"

type StatusFilter = "pending" | "in_progress" | "review_required" | "completed" | "failed" | undefined

export default function ReturnsPage() {
  const [page, setPage] = React.useState(1)
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(undefined)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [cookieDialogOpen, setCookieDialogOpen] = React.useState(false)
  const [logsDialogOpen, setLogsDialogOpen] = React.useState(false)
  const [cookie, setCookie] = React.useState("")
  const [activeJobId, setActiveJobId] = React.useState<string | null>(null)
  
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
  }, [statusFilter])

  const utils = api.useUtils()

  const { data, isLoading, refetch } = api.taxReturn.list.useQuery(
    {
      page,
      pageSize,
      status: statusFilter,
      search: debouncedSearch || undefined,
    },
    { refetchOnWindowFocus: false }
  )

  const deleteMutation = api.taxReturn.delete.useMutation({
    onSuccess: () => {
      setSelected(new Set())
      refetch()
    },
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
      setCookieDialogOpen(false)
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
    if (!cookie.trim()) return
    startSyncMutation.mutate({ eformsCookie: cookie })
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 shadow-none hover:bg-green-500/20">Completed</Badge>
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 shadow-none hover:bg-blue-500/20">In Progress</Badge>
      case "review_required":
        return <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 shadow-none hover:bg-orange-500/20">Review Required</Badge>
      case "failed":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 shadow-none hover:bg-red-500/20">Failed</Badge>
      default:
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 shadow-none hover:bg-yellow-500/20">Pending</Badge>
    }
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
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
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
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-6 bg-muted/10">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">Tax Returns</h2>
              <p className="text-sm text-muted-foreground">
                Manage and track tax returns synced from the portal.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" asChild>
                <Link href="/returns/sync-jobs">
                  <History className="mr-2 h-4 w-4" />
                  Sync Jobs
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/returns/scrape">
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Manual Sync
                </Link>
              </Button>
              {isJobRunning ? (
                <Button onClick={() => setLogsDialogOpen(true)}>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </Button>
              ) : (
                <Button onClick={() => setCookieDialogOpen(true)}>
                  <Play className="mr-2 h-4 w-4" />
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
                    className="pl-9 pr-9 border-none shadow-none focus-visible:ring-0"
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
                  value={statusFilter ?? "all"}
                  onValueChange={(value) => setStatusFilter(value === "all" ? undefined : value as StatusFilter)}
                >
                  <SelectTrigger className="w-[180px] border-none shadow-none focus:ring-0">
                    <SelectValue placeholder="All statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="review_required">Review Required</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
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
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : data?.returns.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                        {searchQuery || statusFilter
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
                            href={`/returns/${item.id}`}
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
                        <TableCell>{getStatusBadge(item.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {item.status !== "completed" && (
                              <Button size="sm" asChild>
                                <Link href={`/returns/${item.id}`}>
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
                                  <Link href={`/returns/${item.id}`}>
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

        {/* Cookie Input Dialog */}
        <Dialog open={cookieDialogOpen} onOpenChange={setCookieDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Start Sync Job</DialogTitle>
              <DialogDescription>
                Enter your Guernsey Tax Portal session cookie to start scraping returns.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="cookie">Session Cookie</Label>
                <Input
                  id="cookie"
                  placeholder="SSESSf0e33fe76aa9..."
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Copy from your browser&apos;s dev tools (Application &gt; Cookies)
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCookieDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartSync} disabled={!cookie.trim() || startSyncMutation.isPending}>
                {startSyncMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Start Sync
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
      </SidebarInset>
    </SidebarProvider>
  )
}