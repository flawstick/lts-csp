"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowUpDown,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Ellipsis,
  FileSpreadsheet,
  Filter,
  Search,
  Settings2,
  Sparkles,
  SquareCheck,
  XCircle,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, XAxis } from "recharts";

import { Button } from "@/components/ui/button";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DashboardRow = {
  id: string;
  entityName: string;
  taxYear: number;
  status: "pending" | "in_progress" | "completed" | "failed" | "review_required";
  jurisdictionCode: string;
  jurisdictionName: string;
  isSubstanceComplete: boolean;
  fileCount: number;
  updatedAt: string;
};

type Props = {
  orgId: string;
  orgName: string;
  rows: DashboardRow[];
};

type SortField = "entity" | "year" | "status" | "score";
type SortDirection = "asc" | "desc";
type StatusFilter = "all" | DashboardRow["status"];
type TimelineRange = 6 | 10 | "all";
type ThroughputSeriesKey = "pending" | "inProgress" | "completed" | "esrReady";

type TimelinePoint = {
  year: string;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  reviewRequired: number;
  total: number;
  esrReady: number;
};

const statusStyles: Record<DashboardRow["status"], string> = {
  pending:
    "border-amber-500/40 bg-[linear-gradient(90deg,rgba(245,158,11,0.14)_0%,rgba(245,158,11,0.05)_36%,transparent_100%)] text-amber-300",
  in_progress:
    "border-cyan-500/40 bg-[linear-gradient(90deg,rgba(6,182,212,0.14)_0%,rgba(6,182,212,0.05)_36%,transparent_100%)] text-cyan-300",
  completed:
    "border-emerald-500/40 bg-[linear-gradient(90deg,rgba(16,185,129,0.14)_0%,rgba(16,185,129,0.05)_36%,transparent_100%)] text-emerald-300",
  failed:
    "border-rose-500/40 bg-[linear-gradient(90deg,rgba(244,63,94,0.14)_0%,rgba(244,63,94,0.05)_36%,transparent_100%)] text-rose-300",
  review_required:
    "border-violet-500/40 bg-[linear-gradient(90deg,rgba(139,92,246,0.14)_0%,rgba(139,92,246,0.05)_36%,transparent_100%)] text-violet-300",
};

const statusLabel: Record<DashboardRow["status"], string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
  failed: "Failed",
  review_required: "Review Required",
};

const throughputChartConfig = {
  pending: {
    label: "Pending",
    color: "var(--color-chart-2)",
  },
  inProgress: {
    label: "In Progress",
    color: "var(--color-chart-1)",
  },
  completed: {
    label: "Completed",
    color: "var(--color-chart-3)",
  },
  esrReady: {
    label: "ESR Ready",
    color: "var(--color-chart-5)",
  },
} satisfies ChartConfig;

const RANGE_OPTIONS: Array<{ value: TimelineRange; label: string }> = [
  { value: 6, label: "6Y" },
  { value: 10, label: "10Y" },
  { value: "all", label: "All" },
];
const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All Status" },
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "review_required", label: "Review Required" },
];

const SORT_FIELD_OPTIONS: Array<{ value: SortField; label: string }> = [
  { value: "year", label: "Year" },
  { value: "entity", label: "Entity" },
  { value: "status", label: "Status" },
  { value: "score", label: "Score" },
];

const THROUGHPUT_SERIES: Array<{ key: ThroughputSeriesKey; label: string; color: string }> = [
  { key: "pending", label: "Pending", color: "var(--color-pending)" },
  { key: "inProgress", label: "In Progress", color: "var(--color-inProgress)" },
  { key: "completed", label: "Completed", color: "var(--color-completed)" },
  { key: "esrReady", label: "ESR Ready", color: "var(--color-esrReady)" },
];

const PAGE_SIZE = 14;

function returnScore(row: DashboardRow) {
  let score = 0;
  score +=
    row.status === "completed"
      ? 45
      : row.status === "in_progress"
        ? 28
        : row.status === "review_required"
          ? 24
          : row.status === "pending"
            ? 18
            : 8;
  score += row.isSubstanceComplete ? 35 : 10;
  score += Math.min(row.fileCount, 8) * 4;
  return Math.min(score, 100);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = monthNames[date.getUTCMonth()] ?? "Jan";
  const day = date.getUTCDate();
  const year = date.getUTCFullYear();
  return `${month} ${day}, ${year}`;
}

function ratio(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(1, value / total));
}

function percentFromRatio(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0%";
  if (value >= 1) return "100%";
  const percent = value * 100;
  const oneDecimal = percent.toFixed(1);
  return oneDecimal.endsWith(".0") ? `${Math.trunc(percent)}%` : `${oneDecimal}%`;
}

function StatVerticalMeter({
  ratioValue,
  fillClassName,
}: {
  ratioValue: number;
  fillClassName: string;
}) {
  const clamped = Number.isFinite(ratioValue) ? Math.max(0, Math.min(1, ratioValue)) : 0;
  const fillPercent = clamped * 100;
  const fillHeight = fillPercent <= 0 ? "0%" : `${Math.max(fillPercent, 8)}%`;

  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="text-base leading-none text-muted-foreground/70">|</span>
      <span className="relative h-8 w-1.5 overflow-hidden rounded-full bg-border/80">
        <span
          className={cn("absolute inset-x-0 bottom-0 rounded-full", fillClassName)}
          style={{ height: fillHeight }}
        />
      </span>
    </span>
  );
}

function getTimeline(rows: DashboardRow[], range: TimelineRange): TimelinePoint[] {
  const byYear = new Map<number, TimelinePoint>();

  for (const row of rows) {
    const entry =
      byYear.get(row.taxYear) ??
      {
        year: String(row.taxYear),
        pending: 0,
        inProgress: 0,
        completed: 0,
        failed: 0,
        reviewRequired: 0,
        total: 0,
        esrReady: 0,
      };

    entry.total += 1;
    if (row.status === "review_required") {
      entry.reviewRequired += 1;
    } else if (row.status === "in_progress") {
      entry.inProgress += 1;
    } else if (row.status === "pending") {
      entry.pending += 1;
    } else if (row.status === "completed") {
      entry.completed += 1;
    } else {
      entry.failed += 1;
    }

    if (row.isSubstanceComplete) {
      entry.esrReady += 1;
    }

    byYear.set(row.taxYear, entry);
  }

  const sorted = Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([, value]) => value);

  if (range === "all") {
    return sorted;
  }

  return sorted.slice(-range);
}

export function OrgDashboardView({ orgId, orgName, rows }: Props) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortField, setSortField] = useState<SortField>("year");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [page, setPage] = useState(1);
  const [timelineRange, setTimelineRange] = useState<TimelineRange>(6);
  const [showChartLegend, setShowChartLegend] = useState(true);
  const [visibleThroughputSeries, setVisibleThroughputSeries] = useState<Record<ThroughputSeriesKey, boolean>>({
    pending: true,
    inProgress: true,
    completed: true,
    esrReady: true,
  });

  const stats = useMemo(() => {
    const total = rows.length;
    const pending = rows.filter((row) => row.status === "pending" || row.status === "review_required").length;
    const inProgress = rows.filter((row) => row.status === "in_progress").length;
    const completed = rows.filter((row) => row.status === "completed").length;
    const failed = rows.filter((row) => row.status === "failed").length;
    const esrReady = rows.filter((row) => row.isSubstanceComplete).length;

    return {
      total,
      pending,
      inProgress,
      completed,
      failed,
      esrReady,
    };
  }, [rows]);

  const totalOpen = Math.max(stats.total - stats.completed, 0);
  const openRatio = ratio(totalOpen, stats.total);
  const pendingRatio = ratio(stats.pending, stats.total);
  const completionRatio = ratio(stats.completed, stats.total);
  const esrReadyRatio = ratio(stats.esrReady, stats.total);
  const openRate = percentFromRatio(openRatio);
  const pendingRate = percentFromRatio(pendingRatio);
  const completionRate = percentFromRatio(completionRatio);
  const esrReadyRate = percentFromRatio(esrReadyRatio);

  const sortedRecentReturns = useMemo(() => {
    return [...rows]
      .sort((a, b) => {
        const aTime = Date.parse(a.updatedAt);
        const bTime = Date.parse(b.updatedAt);
        return (Number.isNaN(bTime) ? 0 : bTime) - (Number.isNaN(aTime) ? 0 : aTime);
      });
  }, [rows]);

  const recentReturns = useMemo(() => sortedRecentReturns.slice(0, 4), [sortedRecentReturns]);
  const hasMoreRecentReturns = sortedRecentReturns.length > recentReturns.length;
  const latestRecentReturn = sortedRecentReturns[0] ?? null;

  const timeline = useMemo(() => getTimeline(rows, timelineRange), [rows, timelineRange]);
  const timelineRangeLabel = useMemo(
    () => RANGE_OPTIONS.find((option) => option.value === timelineRange)?.label ?? "6Y",
    [timelineRange],
  );
  const sortFieldLabel = useMemo(
    () => SORT_FIELD_OPTIONS.find((option) => option.value === sortField)?.label ?? "Year",
    [sortField],
  );

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    const next = rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!term) return true;
      return (
        row.entityName.toLowerCase().includes(term) ||
        row.jurisdictionCode.toLowerCase().includes(term) ||
        row.jurisdictionName.toLowerCase().includes(term) ||
        `${row.taxYear}`.includes(term)
      );
    });

    next.sort((a, b) => {
      const scoreA = returnScore(a);
      const scoreB = returnScore(b);

      let compared = 0;
      if (sortField === "entity") compared = a.entityName.localeCompare(b.entityName);
      if (sortField === "status") compared = a.status.localeCompare(b.status);
      if (sortField === "year") compared = a.taxYear - b.taxYear;
      if (sortField === "score") compared = scoreA - scoreB;

      return sortDirection === "asc" ? compared : -compared;
    });

    return next;
  }, [rows, search, statusFilter, sortField, sortDirection]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, currentPage]);

  const toggleSort = (field: SortField) => {
    if (sortField !== field) {
      setSortField(field);
      setSortDirection("asc");
      return;
    }
    setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
  };

  const setTimelineRangeFromMenu = (value: string) => {
    if (value === "all") {
      setTimelineRange("all");
      return;
    }
    if (value === "10") {
      setTimelineRange(10);
      return;
    }
    setTimelineRange(6);
  };

  const setStatusFilterFromMenu = (value: string) => {
    setStatusFilter(value as StatusFilter);
    setPage(1);
  };

  const toggleThroughputSeries = (key: ThroughputSeriesKey) => {
    setVisibleThroughputSeries((prev) => {
      const enabledCount = Object.values(prev).filter(Boolean).length;
      if (prev[key] && enabledCount <= 1) {
        return prev;
      }
      return {
        ...prev,
        [key]: !prev[key],
      };
    });
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Welcome Back!</h1>
          <p className="mt-1 text-sm text-muted-foreground">{orgName} dashboard and return operations.</p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={`/org/${orgId}/returns`}>
            <Button variant="outline" className="h-9 gap-2">
              <FileSpreadsheet className="size-4" />
              Open Returns
            </Button>
          </Link>
          <Link href={`/org/${orgId}/tasks`}>
            <Button className="group h-9 gap-2">
              <SquareCheck className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              Go to Tasks
            </Button>
          </Link>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="portal-card rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Total Returns</span>
            <FileSpreadsheet className="size-4 text-muted-foreground" />
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-4xl font-medium leading-none">{stats.total}</p>
              <div className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <span>{totalOpen} open</span>
                <StatVerticalMeter ratioValue={openRatio} fillClassName="bg-slate-500" />
                <span>{openRate}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="portal-card rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Pending / Review</span>
            <Clock3 className="size-4 text-muted-foreground" />
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-4xl font-medium leading-none">{stats.pending}</p>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-amber-500">
                <StatVerticalMeter ratioValue={pendingRatio} fillClassName="bg-amber-500" />
                <span>{pendingRate}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="portal-card rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">Completed</span>
            <CheckCircle2 className="size-4 text-muted-foreground" />
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-4xl font-medium leading-none">{stats.completed}</p>
              <span className="inline-flex items-center gap-2 text-sm font-medium text-emerald-500">
                <StatVerticalMeter ratioValue={completionRatio} fillClassName="bg-emerald-500" />
                <span>{completionRate}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="portal-card rounded-xl p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">ESR Ready / Failed</span>
            <Sparkles className="size-4 text-muted-foreground" />
          </div>
          <div className="rounded-lg border bg-muted/40 p-4">
            <div className="flex items-center justify-between">
              <p className="text-4xl font-medium leading-none">{stats.esrReady}</p>
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-rose-500">
                  <XCircle className="size-3.5" />
                  {stats.failed}
                </span>
                <StatVerticalMeter ratioValue={esrReadyRatio} fillClassName="bg-cyan-500" />
                <span className="text-sm font-medium text-cyan-500">{esrReadyRate}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
        <div className="portal-card rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
            <h2 className="text-xl font-medium">Returns Throughput</h2>

            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5">
                    <CalendarDays className="size-3.5" />
                    Tax years: {timelineRangeLabel}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuLabel>Visible Years</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={String(timelineRange)}
                    onValueChange={setTimelineRangeFromMenu}
                  >
                    {RANGE_OPTIONS.map((option) => (
                      <DropdownMenuRadioItem key={String(option.value)} value={String(option.value)}>
                        {option.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon-sm" className="h-8 w-8">
                    <Settings2 className="size-4" />
                    <span className="sr-only">Chart settings</span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64">
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold">Chart Settings</p>
                      <p className="text-xs text-muted-foreground">Show or hide line series.</p>
                    </div>

                    <div className="space-y-2">
                      {THROUGHPUT_SERIES.map((series) => (
                        <button
                          key={series.key}
                          type="button"
                          onClick={() => toggleThroughputSeries(series.key)}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-left text-xs transition",
                            visibleThroughputSeries[series.key]
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-muted/20 text-muted-foreground",
                          )}
                        >
                          <span className="inline-flex items-center gap-2">
                            <span className="size-2.5 rounded-full" style={{ backgroundColor: series.color }} />
                            {series.label}
                          </span>
                          <span>{visibleThroughputSeries[series.key] ? "On" : "Off"}</span>
                        </button>
                      ))}
                    </div>

                    <Button
                      type="button"
                      variant={showChartLegend ? "default" : "outline"}
                      size="sm"
                      className="h-8 w-full"
                      onClick={() => setShowChartLegend((prev) => !prev)}
                    >
                      Legend: {showChartLegend ? "Visible" : "Hidden"}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="p-4">
            <ChartContainer config={throughputChartConfig} className="h-[320px] w-full">
              <LineChart data={timeline} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="4 5" />
                <XAxis dataKey="year" tickLine={false} axisLine={false} dy={8} />
                <ChartTooltip
                  cursor={{ stroke: "var(--border)", strokeDasharray: "4 4" }}
                  content={<ChartTooltipContent indicator="dot" />}
                />
                {showChartLegend ? <ChartLegend content={<ChartLegendContent />} /> : null}
                {visibleThroughputSeries.pending ? (
                  <Line
                    type="monotone"
                    dataKey="pending"
                    stroke="var(--color-pending)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                ) : null}
                {visibleThroughputSeries.inProgress ? (
                  <Line
                    type="monotone"
                    dataKey="inProgress"
                    stroke="var(--color-inProgress)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                ) : null}
                {visibleThroughputSeries.completed ? (
                  <Line
                    type="monotone"
                    dataKey="completed"
                    stroke="var(--color-completed)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                ) : null}
                {visibleThroughputSeries.esrReady ? (
                  <Line
                    type="monotone"
                    dataKey="esrReady"
                    stroke="var(--color-esrReady)"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                ) : null}
              </LineChart>
            </ChartContainer>
          </div>
        </div>

        <aside className="portal-card rounded-xl">
          <div className="flex items-center justify-between border-b p-4">
            <h3 className="text-xl font-medium">Recent Returns</h3>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm">
                  <Ellipsis className="size-4" />
                  <span className="sr-only">Recent return actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem asChild>
                  <Link href={`/org/${orgId}/returns`}>Open return workspace</Link>
                </DropdownMenuItem>
                {latestRecentReturn ? (
                  <DropdownMenuItem asChild>
                    <Link href={`/org/${orgId}/returns/${latestRecentReturn.id}`}>Open latest return</Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={`/org/${orgId}/returns`}>Show all returns</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="space-y-2.5 p-3">
            {recentReturns.length ? (
              recentReturns.map((row) => (
                <Link
                  key={row.id}
                  href={`/org/${orgId}/returns/${row.id}`}
                  className="group block rounded-lg border bg-muted/20 p-2.5 transition hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{row.entityName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.jurisdictionCode} • {row.taxYear}
                      </p>
                    </div>
                    <span className={cn("shrink-0 rounded-lg border px-2 py-1 text-[10px] font-medium", statusStyles[row.status])}>
                      {statusLabel[row.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-muted-foreground">Updated {formatDate(row.updatedAt)}</p>
                </Link>
              ))
            ) : (
              <div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
                No recent returns yet.
              </div>
            )}

            {hasMoreRecentReturns ? (
              <Link href={`/org/${orgId}/returns`} className="block pt-1">
                <Button variant="outline" size="sm" className="h-8 w-full">
                  Show all
                </Button>
              </Link>
            ) : null}
          </div>
        </aside>
      </section>

      <section className="portal-card overflow-hidden rounded-xl">
        <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-medium">Return Management</h3>
            <span className="hidden h-5 w-px bg-border sm:block" />
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Search"
                className="h-9 bg-muted/40 pl-8"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-1.5">
                  <Filter className="size-4" />
                  {STATUS_FILTER_OPTIONS.find((option) => option.value === statusFilter)?.label ?? "All Status"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup value={statusFilter} onValueChange={setStatusFilterFromMenu}>
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9 gap-1.5">
                  <ArrowUpDown className="size-4" />
                  Sort: {sortFieldLabel} {sortDirection === "asc" ? "↑" : "↓"}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>Sort Field</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sortField}
                  onValueChange={(value) => {
                    setSortField(value as SortField);
                    setPage(1);
                  }}
                >
                  {SORT_FIELD_OPTIONS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Direction</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sortDirection}
                  onValueChange={(value) => {
                    setSortDirection(value as SortDirection);
                    setPage(1);
                  }}
                >
                  <DropdownMenuRadioItem value="asc">Ascending</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="desc">Descending</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
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
                    Year
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort("status")}>
                    Status
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">ESR</th>
                <th className="px-4 py-3 text-left font-medium">
                  <button className="inline-flex items-center gap-1" onClick={() => toggleSort("score")}>
                    Score
                    <ArrowUpDown className="size-3.5" />
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">Updated</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const score = returnScore(row);
                return (
                  <tr key={row.id} className="border-b/60 transition hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.entityName}</p>
                      <p className="text-xs text-muted-foreground">{row.fileCount} files</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.jurisdictionCode}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.taxYear}</td>
                    <td className="px-4 py-3">
                      <span className={cn("inline-flex rounded-lg border px-2 py-1 text-xs font-medium", statusStyles[row.status])}>
                        {statusLabel[row.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-lg border px-2 py-1 text-xs font-medium",
                          row.isSubstanceComplete
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-violet-500/40 bg-violet-500/10 text-violet-300",
                        )}
                      >
                        {row.isSubstanceComplete ? "Ready" : "Pending"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              score >= 75 ? "bg-emerald-500" : score >= 45 ? "bg-cyan-500" : "bg-amber-500",
                            )}
                            style={{ width: `${score}%` }}
                          />
                        </div>
                        <span className="text-xs font-semibold">{score}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(row.updatedAt)}</td>
                  </tr>
                );
              })}
              {!pageRows.length ? (
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
            Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredRows.length)}-
            {Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>
              Prev
            </Button>
            <span className="text-xs text-muted-foreground">
              {currentPage} / {pageCount}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
