"use client";

import {
  Building2,
  CalendarClock,
  Sparkles,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import Magnet from "@/components/Magnet";

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
  isReadOnly?: boolean;
  readOnlyMessage?: string;
  onDismiss?: () => void;
  onUndismiss?: () => void;
  isDismissing?: boolean;
};

export function ReturnWorkspaceHeader({
  activeSectionTitle,
  selectedReturn,
  selectedStatus,
  onOpenFinishSheet,
  isReadOnly = false,
  readOnlyMessage,
  onDismiss,
  onUndismiss,
  isDismissing,
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
          {isReadOnly && readOnlyMessage ? (
            <p className="max-w-2xl rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-800">
              {readOnlyMessage}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {selectedStatus === "dismissed" && onUndismiss ? (
            <Button variant="outline" onClick={onUndismiss} disabled={isDismissing}>
              <RotateCcw className="size-4" />
              Restore
            </Button>
          ) : selectedStatus !== "completed" && onDismiss ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={isDismissing}>
                  <XCircle className="size-4" />
                  Dismiss
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Dismiss this return?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will mark the return as dismissed. You can restore it later from the returns list.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className={buttonVariants({ variant: "destructive" })}
                    onClick={onDismiss}
                  >
                    Dismiss
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}

        <Magnet padding={60} magnetStrength={3} wrapperClassName="cursor-pointer" innerClassName="cursor-pointer">
          <HoverCard openDelay={300} closeDelay={100}>
            <HoverCardTrigger asChild>
              <Button
                className="cursor-pointer px-5"
                onClick={onOpenFinishSheet}
                disabled={isReadOnly}
              >
                <Sparkles className="size-4" />
                Guided finish
              </Button>
            </HoverCardTrigger>
            <HoverCardContent align="end" side="bottom" className="w-72 space-y-2 p-4">
              <p className="text-sm font-semibold">Guided Finish Flow</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {isReadOnly && readOnlyMessage
                  ? readOnlyMessage
                  : "Walk through every ESR section step by step, fill in remaining fields, upload your financial statements, and review everything before marking the return as complete."}
              </p>
              <ol className="space-y-1 text-[11px] text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-px font-semibold text-foreground">1.</span>
                  Complete each substance section
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-px font-semibold text-foreground">2.</span>
                  Upload financial statements PDF
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-px font-semibold text-foreground">3.</span>
                  Review and finalize the return
                </li>
              </ol>
            </HoverCardContent>
          </HoverCard>
        </Magnet>
        </div>
      </div>
    </div>
  );
}
