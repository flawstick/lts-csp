"use client";

import { TasksTablePagination } from "./tasks-table-pagination";
import { TasksTableRow } from "./tasks-table-row";
import type { SortDirection, SortKey, TaskRecord } from "./tasks-table-utils";

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
  currentPage,
  pageCount,
  totalCount,
  onPageChange,
}: Props) {
  return (
    <>
      <div className="divide-border/50 divide-y px-4 pb-2">
        {rows.map((row, index) => (
          <TasksTableRow
            key={row.id}
            orgId={orgId}
            row={row}
            index={index}
          />
        ))}
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
