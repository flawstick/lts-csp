import { describe, expect, it } from "vitest";
import { getBrowserJobStaleReason } from "./browser-job-status";

const now = Date.parse("2026-10-19T12:00:00Z");
const options = { startupTimeoutMs: 45_000 };
const job = { status: "queued", createdAt: new Date(now - 300_001) };

describe("browser job timeouts", () => {
  it.each([300_000, 300_001, 30 * 60_000, 24 * 60 * 60_000])(
    "keeps jobs queued after waiting %i ms for a busy worker",
    (queueAgeMs) => {
      expect(
        getBrowserJobStaleReason(
          { ...job, createdAt: new Date(now - queueAgeMs) },
          options,
          now,
        ),
      ).toBeNull();
    },
  );

  it("uses the claim time rather than queue age for browser startup", () => {
    expect(
      getBrowserJobStaleReason(
        {
          ...job,
          status: "starting",
          createdAt: new Date(now - 24 * 60 * 60_000),
          resultData: { startupStartedAt: now - 1_000 },
        },
        options,
        now,
      ),
    ).toBeNull();
    expect(
      getBrowserJobStaleReason(
        {
          ...job,
          status: "starting",
          createdAt: new Date(now - 24 * 60 * 60_000),
          resultData: { startupStartedAt: now - 45_001 },
        },
        options,
        now,
      ),
    ).toBe("Browser Use session failed to initialize");
  });

  it.each(["running", "paused"])("uses the heartbeat for %s jobs", (status) => {
    expect(
      getBrowserJobStaleReason(
        { ...job, status, resultData: { lastHeartbeatAt: now - 1_000 } },
        options,
        now,
      ),
    ).toBeNull();
    expect(
      getBrowserJobStaleReason(
        { ...job, status, resultData: { lastHeartbeatAt: now - 60_001 } },
        options,
        now,
      ),
    ).toBe("Browser worker heartbeat lost");
  });

  it.each(["completed", "failed", "cancelled"])(
    "does not expire %s jobs",
    (status) => {
      expect(
        getBrowserJobStaleReason({ ...job, status }, options, now),
      ).toBeNull();
    },
  );
});
