import { Skeleton } from "@/components/ui/skeleton";

export function DocumentsFilterCardSkeleton() {
  return (
    <section className="portal-card relative overflow-hidden p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 min-w-64 flex-1" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-9 w-24" />
      </div>
    </section>
  );
}

export function DocumentsFolderGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <article key={index} className="portal-card rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="h-16 w-20 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
            <Skeleton className="mt-1 h-4 w-4 shrink-0 rounded-sm" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-6 w-28 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        </article>
      ))}
    </section>
  );
}

export function DocumentsFilesListSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <section className="portal-card overflow-hidden rounded-2xl">
      <div className="divide-y">
        {Array.from({ length: rows }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}
