import { Skeleton } from "@/components/ui/skeleton"

export function MainDashboardSkeleton() {
  return (
    <>
      <header className="bg-container sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <Skeleton className="h-5 w-28" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-20 rounded-lg" />
          <Skeleton className="h-8 w-32 rounded-lg" />
        </div>
      </header>

      <main className="flex-1 overflow-auto" aria-busy="true" aria-label="Loading dashboard">
        <div className="@container/main mx-auto flex w-full max-w-7xl flex-col gap-6 p-4 sm:p-6">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-56" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>

          <div className="grid grid-cols-1 gap-3 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="bg-card flex min-h-36 flex-col rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-7 rounded-md" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <div className="mt-auto pt-4">
                  <Skeleton className="h-8 w-16" />
                  <Skeleton className="mt-2 h-3.5 w-36" />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-card rounded-xl border p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-56" />
              </div>
              <Skeleton className="h-8 w-32 rounded-lg" />
            </div>
            <Skeleton className="mt-6 h-[240px] w-full rounded-lg" />
          </div>

          <div className="flex flex-col gap-3">
            <Skeleton className="h-5 w-24" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-8 w-40" />
              <Skeleton className="h-8 w-36" />
            </div>
            <div className="bg-card space-y-3 rounded-xl border p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
