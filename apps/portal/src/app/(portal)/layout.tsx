import { PortalHeader } from "@/components/portal-header";
import { PortalSidebar } from "@/components/portal-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";

export default function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen className="bg-sidebar">
      <PortalSidebar />
      <div className="h-svh w-full overflow-hidden">
        <div className="flex h-full w-full flex-col overflow-hidden bg-container">
          <PortalHeader />
          <main className="flex-1 overflow-auto p-4 sm:p-6">{children}</main>
        </div>
      </div>
      <Toaster />
    </SidebarProvider>
  );
}
