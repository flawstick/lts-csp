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
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Check, CreditCard } from "lucide-react"
import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

export default function BillingPage() {
  const [showMock, setShowMock] = useState(false)

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
          <AnimatePresence mode="wait">
            {!showMock ? (
              <motion.div
                key="placeholder"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center space-y-6 max-w-md"
              >
                <div className="p-4 bg-background rounded-full w-fit mx-auto shadow-sm">
                  <CreditCard className="h-8 w-8 text-muted-foreground" />
                </div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  Well this is for companies other than LTS that you sell this to... not for you :)
                </h1>
                <Button onClick={() => setShowMock(true)} size="lg">
                  Take a look at how it might look like
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="mock-ui"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full max-w-5xl space-y-8"
              >
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-bold">Simple, Transparent Pricing</h2>
                  <p className="text-muted-foreground">Choose the plan that fits your automation needs.</p>
                  <Button variant="ghost" size="sm" onClick={() => setShowMock(false)} className="mt-4">
                    Back to reality
                  </Button>
                </div>

                <div className="grid md:grid-cols-3 gap-8">
                  {/* Starter Plan */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Starter</CardTitle>
                      <CardDescription>For small firms just getting started.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-3xl font-bold">£499<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Up to 50 Returns/mo</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Basic AI Extraction</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 1 User Seat</li>
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" variant="outline">Choose Starter</Button>
                    </CardFooter>
                  </Card>

                  {/* Pro Plan */}
                  <Card className="border-primary shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-bl-lg">
                      Popular
                    </div>
                    <CardHeader>
                      <CardTitle>Professional</CardTitle>
                      <CardDescription>For growing practices with volume.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-3xl font-bold">£999<span className="text-sm font-normal text-muted-foreground">/mo</span></div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Up to 250 Returns/mo</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Advanced AI Models</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> 5 User Seats</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Priority Support</li>
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full">Choose Professional</Button>
                    </CardFooter>
                  </Card>

                  {/* Enterprise Plan */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Enterprise</CardTitle>
                      <CardDescription>For large institutions.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-3xl font-bold">Custom</div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited Returns</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Custom Integration</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Unlimited Seats</li>
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-500" /> Dedicated Account Mgr</li>
                      </ul>
                    </CardContent>
                    <CardFooter>
                      <Button className="w-full" variant="outline">Contact Sales</Button>
                    </CardFooter>
                  </Card>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
