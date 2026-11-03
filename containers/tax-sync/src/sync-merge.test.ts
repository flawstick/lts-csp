import { describe, expect, it } from "vitest";
import { resolveSyncedReturnStatus } from "./sync-merge";

describe("resolveSyncedReturnStatus", () => {
  it("keeps a prepared-for-review return in review while the portal shows Prepared", () => {
    expect(resolveSyncedReturnStatus("review_required", "in_progress")).toBe(
      "review_required",
    );
  });

  it("replaces a local automation failure with the portal's real state", () => {
    expect(resolveSyncedReturnStatus("failed", "in_progress")).toBe("in_progress");
    expect(resolveSyncedReturnStatus("failed", "pending")).toBe("pending");
  });

  it("always takes a portal submission", () => {
    expect(resolveSyncedReturnStatus("failed", "completed")).toBe("completed");
    expect(resolveSyncedReturnStatus("review_required", "completed")).toBe(
      "completed",
    );
  });

  it("never reopens dismissed or completed returns", () => {
    expect(resolveSyncedReturnStatus("dismissed", "completed")).toBe("dismissed");
    expect(resolveSyncedReturnStatus("completed", "in_progress")).toBe("completed");
  });

  it("follows the portal for ordinary returns", () => {
    expect(resolveSyncedReturnStatus("pending", "in_progress")).toBe("in_progress");
  });
});
