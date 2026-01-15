import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Organisation } from "@repo/database"

interface OrgState {
  orgs: Organisation[]
  currentOrg: Organisation | null
  isLoading: boolean
  setOrgs: (orgs: Organisation[]) => void
  setCurrentOrg: (org: Organisation) => void
  setLoading: (loading: boolean) => void
  fetchOrgs: () => Promise<void>
}

export const useOrgStore = create<OrgState>()(
  persist(
    (set, get) => ({
      orgs: [],
      currentOrg: null,
      isLoading: true,

      setOrgs: (orgs) => set({ orgs }),
      setCurrentOrg: (org) => set({ currentOrg: org }),
      setLoading: (loading) => set({ isLoading: loading }),

      fetchOrgs: async () => {
        set({ isLoading: true })
        try {
          const res = await fetch("/api/orgs")
          if (res.ok) {
            const data = await res.json()
            const { currentOrg } = get()
            set({ orgs: data.orgs })

            // If no current org, set the first one
            if (!currentOrg && data.orgs.length > 0) {
              set({ currentOrg: data.orgs[0] })
            }
            // If current org exists, update it with fresh data from server
            else if (currentOrg) {
              const updated = data.orgs.find((o: Organisation) => o.id === currentOrg.id)
              if (updated) {
                set({ currentOrg: updated })
              } else if (data.orgs.length > 0) {
                set({ currentOrg: data.orgs[0] })
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
