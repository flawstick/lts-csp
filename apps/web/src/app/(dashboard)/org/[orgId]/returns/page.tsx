"use client"

import * as React from "react"
import { useSearchParams, useParams, useRouter } from "next/navigation"
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutColumns,
  IconCircleDot,
  IconGlobe,
  IconCalendar,
  IconShieldCheck,
} from "@tabler/icons-react"
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type VisibilityState,
} from "@tanstack/react-table"
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ExternalLink, RefreshCw, History, Search, X, MoreHorizontal, Trash, FileText, Loader2, ChevronDown } from "@/lib/icons"
import Link from "next/link"
import { api } from "@/trpc/react"
import { Skeleton } from "@/components/ui/skeleton"
import { SyncJobsDialog } from "@/components/sync-jobs-dialog"
import { DirectionalTransition } from "@/components/view-transition"
import { useNavigateWithTransition } from "@/lib/navigate-with-transition"

type StatusFilter = "pending" | "in_progress" | "review_required" | "completed" | "failed" | "dismissed" | undefined
type JurisdictionFilter = "all" | "GG" | "JE"
type TaxYearFilter = "all" | `${number}`
type ReadinessFilter = "all" | "ready" | "missing" | "needs_form"

type TaxReturnRow = {
  id: string
  entityName: string
  taxYear: number
  status: string
  returnType: string | null
  externalId: string | null
  link: string | null
  isSubstanceComplete: boolean | null
  missingSubstanceFieldCount: number | null
  jurisdiction: { code: string } | null
}

const statusBadgeStyles: Record<string, string> = {
  completed: "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-400",
  in_progress: "border-blue-500/50 bg-blue-500/15 text-blue-800 dark:border-blue-500/35 dark:bg-blue-500/10 dark:text-blue-400",
  review_required: "border-violet-500/50 bg-violet-500/15 text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-400",
  failed: "border-rose-500/50 bg-rose-500/15 text-rose-800 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-400",
  dismissed: "border-zinc-500/50 bg-zinc-500/15 text-zinc-700 dark:border-zinc-500/35 dark:bg-zinc-500/10 dark:text-zinc-500",
  pending: "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-400",
}

const statusLabels: Record<string, string> = {
  completed: "Completed",
  in_progress: "In Progress",
  review_required: "Review Required",
  failed: "Failed",
  dismissed: "Dismissed",
}

function createColumns(
  orgId: string,
  dismissMutation: { mutate: (args: { taxReturnId: string }) => void },
  undismissMutation: { mutate: (args: { taxReturnId: string }) => void },
  handleDeleteSingle: (id: string) => void,
): ColumnDef<TaxReturnRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "entityName",
      header: "Entity",
      cell: ({ row }) => (
        <span className="font-medium group-hover/row:text-primary group-hover/row:underline">
          {row.original.entityName}
        </span>
      ),
      enableHiding: false,
    },
    {
      accessorKey: "jurisdiction",
      header: "Jurisdiction",
      cell: ({ row }) => (
        <Badge variant="outline" className="text-muted-foreground px-1.5">
          {row.original.jurisdiction?.code || "\u2014"}
        </Badge>
      ),
    },
    {
      accessorKey: "taxYear",
      header: "Tax Year",
      cell: ({ row }) => row.original.taxYear,
    },
    {
      accessorKey: "externalId",
      header: "External ID",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-muted-foreground">
          {row.original.externalId || "\u2014"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.original.status
        const isReadyForAutomation = Boolean(row.original.isSubstanceComplete)
        const cls = statusBadgeStyles[status] ?? statusBadgeStyles.pending
        const label = statusLabels[status] ?? (isReadyForAutomation ? "Awaiting Automation" : "Pending")
        return (
          <span className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium ${cls}`}>
            {label}
          </span>
        )
      },
    },
    {
      id: "readiness",
      header: "Readiness",
      cell: ({ row }) => {
        if (row.original.isSubstanceComplete) {
          return (
            <span className="inline-flex rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-400">
              Ready
            </span>
          )
        }

        if ((row.original.missingSubstanceFieldCount ?? 0) > 0) {
          return (
            <span className="inline-flex rounded-lg border border-violet-500/50 bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-400">
              {row.original.missingSubstanceFieldCount} Missing
            </span>
          )
        }

        return (
          <span className="inline-flex rounded-lg border border-zinc-500/50 bg-zinc-500/15 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-500/35 dark:bg-zinc-500/10 dark:text-zinc-500">
            Needs Form
          </span>
        )
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const item = row.original
        return (
          <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {item.status !== "completed" && (
              <Button size="sm" asChild>
                <Link href={`/org/${orgId}/returns/${item.id}`}>
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
                  <Link href={`/org/${orgId}/returns/${item.id}`}>
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
        )
      },
    },
  ]
}

export default function ReturnsPage() {
  const params = useParams()
  const router = useRouter()
  const navigateWithTransition = useNavigateWithTransition()
  const orgId = params?.orgId as string
  const searchParams = useSearchParams()
  const initialStatus = searchParams.get("status") as StatusFilter
  const syncJobsDialogRequested = searchParams.get("dialog") === "sync-jobs"
  const currentCalendarYear = React.useMemo(() => new Date().getUTCFullYear(), [])
  const defaultTaxYear = currentCalendarYear - 1

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(initialStatus ?? undefined)
  const [jurisdictionFilter, setJurisdictionFilter] = React.useState<JurisdictionFilter>("all")
  const [taxYearFilter, setTaxYearFilter] = React.useState<TaxYearFilter>(
    `${defaultTaxYear}` as TaxYearFilter,
  )
  const [readinessFilter, setReadinessFilter] = React.useState<ReadinessFilter>("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [syncJobsDialogOpen, setSyncJobsDialogOpen] = React.useState(syncJobsDialogRequested)
  const [selectedSyncJobId, setSelectedSyncJobId] = React.useState<string | null>(null)

  // TanStack Table state
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 20,
  })

  // Debounce search input
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset page when filter changes
  React.useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }))
    setRowSelection({})
  }, [jurisdictionFilter, statusFilter, taxYearFilter, readinessFilter])

  React.useEffect(() => {
    setSyncJobsDialogOpen(syncJobsDialogRequested)
  }, [syncJobsDialogRequested])

  const isReadinessActive = readinessFilter !== "all"

  const { data, isLoading, refetch } = api.taxReturn.list.useQuery(
    {
      orgId,
      page: isReadinessActive ? 1 : pagination.pageIndex + 1,
      pageSize: isReadinessActive ? 100 : pagination.pageSize,
      jurisdictionCode:
        jurisdictionFilter === "all" ? undefined : jurisdictionFilter,
      taxYear: taxYearFilter === "all" ? undefined : Number(taxYearFilter),
      status: statusFilter,
      search: debouncedSearch || undefined,
    },
    {
      refetchOnWindowFocus: false,
      enabled: !!orgId,
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
      setRowSelection({})
      refetch()
    },
  })

  const dismissMutation = api.taxReturn.dismissReturn.useMutation({
    onSuccess: () => refetch(),
  })

  const undismissMutation = api.taxReturn.undismissReturn.useMutation({
    onSuccess: () => refetch(),
  })

  const { data: activeJob } = api.taxReturn.getActiveSyncJob.useQuery({ orgId }, {
    refetchInterval: 3000,
  })

  const startSyncMutation = api.taxReturn.startSyncJob.useMutation({
    onSuccess: (data) => {
      setSelectedSyncJobId(data.jobId)
      handleSyncJobsDialogChange(true)
    },
    onError: () => {
      setSelectedSyncJobId(null)
    },
  })

  React.useEffect(() => {
    if (activeJob && !selectedSyncJobId) {
      setSelectedSyncJobId(activeJob.id)
    }
  }, [activeJob, selectedSyncJobId])

  const previousActiveJobIdRef = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (previousActiveJobIdRef.current && !activeJob) {
      void refetch()
    }

    previousActiveJobIdRef.current = activeJob?.id ?? null
  }, [activeJob, refetch])

  const handleSyncJobsDialogChange = (nextOpen: boolean) => {
    setSyncJobsDialogOpen(nextOpen)

    const nextParams = new URLSearchParams(searchParams.toString())
    if (nextOpen) {
      nextParams.set("dialog", "sync-jobs")
    } else {
      nextParams.delete("dialog")
    }

    const nextQuery = nextParams.toString()
    router.replace(
      nextQuery ? `/org/${orgId}/returns?${nextQuery}` : `/org/${orgId}/returns`,
      { scroll: false },
    )
  }

  const handleStartSync = (jurisdictionCode: "GG" | "JE") => {
    startSyncMutation.mutate({
      orgId,
      jurisdictionCode,
    })
  }

  const handleDeleteSelected = () => {
    const selectedIds = Object.keys(rowSelection)
    if (confirm(`Are you sure you want to delete ${selectedIds.length} returns?`)) {
      deleteMutation.mutate(selectedIds)
    }
  }

  const handleDeleteSingle = (id: string) => {
     if (confirm("Are you sure you want to delete this return?")) {
      deleteMutation.mutate([id])
    }
  }

  const columns = React.useMemo(
    () => createColumns(orgId, dismissMutation, undismissMutation, handleDeleteSingle),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId],
  )

  const filteredReturns = React.useMemo(() => {
    const returns = (data?.returns ?? []) as TaxReturnRow[]
    if (readinessFilter === "all") return returns
    return returns.filter((r) => {
      if (readinessFilter === "ready") return r.isSubstanceComplete === true
      if (readinessFilter === "missing") return (r.missingSubstanceFieldCount ?? 0) > 0 && !r.isSubstanceComplete
      if (readinessFilter === "needs_form") return !r.isSubstanceComplete && (r.missingSubstanceFieldCount ?? 0) === 0
      return true
    })
  }, [data?.returns, readinessFilter])

  const table = useReactTable({
    data: filteredReturns,
    columns,
    state: {
      columnVisibility,
      rowSelection,
      pagination,
    },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualPagination: !isReadinessActive,
    pageCount: isReadinessActive ? undefined : (data?.totalPages ?? 1),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: isReadinessActive ? getPaginationRowModel() : undefined,
  })

  const selectedCount = Object.keys(rowSelection).length

  const isJobRunning =
    activeJob?.status === "pending" || activeJob?.status === "running"

  return (
    <DirectionalTransition>
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
              <Button variant="outline" onClick={() => handleSyncJobsDialogChange(true)}>
                <History className="mr-2 h-4 w-4" />
                Sync Jobs
              </Button>
              {isJobRunning ? (
                <Button variant="outline" onClick={() => handleSyncJobsDialogChange(true)}>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Syncing...
                </Button>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button disabled={startSyncMutation.isPending}>
                      {startSyncMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="mr-2 h-4 w-4" />
                      )}
                      Scrape Returns
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuLabel>Jurisdiction</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => handleStartSync("GG")}>
                      Guernsey
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleStartSync("JE")}>
                      Jersey
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="relative min-w-[220px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 pr-9 h-8"
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
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="relative size-8">
                          <IconCircleDot className="h-4 w-4" />
                          {statusFilter && (
                            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Status</TooltipContent>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuLabel>Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {([
                      ["all", "All statuses"],
                      ["pending", "Pending"],
                      ["in_progress", "In Progress"],
                      ["review_required", "Review Required"],
                      ["completed", "Completed"],
                      ["failed", "Failed"],
                      ["dismissed", "Dismissed"],
                    ] as const).map(([value, label]) => (
                      <DropdownMenuCheckboxItem
                        key={value}
                        checked={value === "all" ? !statusFilter : statusFilter === value}
                        onCheckedChange={() => setStatusFilter(value === "all" ? undefined : value as StatusFilter)}
                      >
                        {label}
                      </DropdownMenuCheckboxItem>
                    ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Tooltip>
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="relative size-8">
                          <IconGlobe className="h-4 w-4" />
                          {jurisdictionFilter !== "all" && (
                            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Jurisdiction</TooltipContent>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuLabel>Jurisdiction</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {([
                        ["all", "All jurisdictions"],
                        ["GG", "Guernsey"],
                        ["JE", "Jersey"],
                      ] as const).map(([value, label]) => (
                        <DropdownMenuCheckboxItem
                          key={value}
                          checked={jurisdictionFilter === value}
                          onCheckedChange={() => setJurisdictionFilter(value as JurisdictionFilter)}
                        >
                          {label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Tooltip>
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="relative size-8">
                          <IconCalendar className="h-4 w-4" />
                          {taxYearFilter !== "all" && (
                            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Tax Year</TooltipContent>
                    <DropdownMenuContent align="start" className="w-40">
                      <DropdownMenuLabel>Tax Year</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuCheckboxItem
                        checked={taxYearFilter === "all"}
                        onCheckedChange={() => setTaxYearFilter("all")}
                      >
                        All tax years
                      </DropdownMenuCheckboxItem>
                      {taxYearOptions.map((year) => (
                        <DropdownMenuCheckboxItem
                          key={year}
                          checked={taxYearFilter === `${year}`}
                          onCheckedChange={() => setTaxYearFilter(`${year}` as TaxYearFilter)}
                        >
                          {year}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Tooltip>
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="relative size-8">
                          <IconShieldCheck className="h-4 w-4" />
                          {readinessFilter !== "all" && (
                            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Readiness</TooltipContent>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuLabel>Readiness</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {([
                        ["all", "All"],
                        ["ready", "Ready"],
                        ["missing", "Missing Fields"],
                        ["needs_form", "Needs Form"],
                      ] as const).map(([value, label]) => (
                        <DropdownMenuCheckboxItem
                          key={value}
                          checked={readinessFilter === value}
                          onCheckedChange={() => setReadinessFilter(value as ReadinessFilter)}
                        >
                          {label}
                        </DropdownMenuCheckboxItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Tooltip>
              </div>
              <div className="flex items-center gap-2">
                {selectedCount > 0 && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteSelected}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete ({selectedCount})
                  </Button>
                )}
                <Tooltip>
                  <DropdownMenu>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="size-8">
                          <IconLayoutColumns className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Columns</TooltipContent>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {table
                        .getAllColumns()
                        .filter(
                          (column) =>
                            typeof column.accessorFn !== "undefined" && column.getCanHide()
                        )
                        .map((column) => (
                          <DropdownMenuCheckboxItem
                            key={column.id}
                            className="capitalize"
                            checked={column.getIsVisible()}
                            onCheckedChange={(value) => column.toggleVisibility(!!value)}
                          >
                            {column.id}
                          </DropdownMenuCheckboxItem>
                        ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </Tooltip>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted sticky top-0 z-10">
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id} colSpan={header.colSpan}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {isLoading || !data ? (
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
                  ) : table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow
                        key={row.id}
                        data-state={row.getIsSelected() && "selected"}
                        className="group/row cursor-pointer"
                        onClick={() => navigateWithTransition(`/org/${orgId}/returns/${row.original.id}`, "nav-forward")}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                        {searchQuery || statusFilter || jurisdictionFilter !== "all" || taxYearFilter !== "all" || readinessFilter !== "all"
                          ? "No returns match your filters."
                          : "No returns found. Run a sync job to import returns."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4">
              <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
                {selectedCount} of{" "}
                {isReadinessActive ? filteredReturns.length : (data?.total ?? 0)} row(s) selected.
              </div>
              <div className="flex w-full items-center gap-8 lg:w-fit">
                <div className="hidden items-center gap-2 lg:flex">
                  <Label htmlFor="rows-per-page" className="text-sm font-medium">
                    Rows per page
                  </Label>
                  <Select
                    value={`${table.getState().pagination.pageSize}`}
                    onValueChange={(value) => {
                      table.setPageSize(Number(value))
                    }}
                  >
                    <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                      <SelectValue placeholder={table.getState().pagination.pageSize} />
                    </SelectTrigger>
                    <SelectContent side="top">
                      {[10, 20, 30, 40, 50].map((size) => (
                        <SelectItem key={size} value={`${size}`}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex w-fit items-center justify-center text-sm font-medium">
                  Page {table.getState().pagination.pageIndex + 1} of{" "}
                  {table.getPageCount() || 1}
                </div>
                <div className="ml-auto flex items-center gap-2 lg:ml-0">
                  <Button
                    variant="outline"
                    className="hidden h-8 w-8 p-0 lg:flex"
                    onClick={() => table.setPageIndex(0)}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <span className="sr-only">Go to first page</span>
                    <IconChevronsLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="size-8"
                    size="icon"
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                  >
                    <span className="sr-only">Go to previous page</span>
                    <IconChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="size-8"
                    size="icon"
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                  >
                    <span className="sr-only">Go to next page</span>
                    <IconChevronRight />
                  </Button>
                  <Button
                    variant="outline"
                    className="hidden size-8 lg:flex"
                    size="icon"
                    onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                    disabled={!table.getCanNextPage()}
                  >
                    <span className="sr-only">Go to last page</span>
                    <IconChevronsRight />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </main>

        <SyncJobsDialog
          orgId={orgId}
          open={syncJobsDialogOpen}
          onOpenChange={handleSyncJobsDialogChange}
          initialJobId={selectedSyncJobId}
        />
    </DirectionalTransition>
  )
}
