import { describe, expect, it } from "vitest";
import { RETURN_DISPLAY_STATUSES } from "@repo/database/return-readiness";
import { processReturnsHref } from "./dashboard-links";

describe("processReturnsHref", () => {
  it("opens the Awaiting automation filter, not Pending", () => {
    const href = processReturnsHref("org-1");
    const status = new URL(href, "https://example.test").searchParams.get("status");

    expect(href).toBe("/org/org-1/returns?status=awaiting_automation");
    expect(status).toBe("awaiting_automation");
    expect(RETURN_DISPLAY_STATUSES).toContain(status);
  });
});
