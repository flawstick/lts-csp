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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Loader2, RefreshCw, Plug, CheckCircle2, AlertCircle } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { api } from "@/trpc/react"

// Mock type for our simulation
type TaxReturn = {
  id: string
  entity: string
  jurisdiction: string
  year: number
  status: string
  source: string
}

export default function Page() {
  const [isConnected, setIsConnected] = React.useState(false)
  const [returns, setReturns] = React.useState<TaxReturn[]>([])
  const [token, setToken] = React.useState("admin123")
  const [open, setOpen] = React.useState(false)

  const syncMutation = api.taxReturn.sync.useMutation({
    onMutate: () => {
      console.log("Mutation started: taxReturn.sync")
    },
    onSuccess: (data) => {
      console.log("Mutation success: received data", data)
      setReturns(data)
    },
    onError: (error) => {
      console.error("Mutation failed:", error)
    }
  })

  const handleConnect = () => {
    console.log("handleConnect called with token:", token)
    // Simulate connection validation
    if (token.length > 5) {
      console.log("Connection validated")
      setIsConnected(true)
      setOpen(false)
      // Reset input
      setToken("")
    } else {
      console.warn("Connection validation failed: token too short")
    }
  }

  const handleSync = () => {
    console.log("handleSync called")
    if (!isConnected) {
      console.warn("Cannot sync: Not connected")
      return
    }
    syncMutation.mutate({ token: "dummy-token" })
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] duration-300 ease-in-out group-has-data-[collapsible=icon]/sidebar-wrapper:h-12 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="mr-2 data-[orientation=vertical]:h-4"
            />
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
        <div className="flex flex-1 flex-col gap-6 p-6 pt-6 bg-muted/10">
          {/* Header Section */}
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold tracking-tight">Tax Returns</h2>
              <p className="text-muted-foreground">
                Manage and sync tax returns from external jurisdictions.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant={isConnected ? "outline" : "default"} className={isConnected ? "border-green-500/50 text-green-600 hover:bg-green-500/10" : ""}>
                    {isConnected ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Guernsey Connected
                      </>
                    ) : (
                      <>
                        <Plug className="mr-2 h-4 w-4" />
                        Connect Source
                      </>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>Connect Jurisdiction</DialogTitle>
                    <DialogDescription>
                      Enter your API credentials to connect to the tax authority portal.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label htmlFor="source">Source</Label>
                      <Input id="source" value="Guernsey Tax Portal (E-Forms)" disabled />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="token">Auth Token</Label>
                      <Input 
                        id="token" 
                        type="password" 
                        placeholder="ghp_xxxxxxxxxxxx" 
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" onClick={handleConnect}>Connect</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              
              <Button onClick={handleSync} disabled={!isConnected || syncMutation.isPending} variant="secondary">
                {syncMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Sync Returns
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <Card>
            <CardHeader>
              <CardTitle>Active Filings</CardTitle>
              <CardDescription>
                {returns.length > 0 
                  ? `${returns.length} returns retrieved from Guernsey Tax Portal.` 
                  : "No returns found. Connect a source and sync to view filings."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>External ID</TableHead>
                      <TableHead>Entity Name</TableHead>
                      <TableHead>Jurisdiction</TableHead>
                      <TableHead>Tax Year</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence>
                      {returns.map((item, index) => (
                        <motion.tr
                          key={item.id}
                          initial={{ opacity: 0, x: -20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20 }}
                          transition={{ delay: index * 0.1 }}
                          className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                        >
                          <TableCell className="font-mono text-xs">{item.id}</TableCell>
                          <TableCell className="font-medium">{item.entity}</TableCell>
                          <TableCell>{item.jurisdiction}</TableCell>
                          <TableCell>{item.year}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{item.source}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 border-yellow-500/20">
                              {item.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost">Create Task</Button>
                          </TableCell>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                    {returns.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <AlertCircle className="h-8 w-8 opacity-50" />
                            <p>No returns loaded.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
