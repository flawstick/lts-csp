"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  EllipsisVertical,
  FileSpreadsheet,
  FolderOpen,
} from "lucide-react";

import { PortalClientAccessMenuSection } from "@/components/portal-client-access-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNavigateWithTransition } from "@/lib/navigate-with-transition";

import {
  STATUS_CLASS,
  STATUS_LABEL,
  classifyTaskKind,
  fileCount,
  formatDateTime,
  formatRelativeTime,
  getTaskAction,
  missingFieldCount,
  normalizeStatus,
  type TaskRecord,
} from "./tasks-table-utils";

const TASK_ICON = {
  review: AlertTriangle,
  active: Clock3,
  esr: FileSpreadsheet,
  documents: FolderOpen,
} as const;

const TASK_DOT_COLOR = {
  review: "bg-amber-500",
  active: "bg-sky-500",
  esr: "bg-violet-500",
  documents: "bg-orange-500",
} as const;

type Props = {
  orgId: string;
  row: TaskRecord;
  index: number;
};

// Entry animation intentionally removed — it re-fired on every mount
// (including every navigation to /tasks) and read like a page transition.
export function TasksTableRow({ orgId, row, index: _index }: Props) {
  const status = normalizeStatus(row.status);
  const taskKind = classifyTaskKind(row);
  const files = fileCount(row.files);
  const missingFields = missingFieldCount(row.missingSubstanceFields);
  const action = getTaskAction(row);
  const updatedLabel = formatRelativeTime(row.updatedAt);
  const updatedTitle = formatDateTime(row.updatedAt);
  const TaskIcon = TASK_ICON[taskKind];
  const navigate = useNavigateWithTransition();
  const href = `/org/${orgId}/returns/${row.id}`;

  return (
    <div className="group">
      <div className="hover:bg-muted/30 -mx-2 flex items-center gap-4 rounded-xl px-2 py-3.5 transition-colors">
        <Link
          href={href}
          onClick={(event) => {
            // Let modifier-clicks (cmd, ctrl, middle-click) open in new tab
            if (
              event.defaultPrevented ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            ) {
              return;
            }
            event.preventDefault();
            navigate(href, "nav-forward");
          }}
          className="flex min-w-0 flex-1 items-center gap-4"
        >
          <div className="relative shrink-0">
            <span
              className={cn(
                "bg-muted/60 text-muted-foreground inline-flex size-10 items-center justify-center rounded-xl border transition-colors",
                "group-hover:border-border/80 group-hover:bg-muted/80",
              )}
            >
              <TaskIcon className="size-4.5" />
            </span>
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-white dark:ring-zinc-950",
                TASK_DOT_COLOR[taskKind],
              )}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <p className="truncate text-sm font-semibold">{row.entityName}</p>
              <span className="text-muted-foreground text-xs">{row.taxYear}</span>
              {row.jurisdictionCode ? (
                <span className="inline-flex rounded-md border border-border/60 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {row.jurisdictionCode}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-0.5 line-clamp-1 text-xs">
              {action.title}
              {action.detail ? ` — ${action.detail}` : ""}
            </p>
          </div>
        </Link>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          {files === 0 ? (
            <span className="inline-flex rounded-md border border-orange-500/20 bg-orange-500/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-600 dark:text-orange-300">
              No docs
            </span>
          ) : null}
          {!row.isSubstanceComplete ? (
            <span className="inline-flex rounded-md border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-medium text-violet-600 dark:text-violet-300">
              {missingFields > 0 ? `${missingFields} missing` : "ESR pending"}
            </span>
          ) : null}
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium",
              STATUS_CLASS[status],
            )}
          >
            {STATUS_LABEL[status]}
          </span>
          <span
            className="text-muted-foreground w-16 text-right text-xs"
            title={updatedTitle}
          >
            {updatedLabel}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8"
                onClick={(event) => event.stopPropagation()}
              >
                <EllipsisVertical className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onClick={(event) => event.stopPropagation()}
            >
              <PortalClientAccessMenuSection
                taxReturnId={row.id}
                entityName={row.entityName}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <ArrowUpRight className="text-muted-foreground/50 group-hover:text-foreground/70 size-4 transition-colors" />
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-8"
                onClick={(event) => event.stopPropagation()}
              >
                <EllipsisVertical className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56"
              onClick={(event) => event.stopPropagation()}
            >
              <PortalClientAccessMenuSection
                taxReturnId={row.id}
                entityName={row.entityName}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          <ArrowUpRight className="text-muted-foreground/50 size-3.5" />
        </div>
      </div>
    </div>
  );
}
