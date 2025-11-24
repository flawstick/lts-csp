"use client"

import * as React from "react"
import {
  Bot,
  Building2,
  CreditCard,
  SquareTerminal,
  FileText,
  Users,
} from "lucide-react"
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
    {
      title: "Members",
      url: "/org/members",
      icon: Users,
    },
    {
      title: "Billing",
      url: "/org/billing",
      icon: CreditCard,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [user, setUser] = React.useState<User | null>(null)
  const supabase = createClient()

  React.useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
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

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Platform" items={data.platform} />
        <NavOrg label="Organisation" items={data.organisation} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
