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
  MessageSquare,
  Loader2,
} from "@/lib/icons"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

import { NavMain } from "@/components/nav-main"
import { NavOrg } from "@/components/nav-org"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import { useOrgFromUrl } from "@/lib/org-context"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const getBasePlatformItems = (orgId: string | undefined) => [
  {
    title: "Dashboard",
    url: orgId ? `/org/${orgId}` : "/",
    icon: SquareTerminal,
  },
  {
    title: "Returns",
    url: orgId ? `/org/${orgId}/returns` : "/returns",
    icon: FileText,
  },
  {
    title: "Tasks",
    url: orgId ? `/org/${orgId}/tasks` : "/tasks",
    icon: Bot,
  },
]

const baseSettingsItems = [
  {
    title: "Organizations",
    url: "/settings",
    icon: Building2,
  },
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
]

interface Organisation {
  id: string
  name: string
  slug: string
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { currentOrg } = useOrgFromUrl()
  const [user, setUser] = React.useState<User | null>(null)
  const [organisations, setOrganisations] = React.useState<Organisation[]>([])
  const [isGlobalAdmin, setIsGlobalAdmin] = React.useState(false)
  const [feedbackOpen, setFeedbackOpen] = React.useState(false)
  const [feedback, setFeedback] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)
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

  const handleSubmitFeedback = async () => {
    if (!feedback.trim()) return

    setIsSubmitting(true)
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ feedback }),
      })

      if (response.ok) {
        setFeedback("")
        setFeedbackOpen(false)
      } else {
        const data = await response.json()
        alert(data.error || "Failed to send feedback")
      }
    } catch (error) {
      console.error("Failed to send feedback:", error)
      alert("Failed to send feedback")
    } finally {
      setIsSubmitting(false)
    }
  }

  // Build platform items - add org settings if there's a current org
  const platformItems = currentOrg
    ? [
        ...getBasePlatformItems(currentOrg.id),
        {
          title: `${currentOrg.name} Settings`,
          url: `/org/${currentOrg.id}/settings`,
          icon: Settings,
        },
      ]
    : getBasePlatformItems(undefined)

  // Build settings items dynamically - add client orgs submenu if admin
  const settingsItems = isGlobalAdmin && organisations.length > 0
    ? [
        {
          title: "Organizations",
          url: "/settings",
          icon: Building2,
          items: [
            { title: "Manage Organizations", url: "/settings" },
            ...organisations.map(org => ({
              title: org.name,
              url: `/client-orgs/${org.slug}/settings`,
            })),
          ],
        },
        ...baseSettingsItems.slice(1), // Members and Billing
      ]
    : baseSettingsItems

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <TeamSwitcher />
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Platform" items={platformItems} />
        <NavMain label="Settings" items={settingsItems} />
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <Dialog open={feedbackOpen} onOpenChange={setFeedbackOpen}>
              <DialogTrigger asChild>
                <SidebarMenuButton tooltip="Send Feedback">
                  <MessageSquare />
                  <span>Send Feedback</span>
                </SidebarMenuButton>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Send Feedback</DialogTitle>
                  <DialogDescription>
                    Have suggestions or found an issue? Let us know how we can improve LTS Tax.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="feedback">Your feedback</Label>
                    <Textarea
                      id="feedback"
                      placeholder="Tell us what you think..."
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      rows={6}
                      className="resize-none"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setFeedbackOpen(false)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitFeedback}
                    disabled={!feedback.trim() || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Send Feedback
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </SidebarMenuItem>
        </SidebarMenu>
        <NavUser user={userData} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
