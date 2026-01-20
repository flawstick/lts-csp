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
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table"
import { Loader2 } from "@/lib/icons"

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
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import { api } from "@/trpc/react"

type TaxReturn = {
  id: string
  entityName: string
  taxYear: number
  status: string
  externalId: string | null
  link: string | null
  jurisdiction: { code: string } | null
}

const columns: ColumnDef<TaxReturn>[] = [
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
        href={`/returns/${row.original.id}`}
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
        default:
          return (
            <Badge variant="outline" className="text-muted-foreground px-1.5">
              <IconLoader />
              Pending
            </Badge>
          )
      }
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
            <Link href={`/returns/${row.original.id}`}>View Details</Link>
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

type FilterValue = "all" | "pending" | "review" | "completed"

interface ReturnsDataTableProps {
  orgId: string
}

export function ReturnsDataTable({ orgId }: ReturnsDataTableProps) {
  const { data, isLoading } = api.taxReturn.list.useQuery(
    { orgId, page: 1, pageSize: 50 },
    { refetchOnWindowFocus: false }
  )

  const [filter, setFilter] = React.useState<FilterValue>("all")
  const [rowSelection, setRowSelection] = React.useState({})
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>({})
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([])
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  })

  const filteredData = React.useMemo(() => {
    const returns = data?.returns || []
    switch (filter) {
      case "pending":
        return returns.filter(r => r.status === "pending")
      case "review":
        return returns.filter(r => r.status === "review_required")
      case "completed":
        return returns.filter(r => r.status === "completed")
      default:
        return returns
    }
  }, [data, filter])

  const counts = React.useMemo(() => {
    const returns = data?.returns || []
    return {
      pending: returns.filter(r => r.status === "pending").length,
      review: returns.filter(r => r.status === "review_required").length,
      completed: returns.filter(r => r.status === "completed").length,
    }
  }, [data])

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id,
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  // Reset pagination when filter changes
  React.useEffect(() => {
    setPagination(p => ({ ...p, pageIndex: 0 }))
  }, [filter])

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="flex items-center justify-between px-4 lg:px-6">
        <Select value={filter} onValueChange={(v) => setFilter(v as FilterValue)}>
          <SelectTrigger
            className="flex w-fit @4xl/main:hidden"
            size="sm"
          >
            <SelectValue placeholder="Select a view" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Returns</SelectItem>
            <SelectItem value="pending">Pending ({counts.pending})</SelectItem>
            <SelectItem value="review">Review ({counts.review})</SelectItem>
            <SelectItem value="completed">Completed ({counts.completed})</SelectItem>
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => v && setFilter(v as FilterValue)}
          variant="outline"
          className="hidden @4xl/main:flex"
        >
          <ToggleGroupItem value="all">All Returns</ToggleGroupItem>
          <ToggleGroupItem value="pending">
            Pending <Badge variant="secondary" className="ml-1">{counts.pending}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="review">
            Review <Badge variant="secondary" className="ml-1">{counts.review}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="completed">Completed</ToggleGroupItem>
        </ToggleGroup>
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
            <Link href="/returns">
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
                    {filter === "all"
                      ? "No returns found. Sync from the portal to get started."
                      : `No ${filter} returns found.`}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-between px-4">
          <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
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
  )
}
