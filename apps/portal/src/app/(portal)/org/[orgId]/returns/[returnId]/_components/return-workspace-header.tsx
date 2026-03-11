"use client";

import {
  Building2,
  CalendarClock,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";

import { Button } from "@/components/ui/button";

import {
  STATUS_CLASS,
  STATUS_LABEL,
  type PortalReturnRecord,
  type ReturnStatusTone,
} from "./return-workspace-shared";

type ReturnWorkspaceHeaderProps = {
  activeSectionTitle: string | null;
  selectedReturn: PortalReturnRecord;
  selectedStatus: ReturnStatusTone;
  onOpenFinishSheet: () => void;
};

export function ReturnWorkspaceHeader({
  activeSectionTitle,
  selectedReturn,
  selectedStatus,
  onOpenFinishSheet,
}: ReturnWorkspaceHeaderProps) {
  return (
    <div className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-3xl font-semibold tracking-tight">
              {selectedReturn.entityName}
            </h1>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs ring-1 ${STATUS_CLASS[selectedStatus]}`}
            >
              {STATUS_LABEL[selectedStatus]}
            </span>
          </div>

          <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="size-3.5" />
              {selectedReturn.jurisdictionName} (
              {selectedReturn.jurisdictionCode})
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-3.5" />
              Tax year {selectedReturn.taxYear}
            </span>
            {selectedReturn.externalId ? (
              <>
                <span>·</span>
                <span className="font-mono">{selectedReturn.externalId}</span>
              </>
            ) : null}
            {activeSectionTitle ? (
              <>
                <span>·</span>
                <span>Last opened: {activeSectionTitle}</span>
              </>
            ) : null}
          </p>

          <p className="text-muted-foreground max-w-2xl text-sm">
            Review the ESR manually or open the guided flow to work through the
            return section by section and upload the financial statements at the
            end.
          </p>
        </div>

        <Button asChild className="px-5">
          <motion.button
            type="button"
            onClick={onOpenFinishSheet}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 380, damping: 24 }}
          >
            <Sparkles className="size-4" />
            Guided finish
          </motion.button>
        </Button>
      </div>
    </div>
  );
}
