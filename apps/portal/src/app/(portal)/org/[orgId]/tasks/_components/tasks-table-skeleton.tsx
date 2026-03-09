"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function TasksTableSkeleton() {
  return (
    <section className="portal-card overflow-hidden rounded-2xl">
      <div className="border-b p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-24" />
            <Skeleton className="h-4 w-72" />
          </div>
          <div className="flex w-full max-w-md gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-36" />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-28 rounded-full" />
          ))}
        </div>
      </div>

      <div>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="px-4 py-3 text-left font-medium">Return</th>
              <th className="px-4 py-3 text-left font-medium">Jurisdiction</th>
              <th className="px-4 py-3 text-left font-medium">Next Step</th>
              <th className="px-4 py-3 text-left font-medium">Progress</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Updated</th>
              <th className="w-[112px] px-4 py-3 pr-6 text-right font-medium">
                Open
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, index) => (
              <tr key={index} className="border-b/60">
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="mt-2 h-3 w-32" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-32" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-2 h-3 w-44" />
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-24 rounded-full" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-6 w-24 rounded-full" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-28" />
                </td>
                <td className="px-4 py-3 pr-6">
                  <div className="flex justify-end">
                    <Skeleton className="h-8 w-20 rounded-md" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
