type CancellableJob = { id: string; status: string };

/**
 * The run the toolbar's "Cancel task" button cancels. The button is shown for
 * running, paused, queued and starting runs (the server accepts all four), so
 * each of them must resolve to a job: a queued run never times out on its
 * own, and cancelling it is the only way to withdraw it before a worker
 * claims it.
 */
export function getJobToCancel<T extends CancellableJob>(input: {
  runningJob?: T | null;
  pausedJob?: T | null;
  activeJob?: T | null;
}): T | null {
  return input.runningJob ?? input.pausedJob ?? input.activeJob ?? null;
}
