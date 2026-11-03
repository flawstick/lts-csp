import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  status: "ready",
  publish: vi.fn(),
  on: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class {
    constructor() {
      return redis;
    }
  },
}));

import { CHANNELS, publishJobEvent } from "./index";

const event = {
  type: "job:started" as const,
  jobId: "job-1",
  timestamp: 1,
  data: {},
};

describe("job event publishing", () => {
  beforeEach(() => {
    redis.status = "ready";
    redis.publish.mockReset();
    redis.publish.mockResolvedValue(1);
  });

  it("publishes events when connected", async () => {
    await publishJobEvent(event);
    expect(redis.publish).toHaveBeenCalledWith(
      CHANNELS.JOB_EVENTS,
      JSON.stringify(event),
    );
  });

  it.each(["connecting", "reconnecting", "close", "end"])(
    "does not block jobs while Redis is %s",
    async (status) => {
      redis.status = status;
      await expect(publishJobEvent(event)).resolves.toBeUndefined();
      expect(redis.publish).not.toHaveBeenCalled();
    },
  );

  it("does not fail a job if the connection drops during publish", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    redis.publish.mockRejectedValue(new Error("Connection lost"));
    try {
      await expect(publishJobEvent(event)).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
