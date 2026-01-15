"use client"

import { useEffect, useState, useRef } from "react"
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
import { useOrgStore } from "@/lib/org-context"
import { canAccessBilling, canEditBilling, type OrgRole } from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  CheckCircle2,
  AlertCircle,
  Plus,
  FileText,
  Download,
  MoreHorizontal,
  Upload,
  Trash2,
} from "@/lib/icons"
import { api } from "@/trpc/react"

interface MemberInfo {
  role: OrgRole
  isGlobalAdmin?: boolean
}

const STATUS_BADGES: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
  draft: { variant: "secondary", label: "Draft" },
  sent: { variant: "outline", label: "Sent" },
  paid: { variant: "default", label: "Paid" },
  overdue: { variant: "destructive", label: "Overdue" },
  cancelled: { variant: "secondary", label: "Cancelled" },
}

export default function OrgBillingPage() {
  const { currentOrg, isLoading: orgLoading } = useOrgStore()
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedPdfUrl, setUploadedPdfUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("GBP")
  const [description, setDescription] = useState("")
  const [dueDate, setDueDate] = useState("")
  const [status, setStatus] = useState<"draft" | "sent" | "paid">("draft")

  const invoicesQuery = api.invoice.list.useQuery(
    { orgId: currentOrg?.id, limit: 50 },
    { enabled: !!currentOrg }
  )
  const nextInvoiceNumberQuery = api.invoice.getNextInvoiceNumber.useQuery(undefined, {
    enabled: createDialogOpen && memberInfo?.isGlobalAdmin,
  })

  const createInvoiceMutation = api.invoice.create.useMutation({
    onSuccess: () => {
      setCreateDialogOpen(false)
      resetForm()
      invoicesQuery.refetch()
    },
  })
  const markPaidMutation = api.invoice.markPaid.useMutation({
    onSuccess: () => invoicesQuery.refetch(),
  })
  const deleteInvoiceMutation = api.invoice.delete.useMutation({
    onSuccess: () => invoicesQuery.refetch(),
  })

  const isGlobalAdmin = memberInfo?.isGlobalAdmin ?? false

  useEffect(() => {
    async function fetchMemberInfo() {
      if (!currentOrg) return
      try {
        const res = await fetch(`/api/orgs/${currentOrg.id}/me`)
        if (res.ok) {
          const data = await res.json()
          setMemberInfo(data)
        }
      } catch (error) {
        console.error("Failed to fetch member info:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchMemberInfo()
  }, [currentOrg])

  useEffect(() => {
    if (createDialogOpen && nextInvoiceNumberQuery.data) {
      setInvoiceNumber(nextInvoiceNumberQuery.data)
    }
  }, [createDialogOpen, nextInvoiceNumberQuery.data])

  const resetForm = () => {
    setInvoiceNumber("")
    setAmount("")
    setCurrency("GBP")
    setDescription("")
    setDueDate("")
    setStatus("draft")
    setUploadedPdfUrl(null)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch("/api/invoices/upload", {
        method: "POST",
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Upload failed")
      }

      const data = await res.json()
      setUploadedPdfUrl(data.url)
    } catch (error) {
      console.error("Upload failed:", error)
      alert("Failed to upload PDF")
    } finally {
      setIsUploading(false)
    }
  }

  const handleCreateInvoice = async () => {
    if (!currentOrg) return

    const amountInCents = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountInCents) || amountInCents <= 0) {
      alert("Please enter a valid amount")
      return
    }

    createInvoiceMutation.mutate({
      orgId: currentOrg.id,
      invoiceNumber,
      amount: amountInCents,
      currency,
      description: description || undefined,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      pdfUrl: uploadedPdfUrl ?? undefined,
      status,
    })
  }

  const formatCurrency = (amount: number, curr: string) => {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: curr,
    }).format(amount / 100)
  }

  const formatDate = (date: Date | string | null) => {
    if (!date) return "-"
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
  }

  const canAccess = memberInfo && (memberInfo.isGlobalAdmin || canAccessBilling(memberInfo.role))
  const canEdit = memberInfo && (memberInfo.isGlobalAdmin || canEditBilling(memberInfo.role))

  if (orgLoading || isLoading) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Skeleton className="h-4 w-48" />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    )
  }

  if (!canAccess) {
    return (
      <>
        <header className="flex h-16 shrink-0 items-center gap-2">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Billing</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
          <AlertCircle className="text-muted-foreground h-12 w-12" />
          <div className="text-center">
            <h2 className="text-lg font-semibold">Access Restricted</h2>
            <p className="text-muted-foreground text-sm">
              Only owners and admins can view billing information
            </p>
          </div>
        </div>
      </>
    )
  }

  const invoices = invoicesQuery.data ?? []

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem>
                  <BreadcrumbPage>Billing</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">Billing</h1>
              <p className="text-muted-foreground text-sm">
                {isGlobalAdmin ? "Manage invoices for all organisations" : "View your invoices"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {memberInfo && (
                <Badge variant={memberInfo.isGlobalAdmin ? "default" : "secondary"}>
                  {memberInfo.isGlobalAdmin ? "Global Admin" : memberInfo.role.charAt(0).toUpperCase() + memberInfo.role.slice(1)}
                </Badge>
              )}
              {isGlobalAdmin && (
                <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Invoice
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Create Invoice</DialogTitle>
                      <DialogDescription>Create a new invoice</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                      <div className="grid gap-2">
                        <Label htmlFor="invoiceNumber">Invoice Number</Label>
                        <Input
                          id="invoiceNumber"
                          value={invoiceNumber}
                          onChange={(e) => setInvoiceNumber(e.target.value)}
                          placeholder="INV-2024-0001"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label htmlFor="amount">Amount</Label>
                          <Input
                            id="amount"
                            type="number"
                            step="0.01"
                            min="0"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="99.00"
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="currency">Currency</Label>
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger id="currency">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GBP">GBP</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          placeholder="Monthly subscription"
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
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
                          <Label htmlFor="status">Status</Label>
                          <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                            <SelectTrigger id="status">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="draft">Draft</SelectItem>
                              <SelectItem value="sent">Sent</SelectItem>
                              <SelectItem value="paid">Paid</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Invoice PDF</Label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                        {uploadedPdfUrl ? (
                          <div className="flex items-center gap-2 rounded-lg border p-3">
                            <FileText className="h-5 w-5 text-red-500" />
                            <span className="flex-1 truncate text-sm">PDF uploaded</span>
                            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setUploadedPdfUrl(null)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                            <Upload className="mr-2 h-4 w-4" />
                            {isUploading ? "Uploading..." : "Upload PDF"}
                          </Button>
                        )}
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
                      <Button onClick={handleCreateInvoice} disabled={createInvoiceMutation.isPending || !invoiceNumber || !amount}>
                        {createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {formatCurrency(invoices.reduce((sum, inv) => sum + inv.amount, 0), "GBP")}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {formatCurrency(invoices.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + inv.amount, 0), "GBP")}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">
                  {formatCurrency(invoices.filter((inv) => inv.status === "sent" || inv.status === "overdue").reduce((sum, inv) => sum + inv.amount, 0), "GBP")}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Invoices</CardTitle>
              <CardDescription>{isGlobalAdmin ? "All invoices" : "Your invoices"}</CardDescription>
            </CardHeader>
            <CardContent>
              {invoicesQuery.isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : invoices.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold">No invoices yet</h3>
                  <p className="text-sm text-muted-foreground">
                    {isGlobalAdmin ? "Create your first invoice" : "Invoices will appear here"}
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      {isGlobalAdmin && <TableHead>Organisation</TableHead>}
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const statusInfo = (STATUS_BADGES[invoice.status] ?? STATUS_BADGES.draft)!
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{invoice.invoiceNumber}</div>
                              {invoice.description && (
                                <div className="text-sm text-muted-foreground truncate max-w-[200px]">{invoice.description}</div>
                              )}
                            </div>
                          </TableCell>
                          {isGlobalAdmin && <TableCell>{invoice.organisation?.name ?? "-"}</TableCell>}
                          <TableCell className="font-medium">{formatCurrency(invoice.amount, invoice.currency)}</TableCell>
                          <TableCell><Badge variant={statusInfo.variant}>{statusInfo.label}</Badge></TableCell>
                          <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                          <TableCell>{formatDate(invoice.createdAt)}</TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {invoice.pdfUrl && (
                                  <DropdownMenuItem asChild>
                                    <a href={invoice.pdfUrl} target="_blank" rel="noopener noreferrer">
                                      <Download className="mr-2 h-4 w-4" />Download PDF
                                    </a>
                                  </DropdownMenuItem>
                                )}
                                {isGlobalAdmin && invoice.status !== "paid" && (
                                  <DropdownMenuItem onClick={() => markPaidMutation.mutate({ id: invoice.id })}>
                                    <CheckCircle2 className="mr-2 h-4 w-4" />Mark as Paid
                                  </DropdownMenuItem>
                                )}
                                {isGlobalAdmin && (
                                  <DropdownMenuItem className="text-destructive" onClick={() => {
                                    if (confirm("Delete this invoice?")) deleteInvoiceMutation.mutate({ id: invoice.id })
                                  }}>
                                    <Trash2 className="mr-2 h-4 w-4" />Delete
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {!canEdit && !isGlobalAdmin && (
            <Card className="border-dashed">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="text-muted-foreground h-5 w-5" />
                <p className="text-muted-foreground text-sm">Only owners can modify billing settings</p>
              </CardContent>
            </Card>
          )}
        </div>
    </>
  )
}
