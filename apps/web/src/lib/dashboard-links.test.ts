import { describe, expect, it } from "vitest";
import { RETURN_DISPLAY_STATUSES } from "@repo/database/return-readiness";
import {
  PERSONAL_TAX_RETURNS_HREF,
  processReturnsHref,
  returnsListHref,
  syncReturnsHref,
  tasksHref,
} from "./dashboard-links";

describe("processReturnsHref", () => {
  it("opens the Awaiting automation filter, not Pending", () => {
    const href = processReturnsHref("org-1");
    const status = new URL(href, "https://example.test").searchParams.get("status");

    expect(href).toBe("/org/org-1/returns?status=awaiting_automation");
    expect(status).toBe("awaiting_automation");
    expect(RETURN_DISPLAY_STATUSES).toContain(status);
  });
});

describe("dashboard shortcuts", () => {
  it("point at the existing returns and tasks routes", () => {
    expect(returnsListHref("org-1", "pending")).toBe("/org/org-1/returns?status=pending")
    expect(returnsListHref("org-1")).toBe("/org/org-1/returns")
    expect(syncReturnsHref("org-1")).toBe("/org/org-1/returns?dialog=sync-jobs")
    expect(tasksHref("org-1")).toBe("/org/org-1/tasks")
  })
})

describe("personal tax returns entry", () => {
  it("lives outside the organisation routes", () => {
    expect(PERSONAL_TAX_RETURNS_HREF).toBe("/personal-returns")
    expect(PERSONAL_TAX_RETURNS_HREF.startsWith("/org/")).toBe(false)
  })
})
