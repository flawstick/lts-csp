"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import {
  TASK_CLASS,
  TASK_LABEL,
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

const rowVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  hover: {},
};

const dotVariants = {
  initial: { scale: 1, opacity: 0.5 },
  animate: { scale: 1, opacity: 0.5 },
  hover: { scale: 1.15, opacity: 0.9 },
};

const badgeVariants = {
  initial: { opacity: 1, x: 0 },
  animate: { opacity: 1, x: 0 },
  hover: { x: 1.5 },
};

type Props = {
  orgId: string;
  row: TaskRecord;
  index: number;
};

export function TasksTableRow({ orgId, row, index }: Props) {
  const status = normalizeStatus(row.status);
  const taskKind = classifyTaskKind(row);
  const files = fileCount(row.files);
  const missingFields = missingFieldCount(row.missingSubstanceFields);
  const action = getTaskAction(row);
  const updatedLabel = formatRelativeTime(row.updatedAt);
  const updatedTitle = formatDateTime(row.updatedAt);
  const metadataLabel = row.externalId
    ? `Tax year ${row.taxYear} • External ID ${row.externalId}`
    : `Tax year ${row.taxYear}`;

  return (
    <motion.tr
      layout
      initial="initial"
      animate="animate"
      whileHover="hover"
      variants={rowVariants}
      transition={{
        duration: 0.18,
        delay: index < 12 ? index * 0.015 : 0,
        ease: "easeOut",
      }}
      className="group border-b/60 hover:bg-muted/20"
    >
      <td className="px-4 py-3">
        <div className="flex items-start gap-3">
          <motion.span
            variants={dotVariants}
            transition={{ duration: 0.16, ease: "easeOut" }}
            className="bg-foreground/25 mt-1.5 size-2.5 shrink-0 rounded-full"
          />

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-medium">{row.entityName}</p>
              <motion.span
                variants={badgeVariants}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className={cn(
                  "inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium",
                  TASK_CLASS[taskKind],
                )}
              >
                {TASK_LABEL[taskKind]}
              </motion.span>
            </div>

            <p className="text-muted-foreground mt-1 truncate text-xs">
              {metadataLabel}
            </p>
          </div>
        </div>
      </td>

      <td className="text-muted-foreground px-4 py-3">
        <p className="truncate">
          {row.jurisdictionName} ({row.jurisdictionCode})
        </p>
      </td>

      <td className="px-4 py-3">
        <div className="max-w-[20rem]">
          <p className="font-medium">{action.title}</p>
          <p className="text-muted-foreground mt-1 truncate text-xs">
            {action.detail}
          </p>
        </div>
      </td>

      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          <span
            className={cn(
              "inline-flex rounded-full border px-2 py-1 text-[11px] font-medium",
              files > 0
                ? "border-slate-200 bg-slate-50 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-white/80"
                : "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-200",
            )}
          >
            {files > 0
              ? `${files} document${files === 1 ? "" : "s"}`
              : "No documents"}
          </span>
          <span
            className={cn(
              "inline-flex rounded-full border px-2 py-1 text-[11px] font-medium",
              row.isSubstanceComplete
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200"
                : "border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-200",
            )}
          >
            {row.isSubstanceComplete
              ? "ESR ready"
              : missingFields > 0
                ? `${missingFields} missing`
                : "ESR pending"}
          </span>
        </div>
      </td>

      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-1 text-[11px] font-medium",
            STATUS_CLASS[status],
          )}
        >
          {STATUS_LABEL[status]}
        </span>
      </td>

      <td className="px-4 py-3">
        <p className="truncate font-medium" title={updatedTitle}>
          {updatedLabel}
        </p>
      </td>

      <td className="px-4 py-3 pr-6 text-right">
        <motion.div
          variants={badgeVariants}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="inline-flex"
        >
          <Button
            asChild
            size="sm"
            variant="outline"
            className="bg-background h-8 gap-1.5"
          >
            <Link href={`/org/${orgId}/returns/${row.id}`}>
              Open
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </motion.div>
      </td>
    </motion.tr>
  );
}
