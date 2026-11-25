"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, TriangleAlertIcon } from "@/lib/icons";

function formatTime(value: Date | string | number | null | undefined) {
  if (value === null || value === undefined) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleString();
}

/**
 * Shown on the task page while a Submit prepared return run that reached
 * the portal (and saved no receipt) blocks every new submission of the
 * return. Lists what each run reported and lets staff, in two steps, stop the
 * run's browser and then (a quiet period later, after checking the Guernsey
 * Tax Portal themselves) record that the run did NOT submit. The server
 * re-checks every condition; the agent's report alone never lifts the lock.
 */
export function SubmitLockBanner(props: {
  taskId: string;
  onSelectJob?: (jobId: string) => void;
}) {
  const { taskId, onSelectJob } = props;
  const utils = api.useUtils();
  const { data } = api.taxReturn.getSubmitDispatchLock.useQuery(
    { taskId },
    { enabled: !!taskId, refetchInterval: 60_000 },
  );

  const [targetJobId, setTargetJobId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);

  const stopBrowser = api.taxReturn.stopSubmitRunBrowser.useMutation({
    onSuccess: async (result) => {
      const minutes = data?.quietPeriodMinutes ?? 5;
      if (!result.verified) {
        toast.warning(
          "The browser was asked to stop, but Browser Use could not confirm it stopped. The run can only be confirmed after the longer waiting period.",
        );
      } else if (result.wasActive) {
        toast.warning(
          `The run's browser was still active and has now been stopped. Wait ${minutes} minutes, then check the Guernsey Tax Portal.`,
        );
      } else {
        toast.success(
          `The run's browser is stopped. Wait ${minutes} minutes, then check the Guernsey Tax Portal.`,
        );
      }
      await utils.taxReturn.getSubmitDispatchLock.invalidate({ taskId });
    },
    onError: async (error) => {
      toast.error(error.message);
      await utils.taxReturn.getSubmitDispatchLock.invalidate({ taskId });
    },
  });

  const confirm = api.taxReturn.confirmSubmitNotFiled.useMutation({
    onSuccess: async () => {
      toast.success(
        "Recorded: this run did not submit the return. Run Prepare only again before submitting.",
      );
      setTargetJobId(null);
      await Promise.all([
        utils.taxReturn.getSubmitDispatchLock.invalidate({ taskId }),
        utils.taxReturn.getTask.invalidate({ taskId }),
      ]);
    },
    onError: async (error) => {
      toast.error(error.message);
      await utils.taxReturn.getSubmitDispatchLock.invalidate({ taskId });
    },
  });

  const lockingRuns = (data?.runs ?? []).filter((run) => !run.confirmation);
  if (!data?.blocker || lockingRuns.length === 0) return null;

  // Limits come from the server (the shared module uses node:crypto).
  const { noteMinLength, noteMaxLength, quietPeriodMinutes, unverifiedQuietPeriodHours } = data;
  const target = lockingRuns.find((run) => run.jobId === targetJobId) ?? null;
  const targetStoppedAt = target?.browserStop?.stoppedAt ?? null;
  const targetStoppedAtLabel = formatTime(targetStoppedAt);
  const trimmedNote = note.trim();
  const canSubmit =
    !!target &&
    !target.confirmRefusal &&
    checked &&
    trimmedNote.length >= noteMinLength &&
    !confirm.isPending;

  const open = (jobId: string) => {
    setTargetJobId(jobId);
    setNote("");
    setChecked(false);
  };

  return (
    <div
      role="alert"
      className="max-h-[45vh] shrink-0 overflow-y-auto border-b border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <div className="flex items-start gap-2">
        <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-amber-800 dark:text-amber-300">
              Submitting is locked for this return
            </p>
            <p className="text-amber-800/90 dark:text-amber-200/90">
              {data.blocker}
            </p>
          </div>

          {lockingRuns.map((run) => {
            const dispatched = formatTime(run.dispatchedAt);
            const ended = formatTime(run.completedAt);
            const isOtherTask = run.taskId !== taskId;
            const report = run.agentReport;
            return (
              <div
                key={run.jobId}
                className="bg-background/70 space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">
                    Submit prepared return, run #{run.jobNumber}
                    {isOtherTask ? " (another task on this return)" : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {run.status}
                    {dispatched ? ` · reached the portal ${dispatched}` : ""}
                    {ended ? ` · ended ${ended}` : ""}
                    {run.receiptCaptureStatus
                      ? ` · receipt capture: ${run.receiptCaptureStatus}`
                      : ""}
                  </span>
                  {!isOtherTask && onSelectJob ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 text-xs"
                      onClick={() => onSelectJob(run.jobId)}
                    >
                      Show run
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs">
                    What the agent reported (its own words, not verified):
                  </p>
                  {report.output || report.question || report.error ? (
                    <pre className="bg-muted/60 max-h-40 overflow-auto rounded p-2 font-mono text-xs whitespace-pre-wrap break-words">
                      {[
                        report.output,
                        report.question ? `Question: ${report.question}` : null,
                        report.error ? `Run error: ${report.error}` : null,
                      ]
                        .filter(Boolean)
                        .join("\n\n")}
                    </pre>
                  ) : (
                    <p className="text-muted-foreground text-xs italic">
                      The run recorded no report.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
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
                      Not stopped from here yet. Your portal check only counts
                      once the browser is stopped and {quietPeriodMinutes}{" "}
                      minutes have passed.
                    </p>
                  ) : (
                    <p className="text-muted-foreground text-xs">
                      This run recorded no browser session, so the app cannot
                      stop or check its browser. It can be confirmed only
                      after {unverifiedQuietPeriodHours} hours with no
                      activity.
                    </p>
                  )}
                  {run.hasBrowserSession ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!!run.stopRefusal || stopBrowser.isPending}
                        onClick={() => stopBrowser.mutate({ jobId: run.jobId })}
                      >
                        {stopBrowser.isPending &&
                        stopBrowser.variables?.jobId === run.jobId ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
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

                <div className="space-y-1">
                  <p className="text-xs font-medium">
                    Step 2: check the Guernsey Tax Portal, then record the
                    result
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!run.confirmRefusal}
                      onClick={() => open(run.jobId)}
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
              </div>
            );
          })}
        </div>
      </div>

      <AlertDialog
        open={!!target}
        onOpenChange={(next) => {
          if (!next && !confirm.isPending) setTargetJobId(null);
        }}
      >
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>
              Record that run #{target?.jobNumber} did not submit?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Do this only after you have checked the Guernsey Tax Portal
              yourself
              {targetStoppedAtLabel
                ? `, after the run's browser was stopped at ${targetStoppedAtLabel}`
                : ""}
              . A check made before that does not count. Do not rely on the
              agent&apos;s report. If the portal
              accepted this return, a new submission could file it twice.
              Your name, the time and your note are saved on the run and on
              the return. After this, run Prepare only again before you
              submit.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-2">
            <Label htmlFor="submit-not-filed-note">
              What the portal shows for this return
            </Label>
            <Textarea
              id="submit-not-filed-note"
              value={note}
              maxLength={noteMaxLength}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Checked 25 Nov 14:10: the 2025 return is still a draft; no submitted return or receipt."
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="submit-not-filed-confirm"
              checked={checked}
              onCheckedChange={(value) => setChecked(value === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="submit-not-filed-confirm"
              className="text-sm leading-snug font-normal"
            >
              {targetStoppedAtLabel
                ? `I checked the Guernsey Tax Portal after ${targetStoppedAtLabel}. This return was NOT submitted.`
                : "I checked the Guernsey Tax Portal just now. This return was NOT submitted."}
            </Label>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirm.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!canSubmit}
              onClick={(event) => {
                event.preventDefault();
                if (!target || !canSubmit) return;
                confirm.mutate({
                  jobId: target.jobId,
                  confirmCheckedPortal: true,
                  checkedAfterBrowserStoppedAt: targetStoppedAt,
                  note: trimmedNote,
                });
              }}
            >
              {confirm.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Record not submitted
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
