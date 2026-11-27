"use client";

import { toast } from "sonner";
import { api } from "@/trpc/react";
import {
  getLockingRuns,
  type RecordNotSubmittedInput,
} from "./submit-lock-dialog";

/**
 * The return's submit dispatch lock, shared by the toolbar's "Submit locked"
 * indicator and the lock dialog, with the two staff actions on a locking
 * run: stop its browser, then record that it did not submit.
 */
export function useSubmitDispatchLock(taskId: string) {
  const utils = api.useUtils();
  const { data: lock } = api.taxReturn.getSubmitDispatchLock.useQuery(
    { taskId },
    { enabled: !!taskId, refetchInterval: 60_000 },
  );

  const stopBrowser = api.taxReturn.stopSubmitRunBrowser.useMutation({
    onSuccess: async (result) => {
      const minutes = lock?.quietPeriodMinutes ?? 5;
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

  const lockingRuns = getLockingRuns(lock);

  return {
    lock,
    lockingRuns,
    isLocked: lockingRuns.length > 0,
    stopBrowser: (jobId: string) => stopBrowser.mutate({ jobId }),
    stoppingJobId: stopBrowser.isPending
      ? (stopBrowser.variables?.jobId ?? null)
      : null,
    isStopPending: stopBrowser.isPending,
    recordNotSubmitted: (input: RecordNotSubmittedInput) =>
      confirm.mutateAsync({ ...input, confirmCheckedPortal: true }),
    isRecordPending: confirm.isPending,
  };
}
