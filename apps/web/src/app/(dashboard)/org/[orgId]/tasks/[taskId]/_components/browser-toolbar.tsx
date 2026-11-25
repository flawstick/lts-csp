"use client";

import Link from "next/link";
import { useId, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getStatusConfig } from "./types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Play,
  Square,
  Loader2,
  Monitor,
  ExternalLink,
  CheckCircle2,
  History,
  ChevronDown,
  XCircle,
  Clock,
  Pause,
  Trash2,
  RefreshCw,
  FileText,
} from "@/lib/icons";

type Job = {
  id: string;
  jobNumber: number;
  status: string;
  createdAt: Date | string;
};

type StartOptions = {
  overrideSaved?: boolean;
  submissionMode?: "prepare_only" | "submit_and_capture_pdf";
  /** Submit the exact draft the last Prepare only run left ready. */
  filingOperation?: "submit_prepared";
};

type SubmitReadiness = { ready: boolean; blocker: string | null };

/**
 * Server-computed start gates for the two submit operations (getTask). The
 * menu only reflects them; startJob enforces them again on every click.
 */
export type ToolbarSubmitReadiness = {
  submit: SubmitReadiness;
  submitPrepared: SubmitReadiness;
};

type BrowserToolbarProps = {
  orgId: string;
  jurisdictionName: string | null;
  entityName: string | null;
  taskStatus: string;
  isConnected: boolean;
  taxReturnId?: string;
  liveUrl: string | null;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
  allJobs: Job[];
  selectedJobId: string | null;
  selectedJob: Job | null | undefined;
  activeJob: Job | null | undefined;
  runningJob: Job | null | undefined;
  pausedJob: Job | null | undefined;
  onSelectJob: (jobId: string) => void;
  onPause: () => void;
  onCancel: () => void;
  onResume: (jobId: string) => void;
  onStart: (options?: StartOptions) => void;
  onDeleteJob: (jobId: string) => void;
  isStartPending: boolean;
  isPausePending: boolean;
  isCancelPending: boolean;
  isResumePending: boolean;
  isDeletePending: boolean;
  /** Missing (loading, or an older server): the actions stay enabled. */
  submitReadiness?: ToolbarSubmitReadiness | null;
  /** Called when the run actions menu opens, to refresh readiness. */
  onActionsMenuOpen?: () => void;
};

function blockerOf(readiness: SubmitReadiness | undefined) {
  if (!readiness || readiness.ready) return null;
  return readiness.blocker || "This submission cannot start right now.";
}

/** Why the menu item(s) just above are disabled. Not dimmed, so it stays legible. */
function BlockerReason({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <p
      id={id}
      className="text-muted-foreground px-2 pb-1.5 text-[11px] leading-snug break-words"
    >
      {children}
    </p>
  );
}

function JobStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-3.5 text-emerald-500" />;
    case "running":
      return <Loader2 className="size-3.5 animate-spin text-blue-500" />;
    case "starting":
      return <Loader2 className="size-3.5 animate-spin text-sky-500" />;
    case "queued":
      return <Clock className="size-3.5 text-yellow-500" />;
    case "paused":
      return <Pause className="size-3.5 text-amber-500" />;
    case "failed":
      return <XCircle className="size-3.5 text-red-500" />;
    case "cancelled":
      return <XCircle className="text-muted-foreground size-3.5" />;
    default:
      return <Clock className="size-3.5 text-yellow-500" />;
  }
}

function getJobStatusLabel(status: string) {
  switch (status) {
    case "queued":
      return "Queued";
    case "starting":
      return "Starting";
    case "running":
      return "Running";
    case "paused":
      return "Awaiting Input";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Pending";
  }
}

export function BrowserToolbar({
  orgId,
  jurisdictionName,
  entityName,
  taskStatus,
  isConnected,
  taxReturnId,
  liveUrl,
  iframeRef,
  allJobs,
  selectedJobId,
  selectedJob,
  activeJob,
  runningJob,
  pausedJob,
  onSelectJob,
  onPause,
  onCancel,
  onResume,
  onStart,
  onDeleteJob,
  isStartPending,
  isPausePending,
  isCancelPending,
  isResumePending,
  isDeletePending,
  submitReadiness,
  onActionsMenuOpen,
}: BrowserToolbarProps) {
  const reasonIdBase = useId();
  const submitPreparedBlocker = blockerOf(submitReadiness?.submitPrepared);
  const submitBlocker = blockerOf(submitReadiness?.submit);
  // One shared reason when both are blocked for the same reason.
  const sharedBlocker =
    submitPreparedBlocker && submitPreparedBlocker === submitBlocker
      ? submitBlocker
      : null;
  const submitPreparedReasonId = `${reasonIdBase}-submit-prepared-reason`;
  const submitReasonId = `${reasonIdBase}-submit-reason`;
  const [pendingSubmission, setPendingSubmission] =
    useState<StartOptions | null>(null);
  // An explicit acknowledgement guards against filing by accident: Submit
  // stays disabled until the reviewer confirms the return was checked.
  const [submissionAcknowledged, setSubmissionAcknowledged] = useState(false);
  const startPreparation = (overrideSaved = false) => {
    onStart({ submissionMode: "prepare_only", overrideSaved });
  };
  // Disabled menu items still receive click events in some environments;
  // a blocked operation never opens its confirmation.
  const requestPreparedSubmission = () => {
    if (submitPreparedBlocker) return;
    setSubmissionAcknowledged(false);
    setPendingSubmission({
      submissionMode: "submit_and_capture_pdf",
      filingOperation: "submit_prepared",
    });
  };
  const isPreparedSubmission =
    pendingSubmission?.filingOperation === "submit_prepared";
  // Readiness can change while the dialog is open (it refreshes on focus).
  const pendingSubmissionBlocker = pendingSubmission
    ? isPreparedSubmission
      ? submitPreparedBlocker
      : submitBlocker
    : null;
  const requestSubmission = (overrideSaved = false) => {
    if (submitBlocker) return;
    setSubmissionAcknowledged(false);
    setPendingSubmission({
      submissionMode: "submit_and_capture_pdf",
      overrideSaved,
    });
  };
  return (
    <>
      <AlertDialog
        open={pendingSubmission !== null}
        onOpenChange={(open) => {
          if (!open) setPendingSubmission(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isPreparedSubmission
                ? "Submit the prepared return?"
                : "Submit this return?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isPreparedSubmission ? (
                <>
                  This authorises the agent to open the draft of{" "}
                  {entityName || "this entity's return"} left on the review
                  page by the last Prepare only run, confirm it is that exact
                  draft and still ready, and file it with the Revenue Service
                  without changing any answers. It stops without submitting if
                  any check fails.
                </>
              ) : (
                <>
                  This authorises the agent to file{" "}
                  {entityName || "this entity's return"} with the Revenue
                  Service and save the confirmation PDF. Check the return and
                  contact details before continuing.
                  {pendingSubmission?.overrideSaved
                    ? " Existing portal answers will also be overwritten."
                    : ""}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-current"
              checked={submissionAcknowledged}
              onChange={(event) =>
                setSubmissionAcknowledged(event.target.checked)
              }
            />
            <span>
              {isPreparedSubmission
                ? "I have reviewed the prepared draft on the portal, including the employees and the organisation's filing contact, and want to file it now."
                : "I have reviewed this return, including the employees and the organisation's filing contact, and want to file it now."}
            </span>
          </label>
          {pendingSubmissionBlocker ? (
            <p role="alert" className="text-destructive text-sm">
              This submission cannot start: {pendingSubmissionBlocker}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
            <AlertDialogAction
              disabled={!submissionAcknowledged || !!pendingSubmissionBlocker}
              onClick={() => {
                if (
                  pendingSubmission &&
                  submissionAcknowledged &&
                  !pendingSubmissionBlocker
                ) {
                  onStart(pendingSubmission);
                  setPendingSubmission(null);
                }
              }}
            >
              {isPreparedSubmission ? "Submit prepared return" : "Submit return"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <div className="flex h-10 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2">
          <Monitor className="text-muted-foreground size-3.5" />
          <span className="text-muted-foreground text-xs font-medium">
            {jurisdictionName ? `${jurisdictionName} Portal` : "Browser"}
          </span>

          {taxReturnId ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-foreground size-6"
                  asChild
                >
                  <Link href={`/org/${orgId}/returns/${taxReturnId}`}>
                    <FileText className="size-3" />
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>View tax return</TooltipContent>
            </Tooltip>
          ) : null}

          {liveUrl ? (
            <div className="flex items-center gap-0.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground size-6"
                    onClick={() => {
                      if (iframeRef.current) iframeRef.current.src = liveUrl;
                    }}
                  >
                    <RefreshCw className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reload browser</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <a
                    href={liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:bg-accent hover:text-foreground inline-flex size-6 items-center justify-center rounded-md transition-colors"
                  >
                    <ExternalLink className="size-3" />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Open in new tab</TooltipContent>
              </Tooltip>
            </div>
          ) : null}

          {allJobs.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-1 h-6 gap-1 px-2 text-[11px]"
                >
                  <History className="size-3" />
                  Run {selectedJob?.jobNumber ?? 1}
                  <ChevronDown className="size-2.5 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-muted-foreground text-[10px] tracking-wider uppercase">
                  Run History · {allJobs.length} total
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {allJobs.map((job) => (
                  <DropdownMenuItem
                    key={job.id}
                    onClick={() => onSelectJob(job.id)}
                    className={`gap-2 ${selectedJobId === job.id ? "bg-accent" : ""}`}
                  >
                    <JobStatusIcon status={job.status} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium">
                          Run #{job.jobNumber}
                        </span>
                        <span className="text-muted-foreground text-[10px]">
                          {getJobStatusLabel(job.status)}
                        </span>
                      </div>
                      <span className="text-muted-foreground text-[10px]">
                        {new Date(job.createdAt).toLocaleString([], {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {job.status !== "queued" &&
                    job.status !== "starting" &&
                    job.status !== "running" &&
                    job.status !== "paused" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="hover:bg-destructive/10 hover:text-destructive size-5 opacity-0 transition-opacity group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteJob(job.id);
                        }}
                        disabled={isDeletePending}
                      >
                        <Trash2 className="size-3" />
                      </Button>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>

        {/* Status + Controls */}
        <div className="flex items-center gap-1.5">
          {(() => {
            const sc = getStatusConfig(taskStatus);
            return (
              <Badge
                variant="outline"
                className={`h-5 gap-1 px-1.5 text-[10px] font-semibold tracking-wider uppercase ${sc.className}`}
              >
                {taskStatus === "running" ||
                taskStatus === "in_progress" ||
                taskStatus === "starting" ? (
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-blue-500" />
                  </span>
                ) : null}
                {sc.label}
              </Badge>
            );
          })()}

          {isConnected ? (
            <Badge
              variant="outline"
              className="h-5 gap-1 border-emerald-500/30 bg-emerald-500/5 px-1.5 text-[10px] text-emerald-600 dark:text-emerald-400"
            >
              <span className="relative flex size-1.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
              </span>
              Live
            </Badge>
          ) : null}

          {runningJob ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={onPause}
                disabled={isPausePending}
              >
                {isPausePending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Pause className="size-3" />
                )}
                Pause
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-6"
                    onClick={onCancel}
                    disabled={isCancelPending}
                  >
                    <Square className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel task</TooltipContent>
              </Tooltip>
            </>
          ) : activeJob &&
            (activeJob.status === "queued" ||
              activeJob.status === "starting") ? (
            <>
              <Badge
                variant="secondary"
                className="h-6 px-2 text-[11px] font-medium"
              >
                {activeJob.status === "queued" ? "Queued" : "Starting"}
              </Badge>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-6"
                    onClick={onCancel}
                    disabled={isCancelPending}
                  >
                    <Square className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel task</TooltipContent>
              </Tooltip>
            </>
          ) : pausedJob ? (
            <>
              <Button
                size="sm"
                className="h-6 gap-1 bg-amber-500 px-2 text-[11px] hover:bg-amber-600"
                onClick={() => onResume(pausedJob.id)}
                disabled={isResumePending}
              >
                {isResumePending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Play className="size-3" />
                )}
                Resume
              </Button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive size-6"
                    onClick={onCancel}
                    disabled={isCancelPending}
                  >
                    <Square className="size-3" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel task</TooltipContent>
              </Tooltip>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                className="h-7 gap-1.5 px-3 text-xs"
                disabled={isStartPending}
                onClick={() => startPreparation()}
              >
                {isStartPending ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FileText className="size-3" />
                )}
                Prepare only
              </Button>
              <DropdownMenu
                onOpenChange={(open) => {
                  if (open) onActionsMenuOpen?.();
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    disabled={isStartPending}
                  >
                    More <ChevronDown className="size-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Prepare a draft</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => startPreparation(true)}>
                    <History className="mr-2 size-3.5" /> Refill saved answers ·
                    prepare only
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Final submission</DropdownMenuLabel>
                  <DropdownMenuItem
                    disabled={!!submitPreparedBlocker}
                    aria-describedby={
                      submitPreparedBlocker
                        ? sharedBlocker
                          ? submitReasonId
                          : submitPreparedReasonId
                        : undefined
                    }
                    onClick={requestPreparedSubmission}
                  >
                    <CheckCircle2 className="mr-2 size-3.5" /> Submit prepared
                    return…
                  </DropdownMenuItem>
                  {submitPreparedBlocker && !sharedBlocker ? (
                    <BlockerReason id={submitPreparedReasonId}>
                      {submitPreparedBlocker}
                    </BlockerReason>
                  ) : null}
                  <DropdownMenuItem
                    disabled={!!submitBlocker}
                    aria-describedby={submitBlocker ? submitReasonId : undefined}
                    onClick={() => requestSubmission()}
                  >
                    <Play className="mr-2 size-3.5" /> Submit return + save PDF…
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!!submitBlocker}
                    aria-describedby={submitBlocker ? submitReasonId : undefined}
                    onClick={() => requestSubmission(true)}
                  >
                    <History className="mr-2 size-3.5" /> Refill answers +
                    submit…
                  </DropdownMenuItem>
                  {submitBlocker ? (
                    <BlockerReason id={submitReasonId}>
                      {submitBlocker}
                    </BlockerReason>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
