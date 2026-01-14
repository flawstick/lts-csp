"use client"

import { useEffect, useState } from "react"
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
import { useOrgStore } from "@/lib/org-context"
import { canAccessBilling, canEditBilling, type OrgRole } from "@/lib/permissions"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { CreditCard, CheckCircle2, AlertCircle } from "lucide-react"

interface MemberInfo {
  role: OrgRole
  isGlobalAdmin?: boolean
}

export default function OrgBillingPage() {
  const { currentOrg, isLoading: orgLoading } = useOrgStore()
  const [memberInfo, setMemberInfo] = useState<MemberInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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

  const canAccess = memberInfo && (memberInfo.isGlobalAdmin || canAccessBilling(memberInfo.role))
  const canEdit = memberInfo && (memberInfo.isGlobalAdmin || canEditBilling(memberInfo.role))

  if (orgLoading || isLoading) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
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
        </SidebarInset>
      </SidebarProvider>
    )
  }

  if (!canAccess) {
    return (
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] duration-300 ease-in-out group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex items-center gap-2 px-4">
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden md:block" />
                  <BreadcrumbItem className="hidden md:block">
                    <BreadcrumbLink href="/org/settings">Organisation</BreadcrumbLink>
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
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] duration-300 ease-in-out group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator className="hidden md:block" />
                <BreadcrumbItem className="hidden md:block">
                  <BreadcrumbLink href="/org/settings">Organisation</BreadcrumbLink>
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
                Manage your subscription and payment methods
              </p>
            </div>
            {memberInfo && (
              <Badge variant={memberInfo.role === "owner" ? "default" : "secondary"}>
                {memberInfo.role.charAt(0).toUpperCase() + memberInfo.role.slice(1)}
              </Badge>
            )}
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  Current Plan
                </CardTitle>
                <CardDescription>Your active subscription</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="text-2xl font-bold">Professional</div>
                    <p className="text-muted-foreground text-sm">
                      Unlimited tax returns and team members
                    </p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-bold">$99</span>
                    <span className="text-muted-foreground">/month</span>
                  </div>
                  {canEdit && (
                    <Button variant="outline" className="w-full">
                      Change Plan
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Payment Method
                </CardTitle>
                <CardDescription>Your default payment method</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="bg-muted flex items-center gap-3 rounded-lg p-3">
                    <div className="bg-background flex h-10 w-14 items-center justify-center rounded border">
                      <span className="text-xs font-bold">VISA</span>
                    </div>
                    <div>
                      <div className="font-medium">Visa ending in 4242</div>
                      <p className="text-muted-foreground text-sm">Expires 12/2025</p>
                    </div>
                  </div>
                  {canEdit && (
                    <Button variant="outline" className="w-full">
                      Update Payment Method
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Billing History</CardTitle>
              <CardDescription>Your recent invoices and payments</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { date: "Nov 1, 2024", amount: "$99.00", status: "Paid" },
                  { date: "Oct 1, 2024", amount: "$99.00", status: "Paid" },
                  { date: "Sep 1, 2024", amount: "$99.00", status: "Paid" },
                ].map((invoice, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                  >
                    <div>
                      <div className="font-medium">{invoice.date}</div>
                      <p className="text-muted-foreground text-sm">Monthly subscription</p>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{invoice.amount}</div>
                      <Badge variant="outline" className="text-green-600">
                        {invoice.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {!canEdit && (
            <Card className="border-dashed">
              <CardContent className="flex items-center gap-3 py-4">
                <AlertCircle className="text-muted-foreground h-5 w-5" />
                <p className="text-muted-foreground text-sm">
                  Only organisation owners can modify billing settings
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
