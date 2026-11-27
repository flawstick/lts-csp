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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,

} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Loader2, Play, ExternalLink, Monitor, AlertCircle, Terminal, Search, X, Trash, Ban, RotateCcw } from "@/lib/icons"
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconLayoutColumns,
  IconCircleDot,
  IconGlobe,
  IconShieldCheck,
} from "@tabler/icons-react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import Link from "next/link"
import { api } from "@/trpc/react"
import { useParams } from "next/navigation"
import { DirectionalTransition } from "@/components/view-transition"
import { useNavigateWithTransition } from "@/lib/navigate-with-transition"
import { resolveGuernseyCertificateType } from "@repo/database/guernsey-filing"
import { formatAskedAgo, type TaskAttention } from "@/lib/task-attention"

type StatusFilter = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | "needs_input" | undefined
type JurisdictionFilter = "all" | "GG" | "JE"
type CertificateFilter = "all" | "Certificate 2" | "Certificate 3" | "unresolved"

type TaskRow = {
  id: string
  name: string
  taskType: string
  status: string
  createdAt: string
  jurisdiction: { code: string; name: string } | null
  taxReturn: {
    id: string
    entityName: string
    taxYear: number
    returnType: string | null
    metadata?: unknown
  } | null
  substanceForm: {
    isComplete: boolean
    missingFields: unknown
    certificateType?: string | null
  } | null
  /** What the latest run is waiting on (listTasks). */
  attention?: TaskAttention | null
}

/** How often the list (and the sidebar count) re-checks for new questions. */
const TASKS_REFETCH_INTERVAL_MS = 30_000

function matchesCertificateFilter(
  task: Pick<TaskRow, "jurisdiction" | "taxReturn" | "substanceForm">,
  certificateFilter: CertificateFilter,
) {
  if (certificateFilter === "all") {
    return true
  }

  if (
    task.jurisdiction?.code !== "GG" ||
    task.taxReturn?.returnType !== "economic_substance"
  ) {
    return false
  }

  const resolution = resolveGuernseyCertificateType({
    metadata:
      task.taxReturn?.metadata && typeof task.taxReturn.metadata === "object"
        ? (task.taxReturn.metadata as Record<string, unknown>)
        : null,
    savedCertificateType: task.substanceForm?.certificateType ?? null,
  })

  if (certificateFilter === "unresolved") {
    return resolution.unresolved
  }

  return resolution.certificateType === certificateFilter
}

function getStatusBadge(status: string, attention?: TaskAttention | null) {
  if (attention?.kind === "question") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/60 bg-amber-500/15 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300"
        title={`The filing agent asked a question ${formatAskedAgo(attention.askedAt)}`}
      >
        <span className="relative flex size-1.5" aria-hidden="true">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-500 opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-1.5 rounded-full bg-amber-500" />
        </span>
        Needs input
      </span>
    )
  }
  const styles: Record<string, string> = {
    completed: "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-400",
    queued: "border-yellow-500/50 bg-yellow-500/15 text-yellow-800 dark:border-yellow-500/35 dark:bg-yellow-500/10 dark:text-yellow-400",
    starting: "border-sky-500/50 bg-sky-500/15 text-sky-800 dark:border-sky-500/35 dark:bg-sky-500/10 dark:text-sky-400",
    running: "border-blue-500/50 bg-blue-500/15 text-blue-800 dark:border-blue-500/35 dark:bg-blue-500/10 dark:text-blue-400",
    in_progress: "border-blue-500/50 bg-blue-500/15 text-blue-800 dark:border-blue-500/35 dark:bg-blue-500/10 dark:text-blue-400",
    paused: "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-400",
    failed: "border-rose-500/50 bg-rose-500/15 text-rose-800 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-400",
    cancelled: "border-zinc-500/50 bg-zinc-500/15 text-zinc-700 dark:border-zinc-500/35 dark:bg-zinc-500/10 dark:text-zinc-500",
    pending: "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-400",
  }
  const labels: Record<string, string> = {
    completed: "Completed",
    queued: "Queued",
    starting: "Starting",
    running: "Running",
    in_progress: "Running",
    paused: "Paused",
    failed: "Failed",
    cancelled: "Cancelled",
    pending: "Pending",
  }
  const cls = styles[status] ?? styles.pending
  const label = labels[status] ?? labels.pending
  return (
    <span className={`inline-flex rounded-lg border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  )
}

function getTaskTypeLabel(type: string) {
  return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

const createColumns = (orgId: string): ColumnDef<TaskRow>[] => [
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
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => {
      const attention = row.original.attention
      return (
        <div className="flex max-w-[28rem] min-w-0 flex-col">
          <span className="font-medium">{row.original.name}</span>
          {attention?.kind === "question" && (
            <span
              className="text-muted-foreground truncate text-xs"
              title={attention.text}
              data-testid="task-question-preview"
            >
              <span className="sr-only">Agent question: </span>
              {attention.preview}
            </span>
          )}
        </div>
      )
    },
    enableHiding: false,
  },
  {
    accessorKey: "taskType",
    header: "Type",
    cell: ({ row }) => (
      <Badge variant="outline">{getTaskTypeLabel(row.original.taskType)}</Badge>
    ),
  },
  {
    accessorKey: "jurisdiction",
    header: "Jurisdiction",
    cell: ({ row }) => (
      <Badge variant="outline">
        {row.original.jurisdiction?.code || "\u2014"}
      </Badge>
    ),
  },
  {
    accessorKey: "createdAt",
    header: "Created",
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString(),
  },
  {
    id: "relatedReturn",
    header: "Related Return",
    cell: ({ row }) => {
      const task = row.original
      if (task.taxReturn) {
        return (
          <Link
            href={`/org/${orgId}/returns/${task.taxReturn.id}`}
            className="flex items-center gap-1 hover:underline text-primary"
            onClick={(e) => e.stopPropagation()}
          >
            {task.taxReturn.entityName}
            <ExternalLink className="h-3 w-3" />
          </Link>
        )
      }
      return <span className="text-muted-foreground">{"\u2014"}</span>
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => getStatusBadge(row.original.status, row.original.attention),
  },
  {
    id: "actions",
    cell: () => null, // Rendered inline in the row for Dialog support
    enableHiding: false,
  },
]

export default function TasksPage() {
  const params = useParams()
  const navigateWithTransition = useNavigateWithTransition()
  const orgId = params?.orgId as string

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>(undefined)
  const [certificateFilter, setCertificateFilter] = React.useState<CertificateFilter>("all")
  const [jurisdictionFilter, setJurisdictionFilter] = React.useState<JurisdictionFilter>("all")
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false)
  const [taskToDelete, setTaskToDelete] = React.useState<string | null>(null)
  const [detailTask, setDetailTask] = React.useState<TaskRow | null>(null)
  const [isRefetching, setIsRefetching] = React.useState(false)
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [rowSelection, setRowSelection] = React.useState({})
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
  }, [jurisdictionFilter, statusFilter, certificateFilter])

  const { data, isLoading, refetch } = api.taxReturn.listTasks.useQuery({
    orgId,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize,
    jurisdictionCode:
      jurisdictionFilter === "all" ? undefined : jurisdictionFilter,
    status: statusFilter,
    certificateType:
      certificateFilter === "all" ? undefined : certificateFilter,
    search: debouncedSearch || undefined,
  }, {
    enabled: !!orgId,
    // New agent questions appear without a manual refresh.
    refetchInterval: TASKS_REFETCH_INTERVAL_MS,
  })

  const deleteTasksMutation = api.taxReturn.deleteTasks.useMutation({
    onSuccess: () => {
      setRowSelection({})
      refetch()
    }
  })

  const handleRefetch = async () => {
    setIsRefetching(true)
    await refetch()
    setTimeout(() => setIsRefetching(false), 500)
  }

  const handleDeleteSelected = () => {
    setTaskToDelete(null)
    setDeleteDialogOpen(true)
  }

  const handleDeleteSingle = (id: string) => {
    setTaskToDelete(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (taskToDelete) {
      deleteTasksMutation.mutate([taskToDelete])
    } else {
      const selectedIds = table.getSelectedRowModel().rows.map(r => r.original.id)
      deleteTasksMutation.mutate(selectedIds)
    }
    setDeleteDialogOpen(false)
    setTaskToDelete(null)
  }

  const columns = React.useMemo(() => createColumns(orgId), [orgId])

  const table = useReactTable({
    data: (data?.tasks as TaskRow[] | undefined) ?? [],
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      pagination,
    },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    manualPagination: true,
    pageCount: data?.totalPages ?? 1,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const selectedCount = table.getSelectedRowModel().rows.length
  // The open detail panel follows the periodic refetch (a question can be
  // asked or answered while it is open).
  const liveDetailTask = detailTask
    ? ((data?.tasks as TaskRow[] | undefined)?.find((task) => task.id === detailTask.id) ?? detailTask)
    : null

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
                <BreadcrumbPage>Processing Tasks</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </PageHeader>

        <main className="flex-1 overflow-auto">
        <div className="flex flex-1 flex-col gap-6 p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">Processing Tasks</h2>
              <p className="text-sm text-muted-foreground">
                Monitor and manage automated processing tasks.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="relative min-w-[220px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
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
                        <Button variant="outline" size="icon" className="relative size-8" aria-label="Filter by status">
                          <IconCircleDot className="h-4 w-4" />
                          {statusFilter && (
                            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Status</TooltipContent>
                    <DropdownMenuContent align="start" className="w-44">
                      <DropdownMenuLabel>Status</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {([
                      ["all", "All statuses"],
                      ["needs_input", "Needs input"],
                      ["pending", "Pending"],
                      ["in_progress", "Running"],
                      ["completed", "Completed"],
                      ["failed", "Failed"],
                      ["cancelled", "Cancelled"],
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
                        <Button variant="outline" size="icon" className="relative size-8" aria-label="Filter by jurisdiction">
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
                        <Button variant="outline" size="icon" className="relative size-8" aria-label="Filter by certificate type">
                          <IconShieldCheck className="h-4 w-4" />
                          {certificateFilter !== "all" && (
                            <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Certificate Type</TooltipContent>
                    <DropdownMenuContent align="start" className="w-48">
                      <DropdownMenuLabel>Certificate Type</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {([
                        ["all", "All certificates"],
                        ["Certificate 2", "Certificate 2"],
                        ["Certificate 3", "Certificate 3"],
                        ["unresolved", "Unresolved"],
                      ] as const).map(([value, label]) => (
                        <DropdownMenuCheckboxItem
                          key={value}
                          checked={certificateFilter === value}
                          onCheckedChange={() =>
                            setCertificateFilter(value as CertificateFilter)
                          }
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
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-8"
                      onClick={handleRefetch}
                      disabled={isRefetching}
                      aria-label="Refresh tasks"
                    >
                      <RotateCcw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh tasks</p>
                  </TooltipContent>
                </Tooltip>
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

            <div className="relative flex flex-col gap-4 overflow-auto">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader className="bg-muted sticky top-0 z-10">
                    {table.getHeaderGroups().map((headerGroup) => (
                      <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                          <TableHead key={header.id} colSpan={header.colSpan}>
                            {header.id === "actions" ? (
                              <span className="sr-only">Actions</span>
                            ) : header.isPlaceholder ? null : (
                              flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    ))}
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                          <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : table.getRowModel().rows?.length ? (
                      table.getRowModel().rows.map((row) => {
                        const task = row.original
                        return (
                          <TableRow
                            key={row.id}
                            data-state={row.getIsSelected() && "selected"}
                            className="group/row cursor-pointer"
                            onClick={() => navigateWithTransition(`/org/${orgId}/tasks/${task.id}`, "nav-forward")}
                          >
                            {row.getVisibleCells().map((cell) => {
                              // Render the actions column with Dialog support
                              if (cell.column.id === "actions") {
                                return (
                                  <TableCell key={cell.id} className="text-right" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-2">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            className="data-[state=open]:bg-muted text-muted-foreground flex size-8"
                                            size="icon"
                                          >
                                            <IconDotsVertical />
                                            <span className="sr-only">Open menu</span>
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-40">
                                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                          <DropdownMenuItem asChild>
                                            <Link href={`/org/${orgId}/tasks/${task.id}`}>
                                              <Monitor className="mr-2 h-4 w-4" />
                                              Open Task
                                            </Link>
                                          </DropdownMenuItem>
                                          <DropdownMenuItem onSelect={() => setDetailTask(task)}>
                                            <ExternalLink className="mr-2 h-4 w-4" />
                                            View Details
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            variant="destructive"
                                            onClick={() => handleDeleteSingle(task.id)}
                                          >
                                            <Trash className="mr-2 h-4 w-4" />
                                            Delete
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </TableCell>
                                )
                              }
                              return (
                                <TableCell key={cell.id}>
                                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={columns.length} className="h-64 text-center text-muted-foreground">
                          <div className="flex flex-col items-center justify-center">
                            <Terminal className="h-12 w-12 mb-4 opacity-20" />
                            <p>No tasks found.</p>
                            <Button variant="link" asChild className="mt-2">
                              <Link href={`/org/${orgId}/returns`}>Go to Returns to create a task</Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between px-4">
                <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
                  {selectedCount} of{" "}
                  {data?.total ?? data?.tasks?.length ?? 0} row(s) selected.
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
                    Page {(data?.page ?? 1)} of{" "}
                    {(data?.totalPages ?? 1) || 1}
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
        </div>
        </main>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {taskToDelete ? "Task" : `${selectedCount} Tasks`}?</AlertDialogTitle>
              <AlertDialogDescription>
                {taskToDelete
                  ? "This action cannot be undone. This will permanently delete the task and all associated data."
                  : `This action cannot be undone. This will permanently delete ${selectedCount} selected tasks and all associated data.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setDeleteDialogOpen(false); setTaskToDelete(null); }}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleteTasksMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash className="mr-2 h-4 w-4" />
                    Delete
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={!!liveDetailTask} onOpenChange={(open) => { if (!open) setDetailTask(null) }}>
          <DialogContent className="max-w-2xl">
            {liveDetailTask && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {liveDetailTask.name}
                    {getStatusBadge(liveDetailTask.status, liveDetailTask.attention)}
                  </DialogTitle>
                  <DialogDescription>
                    Task ID: <span className="font-mono text-xs">{liveDetailTask.id}</span>
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {liveDetailTask.attention?.kind === "question" && (
                    <div
                      className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4"
                      role="status"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-medium text-amber-900 dark:text-amber-300">
                          {liveDetailTask.attention.reason === "filing_contact"
                            ? "The filing agent needs the filing contact"
                            : "The filing agent asked a question"}
                        </h4>
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {formatAskedAgo(liveDetailTask.attention.askedAt)}
                        </span>
                      </div>
                      <p className="max-h-48 overflow-y-auto text-sm leading-relaxed break-words" data-testid="task-question-text">
                        {liveDetailTask.attention.text}
                      </p>
                      <div className="flex justify-end pt-1">
                        <Button size="sm" asChild>
                          <Link href={`/org/${orgId}/tasks/${liveDetailTask.id}`}>
                            Answer in task
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}
                  {liveDetailTask.attention?.kind === "paused" && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm" role="status">
                      The run is paused. Open the task to resume it or send the agent an instruction.
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Task Type</h4>
                      <p>{getTaskTypeLabel(liveDetailTask.taskType)}</p>
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium text-muted-foreground">Created At</h4>
                      <p>{new Date(liveDetailTask.createdAt).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                    <h4 className="text-sm font-medium">Associated Tax Return</h4>
                    {liveDetailTask.taxReturn ? (
                      <div className="grid gap-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Entity:</span>
                          <span className="font-medium">{liveDetailTask.taxReturn.entityName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tax Year:</span>
                          <span>{liveDetailTask.taxReturn.taxYear}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Jurisdiction:</span>
                          <span>{liveDetailTask.jurisdiction?.name || "\u2014"}</span>
                        </div>
                        <div className="pt-2 mt-2 border-t flex justify-end">
                          <Button variant="secondary" size="sm" asChild>
                            <Link href={`/org/${orgId}/returns/${liveDetailTask.taxReturn.id}`}>
                              View Return
                            </Link>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No tax return associated.</p>
                    )}
                  </div>

                  {liveDetailTask.substanceForm && (
                    <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">Substance Form Status</h4>
                        {liveDetailTask.substanceForm.isComplete ? (
                          <span className="inline-flex rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-400">
                            Complete
                          </span>
                        ) : (
                          <span className="inline-flex rounded-lg border border-amber-500/50 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-400">
                            {(liveDetailTask.substanceForm.missingFields as string[])?.length ?? 0} Fields Missing
                          </span>
                        )}
                      </div>
                      <div className="pt-2 flex justify-end">
                        <Button variant="secondary" size="sm" asChild>
                          <Link href={`/org/${orgId}/tasks/${liveDetailTask.id}/substance-form`}>
                            View Form
                          </Link>
                        </Button>
                      </div>
                    </div>
                  )}

                  {liveDetailTask.status === "pending" && (
                    <div className="flex items-center gap-2 p-3 bg-blue-500/10 text-blue-700 rounded-md text-sm border border-blue-500/20">
                      <Play className="h-4 w-4" />
                      Ready to start processing.
                    </div>
                  )}
                </div>
                <DialogFooter className="gap-2 sm:gap-0">
                  {(liveDetailTask.status === "in_progress" ||
                    liveDetailTask.status === "running" ||
                    liveDetailTask.status === "queued" ||
                    liveDetailTask.status === "starting" ||
                    liveDetailTask.status === "paused") && (
                    <Button className="w-full sm:w-auto" asChild>
                      <Link href={`/org/${orgId}/tasks/${liveDetailTask.id}`}>
                        <Monitor className="h-4 w-4 mr-2" />
                        {liveDetailTask.status === "paused" ? "Open Task" : "View Live Stream"}
                      </Link>
                    </Button>
                  )}
                  {liveDetailTask.status === "pending" && (
                    <>
                      <Button variant="destructive" className="w-full sm:w-auto sm:mr-auto">
                        <Ban className="h-4 w-4 mr-2" />
                        Cancel Task
                      </Button>
                      {liveDetailTask.substanceForm && !liveDetailTask.substanceForm.isComplete ? (
                        <Button disabled className="w-full sm:w-auto">
                          <AlertCircle className="h-4 w-4 mr-2" />
                          Missing fields
                        </Button>
                      ) : (
                        <Button className="w-full sm:w-auto" asChild>
                          <Link href={`/org/${orgId}/tasks/${liveDetailTask.id}`}>
                            <Play className="h-4 w-4 mr-2" />
                            Open & Start
                          </Link>
                        </Button>
                      )}
                    </>
                  )}
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
    </DirectionalTransition>
  )
}
