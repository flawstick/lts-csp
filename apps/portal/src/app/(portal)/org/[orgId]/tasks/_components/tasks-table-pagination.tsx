"use client";

import { Button } from "@/components/ui/button";

import { PAGE_SIZE } from "./tasks-table-utils";

type Props = {
  currentPage: number;
  pageCount: number;
  totalCount: number;
  onPageChange: (page: number) => void;
};

export function TasksTablePagination({
  currentPage,
  pageCount,
  totalCount,
  onPageChange,
}: Props) {
  const start = totalCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalCount);

  return (
    <div className="flex items-center justify-between border-t p-4 text-sm">
      <p className="text-muted-foreground">
        Showing {start}-{end} of {totalCount}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
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
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
