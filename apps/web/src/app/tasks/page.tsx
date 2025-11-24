"use client"

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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { Loader2, Play, ExternalLink, Monitor, AlertCircle, CheckCircle2, XCircle, Terminal, Search, X, MoreHorizontal, Trash, ChevronLeft, ChevronRight, Ban, RotateCcw } from "lucide-react"
import Link from "next/link"
import { api } from "@/trpc/react"
import { useState, useEffect } from "react"

type StatusFilter = "pending" | "in_progress" | "completed" | "failed" | "cancelled" | undefined

export default function TasksPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(undefined)
  const [searchQuery, setSearchQuery] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  
  const pageSize = 20

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery)
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset page when filter changes
  useEffect(() => {
    setPage(1)
    setSelected(new Set())
  }, [statusFilter])
  
  const { data, isLoading, refetch } = api.taxReturn.listTasks.useQuery({
    page,
    pageSize,
    status: statusFilter,
    search: debouncedSearch || undefined,
  })

  const deleteTasksMutation = api.taxReturn.deleteTasks.useMutation({
    onSuccess: () => {
      setSelected(new Set())
      refetch()
    }
  })

  const handleDeleteSelected = () => {
    if (confirm(`Are you sure you want to delete ${selected.size} tasks?`)) {
      deleteTasksMutation.mutate(Array.from(selected))
    }
  }

  const handleDeleteSingle = (id: string) => {
    if (confirm("Are you sure you want to delete this task?")) {
      deleteTasksMutation.mutate([id])
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    if (checked && data) {
      const allIds = data.tasks.map(t => t.id)
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">Completed</Badge>
      case "running":
      case "in_progress":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 hover:bg-blue-500/20">Running</Badge>
      case "failed":
        return <Badge className="bg-red-500/10 text-red-600 border-red-500/20 hover:bg-red-500/20">Failed</Badge>
      case "cancelled":
        return <Badge variant="secondary">Cancelled</Badge>
      default:
        return <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 hover:bg-yellow-500/20">Pending</Badge>
    }
  }

  const getTaskTypeLabel = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
  }

  const isAllSelected = data?.tasks.length ? data.tasks.every(t => selected.has(t.id)) : false

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
                  <BreadcrumbPage>Processing Tasks</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-6 bg-muted/10 min-h-[calc(100vh-4rem)]">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">Processing Tasks</h2>
              <p className="text-sm text-muted-foreground">
                Monitor and manage automated processing tasks.
              </p>
            </div>
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 bg-background p-1 rounded-lg border shadow-sm">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search tasks..."
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
                    <SelectItem value="in_progress">Running</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
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

            <div className="rounded-md border bg-background">
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
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Related Return</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : !data?.tasks || data.tasks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="h-64 text-center text-muted-foreground">
                        <div className="flex flex-col items-center justify-center">
                          <Terminal className="h-12 w-12 mb-4 opacity-20" />
                          <p>No tasks found.</p>
                          <Button variant="link" asChild className="mt-2">
                            <Link href="/returns">Go to Returns to create a task</Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.tasks.map((task) => (
                      <TableRow key={task.id} data-state={selected.has(task.id) && "selected"}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(task.id)}
                            onCheckedChange={(checked) => toggleSelectRow(task.id, !!checked)}
                            aria-label="Select row"
                          />
                        </TableCell>
                        <TableCell className="font-medium">{task.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{getTaskTypeLabel(task.taskType)}</Badge>
                        </TableCell>
                        <TableCell>{new Date(task.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          {task.taxReturn ? (
                            <Link 
                              href={`/returns/${task.taxReturn.id}`}
                              className="flex items-center gap-1 hover:underline text-primary"
                            >
                              {task.taxReturn.entityName}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>{getStatusBadge(task.status)}</TableCell>
                        <TableCell className="text-right">
                          <Dialog>
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
                                  <Link href={`/tasks/${task.id}`}>
                                    <Monitor className="mr-2 h-4 w-4" />
                                    Open Task
                                  </Link>
                                </DropdownMenuItem>
                                <DialogTrigger asChild>
                                  <DropdownMenuItem>
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    View Details
                                  </DropdownMenuItem>
                                </DialogTrigger>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-red-600 focus:text-red-600"
                                  onClick={() => handleDeleteSingle(task.id)}
                                >
                                  <Trash className="mr-2 h-4 w-4" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>

                            <DialogContent className="max-w-2xl">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  {task.name}
                                  {getStatusBadge(task.status)}
                                </DialogTitle>
                                <DialogDescription>
                                  Task ID: <span className="font-mono text-xs">{task.id}</span>
                                </DialogDescription>
                              </DialogHeader>
                              <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-1">
                                    <h4 className="text-sm font-medium text-muted-foreground">Task Type</h4>
                                    <p>{getTaskTypeLabel(task.taskType)}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <h4 className="text-sm font-medium text-muted-foreground">Created At</h4>
                                    <p>{new Date(task.createdAt).toLocaleString()}</p>
                                  </div>
                                </div>
                                
                                <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                                  <h4 className="text-sm font-medium">Associated Tax Return</h4>
                                  {task.taxReturn ? (
                                    <div className="grid gap-2 text-sm">
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Entity:</span>
                                        <span className="font-medium">{task.taxReturn.entityName}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Tax Year:</span>
                                        <span>{task.taxReturn.taxYear}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-muted-foreground">Jurisdiction:</span>
                                        <span>Guernsey</span>
                                      </div>
                                      <div className="pt-2 mt-2 border-t flex justify-end">
                                        <Button variant="secondary" size="sm" asChild>
                                          <Link href={`/returns/${task.taxReturn.id}`}>
                                            View Return
                                          </Link>
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-muted-foreground">No tax return associated.</p>
                                  )}
                                </div>

                                {task.substanceForm && (
                                  <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                                    <div className="flex items-center justify-between">
                                      <h4 className="text-sm font-medium">Substance Form Status</h4>
                                      {task.substanceForm.isComplete ? (
                                        <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Complete</Badge>
                                      ) : (
                                        <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">
                                          {(task.substanceForm.missingFields as string[])?.length ?? 0} Fields Missing
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="pt-2 flex justify-end">
                                      <Button variant="secondary" size="sm" asChild>
                                        <Link href={`/tasks/${task.id}/substance-form`}>
                                          View Form
                                        </Link>
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {task.status === "pending" && (
                                  <div className="flex items-center gap-2 p-3 bg-blue-500/10 text-blue-700 rounded-md text-sm border border-blue-500/20">
                                    <Play className="h-4 w-4" />
                                    Ready to start processing.
                                  </div>
                                )}
                              </div>
                              <DialogFooter className="gap-2 sm:gap-0">
                                {task.status === "in_progress" && (
                                  <Button className="w-full sm:w-auto" asChild>
                                    <Link href={`/tasks/${task.id}`}>
                                      <Monitor className="h-4 w-4 mr-2" />
                                      View Live Stream
                                    </Link>
                                  </Button>
                                )}
                                {task.status === "pending" && (
                                  <>
                                    <Button variant="destructive" className="w-full sm:w-auto sm:mr-auto">
                                      <Ban className="h-4 w-4 mr-2" />
                                      Cancel Task
                                    </Button>
                                    {task.substanceForm && !task.substanceForm.isComplete ? (
                                      <Button disabled className="w-full sm:w-auto">
                                        <AlertCircle className="h-4 w-4 mr-2" />
                                        Missing fields
                                      </Button>
                                    ) : (
                                      <Button className="w-full sm:w-auto" asChild>
                                        <Link href={`/tasks/${task.id}`}>
                                          <Play className="h-4 w-4 mr-2" />
                                          Open & Start
                                        </Link>
                                      </Button>
                                    )}
                                  </>
                                )}
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
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
      </SidebarInset>
    </SidebarProvider>
  )
}
