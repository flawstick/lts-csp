"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpDown, EllipsisVertical, ExternalLink, Search, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { PortalClientAccessMenuSection } from "@/components/portal-client-access-actions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { SharedElement } from "@/components/view-transitions";
import { api } from "@/trpc/react";

type ReturnStatusTone =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "review_required"
  | "dismissed";
type StatusFilter = "all" | ReturnStatusTone;
type JurisdictionFilter = string;
type TaxYearFilter = "all" | `${number}`;
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
  pending: "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:border-amber-500/35 dark:bg-amber-500/10 dark:text-amber-700",
  in_progress: "border-blue-500/50 bg-blue-500/15 text-blue-800 dark:border-blue-500/35 dark:bg-blue-500/10 dark:text-blue-700",
  completed: "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-700",
  failed: "border-rose-500/50 bg-rose-500/15 text-rose-800 dark:border-rose-500/35 dark:bg-rose-500/10 dark:text-rose-700",
  review_required: "border-violet-500/50 bg-violet-500/15 text-violet-800 dark:border-violet-500/35 dark:bg-violet-500/10 dark:text-violet-700",
  dismissed: "border-zinc-500/50 bg-zinc-500/15 text-zinc-700 dark:border-zinc-500/35 dark:bg-zinc-500/10 dark:text-zinc-500",
};

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "review_required", label: "Review Required" },
  { value: "dismissed", label: "Dismissed" },
];

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
  const router = useRouter();
  const searchParams = useSearchParams();
  const utils = api.useUtils();

  const dismissMutation = api.portalReturns.dismissReturn.useMutation({
    onSuccess: () => {
      void utils.portalReturns.listByOrg.invalidate({ orgId });
      toast.success("Return dismissed");
    },
    onError: (error) => toast.error(error.message),
  });

  const undismissMutation = api.portalReturns.undismissReturn.useMutation({
    onSuccess: () => {
      void utils.portalReturns.listByOrg.invalidate({ orgId });
      toast.success("Return restored");
    },
    onError: (error) => toast.error(error.message),
  });

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const currentCalendarYear = useMemo(() => new Date().getUTCFullYear(), []);
  const [taxYearFilter, setTaxYearFilter] = useState<TaxYearFilter>("all");
  const jurisdictionFilter: JurisdictionFilter = searchParams.get("jurisdiction") ?? "all";
  const setJurisdictionFilter = (value: JurisdictionFilter) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete("jurisdiction");
    } else {
      params.set("jurisdiction", value);
    }
    const qs = params.toString();
    router.replace(`/org/${orgId}/returns${qs ? `?${qs}` : ""}`, { scroll: false });
  };
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const returnsQuery = api.portalReturns.listByOrg.useQuery(
    { orgId },
    { enabled: !!orgId },
  );

  const returns = useMemo(() => returnsQuery.data ?? [], [returnsQuery.data]);
  const taxYearOptions = useMemo(() => {
    const recentYears = Array.from(
      { length: 8 },
      (_, index) => currentCalendarYear - index,
    );
    const syncedYears = returns.map((row) => row.taxYear);
    return Array.from(new Set([...recentYears, ...syncedYears])).sort(
      (left, right) => right - left,
    );
  }, [currentCalendarYear, returns]);
  const jurisdictionFilterOptions = useMemo(() => {
    const uniqueJurisdictions = new Map<string, string>();

    for (const row of returns) {
      if (!uniqueJurisdictions.has(row.jurisdictionCode)) {
        uniqueJurisdictions.set(row.jurisdictionCode, row.jurisdictionName);
      }
    }

    return [
      { value: "all", label: "All jurisdictions" },
      ...Array.from(uniqueJurisdictions.entries())
        .sort((left, right) => left[1].localeCompare(right[1]))
        .map(([code, name]) => ({
          value: code,
          label: `${name} (${code})`,
        })),
    ];
  }, [returns]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();

    return returns
      .filter((row) => {
        if (
          jurisdictionFilter !== "all" &&
          row.jurisdictionCode !== jurisdictionFilter
        ) {
          return false;
        }

        const status = normalizeStatus(row.status);
        if (statusFilter !== "all" && status !== statusFilter) {
          return false;
        }

        if (
          taxYearFilter !== "all" &&
          row.taxYear !== Number(taxYearFilter)
        ) {
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
          return (
            direction *
            normalizeStatus(a.status).localeCompare(normalizeStatus(b.status))
          );
        }

        return (
          direction * (toTimestamp(a.updatedAt) - toTimestamp(b.updatedAt))
        );
      });
  }, [
    jurisdictionFilter,
    query,
    returns,
    sortDirection,
    sortKey,
    statusFilter,
    taxYearFilter,
  ]);

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
            <p className="text-muted-foreground mt-1 text-sm">
              Open a return to manage return uploads, Jersey or Guernsey form
              data, and filing readiness.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="bg-muted/40 text-muted-foreground rounded-lg border px-2.5 py-1.5">
              {returnsQuery.isLoading ? (
                <Skeleton className="h-4 w-14" />
              ) : (
                `${returns.length} total`
              )}
            </span>
            <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-emerald-700">
              {returnsQuery.isLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                `${readyCount} form ready`
              )}
            </span>
          </div>
        </div>

        <div className="bg-muted/20 flex flex-wrap items-center gap-2 border-b p-4">
          <div className="relative w-full max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
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

          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value as StatusFilter);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="Filter returns by status"
              className="bg-background h-9 w-[180px]"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent align="end">
              {STATUS_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={jurisdictionFilter}
            onValueChange={(value) => {
              setJurisdictionFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="Filter returns by jurisdiction"
              className="bg-background h-9 w-[220px]"
            >
              <SelectValue placeholder="All jurisdictions" />
            </SelectTrigger>
            <SelectContent align="end">
              {jurisdictionFilterOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={taxYearFilter}
            onValueChange={(value) => {
              setTaxYearFilter(value as TaxYearFilter);
              setPage(1);
            }}
          >
            <SelectTrigger
              aria-label="Filter returns by tax year"
              className="bg-background h-9 w-[160px]"
            >
              <SelectValue placeholder="All tax years" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All tax years</SelectItem>
              {taxYearOptions.map((year) => (
                <SelectItem key={year} value={`${year}`}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => toggleSort("updated")}
          >
            <ArrowUpDown className="size-4" />
            Sort: {sortKey}
          </Button>
        </div>

        {returnsQuery.isLoading ? (
          <div className="space-y-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="px-4 py-3 text-left font-medium">Entity</th>
                    <th className="px-4 py-3 text-left font-medium">
                      Jurisdiction
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Tax Year
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Filing Status
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Form</th>
                    <th className="px-4 py-3 text-left font-medium">Updated</th>
                    <th className="w-12 px-4 py-3 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
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

        {returnsQuery.error ? (
          <p className="p-6 text-sm text-red-600">
            {returnsQuery.error.message}
          </p>
        ) : null}

        {!returnsQuery.isLoading && !returnsQuery.error ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        className="inline-flex items-center gap-1"
                        onClick={() => toggleSort("entity")}
                      >
                        Entity
                        <ArrowUpDown className="size-3.5" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      Jurisdiction
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        className="inline-flex items-center gap-1"
                        onClick={() => toggleSort("year")}
                      >
                        Tax Year
                        <ArrowUpDown className="size-3.5" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">
                      <button
                        className="inline-flex items-center gap-1"
                        onClick={() => toggleSort("status")}
                      >
                        Filing Status
                        <ArrowUpDown className="size-3.5" />
                      </button>
                    </th>
                    <th className="px-4 py-3 text-left font-medium">Form</th>
                    <th className="px-4 py-3 text-left font-medium">Updated</th>
                    <th className="w-12 px-4 py-3 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const status = normalizeStatus(row.status);
                    const missingCount = Array.isArray(
                      row.missingSubstanceFields,
                    )
                      ? row.missingSubstanceFields.length
                      : 0;

                    const isDismissed = status === "dismissed";
                    const returnHref = `/org/${orgId}/returns/${row.id}`;

                    return (
                      <tr
                        key={row.id}
                        className="border-b/60 hover:bg-muted/25 cursor-pointer transition"
                        onClick={() => router.push(returnHref)}
                      >
                        <td className="px-4 py-3">
                          <SharedElement name={`return-${row.id}`}>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {row.entityName}
                              </p>
                              <p className="text-muted-foreground truncate text-xs">
                                {row.externalId
                                  ? `External ID: ${row.externalId}`
                                  : `${fileCount(row.files)} file(s)`}
                              </p>
                            </div>
                          </SharedElement>
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          {row.jurisdictionName} ({row.jurisdictionCode})
                        </td>
                        <td className="text-muted-foreground px-4 py-3">
                          {row.taxYear}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-lg border px-2 py-1 text-xs font-medium",
                              STATUS_CLASS[status],
                            )}
                          >
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
                        <td className="text-muted-foreground px-4 py-3">
                          {formatDateTime(row.updatedAt)}
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <AlertDialog>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="size-8"
                                >
                                  <EllipsisVertical className="size-4" />
                                  <span className="sr-only">Actions</span>
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-56">
                                <PortalClientAccessMenuSection
                                  taxReturnId={row.id}
                                  entityName={row.entityName}
                                />
                                <DropdownMenuItem
                                  className="cursor-pointer gap-2"
                                  onClick={() => router.push(returnHref)}
                                >
                                  <ExternalLink className="size-3.5" />
                                  Open
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                {isDismissed ? (
                                  <DropdownMenuItem
                                    className="cursor-pointer gap-2"
                                    onClick={() => undismissMutation.mutate({ orgId, taxReturnId: row.id })}
                                  >
                                    Restore
                                  </DropdownMenuItem>
                                ) : (
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      className="cursor-pointer gap-2"
                                      onSelect={(e) => e.preventDefault()}
                                    >
                                      <XCircle className="size-3.5" />
                                      Dismiss
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Dismiss this return?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will mark <strong>{row.entityName}</strong> ({row.taxYear}) as dismissed. You can restore it later from the returns list.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className={buttonVariants({ variant: "destructive" })}
                                  onClick={() => dismissMutation.mutate({ orgId, taxReturnId: row.id })}
                                >
                                  Dismiss
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </td>
                      </tr>
                    );
                  })}

                  {!rows.length ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-muted-foreground px-4 py-10 text-center"
                      >
                        No returns match the current filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t p-4 text-sm">
              <p className="text-muted-foreground">
                Showing{" "}
                {Math.min((currentPage - 1) * PAGE_SIZE + 1, totalCount)}-
                {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
              </p>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() =>
                    setPage((previous) => Math.max(1, previous - 1))
                  }
                >
                  Prev
                </Button>
                <span className="text-muted-foreground text-xs">
                  {currentPage} / {pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= pageCount}
                  onClick={() =>
                    setPage((previous) => Math.min(pageCount, previous + 1))
                  }
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
