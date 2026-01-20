import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Organisation } from "@repo/database"
import { useParams } from "next/navigation"
import { useEffect } from "react"

interface OrgState {
  orgs: Organisation[]
  currentOrg: Organisation | null
  isLoading: boolean
  setOrgs: (orgs: Organisation[]) => void
  setCurrentOrg: (org: Organisation) => void
  setCurrentOrgById: (orgId: string) => void
  setLoading: (loading: boolean) => void
  fetchOrgs: () => Promise<void>
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set, get) => ({
      orgs: [],
      currentOrg: null,
      isLoading: false,

      setOrgs: (orgs) => set({ orgs }),
      setCurrentOrg: (org) => set({ currentOrg: org }),
      setCurrentOrgById: (orgId) => {
        const { orgs } = get()
        const org = orgs.find((o) => o.id === orgId)
        if (org) {
          set({ currentOrg: org })
        }
      },
      setLoading: (loading) => set({ isLoading: loading }),

      fetchOrgs: async () => {
        set({ isLoading: true })
        try {
          const res = await fetch("/api/orgs")
          if (res.ok) {
            const orgs = await res.json()
            const { currentOrg } = get()
            set({ orgs })

            // If no current org, set the first one
            if (!currentOrg && orgs.length > 0) {
              set({ currentOrg: orgs[0] })
            }
            // If current org exists, update it with fresh data from server
            else if (currentOrg) {
              const updated = orgs.find((o: Organisation) => o.id === currentOrg.id)
              if (updated) {
                set({ currentOrg: updated })
              } else if (orgs.length > 0) {
                set({ currentOrg: orgs[0] })
              }
            }
          }
        } catch (error) {
          console.error("Failed to load orgs:", error)
        } finally {
          set({ isLoading: false })
        }
      },
    }),
    {
      name: "org-storage",
      partialize: (state) => ({ currentOrg: state.currentOrg }),
    }
  )
)

// Hook to sync currentOrg with URL params (URL is the source of truth)
export function useOrgFromUrl() {
  const params = useParams()
  const { orgs, currentOrg, setCurrentOrgById, fetchOrgs, isLoading } = useOrgStore()
  const orgIdFromUrl = params.orgId as string | undefined

  useEffect(() => {
    // Fetch orgs on mount if we don't have them
    if (orgs.length === 0) {
      fetchOrgs()
    }
  }, []) // Empty deps - only run once on mount

  useEffect(() => {
    // If we have an orgId in the URL and orgs are loaded, sync it
    if (orgIdFromUrl && orgs.length > 0) {
      // Only update if the current org doesn't match the URL
      if (!currentOrg || currentOrg.id !== orgIdFromUrl) {
        setCurrentOrgById(orgIdFromUrl)
      }
    }
  }, [orgIdFromUrl, orgs.length]) // Depend on orgId and orgs.length, not the objects themselves

  return { currentOrg, orgs, isLoading }
}
