import {
  EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
  isBrowserSessionStoppedStatus,
  planEarlierSubmitBrowserCheck,
  type EarlierSubmitRunJob,
} from "@repo/database/prepared-draft";
import {
  getBrowserUseApiVersion,
  stopBrowserUseSession,
  waitForBrowserUseSessionToPause,
  type BrowserUseApiVersion,
} from "@/lib/browser-use-control";

export type EarlierSubmitBrowserControl = {
  stop: (
    sessionId: string,
    strategy: "session",
    version: BrowserUseApiVersion,
  ) => Promise<void>;
  /** Reads the status back, waiting while it still reports "running". */
  waitForStop: (
    sessionId: string,
    version: BrowserUseApiVersion,
  ) => Promise<string | null>;
};

const defaultControl: EarlierSubmitBrowserControl = {
  stop: stopBrowserUseSession,
  waitForStop: (sessionId, version) =>
    waitForBrowserUseSessionToPause(sessionId, version),
};

export type EarlierSubmitBrowserStopResult =
  | {
      ok: true;
      /** Runs whose Browser Use session was stopped and read back as stopped. */
      stoppedJobIds: Set<string>;
    }
  | {
      ok: false;
      /** The first run that holds the new submit run back. */
      jobId: string;
      reason: "quiet_period" | "not_stopped";
      status: string | null;
      message: string;
    };

/**
 * Before a new submit run (full submit or Submit prepared return) starts:
 * stop the Browser Use session of every earlier dispatched submit run on the
 * return and read back that it stopped. A run whose session cannot be
 * confirmed stopped, or that recorded no session and ended moments ago,
 * holds the start back with a short retry message. Runs that are still
 * active are never touched (the active-run guard refuses the start).
 */
export async function stopEarlierSubmitRunBrowsers(
  returnJobs: EarlierSubmitRunJob[],
  options: {
    now?: number;
    control?: EarlierSubmitBrowserControl;
    log?: (message: string, data: Record<string, unknown>) => void;
  } = {},
): Promise<EarlierSubmitBrowserStopResult> {
  const now = options.now ?? Date.now();
  const control = options.control ?? defaultControl;
  const log = options.log ?? ((message, data) => console.warn(message, data));
  const stoppedJobIds = new Set<string>();

  const waiting = returnJobs.find(
    (job) => planEarlierSubmitBrowserCheck(job, now).kind === "wait",
  );
  if (waiting) {
    return {
      ok: false,
      jobId: waiting.id,
      reason: "quiet_period",
      status: null,
      message: EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
    };
  }

  const results = await Promise.all(
    returnJobs.map(async (job) => {
      const plan = planEarlierSubmitBrowserCheck(job, now);
      if (plan.kind !== "stop_session") return null;
      const record =
        job.resultData && typeof job.resultData === "object"
          ? (job.resultData as Record<string, unknown>)
          : null;
      const version = getBrowserUseApiVersion(record);
      try {
        await control.stop(plan.sessionId, "session", version);
      } catch (error) {
        // The read-back below decides; a partial stop may still have worked.
        log("Stopping an earlier submit run's browser failed", {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      let status: string | null = null;
      try {
        status = await control.waitForStop(plan.sessionId, version);
      } catch (error) {
        log("Reading an earlier submit run's browser status failed", {
          jobId: job.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      if (isBrowserSessionStoppedStatus(status)) {
        stoppedJobIds.add(job.id);
        return null;
      }
      return { jobId: job.id, status };
    }),
  );
  const failed = results.find((result) => result !== null);
  if (failed) {
    log("An earlier submit run's browser is not confirmed stopped", failed);
    return {
      ok: false,
      jobId: failed.jobId,
      reason: "not_stopped",
      status: failed.status,
      message: EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
    };
  }
  return { ok: true, stoppedJobIds };
}

/**
 * Re-check, under the return row lock, that every earlier dispatched submit
 * run either needs nothing or had its session confirmed stopped just now (a
 * run that ended after the stop pass was not covered by it).
 */
export function getEarlierSubmitBrowserBlocker(input: {
  returnJobs: EarlierSubmitRunJob[];
  stoppedJobIds: Set<string>;
  now?: number;
}): string | null {
  const now = input.now ?? Date.now();
  for (const job of input.returnJobs) {
    const plan = planEarlierSubmitBrowserCheck(job, now);
    if (plan.kind === "wait") return EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE;
    if (plan.kind === "stop_session" && !input.stoppedJobIds.has(job.id)) {
      return EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE;
    }
  }
  return null;
}
