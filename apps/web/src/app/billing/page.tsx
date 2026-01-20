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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Loader2,
  Plus,
  FileText,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  Send,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Receipt,
} from "@/lib/icons"
import { api } from "@/trpc/react"
import { Skeleton } from "@/components/ui/skeleton"

type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled"

export default function BillingPage() {
  const [page, setPage] = React.useState(1)
  const [statusFilter, setStatusFilter] = React.useState<InvoiceStatus | "all">("all")
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false)
  const [selectedOrgId, setSelectedOrgId] = React.useState<string>("")
  const [invoiceNumber, setInvoiceNumber] = React.useState("")
  const [amount, setAmount] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [dueDate, setDueDate] = React.useState("")

  const pageSize = 20

  const utils = api.useUtils()

  const { data: invoicesData, isLoading, isError, error } = api.invoice.list.useQuery(
    {
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: pageSize,
      offset: (page - 1) * pageSize,
    },
    { refetchOnWindowFocus: false }
  )

  const { data: orgsData } = api.invoice.getOrganisations.useQuery(undefined, {
    enabled: createDialogOpen,
  })

  const { data: nextInvoiceNumber } = api.invoice.getNextInvoiceNumber.useQuery(undefined, {
    enabled: createDialogOpen,
  })

  const createMutation = api.invoice.create.useMutation({
    onSuccess: () => {
      setCreateDialogOpen(false)
      resetForm()
      utils.invoice.list.invalidate()
      utils.invoice.getNextInvoiceNumber.invalidate()
    },
  })

  const markPaidMutation = api.invoice.markPaid.useMutation({
    onSuccess: () => {
      utils.invoice.list.invalidate()
    },
  })

  const updateMutation = api.invoice.update.useMutation({
    onSuccess: () => {
      utils.invoice.list.invalidate()
    },
  })

  const deleteMutation = api.invoice.delete.useMutation({
    onSuccess: () => {
      utils.invoice.list.invalidate()
    },
  })

  React.useEffect(() => {
    if (nextInvoiceNumber && !invoiceNumber) {
      setInvoiceNumber(nextInvoiceNumber)
    }
  }, [nextInvoiceNumber, invoiceNumber])

  const resetForm = () => {
    setSelectedOrgId("")
    setInvoiceNumber("")
    setAmount("")
    setDescription("")
    setDueDate("")
  }

  const handleCreate = () => {
    if (!selectedOrgId || !invoiceNumber || !amount) return

    createMutation.mutate({
      orgId: selectedOrgId,
      invoiceNumber,
      amount: Math.round(parseFloat(amount) * 100), // Convert to pence
      description: description || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      status: "draft",
    })
  }

  const handleMarkPaid = (id: string) => {
    markPaidMutation.mutate({ id })
  }

  const handleSendInvoice = (id: string) => {
    updateMutation.mutate({ id, status: "sent" })
  }

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this invoice?")) {
      deleteMutation.mutate({ id })
    }
  }

  const formatAmount = (amountInPence: number, currency: string) => {
    const formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    })
    return formatter.format(amountInPence / 100)
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return (
          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 shadow-none hover:bg-green-500/20">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Paid
          </Badge>
        )
      case "sent":
        return (
          <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 shadow-none hover:bg-blue-500/20">
            <Send className="mr-1 h-3 w-3" />
            Sent
          </Badge>
        )
      case "overdue":
        return (
          <Badge className="bg-red-500/10 text-red-600 border-red-500/20 shadow-none hover:bg-red-500/20">
            <AlertCircle className="mr-1 h-3 w-3" />
            Overdue
          </Badge>
        )
      case "cancelled":
        return (
          <Badge className="bg-gray-500/10 text-gray-600 border-gray-500/20 shadow-none hover:bg-gray-500/20">
            <XCircle className="mr-1 h-3 w-3" />
            Cancelled
          </Badge>
        )
      default:
        return (
          <Badge className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20 shadow-none hover:bg-yellow-500/20">
            <Clock className="mr-1 h-3 w-3" />
            Draft
          </Badge>
        )
    }
  }

  const totalPages = invoicesData ? Math.ceil(invoicesData.length / pageSize) : 1

  // Show error state for non-admin users
  if (isError) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">LTS</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Billing</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>

          <div className="flex flex-1 flex-col items-center justify-center p-6 bg-muted/10 min-h-[calc(100vh-4rem)]">
            <Card className="w-full max-w-md">
              <CardHeader className="text-center">
                <div className="p-4 bg-destructive/10 rounded-full w-fit mx-auto mb-4">
                  <AlertCircle className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle>Access Denied</CardTitle>
                <CardDescription>
                  {error?.message || "Only global admins can access the billing page."}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem className="hidden md:block">
                <BreadcrumbLink href="/">LTS</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              <BreadcrumbItem>
                <BreadcrumbPage>Billing</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </header>

        <div className="flex flex-1 flex-col gap-6 p-6 bg-muted/10">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">Invoices</h2>
              <p className="text-sm text-muted-foreground">
                Create and manage invoices for client organisations.
              </p>
            </div>
            <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  New Invoice
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Create Invoice</DialogTitle>
                  <DialogDescription>
                    Create a new invoice for a client organisation.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="org">Organisation</Label>
                    <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select organisation" />
                      </SelectTrigger>
                      <SelectContent>
                        {orgsData?.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="invoiceNumber">Invoice Number</Label>
                    <Input
                      id="invoiceNumber"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="INV-2026-0001"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="amount">Amount (GBP)</Label>
                    <Input
                      id="amount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dueDate">Due Date</Label>
                    <Input
                      id="dueDate"
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Invoice description..."
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreate}
                    disabled={!selectedOrgId || !invoiceNumber || !amount || createMutation.isPending}
                  >
                    {createMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Create Invoice
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3 bg-background p-1 rounded-lg border shadow-sm">
              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setStatusFilter(value as InvoiceStatus | "all")
                  setPage(1)
                }}
              >
                <SelectTrigger className="w-[180px] border-none shadow-none focus:ring-0">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="rounded-md border bg-background shadow-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                        <TableCell className="text-right"><Skeleton className="h-8 w-8 ml-auto" /></TableCell>
                      </TableRow>
                    ))
                  ) : !invoicesData || invoicesData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Receipt className="h-8 w-8 text-muted-foreground/50" />
                          <p>No invoices found.</p>
                          <p className="text-xs">Create your first invoice to get started.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    invoicesData.map((invoice) => (
                      <TableRow key={invoice.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            {invoice.invoiceNumber}
                          </div>
                        </TableCell>
                        <TableCell>{invoice.organisation?.name || "—"}</TableCell>
                        <TableCell className="font-medium">
                          {formatAmount(invoice.amount, invoice.currency)}
                        </TableCell>
                        <TableCell>
                          {invoice.dueDate
                            ? new Date(invoice.dueDate).toLocaleDateString("en-GB")
                            : "—"}
                        </TableCell>
                        <TableCell>{getStatusBadge(invoice.status)}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <span className="sr-only">Open menu</span>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              {invoice.pdfUrl && (
                                <DropdownMenuItem asChild>
                                  <a
                                    href={invoice.pdfUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    <ExternalLink className="mr-2 h-4 w-4" />
                                    View PDF
                                  </a>
                                </DropdownMenuItem>
                              )}
                              {invoice.status === "draft" && (
                                <DropdownMenuItem onClick={() => handleSendInvoice(invoice.id)}>
                                  <Send className="mr-2 h-4 w-4" />
                                  Mark as Sent
                                </DropdownMenuItem>
                              )}
                              {(invoice.status === "sent" || invoice.status === "overdue") && (
                                <DropdownMenuItem onClick={() => handleMarkPaid(invoice.id)}>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Mark as Paid
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => handleDelete(invoice.id)}
                                className="text-destructive"
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {invoicesData && totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
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
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
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
