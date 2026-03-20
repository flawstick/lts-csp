"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function TasksTableSkeleton() {
  return (
    <section className="portal-card overflow-hidden rounded-2xl">
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-56" />
            <Skeleton className="h-9 w-36" />
          </div>
        </div>
        <div className="mt-3 flex gap-1.5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-24 rounded-lg" />
          ))}
        </div>
      </div>

      <div className="divide-border/50 divide-y px-4 pb-2">
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="flex items-center gap-4 py-3.5">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <Skeleton className="h-5 w-16 rounded-md" />
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-4 w-12" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
