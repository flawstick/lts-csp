import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ReturnWorkspaceFormSkeleton() {
  return (
    <div className="space-y-4">
      <div className="border-border/70 bg-muted/20 rounded-[1.2rem] border px-4 py-3">
        <Skeleton className="h-4 w-56 max-w-full" />
        <Skeleton className="mt-2 h-3 w-72 max-w-full" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`workspace-section-skeleton-${index}`}
            className="portal-card bg-background/96 rounded-[1.35rem] p-4"
          >
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-11/12" />
            <div className="mt-3 space-y-1.5">
              <Skeleton className="h-3 w-10/12" />
              <Skeleton className="h-3 w-8/12" />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ReturnWorkspacePageSkeleton() {
  return (
    <main className="mx-auto max-w-6xl space-y-5 pb-8">
      <Card className="portal-card bg-card/96 rounded-[1.95rem] py-0">
        <CardHeader className="px-6 py-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-9 w-80 max-w-full" />
              <Skeleton className="h-4 w-[34rem] max-w-full" />
              <Skeleton className="h-4 w-72 max-w-full" />
            </div>

            <div className="flex flex-col gap-2 sm:items-end">
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-24 rounded-full" />
                <Skeleton className="h-7 w-28 rounded-full" />
              </div>
              <Skeleton className="h-9 w-36 rounded-xl" />
            </div>
          </div>
        </CardHeader>
      </Card>

      <Card className="portal-card bg-card/96 rounded-[1.95rem] py-0">
        <CardContent className="px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-[28rem] max-w-full" />
            </div>

            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-8 w-36 rounded-md" />
            </div>
          </div>

          <div className="mt-5">
            <ReturnWorkspaceFormSkeleton />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
