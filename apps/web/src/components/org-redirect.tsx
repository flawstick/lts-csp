"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"

interface Organisation {
  id: string
  name: string
  slug: string
}

interface OrgRedirectProps {
  orgs: Organisation[]
}

export function OrgRedirect({ orgs }: OrgRedirectProps) {
  const router = useRouter()

  useEffect(() => {
    // Try to get the last selected org from localStorage
    const storedData = localStorage.getItem("org-storage")
    let lastOrgId: string | null = null

    if (storedData) {
      try {
        const parsed = JSON.parse(storedData)
        lastOrgId = parsed.state?.currentOrg?.id
      } catch (e) {
        console.error("Failed to parse stored org:", e)
      }
    }

    // Check if the last org still exists in the available orgs
    const targetOrg = lastOrgId
      ? orgs.find(org => org.id === lastOrgId)
      : orgs[0]

    if (targetOrg) {
      router.push(`/org/${targetOrg.id}`)
    } else {
      // No orgs available
      router.push("/waiting-for-invite")
    }
  }, [orgs, router])

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      <PageHeader
        actions={
          <>
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </>
        }
      >
        <Skeleton className="h-3.5 w-16 rounded" />
        <Skeleton className="mx-1 size-1 rounded-full" />
        <Skeleton className="h-3.5 w-40 rounded" />
      </PageHeader>

      <div className="flex-1 space-y-6 overflow-hidden p-6">
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-xl border bg-card p-5">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="mt-4 h-8 w-20 rounded" />
              <Skeleton className="mt-3 h-3 w-32 rounded" />
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className="h-5 w-36 rounded" />
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
          <div className="mt-6 space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="grid grid-cols-[1.2fr_0.6fr_0.6fr_0.7fr] gap-4">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
