"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

export default function DashboardRedirect() {
  const router = useRouter()

  useEffect(() => {
    async function redirectToFirstOrg() {
      try {
        const res = await fetch("/api/orgs")
        if (res.ok) {
          const orgs = await res.json()
          if (orgs && orgs.length > 0) {
            router.replace(`/org/${orgs[0].id}`)
          } else {
            // No orgs found, stay on this page or show error
            console.error("No organizations found")
          }
        }
      } catch (error) {
        console.error("Failed to redirect:", error)
      }
    }

    redirectToFirstOrg()
  }, [router])

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur sticky top-0 z-10 px-4">
        <SidebarTrigger className="-ml-1" />
        <Skeleton className="h-4 w-32" />
      </header>
      <div className="flex flex-1 flex-col p-6">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <Skeleton className="h-7 w-48" />
          <Separator />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </>
  )
}
