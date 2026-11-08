import type { ReturnDisplayStatus } from "@repo/database/return-readiness"

export function returnsListHref(orgId: string, status?: ReturnDisplayStatus): string {
  return status ? `/org/${orgId}/returns?status=${status}` : `/org/${orgId}/returns`
}

/**
 * "Process Returns" opens the signed-off returns waiting for the filing
 * automation. "Pending" excludes those, so it would show work that still
 * needs signoff instead.
 */
export function processReturnsHref(orgId: string): string {
  return returnsListHref(orgId, "awaiting_automation")
}

/** Opens the returns page with the portal sync jobs dialog. */
export function syncReturnsHref(orgId: string): string {
  return `/org/${orgId}/returns?dialog=sync-jobs`
}

export function tasksHref(orgId: string): string {
  return `/org/${orgId}/tasks`
}

/**
 * Personal Tax Returns live outside any organisation. The page is a
 * placeholder while the feature is in development.
 */
export const PERSONAL_TAX_RETURNS_HREF = "/personal-returns"
