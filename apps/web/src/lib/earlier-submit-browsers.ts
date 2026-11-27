import {
  EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
  findWorkspaceSessionIds,
  getSubmitRunBrowserSessionId,
  hasSubmitDispatch,
  isBrowserSessionStoppedStatus,
  planEarlierSubmitBrowserCheck,
  type EarlierSubmitRunJob,
  type ListedBrowserUseSession,
  type SubmitDispatchSessionSearch,
} from "@repo/database/prepared-draft";
import {
  getBrowserUseApiVersion,
  listBrowserUseSessions,
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
  /** One page of the account's V4 sessions, most recent first. */
  listSessions: (cursor: string | null) => Promise<{
    sessions: ListedBrowserUseSession[];
    nextCursor?: string | null;
    hasMore?: boolean;
  }>;
};

const defaultControl: EarlierSubmitBrowserControl = {
  stop: stopBrowserUseSession,
  waitForStop: (sessionId, version) =>
    waitForBrowserUseSessionToPause(sessionId, version),
  listSessions: (cursor) => listBrowserUseSessions(cursor),
};

export type EarlierSubmitBrowserStopResult =
  | {
      ok: true;
      /** Runs whose Browser Use sessions were all stopped and read back as stopped. */
      stoppedJobIds: Set<string>;
    }
  | {
      ok: false;
      /** The first run that holds the new run back. */
      jobId: string;
      reason: "quiet_period" | "not_stopped" | "search_failed";
      status: string | null;
      message: string;
    };

type Log = (message: string, data: Record<string, unknown>) => void;

/** Stops one session and reads it back; true only for a stopped status. */
async function stopAndConfirm(
  sessionId: string,
  version: BrowserUseApiVersion,
  control: EarlierSubmitBrowserControl,
  log: Log,
  jobId: string,
): Promise<{ stopped: boolean; status: string | null }> {
  try {
    await control.stop(sessionId, "session", version);
  } catch (error) {
    // The read-back below decides; a partial stop may still have worked.
    log("Stopping an earlier submit run's browser failed", {
      jobId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  let status: string | null = null;
  try {
    status = await control.waitForStop(sessionId, version);
  } catch (error) {
    log("Reading an earlier submit run's browser status failed", {
      jobId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return { stopped: isBrowserSessionStoppedStatus(status), status };
}

/**
 * Before a new browser run (of any mode: a prepare agent must not share the
 * draft with an orphaned submit agent either) starts: stop the Browser Use
 * sessions of every earlier dispatched submit run on the return and read
 * back that they stopped. A run that recorded no session has its workspace
 * searched for the sessions Browser Use created (the search is recorded
 * through `recordSearch`). A run whose sessions cannot be confirmed stopped
 * or found holds the start back with a short retry message. Runs that are
 * still active are never touched (the active-run guard refuses the start).
 */
export async function stopEarlierSubmitRunBrowsers(
  returnJobs: EarlierSubmitRunJob[],
  options: {
    now?: number;
    control?: EarlierSubmitBrowserControl;
    log?: Log;
    /** Persists a completed workspace search on the earlier job. */
    recordSearch?: (jobId: string, search: SubmitDispatchSessionSearch) => Promise<void>;
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
      if (plan.kind === "none" || plan.kind === "wait") return null;
      const record =
        job.resultData && typeof job.resultData === "object"
          ? (job.resultData as Record<string, unknown>)
          : null;

      let sessionIds: string[];
      // Sessions found by a search only exist on V4.
      let version: BrowserUseApiVersion = getBrowserUseApiVersion(record);
      if (plan.kind === "find_sessions") {
        version = 4;
        let found: string[] | null = null;
        try {
          found = await findWorkspaceSessionIds(control.listSessions, {
            workspaceId: plan.workspaceId,
            createdAfter: plan.createdAfter,
          });
        } catch (error) {
          log("Searching an earlier submit run's workspace for sessions failed", {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        if (!found) {
          return { jobId: job.id, status: null, reason: "search_failed" as const };
        }
        sessionIds = found;
      } else {
        sessionIds = plan.sessionIds;
      }

      for (const sessionId of sessionIds) {
        const { stopped, status } = await stopAndConfirm(
          sessionId,
          version,
          control,
          log,
          job.id,
        );
        if (!stopped) return { jobId: job.id, status, reason: "not_stopped" as const };
      }
      if (plan.kind === "find_sessions" && options.recordSearch) {
        try {
          await options.recordSearch(job.id, { searchedAt: now, sessionIds });
        } catch (error) {
          // Not fatal: this start is covered (its sessions are stopped), and
          // the next start searches again.
          log("Recording an earlier submit run's session search failed", {
            jobId: job.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      stoppedJobIds.add(job.id);
      return null;
    }),
  );
  const failed = results.find((result) => result !== null);
  if (failed) {
    log("An earlier submit run's browser is not confirmed stopped", failed);
    return {
      ok: false,
      jobId: failed.jobId,
      reason: failed.reason,
      status: failed.status,
      message: EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
    };
  }
  return { ok: true, stoppedJobIds };
}

/**
 * Re-check, under the return row lock, that every earlier dispatched submit
 * run either needs nothing or had its sessions confirmed stopped just now (a
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
    if (plan.kind !== "none" && !input.stoppedJobIds.has(job.id)) {
      return EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE;
    }
  }
  return null;
}

/**
 * When a dispatched submit run is failed as stale (its worker is gone), its
 * Browser Use agent may still be driving the portal: stop it. Decides from
 * `resultData` as stored on the row the stale update changed, never from a
 * caller's projection of it (the task list keeps only a few keys). Returns
 * the session it tried to stop, or null when there is none to stop.
 */
export async function stopStaleSubmitRunBrowser(
  job: { id: string; resultData: unknown },
  options: { control?: Pick<EarlierSubmitBrowserControl, "stop">; log?: Log } = {},
): Promise<string | null> {
  const control = options.control ?? defaultControl;
  const log = options.log ?? ((message, data) => console.error(message, data));
  if (!hasSubmitDispatch(job.resultData)) return null;
  const sessionId = getSubmitRunBrowserSessionId(job.resultData);
  if (!sessionId) return null;
  const record =
    job.resultData && typeof job.resultData === "object"
      ? (job.resultData as Record<string, unknown>)
      : null;
  try {
    await control.stop(sessionId, "session", getBrowserUseApiVersion(record));
  } catch (error) {
    // startJob stops and confirms it again before any later run.
    log("Failed to stop the Browser Use session of a stale submit run", {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return sessionId;
}
