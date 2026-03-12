"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpDown, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/trpc/react";

type ReturnStatusTone = "pending" | "in_progress" | "completed" | "failed" | "review_required" | "dismissed";
type StatusFilter = "all" | ReturnStatusTone;
type SortKey = "entity" | "year" | "status" | "updated";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 20;

const STATUS_LABEL: Record<ReturnStatusTone, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
  review_required: "Review Required",
  dismissed: "Dismissed",
};

const STATUS_CLASS: Record<ReturnStatusTone, string> = {
  pending: "border-amber-500/35 bg-amber-500/10 text-amber-700",
  in_progress: "border-blue-500/35 bg-blue-500/10 text-blue-700",
  completed: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700",
  failed: "border-rose-500/35 bg-rose-500/10 text-rose-700",
  review_required: "border-violet-500/35 bg-violet-500/10 text-violet-700",
  dismissed: "border-zinc-500/35 bg-zinc-500/10 text-zinc-500",
};

function normalizeStatus(status: string): ReturnStatusTone {
  if (status === "pending") return "pending";
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  if (status === "failed") return "failed";
  if (status === "dismissed") return "dismissed";
  return "review_required";
}

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function fileCount(files: unknown) {
  return Array.isArray(files) ? files.length : 0;
}

export default function OrgReturnsPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const returnsQuery = api.portalReturns.listByOrg.useQuery({ orgId }, { enabled: !!orgId });

  const returns = useMemo(() => returnsQuery.data ?? [], [returnsQuery.data]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return returns
      .filter((row) => {
        const status = normalizeStatus(row.status);
        if (statusFilter !== "all" && status !== statusFilter) {
          return false;
        }

        if (!term) {
          return true;
        }

        return (
          row.entityName.toLowerCase().includes(term) ||
          row.jurisdictionCode.toLowerCase().includes(term) ||
          row.jurisdictionName.toLowerCase().includes(term) ||
          `${row.taxYear}`.includes(term) ||
          (row.externalId ?? "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const direction = sortDirection === "asc" ? 1 : -1;

        if (sortKey === "entity") {
          return direction * a.entityName.localeCompare(b.entityName);
        }

        if (sortKey === "year") {
          return direction * (a.taxYear - b.taxYear);
        }

        if (sortKey === "status") {
          return direction * normalizeStatus(a.status).localeCompare(normalizeStatus(b.status));
        }

        return direction * (toTimestamp(a.updatedAt) - toTimestamp(b.updatedAt));
      });
  }, [query, returns, sortDirection, sortKey, statusFilter]);

  const totalCount = filtered.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const rows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [currentPage, filtered]);

  const readyCount = useMemo(
    () => returns.filter((row) => row.isSubstanceComplete).length,
    [returns],
  );

  const toggleSort = (key: SortKey) => {
    setPage(1);
    setSortDirection((prevDirection) => {
      if (sortKey !== key) {
        setSortKey(key);
        return key === "updated" ? "desc" : "asc";
      }

      return prevDirection === "asc" ? "desc" : "asc";
    });
  };

  return (
    <main className="mx-auto max-w-[1280px] space-y-4">
      <section className="portal-card overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h1 className="text-xl font-semibold">Returns</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a return to manage ESR uploads, AI extraction, and the substance form.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-lg border bg-muted/40 px-2.5 py-1.5 text-muted-foreground">
              {returnsQuery.isLoading ? <Skeleton className="h-4 w-14" /> : `${returns.length} total`}
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-700">
              {returnsQuery.isLoading ? <Skeleton className="h-4 w-20" /> : `${readyCount} ESR ready`}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/20 p-4">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="Search entity, jurisdiction, external ID, or year"
              className="h-9 pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value as StatusFilter);
              setPage(1);
            }}
            className="h-9 rounded-md border bg-background px-2.5 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
            <option value="review_required">Review Required</option>
            <option value="dismissed">Dismissed</option>
          </select>

          <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => toggleSort("updated")}>
            <ArrowUpDown className="size-4" />
            Sort: {sortKey}
          </Button>
        </div>

        {returnsQuery.isLoading ? (
          <div className="space-y-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">Entity</th>
                    <th className="px-4 py-3 text-left font-medium">Jurisdiction</th>
                    <th className="px-4 py-3 text-left font-medium">Tax Year</th>
                    <th className="px-4 py-3 text-left font-medium">Filing Status</th>
                    <th className="px-4 py-3 text-left font-medium">ESR</th>
                    <th className="px-4 py-3 text-left font-medium">Updated</th>
                    <th className="px-4 py-3 text-right font-medium">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index} className="border-b/60">
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-44" />
                        <Skeleton className="mt-2 h-3 w-28" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-40" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-16" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-6 w-24 rounded-lg" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-6 w-20 rounded-lg" />
                      </td>
                      <td className="px-4 py-3">
                        <Skeleton className="h-4 w-36" />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          <Skeleton className="h-8 w-16 rounded-md" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t p-4">
              <Skeleton className="h-4 w-48" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-14 rounded-md" />
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-8 w-14 rounded-md" />
              </div>
            </div>
          </div>
        ) : null}

        {returnsQuery.error ? <p className="p-6 text-sm text-red-600">{returnsQuery.error.message}</p> : null}

        {!returnsQuery.isLoading && !returnsQuery.error ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="px-4 py-3 text-left font-medium">
                      <button className="inline-flex items-center gap-1" onClick={() => toggleSort("entity")}>
                        Entity
                        <ArrowUpDown className="size-3.5" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Jurisdiction</th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button className="inline-flex items-center gap-1" onClick={() => toggleSort("year")}>
                        Tax Year
                        <ArrowUpDown className="size-3.5" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                        Filing Status
                        <ArrowUpDown className="size-3.5" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">ESR</th>
                    <th className="px-4 py-3 text-left font-medium">Updated</th>
                    <th className="px-4 py-3 text-right font-medium">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = normalizeStatus(row.status);
                    const missingCount = Array.isArray(row.missingSubstanceFields)
                      ? row.missingSubstanceFields.length
                      : 0;

                    return (
                      <tr key={row.id} className="border-b/60 transition hover:bg-muted/25">
                        <td className="px-4 py-3">
                          <div className="min-w-0">
                            <p className="truncate font-medium">{row.entityName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {row.externalId ? `External ID: ${row.externalId}` : `${fileCount(row.files)} file(s)`}
                            </p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {row.jurisdictionName} ({row.jurisdictionCode})
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{row.taxYear}</td>
                        <td className="px-4 py-3">
                          <span className={cn("inline-flex rounded-lg border px-2 py-1 text-xs font-medium", STATUS_CLASS[status])}>
                            {STATUS_LABEL[status]}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-lg border px-2 py-1 text-xs font-medium",
                              row.isSubstanceComplete
                                ? "border-emerald-500/35 bg-emerald-500/10 text-emerald-700"
                                : "border-violet-500/35 bg-violet-500/10 text-violet-700",
                            )}
                          >
                            {row.isSubstanceComplete
                              ? "Ready"
                              : missingCount > 0
                                ? `${missingCount} missing`
                                : "Pending"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateTime(row.updatedAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
                            <Link href={`/org/${orgId}/returns/${row.id}`}>
                              Open
                              <ExternalLink className="size-3.5" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}

                  {!rows.length ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                        No returns match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t p-4 text-sm">
              <p className="text-muted-foreground">
                Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCount)}-
                {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((previous) => Math.max(1, previous - 1))}
                >
                  Prev
                </Button>
                <span className="text-xs text-muted-foreground">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage((previous) => Math.min(pageCount, previous + 1))}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
