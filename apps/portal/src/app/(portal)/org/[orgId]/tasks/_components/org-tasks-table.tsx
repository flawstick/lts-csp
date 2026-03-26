"use client";

import { CheckCircle2 } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { api } from "@/trpc/react";

import { TasksTableSkeleton } from "./tasks-table-skeleton";
import { TasksTableToolbar } from "./tasks-table-toolbar";
import { TasksTableView } from "./tasks-table-view";
import {
  PAGE_SIZE,
  classifyTaskKind,
  fileCount,
  normalizeStatus,
  toTimestamp,
  type SortDirection,
  type SortKey,
  type StatusFilter,
  type TaskFilter,
  type TaskKind,
  type TaxYearFilter,
} from "./tasks-table-utils";

type Props = {
  orgId: string;
};

export function OrgTasksTable({ orgId }: Props) {
  const currentCalendarYear = new Date().getUTCFullYear();
  const defaultTaxYear = `${currentCalendarYear - 1}` as TaxYearFilter;
  const [query, setQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState<TaskFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState("all");
  const [taxYearFilter, setTaxYearFilter] = useState<TaxYearFilter>(
    defaultTaxYear,
  );
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);

  const deferredQuery = useDeferredValue(query);

  const returnsQuery = api.portalReturns.listByOrg.useQuery(
    { orgId },
    { enabled: !!orgId },
  );

  const tasks = useMemo(
    () =>
      (returnsQuery.data ?? []).filter((row) => {
        if (row.status === "completed") return false;
        // If pending but has docs and ESR is complete, nothing left to do — hide it
        if (
          row.status === "pending" &&
          fileCount(row.files) > 0 &&
          row.isSubstanceComplete
        ) {
          return false;
        }
        return true;
      }),
    [returnsQuery.data],
  );

  const taskCounts = useMemo(
    () =>
      tasks.reduce<Record<TaskKind, number>>(
        (accumulator, row) => {
          accumulator[classifyTaskKind(row)] += 1;
          return accumulator;
        },
        {
          review: 0,
          active: 0,
          esr: 0,
          documents: 0,
        },
      ),
    [tasks],
  );

  const jurisdictions = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of tasks) {
      if (!map.has(row.jurisdictionCode)) {
        map.set(row.jurisdictionCode, row.jurisdictionName);
      }
    }
    return Array.from(map, ([code, name]) => ({ code, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [tasks]);

  const taxYearOptions = useMemo(() => {
    const recentYears = Array.from(
      { length: 8 },
      (_, index) => currentCalendarYear - index,
    );
    const syncedYears = tasks.map((row) => row.taxYear);
    return Array.from(new Set([...recentYears, ...syncedYears])).sort(
      (left, right) => right - left,
    );
  }, [currentCalendarYear, tasks]);

  const filteredRows = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();

    return tasks
      .filter((row) => {
        const taskKind = classifyTaskKind(row);
        const normalizedStatus = normalizeStatus(row.status);

        if (taskFilter !== "all" && taskKind !== taskFilter) {
          return false;
        }

        if (statusFilter !== "all" && normalizedStatus !== statusFilter) {
          return false;
        }

        if (
          jurisdictionFilter !== "all" &&
          row.jurisdictionCode !== jurisdictionFilter
        ) {
          return false;
        }

        if (taxYearFilter !== "all" && row.taxYear !== Number(taxYearFilter)) {
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
      .sort((left, right) => {
        const direction = sortDirection === "asc" ? 1 : -1;

        if (sortKey === "entity") {
          return direction * left.entityName.localeCompare(right.entityName);
        }

        if (sortKey === "year") {
          return direction * (left.taxYear - right.taxYear);
        }

        if (sortKey === "status") {
          return (
            direction *
            normalizeStatus(left.status).localeCompare(
              normalizeStatus(right.status),
            )
          );
        }

        return (
          direction *
          (toTimestamp(left.updatedAt) - toTimestamp(right.updatedAt))
        );
      });
  }, [
    deferredQuery,
    jurisdictionFilter,
    sortDirection,
    sortKey,
    statusFilter,
    taskFilter,
    tasks,
    taxYearFilter,
  ]);

  const totalCount = filteredRows.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [currentPage, filteredRows]);

  useEffect(() => {
    setPage(1);
  }, [
    deferredQuery,
    taskFilter,
    statusFilter,
    jurisdictionFilter,
    taxYearFilter,
    sortKey,
    sortDirection,
  ]);

  const hasFilters =
    query.trim().length > 0 ||
    taskFilter !== "all" ||
    statusFilter !== "all" ||
    jurisdictionFilter !== "all" ||
    taxYearFilter !== "all";

  const toggleSort = (key: SortKey) => {
    setSortDirection((currentDirection) => {
      if (sortKey !== key) {
        setSortKey(key);
        return key === "updated" ? "desc" : "asc";
      }

      return currentDirection === "asc" ? "desc" : "asc";
    });
  };

  if (returnsQuery.isLoading) {
    return <TasksTableSkeleton />;
  }

  if (returnsQuery.error) {
    return (
      <section className="portal-card rounded-2xl border border-red-200 p-5 text-sm text-red-600">
        {returnsQuery.error.message}
      </section>
    );
  }

  if (!tasks.length) {
    return (
      <section className="portal-card rounded-2xl border border-dashed p-12 text-center">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          <span className="inline-flex size-12 items-center justify-center rounded-2xl border bg-emerald-500/10 text-emerald-700">
            <CheckCircle2 className="size-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">No active tasks</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Every return for this organisation is currently complete.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="portal-card overflow-hidden rounded-2xl">
      <TasksTableToolbar
        query={query}
        onQueryChange={setQuery}
        taskFilter={taskFilter}
        onTaskFilterChange={setTaskFilter}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        jurisdictionFilter={jurisdictionFilter}
        onJurisdictionFilterChange={setJurisdictionFilter}
        taxYearFilter={taxYearFilter}
        onTaxYearFilterChange={setTaxYearFilter}
        taxYearOptions={taxYearOptions}
        jurisdictions={jurisdictions}
        filteredCount={totalCount}
        totalCount={tasks.length}
        taskCounts={taskCounts}
        hasFilters={hasFilters}
        onReset={() => {
          setQuery("");
          setTaskFilter("all");
          setStatusFilter("all");
          setJurisdictionFilter("all");
          setTaxYearFilter(defaultTaxYear);
        }}
      />

      {!pageRows.length ? (
        <div className="text-muted-foreground p-10 text-center text-sm">
          No tasks match the current filters.
        </div>
      ) : (
        <TasksTableView
          orgId={orgId}
          rows={pageRows}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={toggleSort}
          currentPage={currentPage}
          pageCount={pageCount}
          totalCount={totalCount}
          onPageChange={setPage}
        />
      )}
    </section>
  );
}
