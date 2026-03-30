"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { PageHeader } from "@/components/page-header"

export default function OrgSettingsRedirect() {
  const router = useRouter()

  useEffect(() => {
    async function redirectToFirstOrg() {
      try {
        const res = await fetch("/api/orgs")
        if (res.ok) {
          const orgs = await res.json()
          if (orgs && orgs.length > 0) {
            // Redirect to first org
            router.replace(`/org/${orgs[0].id}/settings`)
          } else {
            // No orgs found, redirect to home
            router.replace("/")
          }
        } else {
          // Failed to fetch orgs, redirect to home
          router.replace("/")
        }
      } catch (error) {
        console.error("Failed to redirect:", error)
        router.replace("/")
      }
    }

    redirectToFirstOrg()
  }, [router])

  // Show loading state while redirecting
  return (
    <>
      <PageHeader>
        <Skeleton className="h-4 w-32" />
      </PageHeader>
      <div className="flex flex-1 flex-col p-6">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <div className="space-y-1">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Separator />
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-lg" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
