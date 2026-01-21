"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "@/lib/icons"

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
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
