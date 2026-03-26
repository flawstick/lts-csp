"use client"

import * as React from "react"
import Link from "next/link"
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconDotsVertical,
  IconExternalLink,
  IconLayoutColumns,
  IconLoader,
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

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api } from "@/trpc/react"

type TaxReturn = {
  id: string
  entityName: string
  taxYear: number
  status: string
  returnType: string | null
  externalId: string | null
  link: string | null
  isSubstanceComplete: boolean | null
  missingSubstanceFieldCount: number
  jurisdiction: { code: string } | null
}

const createColumns = (orgId: string): ColumnDef<TaxReturn>[] => [
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
      <div className="flex items-center justify-center">
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
      <Link
        href={`/org/${orgId}/returns/${row.original.id}`}
        className="font-medium hover:underline hover:text-primary transition-colors"
      >
        {row.original.entityName}
      </Link>
    ),
    enableHiding: false,
  },
  {
    accessorKey: "jurisdiction",
    header: "Jurisdiction",
    cell: ({ row }) => (
      <Badge variant="outline" className="text-muted-foreground px-1.5">
        {row.original.jurisdiction?.code || "—"}
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
        {row.original.externalId || "—"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const status = row.original.status
      switch (status) {
        case "completed":
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <IconCircleCheckFilled className="fill-green-500 dark:fill-green-400" />
              Completed
            </Badge>
          )
        case "in_progress":
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <IconLoader className="animate-spin" />
              In Progress
            </Badge>
          )
        case "review_required":
          return (
            <Badge variant="outline" className="text-orange-600 px-1.5">
              <IconLoader />
              Review
            </Badge>
          )
        case "failed":
          return (
            <Badge variant="outline" className="text-red-600 px-1.5">
              Failed
            </Badge>
          )
        case "dismissed":
          return (
            <Badge variant="outline" className="text-zinc-500 px-1.5">
              Dismissed
            </Badge>
          )
        default:
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <IconLoader />
              Awaiting Automation
            </Badge>
          )
      }
    },
  },
  {
    id: "readiness",
    header: "Readiness",
    cell: ({ row }) => {
      if (row.original.isSubstanceComplete) {
        return (
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 px-1.5 text-emerald-700">
            Ready
          </Badge>
        )
      }

      if ((row.original.missingSubstanceFieldCount ?? 0) > 0) {
        return (
          <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 px-1.5 text-violet-700">
            {row.original.missingSubstanceFieldCount} Missing
          </Badge>
        )
      }

      return (
        <Badge variant="outline" className="border-slate-500/30 bg-slate-500/10 px-1.5 text-slate-700">
          Needs Form
        </Badge>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row }) => (
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
        <DropdownMenuContent align="end" className="w-32">
          <DropdownMenuItem asChild>
            <Link href={`/org/${orgId}/returns/${row.original.id}`}>View Details</Link>
          </DropdownMenuItem>
          {row.original.link && (
            <DropdownMenuItem asChild>
              <a href={row.original.link} target="_blank" rel="noopener noreferrer">
                <IconExternalLink className="mr-2 h-4 w-4" />
                Portal
              </a>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
]

type StatusFilter =
  | "all"
  | "pending"
  | "in_progress"
  | "review_required"
  | "completed"
  | "failed"
  | "dismissed"
type JurisdictionFilter = "all" | "GG" | "JE"
type TaxYearFilter = "all" | `${number}`

interface ReturnsDataTableProps {
  orgId: string
}

export function ReturnsDataTable({ orgId }: ReturnsDataTableProps) {
  const currentCalendarYear = React.useMemo(() => new Date().getUTCFullYear(), [])
  const defaultTaxYear = `${currentCalendarYear - 1}` as TaxYearFilter
  const [searchQuery, setSearchQuery] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all")
  const [jurisdictionFilter, setJurisdictionFilter] =
    React.useState<JurisdictionFilter>("all")
  const [taxYearFilter, setTaxYearFilter] =
    React.useState<TaxYearFilter>(defaultTaxYear)
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchQuery.trim())
      setPagination((current) => ({ ...current, pageIndex: 0 }))
    }, 250)

    return () => window.clearTimeout(timer)
  }, [searchQuery])

  const { data, isLoading } = api.taxReturn.list.useQuery(
    {
      orgId,
      page: pagination.pageIndex + 1,
      pageSize: pagination.pageSize,
      jurisdictionCode:
        jurisdictionFilter === "all" ? undefined : jurisdictionFilter,
      taxYear: taxYearFilter === "all" ? undefined : Number(taxYearFilter),
      status: statusFilter === "all" ? undefined : statusFilter,
      search: debouncedSearch || undefined,
    },
    { refetchOnWindowFocus: false },
  )

  const taxYearOptions = React.useMemo(
    () =>
      Array.from({ length: 8 }, (_, index) => currentCalendarYear - index),
    [currentCalendarYear],
  )

  const columns = React.useMemo(() => createColumns(orgId), [orgId])

  const table = useReactTable({
    data: data?.returns ?? [],
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

  // Reset pagination when filter changes
  React.useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }))
    setRowSelection({})
  }, [jurisdictionFilter, statusFilter, taxYearFilter])

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    statusFilter !== "all" ||
    jurisdictionFilter !== "all" ||
    taxYearFilter !== "all"

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full min-w-[220px] max-w-sm">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search name or external ID"
              className="h-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger size="sm" className="w-[180px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Awaiting automation</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="review_required">Review Required</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="dismissed">Dismissed</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={jurisdictionFilter}
            onValueChange={(value) =>
              setJurisdictionFilter(value as JurisdictionFilter)
            }
          >
            <SelectTrigger size="sm" className="w-[170px]">
              <SelectValue placeholder="All jurisdictions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All jurisdictions</SelectItem>
              <SelectItem value="GG">Guernsey</SelectItem>
              <SelectItem value="JE">Jersey</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={taxYearFilter}
            onValueChange={(value) => setTaxYearFilter(value as TaxYearFilter)}
          >
            <SelectTrigger size="sm" className="w-[140px]">
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
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Customize Columns</span>
                <span className="lg:hidden">Columns</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" && column.getCanHide()
                )
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) => column.toggleVisibility(!!value)}
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/org/${orgId}/returns`}>
              View All
            </Link>
          </Button>
        </div>
      </div>
      <div className="relative flex flex-col gap-4 overflow-auto px-4 lg:px-6">
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted sticky top-0 z-10">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    )
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-12" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
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
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {hasActiveFilters
                      ? "No returns match the current filters."
                      : "No returns found. Sync from the portal to get started."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {table.getSelectedRowModel().rows.length} of{" "}
            {data?.total ?? 0} row(s) selected.
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
                  {[10, 20, 30, 40, 50].map((pageSize) => (
                    <SelectItem key={pageSize} value={`${pageSize}`}>
                      {pageSize}
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
  )
}
