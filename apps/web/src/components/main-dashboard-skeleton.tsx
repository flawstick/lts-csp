import { Skeleton } from "@/components/ui/skeleton"

export function MainDashboardSkeleton() {
  return (
    <>
      <header className="bg-container sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Skeleton className="h-5 w-28" />
      </header>

      <main className="flex-1 overflow-auto">
        <div className="@container/main flex flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6">
          <div className="grid grid-cols-1 gap-4 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
            <Skeleton className="h-32 @xl/main:col-span-2" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>

          <Skeleton className="h-[320px] w-full" />

          <div className="space-y-3 rounded-xl border p-4">
            <Skeleton className="h-8 w-56" />
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
