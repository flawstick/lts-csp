import { describe, expect, it } from "vitest";
import { getJobToCancel } from "./cancel-target";

describe("getJobToCancel", () => {
  const job = (id: string, status: string) => ({ id, status });

  it("cancels a queued run (shown with a Cancel task button)", () => {
    expect(getJobToCancel({ activeJob: job("q", "queued") })?.id).toBe("q");
  });

  it("cancels a starting run", () => {
    expect(getJobToCancel({ activeJob: job("s", "starting") })?.id).toBe("s");
  });

  it("prefers the running, then the paused run", () => {
    expect(
      getJobToCancel({ runningJob: job("r", "running"), pausedJob: job("p", "paused"), activeJob: job("r", "running") })?.id,
    ).toBe("r");
    expect(getJobToCancel({ pausedJob: job("p", "paused"), activeJob: job("p", "paused") })?.id).toBe("p");
  });

  it("returns null when nothing is active", () => {
    expect(getJobToCancel({})).toBeNull();
  });
});
