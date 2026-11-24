/**
 * Timed maintenance window for filing automation.
 *
 * Set FILING_MAINTENANCE_UNTIL to an ISO 8601 instant with an explicit offset
 * (for example "2026-11-24T14:00:00Z"). Until that instant no new filing
 * automation run can start. From that instant on, runs start normally again,
 * with no redeploy needed. Unset or empty means no maintenance.
 *
 * Only new launches are blocked. Jobs that are already queued, running or
 * paused are left alone.
 *
 * This module has no env import so it can be unit tested; callers on the
 * server use getFilingMaintenance(), which reads process.env.
 */

export type FilingMaintenanceState =
  | { active: false; until: null; message: null }
  | { active: true; until: string | null; message: string };

const INACTIVE: FilingMaintenanceState = {
  active: false,
  until: null,
  message: null,
};

// An explicit Z or ±hh:mm offset is required so the instant never depends
// on the server's time zone.
const ISO_INSTANT_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse a maintenance end instant. Returns null when unset, and "invalid"
 * when set but not a valid ISO instant with an offset.
 */
export function parseFilingMaintenanceUntil(
  raw: string | null | undefined,
): Date | null | "invalid" {
  const value = raw?.trim();
  if (!value) return null;
  if (!ISO_INSTANT_WITH_OFFSET.test(value)) return "invalid";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

/** "14:00 GMT on 24 November 2026", in UK time (GMT or BST). */
export function formatUkInstant(date: Date): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZoneName: "shortOffset",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  // ICU builds differ ("GMT", "GMT+0", "GMT+1"), so name the UK zone here.
  const zone = /^GMT\+0?1(:00)?$/.test(parts.timeZoneName ?? "")
    ? "BST"
    : /^GMT(\+0)?$/.test(parts.timeZoneName ?? "")
      ? "GMT"
      : (parts.timeZoneName ?? "UK time");
  return `${parts.hour}:${parts.minute} ${zone} on ${parts.day} ${parts.month} ${parts.year}`;
}

/**
 * Maintenance state at `now`. Maintenance is active while now is strictly
 * before the end instant; at the end instant itself launches are allowed.
 *
 * A value that is set but cannot be parsed keeps maintenance on (fail
 * closed), because an operator set it to stop filing runs.
 */
export function getFilingMaintenanceState(
  raw: string | null | undefined,
  now: Date = new Date(),
): FilingMaintenanceState {
  const until = parseFilingMaintenanceUntil(raw);
  if (until === null) return INACTIVE;
  if (until === "invalid") {
    return {
      active: true,
      until: null,
      message:
        "Filing automation is paused for maintenance. No new filing runs can start until LTS ends the maintenance window.",
    };
  }
  if (now.getTime() >= until.getTime()) return INACTIVE;
  return {
    active: true,
    until: until.toISOString(),
    message: `Filing automation is paused for maintenance until ${formatUkInstant(until)}. No new filing runs can start until then. Returns can still be edited and reviewed.`,
  };
}

/** Current maintenance state from the server environment. */
export function getFilingMaintenance(
  now: Date = new Date(),
): FilingMaintenanceState {
  return getFilingMaintenanceState(process.env.FILING_MAINTENANCE_UNTIL, now);
}

/** Why a filing automation launch must not start now, or null. */
export function getFilingMaintenanceBlocker(
  now: Date = new Date(),
): string | null {
  return getFilingMaintenance(now).message;
}

export class FilingMaintenanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilingMaintenanceError";
  }
}

/** Throws FilingMaintenanceError while maintenance is active. */
export function assertFilingAutomationAvailable(now: Date = new Date()): void {
  const blocker = getFilingMaintenanceBlocker(now);
  if (blocker) throw new FilingMaintenanceError(blocker);
}
