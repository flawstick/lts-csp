import { Skeleton } from "@/components/ui/skeleton"

export function MainDashboardSkeleton() {
  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-5 w-28" />
      </header>

      <div className="flex flex-1 flex-col">
        <div className="@container/main flex flex-1 flex-col gap-2">
          <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
            <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
              <Skeleton className="h-32 @xl/main:col-span-2" />
              <Skeleton className="h-32" />
              <Skeleton className="h-32" />
            </div>

            <div className="px-4 lg:px-6">
              <Skeleton className="h-[320px] w-full" />
            </div>

            <div className="px-4 lg:px-6">
              <div className="space-y-3 rounded-xl border p-4">
                <Skeleton className="h-8 w-56" />
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
