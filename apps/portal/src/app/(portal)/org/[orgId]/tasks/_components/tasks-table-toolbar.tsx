"use client";

import {
  AlertTriangle,
  Clock3,
  FileSpreadsheet,
  FolderOpen,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { StatusFilter, TaskFilter, TaskKind } from "./tasks-table-utils";
import { STATUS_OPTIONS, TASK_LABEL } from "./tasks-table-utils";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  taskFilter: TaskFilter;
  onTaskFilterChange: (value: TaskFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  filteredCount: number;
  totalCount: number;
  taskCounts: Record<TaskKind, number>;
  hasFilters: boolean;
  onReset: () => void;
};

export function TasksTableToolbar({
  query,
  onQueryChange,
  taskFilter,
  onTaskFilterChange,
  statusFilter,
  onStatusFilterChange,
  filteredCount,
  totalCount,
  taskCounts,
  hasFilters,
  onReset,
}: Props) {
  const taskFilterButtons: Array<{
    value: TaskFilter;
    label: string;
    count: number;
    icon?: typeof AlertTriangle;
  }> = [
    { value: "all", label: "All Open", count: totalCount },
    {
      value: "review",
      label: TASK_LABEL.review,
      count: taskCounts.review,
      icon: AlertTriangle,
    },
    {
      value: "active",
      label: TASK_LABEL.active,
      count: taskCounts.active,
      icon: Clock3,
    },
    {
      value: "esr",
      label: TASK_LABEL.esr,
      count: taskCounts.esr,
      icon: FileSpreadsheet,
    },
    {
      value: "documents",
      label: TASK_LABEL.documents,
      count: taskCounts.documents,
      icon: FolderOpen,
    },
  ];

  return (
    <div className="border-b p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
            <span className="bg-muted/35 text-muted-foreground inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">
              {filteredCount} shown
            </span>
            <span className="bg-muted/35 text-muted-foreground inline-flex rounded-full border px-2.5 py-1 text-xs font-medium">
              {totalCount} open total
            </span>
          </div>

          <p className="text-muted-foreground mt-2 text-sm">
            Search, filter, sort, and paginate every open return from one table.
          </p>
        </div>

        <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search entity, jurisdiction, year, or external ID"
              className="bg-background h-10 pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              onStatusFilterChange(event.target.value as StatusFilter)
            }
            className="bg-background h-10 rounded-xl border px-3 text-sm sm:w-auto"
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {hasFilters ? (
            <Button
              variant="outline"
              className="h-10 shrink-0"
              onClick={onReset}
            >
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {taskFilterButtons.map((filterButton) => {
          const active = taskFilter === filterButton.value;
          const Icon = filterButton.icon;

          return (
            <button
              key={filterButton.value}
              type="button"
              onClick={() => onTaskFilterChange(filterButton.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition",
                active
                  ? "border-foreground/15 bg-muted/65 text-foreground shadow-sm"
                  : "bg-background text-muted-foreground hover:bg-muted/35 hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="size-3.5" /> : null}
              <span>{filterButton.label}</span>
              <span className="rounded-full bg-black/5 px-1.5 py-0.5 text-xs dark:bg-white/10">
                {filterButton.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
