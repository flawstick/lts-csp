"use client"

import * as React from "react"
import {
  Bot,
  Building2,
  CreditCard,
  SquareTerminal,
  FileText,
  Users,
  Settings,
} from "@/lib/icons"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

import { NavMain } from "@/components/nav-main"
import { NavOrg } from "@/components/nav-org"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"

const data = {
  platform: [
    {
      title: "Dashboard",
      url: "/",
      icon: SquareTerminal,
    },
    {
      title: "Returns",
      url: "/returns",
      icon: FileText,
    },
    {
      title: "Tasks",
      url: "/tasks",
      icon: Bot,
    },
  ],
  organisation: [
    {
      title: "Settings",
      url: "/org/settings",
      icon: Building2,
    },
  ],
  settings: [
    {
      title: "Members",
      url: "/members",
      icon: Users,
    },
    {
      title: "Billing",
      url: "/billing",
      icon: CreditCard,
    },
  ],
}

interface Organisation {
  id: string
  name: string
  slug: string
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [user, setUser] = React.useState<User | null>(null)
  const [organisations, setOrganisations] = React.useState<Organisation[]>([])
  const [isGlobalAdmin, setIsGlobalAdmin] = React.useState(false)
  const supabase = createClient()

  React.useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)

      if (user) {
        // Check if global admin and fetch organizations
        try {
          const res = await fetch("/api/organisations")
          if (res.ok) {
            const orgs = await res.json()
            setOrganisations(orgs)
            setIsGlobalAdmin(true)
          }
        } catch (error) {
          console.error("Failed to fetch organizations:", error)
        }
      }
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const userData = {
    name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "User",
    email: user?.email || "",
    avatar: user?.user_metadata?.avatar_url || user?.user_metadata?.picture || "",
  }

  const clientOrgItems = organisations.map(org => ({
    title: org.name,
    url: `/client-orgs/${org.slug}/settings`,
    icon: Building2,
  }))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Platform" items={data.platform} />
        {isGlobalAdmin && organisations.length > 0 && (
          <NavOrg label="Client Organizations" items={clientOrgItems} />
        )}
        <NavOrg label="Organisation" items={data.organisation} />
        <NavMain label="Settings" items={data.settings} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
