import { Skeleton } from "@/components/ui/skeleton";

export function OrgDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="portal-card rounded-xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="size-4 rounded-full" />
            </div>
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="flex items-center justify-between">
                <Skeleton className="h-10 w-16" />
                <Skeleton className="h-4 w-10" />
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="portal-card rounded-xl p-4">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <Skeleton className="h-[320px] w-full rounded-xl" />
        </div>

        <div className="portal-card rounded-xl p-4">
          <div className="mb-4 flex items-center justify-between">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="size-6 rounded-md" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-md" />
            ))}
            <Skeleton className="h-8 w-full rounded-md" />
          </div>
        </div>
      </section>

      <section className="portal-card overflow-hidden rounded-xl">
        <div className="border-b p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-6 w-44" />
            <Skeleton className="h-9 w-72 rounded-md" />
          </div>
        </div>
        <div className="space-y-3 p-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-12 w-full rounded-md" />
          ))}
        </div>
      </section>
    </div>
  );
}
