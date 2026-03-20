import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"

export function TaskLoading() {
  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
      {/* Header skeleton */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <Skeleton className="h-3.5 w-12 rounded" />
        <Skeleton className="mx-1 size-1 rounded-full" />
        <Skeleton className="h-3.5 w-44 rounded" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-3 w-16 rounded" />
          <Separator orientation="vertical" className="h-3.5" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </header>

      {/* Content skeleton */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* Browser panel skeleton */}
          <ResizablePanel defaultSize={70} minSize={30}>
            <div className="flex h-full flex-col">
              {/* Toolbar skeleton */}
              <div className="flex shrink-0 items-center justify-between border-b bg-muted/20 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-3.5 rounded" />
                  <Skeleton className="h-3.5 w-24 rounded" />
                  <Skeleton className="ml-1 h-6 w-20 rounded" />
                </div>
                <div className="flex items-center gap-1.5">
                  <Skeleton className="size-6 rounded" />
                  <Skeleton className="h-6 w-16 rounded" />
                </div>
              </div>

              {/* Browser frame skeleton */}
              <div className="flex flex-1 items-center justify-center bg-muted/5">
                <div className="flex flex-col items-center gap-3">
                  <Skeleton className="size-14 rounded-2xl" />
                  <Skeleton className="h-3.5 w-28 rounded" />
                  <Skeleton className="h-3 w-44 rounded" />
                </div>
              </div>

              {/* Steps timeline skeleton */}
              <div className="shrink-0 border-t">
                <div className="flex items-center justify-between border-b bg-muted/20 px-3 py-1.5">
                  <Skeleton className="h-3 w-10 rounded" />
                  <Skeleton className="h-3 w-12 rounded" />
                </div>
                <div className="flex gap-2 overflow-hidden p-2.5">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-56 shrink-0 rounded-lg border border-border/60 p-2.5">
                      <div className="mb-1.5 flex items-center gap-1.5">
                        <Skeleton className="size-3 rounded-full" />
                        <Skeleton className="h-2.5 w-12 rounded" />
                      </div>
                      <Skeleton className="h-3 w-full rounded" />
                      <Skeleton className="mt-1 h-3 w-3/4 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Agent panel skeleton */}
          <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
            <div className="flex h-full flex-col bg-background">
              {/* Panel header */}
              <div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
                <Skeleton className="size-6 rounded-md" />
                <Skeleton className="h-3.5 w-20 rounded" />
                <Skeleton className="ml-auto h-2.5 w-24 rounded" />
              </div>

              {/* Messages skeleton */}
              <div className="flex-1 space-y-4 p-4">
                <div className="flex gap-2.5">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-12 w-48 rounded-xl rounded-tl-sm" />
                    <Skeleton className="h-2 w-10 rounded" />
                  </div>
                </div>
                <div className="flex gap-2.5">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="space-y-1.5">
                    <Skeleton className="h-8 w-56 rounded-xl rounded-tl-sm" />
                    <Skeleton className="h-2 w-10 rounded" />
                  </div>
                </div>
                <div className="flex flex-row-reverse gap-2.5">
                  <Skeleton className="size-7 shrink-0 rounded-full" />
                  <div className="flex flex-col items-end space-y-1.5">
                    <Skeleton className="h-8 w-36 rounded-xl rounded-tr-sm" />
                    <Skeleton className="h-2 w-10 rounded" />
                  </div>
                </div>
              </div>

              {/* Input skeleton */}
              <div className="shrink-0 border-t p-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-9 flex-1 rounded-md" />
                  <Skeleton className="size-9 shrink-0 rounded-md" />
                </div>
                <Skeleton className="mx-auto mt-1.5 h-2.5 w-28 rounded" />
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
