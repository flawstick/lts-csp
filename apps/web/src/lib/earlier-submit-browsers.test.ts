import { describe, expect, it, vi } from "vitest";
import {
  EARLIER_SUBMIT_BROWSER_STOPPING_MESSAGE,
  SUBMIT_DISPATCHED_KEY,
  SUBMIT_PREPARED_DISPATCHED_KEY,
} from "@repo/database/prepared-draft";
import {
  getEarlierSubmitBrowserBlocker,
  stopEarlierSubmitRunBrowsers,
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

function control(statuses: Record<string, string | null>): EarlierSubmitBrowserControl & {
  stop: ReturnType<typeof vi.fn>;
  waitForStop: ReturnType<typeof vi.fn>;
} {
  return {
    stop: vi.fn(async () => {}),
    waitForStop: vi.fn(async (sessionId: string) => statuses[sessionId] ?? null),
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
    const justEnded = submitRun("a", { completedAt: new Date(now - 30_000) });
    expect(await stopEarlierSubmitRunBrowsers([justEnded], { now, control: browser, log: quiet })).toMatchObject({
      ok: false,
      reason: "quiet_period",
      message: "The previous submit run's browser is still shutting down. Try again in a minute.",
    });
    const quietRun = submitRun("b", { completedAt: new Date(now - 3 * 60_000) });
    expect(await stopEarlierSubmitRunBrowsers([quietRun], { now, control: browser, log: quiet })).toEqual({
      ok: true,
      stoppedJobIds: new Set(),
    });
    expect(browser.stop).not.toHaveBeenCalled();
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
  });
});
