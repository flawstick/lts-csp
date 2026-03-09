"use client";

import { ArrowUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

import { TasksTablePagination } from "./tasks-table-pagination";
import { TasksTableRow } from "./tasks-table-row";
import type { SortDirection, SortKey, TaskRecord } from "./tasks-table-utils";

function HeaderSortButton({
  label,
  sortKey,
  activeKey,
  direction,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onClick: (key: SortKey) => void;
}) {
  const active = activeKey === sortKey;

  return (
    <button
      type="button"
      onClick={() => onClick(sortKey)}
      className={cn(
        "hover:text-foreground inline-flex items-center gap-1 transition",
        active && "text-foreground",
      )}
    >
      <span>{label}</span>
      <ArrowUpDown
        className={cn(
          "size-3.5",
          active && direction === "desc" && "rotate-180",
        )}
      />
    </button>
  );
}

type Props = {
  orgId: string;
  rows: TaskRecord[];
  sortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (key: SortKey) => void;
  currentPage: number;
  pageCount: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export function TasksTableView({
  orgId,
  rows,
  sortKey,
  sortDirection,
  onSort,
  currentPage,
  pageCount,
  totalCount,
  onPageChange,
}: Props) {
  return (
    <>
      <div>
        <table className="w-full table-fixed text-sm">
          <thead>
            <tr className="text-muted-foreground border-b">
              <th className="px-4 py-3 text-left font-medium">
                <HeaderSortButton
                  label="Return"
                  sortKey="entity"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={onSort}
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">Jurisdiction</th>
              <th className="px-4 py-3 text-left font-medium">Next Step</th>
              <th className="px-4 py-3 text-left font-medium">Progress</th>
              <th className="px-4 py-3 text-left font-medium">
                <HeaderSortButton
                  label="Status"
                  sortKey="status"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={onSort}
                />
              </th>
              <th className="px-4 py-3 text-left font-medium">
                <HeaderSortButton
                  label="Updated"
                  sortKey="updated"
                  activeKey={sortKey}
                  direction={sortDirection}
                  onClick={onSort}
                />
              </th>
              <th className="w-[112px] px-4 py-3 pr-6 text-right font-medium">
                Open
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <TasksTableRow
                key={row.id}
                orgId={orgId}
                row={row}
                index={index}
              />
            ))}
          </tbody>
        </table>
      </div>

      <TasksTablePagination
        currentPage={currentPage}
        pageCount={pageCount}
        totalCount={totalCount}
        onPageChange={onPageChange}
      />
    </>
  );
}
