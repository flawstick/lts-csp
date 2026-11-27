import { describe, expect, it, vi } from "vitest";
import {
  EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
  SUBMIT_DISPATCH_SESSION_SEARCH_KEY,
  SUBMIT_DISPATCHED_KEY,
  SUBMIT_PREPARED_DISPATCHED_KEY,
} from "@repo/database/prepared-draft";
import {
  getEarlierSubmitBrowserBlocker,
  stopEarlierSubmitRunBrowsers,
  stopStaleSubmitRunBrowser,
  type EarlierSubmitBrowserControl,
} from "./earlier-submit-browsers";

const now = Date.parse("2026-11-27T12:00:00Z");
const quiet = () => {};

function submitRun(
  id: string,
  overrides: { status?: string; completedAt?: Date | null } = {},
  data: Record<string, unknown> = {},
) {
  return {
    id,
    status: overrides.status ?? "failed",
    createdAt: new Date(now - 60 * 60_000),
    completedAt:
      overrides.completedAt === undefined ? new Date(now - 10 * 60_000) : overrides.completedAt,
    resultData: {
      submissionMode: "submit_and_capture_pdf",
      [SUBMIT_DISPATCHED_KEY]: now - 50 * 60_000,
      browserUseApiVersion: 4,
      ...data,
    },
  };
}

function control(
  statuses: Record<string, string | null>,
  sessions: Array<{ sessionId: string; workspaceId: string | null; createdAt: string }> = [],
): EarlierSubmitBrowserControl & {
  stop: ReturnType<typeof vi.fn>;
  waitForStop: ReturnType<typeof vi.fn>;
  listSessions: ReturnType<typeof vi.fn>;
} {
  return {
    stop: vi.fn(async () => {}),
    waitForStop: vi.fn(async (sessionId: string) => statuses[sessionId] ?? null),
    listSessions: vi.fn(async () => ({ sessions, hasMore: false })),
  };
}

describe("stopEarlierSubmitRunBrowsers", () => {
  it("stops every earlier dispatched run's session and accepts a stopped read-back", async () => {
    const browser = control({ "s-1": "stopped", "s-2": "idle" });
    const result = await stopEarlierSubmitRunBrowsers(
      [
        submitRun("a", {}, { browserUseSessionId: "s-1" }),
        // A Submit prepared return run with only the original key.
        {
          ...submitRun("b", { status: "cancelled" }),
          resultData: { filingOperation: "submit_prepared", [SUBMIT_PREPARED_DISPATCHED_KEY]: now - 5 * 60_000, sessionId: "s-2" },
        },
      ],
      { now, control: browser, log: quiet },
    );
    expect(result).toEqual({ ok: true, stoppedJobIds: new Set(["a", "b"]) });
    expect(browser.stop).toHaveBeenCalledWith("s-1", "session", 4);
    expect(browser.stop).toHaveBeenCalledWith("s-2", "session", 3);
  });

  it("refuses with the retry message when a session is not confirmed stopped", async () => {
    for (const status of ["running", null]) {
      const browser = control({ "s-1": status });
      const result = await stopEarlierSubmitRunBrowsers(
        [submitRun("a", {}, { browserUseSessionId: "s-1" })],
        { now, control: browser, log: quiet },
      );
      expect(result).toEqual({
        ok: false,
        jobId: "a",
        reason: "not_stopped",
        status,
        message: EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
      });
    }
    // A failed read-back is not a stop either.
    const failing = control({});
    failing.waitForStop.mockRejectedValueOnce(new Error("Browser Use request failed (500)"));
    const result = await stopEarlierSubmitRunBrowsers(
      [submitRun("a", {}, { browserUseSessionId: "s-1" })],
      { now, control: failing, log: quiet },
    );
    expect(result.ok).toBe(false);
  });

  it("still reads the status back when the stop call fails (a partial stop may have worked)", async () => {
    const browser = control({ "s-1": "stopped" });
    browser.stop.mockRejectedValueOnce(new Error("Unable to fully stop"));
    const result = await stopEarlierSubmitRunBrowsers(
      [submitRun("a", {}, { browserUseSessionId: "s-1" })],
      { now, control: browser, log: quiet },
    );
    expect(result).toEqual({ ok: true, stoppedJobIds: new Set(["a"]) });
  });

  it("holds a run with no session for a short quiet period, without calling Browser Use", async () => {
    const browser = control({});
    const justEnded = submitRun("a", { completedAt: new Date(now - 30_000) }, { workspaceId: "w-a" });
    expect(await stopEarlierSubmitRunBrowsers([justEnded], { now, control: browser, log: quiet })).toMatchObject({
      ok: false,
      reason: "quiet_period",
      message: "The previous submit run's browser is still shutting down. Try again in a minute.",
    });
    expect(browser.stop).not.toHaveBeenCalled();
    expect(browser.listSessions).not.toHaveBeenCalled();
  });

  it("finds, stops and records the sessions of a run whose create request failed with no session recorded", async () => {
    // runs.create timed out after Browser Use accepted it: the agent is live in the run's workspace.
    const browser = control({ orphan: "stopped" }, [
      { sessionId: "someone-else", workspaceId: "w-other", createdAt: "2026-11-27T11:40:00Z" },
      { sessionId: "orphan", workspaceId: "w-a", createdAt: "2026-11-27T11:10:00Z" },
    ]);
    const recordSearch = vi.fn(async () => {});
    const run = submitRun("a", { completedAt: new Date(now - 3 * 60_000) }, { workspaceId: "w-a" });
    expect(await stopEarlierSubmitRunBrowsers([run], { now, control: browser, log: quiet, recordSearch })).toEqual({
      ok: true,
      stoppedJobIds: new Set(["a"]),
    });
    expect(browser.stop).toHaveBeenCalledTimes(1);
    expect(browser.stop).toHaveBeenCalledWith("orphan", "session", 4);
    expect(recordSearch).toHaveBeenCalledWith("a", { searchedAt: now, sessionIds: ["orphan"] });
    // The recorded search is trusted next time: only the found session is confirmed again.
    const recorded = {
      ...run,
      resultData: { ...run.resultData, [SUBMIT_DISPATCH_SESSION_SEARCH_KEY]: { searchedAt: now, sessionIds: ["orphan"] } },
    };
    const again = control({ orphan: "stopped" });
    expect(await stopEarlierSubmitRunBrowsers([recorded], { now: now + 60_000, control: again, log: quiet })).toEqual({
      ok: true,
      stoppedJobIds: new Set(["a"]),
    });
    expect(again.listSessions).not.toHaveBeenCalled();
  });

  it("refuses when the workspace search fails or a found session will not stop", async () => {
    const run = submitRun("a", { completedAt: new Date(now - 3 * 60_000) }, { workspaceId: "w-a" });
    const failing = control({});
    failing.listSessions.mockRejectedValueOnce(new Error("Browser Use API key is not configured"));
    const recordSearch = vi.fn(async () => {});
    expect(await stopEarlierSubmitRunBrowsers([run], { now, control: failing, log: quiet, recordSearch })).toMatchObject({
      ok: false,
      reason: "search_failed",
      message: EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
    });
    const stuck = control({ orphan: "running" }, [{ sessionId: "orphan", workspaceId: "w-a", createdAt: "2026-11-27T11:10:00Z" }]);
    expect(await stopEarlierSubmitRunBrowsers([run], { now, control: stuck, log: quiet, recordSearch })).toMatchObject({
      ok: false,
      reason: "not_stopped",
    });
    expect(recordSearch).not.toHaveBeenCalled();
  });

  it("holds a run with no session and no workspace to search", async () => {
    const browser = control({});
    const run = submitRun("a", { completedAt: new Date(now - 30 * 60_000) });
    expect(await stopEarlierSubmitRunBrowsers([run], { now, control: browser, log: quiet })).toMatchObject({
      ok: false,
      reason: "quiet_period",
    });
  });

  it("never touches an active run, an undispatched run or a prepare run", async () => {
    const browser = control({});
    const result = await stopEarlierSubmitRunBrowsers(
      [
        ...["queued", "starting", "running", "paused"].map((status) =>
          submitRun(`active-${status}`, { status, completedAt: null }, { browserUseSessionId: `s-${status}` }),
        ),
        { ...submitRun("never"), resultData: { submissionMode: "submit_and_capture_pdf", browserUseSessionId: "s-x" } },
        { ...submitRun("prepare"), resultData: { submissionMode: "prepare_only", browserUseSessionId: "s-p" } },
      ],
      { now, control: browser, log: quiet },
    );
    expect(result).toEqual({ ok: true, stoppedJobIds: new Set() });
    expect(browser.stop).not.toHaveBeenCalled();
    expect(browser.waitForStop).not.toHaveBeenCalled();
  });
});

describe("getEarlierSubmitBrowserBlocker (re-checked under the return lock)", () => {
  it("refuses a run whose session was not covered by the stop pass", () => {
    const run = submitRun("a", {}, { browserUseSessionId: "s-1" });
    expect(getEarlierSubmitBrowserBlocker({ returnJobs: [run], stoppedJobIds: new Set(), now })).toBe(
      EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
    );
    expect(getEarlierSubmitBrowserBlocker({ returnJobs: [run], stoppedJobIds: new Set(["a"]), now })).toBeNull();
    expect(
      getEarlierSubmitBrowserBlocker({
        returnJobs: [submitRun("b", { completedAt: new Date(now - 1_000) })],
        stoppedJobIds: new Set(),
        now,
      }),
    ).toBe(EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE);
    // A run whose sessions must still be found is not covered either.
    const unsearched = submitRun("c", { completedAt: new Date(now - 3 * 60_000) }, { workspaceId: "w-c" });
    expect(getEarlierSubmitBrowserBlocker({ returnJobs: [unsearched], stoppedJobIds: new Set(), now })).toBe(
      EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
    );
    expect(getEarlierSubmitBrowserBlocker({ returnJobs: [unsearched], stoppedJobIds: new Set(["c"]), now })).toBeNull();
  });
});

describe("stopStaleSubmitRunBrowser (maybeMarkBrowserJobStale)", () => {
  it("stops the session recorded on the stored row, not on a listTasks projection", async () => {
    const browser = control({});
    // listTasks passes result_data reduced to TASK_LIST_JOB_RESULT_KEYS.
    const projected = { id: "a", resultData: { lastHeartbeatAt: now - 10 * 60_000, browserUseApiVersion: 4 } };
    expect(await stopStaleSubmitRunBrowser(projected, { control: browser, log: quiet })).toBeNull();
    // The row the stale UPDATE returned carries every key.
    const stored = submitRun("a", {}, { browserUseSessionId: "s-1", staleFailureAt: now });
    expect(await stopStaleSubmitRunBrowser(stored, { control: browser, log: quiet })).toBe("s-1");
    expect(browser.stop).toHaveBeenCalledWith("s-1", "session", 4);
  });

  it("leaves undispatched runs alone and survives a failed stop", async () => {
    const browser = control({});
    expect(
      await stopStaleSubmitRunBrowser(
        { id: "p", resultData: { submissionMode: "prepare_only", browserUseSessionId: "s-p" } },
        { control: browser, log: quiet },
      ),
    ).toBeNull();
    expect(browser.stop).not.toHaveBeenCalled();
    browser.stop.mockRejectedValueOnce(new Error("Unable to fully stop"));
    await expect(
      stopStaleSubmitRunBrowser(submitRun("a", {}, { browserUseSessionId: "s-1" }), { control: browser, log: quiet }),
    ).resolves.toBe("s-1");
  });
});
