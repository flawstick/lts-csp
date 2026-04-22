"use client";

import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  EllipsisVertical,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  XCircle,
} from "lucide-react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useNavigateWithTransition } from "@/lib/navigate-with-transition";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { PortalClientAccessMenuSection } from "@/components/portal-client-access-actions";
import { SharedElement } from "@/components/view-transitions";

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
  isAdmin?: boolean;
  isSubmittable?: boolean;
  readyForSubmissionAt?: string | Date | null;
  submittabilityBlockReason?: string | null;
  onMarkReadyForSubmission?: () => void;
  onRevertReadyForSubmission?: () => void;
  isTogglingReadyForSubmission?: boolean;
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
  isAdmin = false,
  isSubmittable = false,
  readyForSubmissionAt = null,
  submittabilityBlockReason = null,
  onMarkReadyForSubmission,
  onRevertReadyForSubmission,
  isTogglingReadyForSubmission = false,
}: ReturnWorkspaceHeaderProps) {
  const params = useParams<{ orgId: string }>();
  const navigate = useNavigateWithTransition();
  const isMarkedReady = Boolean(readyForSubmissionAt);
  const readyTimestamp = readyForSubmissionAt
    ? readyForSubmissionAt instanceof Date
      ? readyForSubmissionAt
      : new Date(readyForSubmissionAt)
    : null;
  const readyTimestampText =
    readyTimestamp && !Number.isNaN(readyTimestamp.getTime())
      ? readyTimestamp.toLocaleString()
      : null;
  const [isDismissDialogOpen, setIsDismissDialogOpen] = useState(false);
  const canDismiss = selectedStatus !== "completed" && Boolean(onDismiss);
  const canRestore = selectedStatus === "dismissed" && Boolean(onUndismiss);

  return (
    <div className="px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-3xl space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => navigate(`/org/${params.orgId}/returns`, "nav-back")}
              className="text-muted-foreground hover:bg-muted/70 hover:text-foreground -ml-1 inline-flex size-8 items-center justify-center rounded-lg transition-colors"
              aria-label="Back to returns"
            >
              <ArrowLeft className="size-4" />
            </button>
            <SharedElement name={`return-${selectedReturn.id}`}>
              <h1 className="text-3xl font-semibold tracking-tight">
                {selectedReturn.entityName}
              </h1>
            </SharedElement>
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
          {isMarkedReady ? (
            <div className="flex max-w-2xl items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-0.5">
                <p className="font-medium">Ready for filing</p>
                <p className="text-xs text-emerald-800/90 dark:text-emerald-300/90">
                  An admin signed off on this return
                  {readyTimestampText ? ` on ${readyTimestampText}` : ""}. LTS
                  Tax can now submit it on the client&apos;s behalf.
                </p>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && !isMarkedReady && onMarkReadyForSubmission ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  <Button
                    variant="default"
                    onClick={onMarkReadyForSubmission}
                    disabled={
                      !isSubmittable ||
                      isTogglingReadyForSubmission ||
                      isReadOnly
                    }
                  >
                    {isTogglingReadyForSubmission ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    Submit for filing
                  </Button>
                </span>
              </TooltipTrigger>
              {!isSubmittable && submittabilityBlockReason ? (
                <TooltipContent side="bottom" className="max-w-xs">
                  {submittabilityBlockReason}
                </TooltipContent>
              ) : null}
            </Tooltip>
          ) : null}
          {isAdmin && isMarkedReady && onRevertReadyForSubmission ? (
            <Button
              variant="outline"
              onClick={onRevertReadyForSubmission}
              disabled={isTogglingReadyForSubmission}
            >
              {isTogglingReadyForSubmission ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RotateCcw className="size-4" />
              )}
              Revert submission
            </Button>
          ) : null}
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
        <AlertDialog
          open={isDismissDialogOpen}
          onOpenChange={setIsDismissDialogOpen}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" className="size-9">
                <EllipsisVertical className="size-4" />
                <span className="sr-only">Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <PortalClientAccessMenuSection
                taxReturnId={selectedReturn.id}
                entityName={selectedReturn.entityName}
              />
              {canRestore || canDismiss ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Return actions</DropdownMenuLabel>
                  {canRestore ? (
                    <DropdownMenuItem
                      onSelect={(event) => {
                        event.preventDefault();
                        onUndismiss?.();
                      }}
                      disabled={isDismissing}
                    >
                      <RotateCcw className="size-4" />
                      Restore
                    </DropdownMenuItem>
                  ) : null}
                  {canDismiss ? (
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={isDismissing}
                      onSelect={(event) => {
                        event.preventDefault();
                        setIsDismissDialogOpen(true);
                      }}
                    >
                      <XCircle className="size-4" />
                      Dismiss
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Dismiss this return?</AlertDialogTitle>
              <AlertDialogDescription>
                This will mark the return as dismissed. You can restore it
                later from the returns list.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={buttonVariants({ variant: "destructive" })}
                onClick={() => onDismiss?.()}
              >
                Dismiss
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
      </div>
    </div>
  );
}
