"use client";

import {
  AlertTriangle,
  Clock3,
  FileSpreadsheet,
  FolderOpen,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type {
  CertificateFilter,
  StatusFilter,
  TaskFilter,
  TaskKind,
  TaxYearFilter,
} from "./tasks-table-utils";
import { STATUS_OPTIONS, TASK_LABEL } from "./tasks-table-utils";

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  taskFilter: TaskFilter;
  onTaskFilterChange: (value: TaskFilter) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (value: StatusFilter) => void;
  certificateFilter: CertificateFilter;
  onCertificateFilterChange: (value: CertificateFilter) => void;
  jurisdictionFilter: string;
  onJurisdictionFilterChange: (value: string) => void;
  taxYearFilter: TaxYearFilter;
  onTaxYearFilterChange: (value: TaxYearFilter) => void;
  taxYearOptions: number[];
  jurisdictions: Array<{ code: string; name: string }>;
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
  certificateFilter,
  onCertificateFilterChange,
  jurisdictionFilter,
  onJurisdictionFilterChange,
  taxYearFilter,
  onTaxYearFilterChange,
  taxYearOptions,
  jurisdictions,
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
    { value: "all", label: "All", count: totalCount },
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
    <div className="p-4 pb-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">Tasks</h1>
          {hasFilters ? (
            <span className="text-muted-foreground text-xs">
              {filteredCount} of {totalCount}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">
              {totalCount} open
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56 sm:flex-initial">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search..."
              className="bg-background h-9 pl-9 text-sm"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(value) =>
              onStatusFilterChange(value as StatusFilter)
            }
          >
            <SelectTrigger
              aria-label="Filter by status"
              className="bg-background h-9 w-[150px] text-sm"
            >
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent align="end">
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {jurisdictions.length > 1 ? (
            <Select
              value={jurisdictionFilter}
              onValueChange={onJurisdictionFilterChange}
            >
              <SelectTrigger
                aria-label="Filter by jurisdiction"
                className="bg-background h-9 w-[160px] text-sm"
              >
                <SelectValue placeholder="All jurisdictions" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="all">All jurisdictions</SelectItem>
                {jurisdictions.map((j) => (
                  <SelectItem key={j.code} value={j.code}>
                    {j.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}

          <Select
            value={taxYearFilter}
            onValueChange={(value) =>
              onTaxYearFilterChange(value as TaxYearFilter)
            }
          >
            <SelectTrigger
              aria-label="Filter by tax year"
              className="bg-background h-9 w-[140px] text-sm"
            >
              <SelectValue placeholder="Tax year" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All years</SelectItem>
              {taxYearOptions.map((year) => (
                <SelectItem key={year} value={`${year}`}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="relative size-9 shrink-0"
                aria-label="Filter by certificate type"
              >
                <ShieldCheck className="size-4" />
                {certificateFilter !== "all" ? (
                  <span className="absolute -top-1 -right-1 size-2 rounded-full bg-primary" />
                ) : null}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {([
                ["all", "All certificates"],
                ["Certificate 2", "Certificate 2"],
                ["Certificate 3", "Certificate 3"],
                ["unresolved", "Unresolved"],
              ] as const).map(([value, label]) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={certificateFilter === value}
                  onCheckedChange={() =>
                    onCertificateFilterChange(value as CertificateFilter)
                  }
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {hasFilters ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 shrink-0"
              onClick={onReset}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {taskFilterButtons.map((filterButton) => {
          const active = taskFilter === filterButton.value;
          const Icon = filterButton.icon;

          return (
            <button
              key={filterButton.value}
              type="button"
              onClick={() => onTaskFilterChange(filterButton.value)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition",
                active
                  ? "border-foreground/15 bg-foreground/5 text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {Icon ? <Icon className="size-3" /> : null}
              <span>{filterButton.label}</span>
              <span
                className={cn(
                  "ml-0.5 tabular-nums",
                  active ? "text-foreground/70" : "text-muted-foreground/60",
                )}
              >
                {filterButton.count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
