"use client";

import { useEffect, useId, useState } from "react";
import type { RouterOutputs } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronDown, ChevronLeft, Loader2, Lock } from "@/lib/icons";
import { cn } from "@/lib/utils";

export type SubmitDispatchLock =
  RouterOutputs["taxReturn"]["getSubmitDispatchLock"];
export type SubmitLockRun = SubmitDispatchLock["runs"][number];

export type RecordNotSubmittedInput = {
  jobId: string;
  /** The browser stop time the form showed (null: none recorded). */
  checkedAfterBrowserStoppedAt: number | null;
  note: string;
};

/** The Submit prepared return runs that still lock submitting (none: unlocked). */
export function getLockingRuns(
  lock: SubmitDispatchLock | null | undefined,
): SubmitLockRun[] {
  if (!lock?.blocker) return [];
  return lock.runs.filter((run) => !run.confirmation);
}

function formatTime(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

function agentReportText(report: SubmitLockRun["agentReport"]) {
  return [
    report.output,
    report.question ? `Question: ${report.question}` : null,
    report.error ? `Run error: ${report.error}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

type SubmitLockDialogProps = {
  taskId: string;
  /** getSubmitDispatchLock; undefined while loading. */
  lock: SubmitDispatchLock | null | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectJob?: (jobId: string) => void;
  onStopBrowser: (jobId: string) => void;
  /** The run whose browser is being stopped, if any. */
  stoppingJobId: string | null;
  isStopPending: boolean;
  /** Resolves once recorded; rejects (already reported) when refused. */
  onRecordNotSubmitted: (input: RecordNotSubmittedInput) => Promise<unknown>;
  isRecordPending: boolean;
};

/**
 * Opened from the toolbar's "Submit locked" indicator while a Submit
 * prepared return run that reached the portal (and saved no receipt) blocks
 * every new submission of the return. Lists what each run reported and lets
 * staff, in two steps, stop the run's browser and then (a quiet period
 * later, after checking the Guernsey Tax Portal themselves) record that the
 * run did NOT submit. The record form is a second view of the same dialog.
 * The server re-checks every condition; the agent's report alone never
 * lifts the lock.
 */
export function SubmitLockDialog({
  taskId,
  lock,
  open,
  onOpenChange,
  onSelectJob,
  onStopBrowser,
  stoppingJobId,
  isStopPending,
  onRecordNotSubmitted,
  isRecordPending,
}: SubmitLockDialogProps) {
  const idBase = useId();
  const noteId = `${idBase}-note`;
  const confirmId = `${idBase}-confirm`;
  const [targetJobId, setTargetJobId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);
  const [expandedReports, setExpandedReports] = useState<Set<string>>(
    () => new Set(),
  );

  const lockingRuns = getLockingRuns(lock);
  const isLocked = lockingRuns.length > 0;

  // The lock was lifted (here or elsewhere): nothing is left to show.
  useEffect(() => {
    if (open && lock && !isLocked && !isRecordPending) onOpenChange(false);
  }, [open, lock, isLocked, isRecordPending, onOpenChange]);

  const handleOpenChange = (next: boolean) => {
    if (!next && isRecordPending) return;
    if (!next) setTargetJobId(null);
    onOpenChange(next);
  };

  if (!lock) return null;

  // Limits come from the server (the shared module uses node:crypto).
  const {
    noteMinLength,
    noteMaxLength,
    quietPeriodMinutes,
    unverifiedQuietPeriodHours,
  } = lock;
  const target = lockingRuns.find((run) => run.jobId === targetJobId) ?? null;
  const targetStoppedAt = target?.browserStop?.stoppedAt ?? null;
  const targetStoppedAtLabel = formatTime(targetStoppedAt);
  const trimmedNote = note.trim();
  const canSubmit =
    !!target &&
    !target.confirmRefusal &&
    checked &&
    trimmedNote.length >= noteMinLength &&
    !isRecordPending;

  const openRecordForm = (jobId: string) => {
    setTargetJobId(jobId);
    setNote("");
    setChecked(false);
  };

  const toggleReport = (jobId: string, next: boolean) => {
    setExpandedReports((current) => {
      const updated = new Set(current);
      if (next) updated.add(jobId);
      else updated.delete(jobId);
      return updated;
    });
  };

  const submitRecord = async () => {
    if (!target || !canSubmit) return;
    try {
      await onRecordNotSubmitted({
        jobId: target.jobId,
        checkedAfterBrowserStoppedAt: targetStoppedAt,
        note: trimmedNote,
      });
      setTargetJobId(null);
    } catch {
      // Refused: the caller has shown why; the form stays as filled in.
    }
  };

  return (
    <Dialog open={open && isLocked} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        onEscapeKeyDown={(event) => {
          if (isRecordPending) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (isRecordPending) event.preventDefault();
        }}
      >
        {target ? (
          <>
            <DialogHeader className="shrink-0 border-b px-4 pt-4 pr-12 pb-3 text-left sm:px-6 sm:pt-6">
              <DialogTitle className="leading-snug">
                Record that run #{target.jobNumber} did not submit?
              </DialogTitle>
              <DialogDescription>
                Do this only after you have checked the Guernsey Tax Portal
                yourself
                {targetStoppedAtLabel
                  ? `, after the run's browser was stopped at ${targetStoppedAtLabel}`
                  : ""}
                . A check made before that does not count. Do not rely on the
                agent&apos;s report. If the portal accepted this return, a new
                submission could file it twice. Your name, the time and your
                note are saved on the run and on the return. After this, run
                Prepare only again before you submit.
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              <div className="space-y-2">
                <Label htmlFor={noteId}>
                  What the portal shows for this return
                </Label>
                <Textarea
                  id={noteId}
                  value={note}
                  maxLength={noteMaxLength}
                  disabled={isRecordPending}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Checked 25 Nov 14:10: the 2025 return is still a draft; no submitted return or receipt."
                />
                <p className="text-muted-foreground text-xs">
                  At least {noteMinLength} characters.
                </p>
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id={confirmId}
                  checked={checked}
                  disabled={isRecordPending}
                  onCheckedChange={(value) => setChecked(value === true)}
                  className="mt-0.5"
                />
                <Label
                  htmlFor={confirmId}
                  className="text-sm leading-snug font-normal"
                >
                  {targetStoppedAtLabel
                    ? `I checked the Guernsey Tax Portal after ${targetStoppedAtLabel}. This return was NOT submitted.`
                    : "I checked the Guernsey Tax Portal just now. This return was NOT submitted."}
                </Label>
              </div>

              {target.confirmRefusal ? (
                <p role="alert" className="text-destructive text-sm">
                  {target.confirmRefusal}
                </p>
              ) : null}
            </div>

            <DialogFooter className="shrink-0 border-t px-4 py-3 sm:px-6">
              <Button
                variant="outline"
                disabled={isRecordPending}
                onClick={() => setTargetJobId(null)}
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
              <Button disabled={!canSubmit} onClick={() => void submitRecord()}>
                {isRecordPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : null}
                Record not submitted
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader className="shrink-0 border-b px-4 pt-4 pr-12 pb-3 text-left sm:px-6 sm:pt-6">
              <DialogTitle className="flex items-center gap-2 leading-snug">
                <Lock
                  aria-hidden
                  className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
                />
                Submitting is locked for this return
              </DialogTitle>
              <DialogDescription>{lock.blocker}</DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6">
              {lockingRuns.map((run) => (
                <LockingRunSection
                  key={run.jobId}
                  run={run}
                  isOtherTask={run.taskId !== taskId}
                  quietPeriodMinutes={quietPeriodMinutes}
                  unverifiedQuietPeriodHours={unverifiedQuietPeriodHours}
                  reportExpanded={expandedReports.has(run.jobId)}
                  onReportExpandedChange={(next) =>
                    toggleReport(run.jobId, next)
                  }
                  onShowRun={
                    onSelectJob
                      ? () => {
                          onSelectJob(run.jobId);
                          handleOpenChange(false);
                        }
                      : undefined
                  }
                  onStopBrowser={() => onStopBrowser(run.jobId)}
                  isStopping={isStopPending && stoppingJobId === run.jobId}
                  isStopPending={isStopPending}
                  onRecord={() => openRecordForm(run.jobId)}
                />
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LockingRunSection({
  run,
  isOtherTask,
  quietPeriodMinutes,
  unverifiedQuietPeriodHours,
  reportExpanded,
  onReportExpandedChange,
  onShowRun,
  onStopBrowser,
  isStopping,
  isStopPending,
  onRecord,
}: {
  run: SubmitLockRun;
  isOtherTask: boolean;
  quietPeriodMinutes: number;
  unverifiedQuietPeriodHours: number;
  reportExpanded: boolean;
  onReportExpandedChange: (expanded: boolean) => void;
  onShowRun?: () => void;
  onStopBrowser: () => void;
  isStopping: boolean;
  isStopPending: boolean;
  onRecord: () => void;
}) {
  const dispatched = formatTime(run.dispatchedAt);
  const ended = formatTime(run.completedAt);
  const reportText = agentReportText(run.agentReport);
  const titleId = useId();

  return (
    <section
      aria-labelledby={titleId}
      className="space-y-3 rounded-md border p-3 text-sm"
    >
      <div className="space-y-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h3 id={titleId} className="font-medium">
            Submit prepared return, run #{run.jobNumber}
            {isOtherTask ? " (another task on this return)" : ""}
          </h3>
          {!isOtherTask && onShowRun ? (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={onShowRun}
            >
              Show run
            </Button>
          ) : null}
        </div>
        <p className="text-muted-foreground text-xs">
          {run.status}
          {dispatched ? ` · reached the portal ${dispatched}` : ""}
          {ended ? ` · ended ${ended}` : ""}
          {run.receiptCaptureStatus
            ? ` · receipt capture: ${run.receiptCaptureStatus}`
            : ""}
        </p>
      </div>

      {reportText ? (
        <Collapsible
          open={reportExpanded}
          onOpenChange={onReportExpandedChange}
        >
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground -ml-2 h-7 gap-1 px-2 text-xs"
            >
              <ChevronDown
                aria-hidden
                className={cn(
                  "size-3.5 transition-transform",
                  reportExpanded ? "rotate-180" : "",
                )}
              />
              {reportExpanded ? "Hide agent report" : "Show agent report"}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 pt-1">
            <p className="text-muted-foreground text-xs">
              What the agent reported (its own words, not verified):
            </p>
            <pre
              tabIndex={0}
              aria-label={`Agent report for run #${run.jobNumber}`}
              className="bg-muted/60 max-h-60 overflow-auto rounded p-2 font-mono text-xs break-words whitespace-pre-wrap"
            >
              {reportText}
            </pre>
          </CollapsibleContent>
        </Collapsible>
      ) : (
        <p className="text-muted-foreground text-xs italic">
          The run recorded no report.
        </p>
      )}

      <div className="space-y-1.5">
        <p className="text-xs font-medium">
          Step 1: stop the run&apos;s browser
        </p>
        {run.browserStop ? (
          <p className="text-muted-foreground text-xs">
            Stopped {formatTime(run.browserStop.stoppedAt)}
            {run.browserStop.stoppedByName
              ? ` by ${run.browserStop.stoppedByName}`
              : ""}
            {run.browserStop.verified
              ? `. Browser Use reported "${run.browserStop.statusAfter}".`
              : `. Browser Use could not confirm it stopped, so the run can only be confirmed after ${unverifiedQuietPeriodHours} hours with no activity.`}
            {run.browserStop.wasActive
              ? " It was still active when it was stopped."
              : ""}
          </p>
        ) : run.hasBrowserSession ? (
          <p className="text-muted-foreground text-xs">
            Not stopped from here yet. Your portal check only counts once the
            browser is stopped and {quietPeriodMinutes} minutes have passed.
          </p>
        ) : (
          <p className="text-muted-foreground text-xs">
            This run recorded no browser session, so the app cannot stop or
            check its browser. It can be confirmed only after{" "}
            {unverifiedQuietPeriodHours} hours with no activity.
          </p>
        )}
        {run.hasBrowserSession ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!!run.stopRefusal || isStopPending}
              onClick={onStopBrowser}
            >
              {isStopping ? <Loader2 className="size-4 animate-spin" /> : null}
              {run.browserStop ? "Stop browser again" : "Stop browser"}
            </Button>
            {run.stopRefusal ? (
              <span className="text-muted-foreground text-xs">
                {run.stopRefusal}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium">
          Step 2: check the Guernsey Tax Portal, then record the result
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!!run.confirmRefusal}
            onClick={onRecord}
          >
            I checked the portal: not submitted…
          </Button>
          {run.confirmRefusal ? (
            <span className="text-muted-foreground text-xs">
              {run.confirmRefusal}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
