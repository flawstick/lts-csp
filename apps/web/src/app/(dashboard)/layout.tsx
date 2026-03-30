import { cookies } from "next/headers"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"

const SIDEBAR_COOKIE_NAME = "sidebar_state"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const sidebarStateCookie = cookieStore.get(SIDEBAR_COOKIE_NAME)

  // Default to open, but respect cookie if set
  const defaultOpen = sidebarStateCookie?.value !== "false"

  return (
    <SidebarProvider defaultOpen={defaultOpen} className="bg-sidebar overflow-hidden">
      <AppSidebar />
      <SidebarInset className="!bg-container min-w-0 overflow-hidden">
        <div className="flex h-full w-full flex-col overflow-hidden">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
