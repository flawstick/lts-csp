import { schema } from "@repo/database";
import { sql } from "drizzle-orm";
import type { SyncedTaxReturn } from "./types";

type TaxReturnStatus = SyncedTaxReturn["status"] | "failed" | "review_required" | "dismissed";

/**
 * Status to keep when a return is re-synced from the tax portal.
 *
 * - A dismissal is a user decision and always sticks.
 * - "Submitted" on the tax portal is authoritative and always wins.
 * - Local states the portal cannot express ("review_required" after LTS
 *   prepared a draft, or "completed") are kept.
 * - A local automation "failed" is replaced by the portal's real state, so a
 *   draft that is actually prepared on the portal is not shown as failed.
 *
 * Must match `syncedStatusSql`.
 */
export function resolveSyncedReturnStatus(
  existing: TaxReturnStatus,
  synced: SyncedTaxReturn["status"],
): TaxReturnStatus {
  if (existing === "dismissed") return existing;
  if (synced === "completed") return "completed";
  if (existing === "completed" || existing === "review_required") return existing;
  return synced;
}

export function syncedStatusSql(synced: SyncedTaxReturn["status"]) {
  const existing = schema.taxReturns.status;
  return sql`CASE
    WHEN ${existing} = 'dismissed' THEN ${existing}
    WHEN ${synced}::text = 'completed' THEN 'completed'::tax_return_status
    WHEN ${existing} IN ('completed', 'review_required') THEN ${existing}
    ELSE ${synced}::tax_return_status
  END`;
}

/**
 * Merge synced metadata over the stored metadata instead of replacing it, so
 * keys owned by the app (financial currency, signoff revocation, filed-return
 * artifact state, ...) survive a sync.
 */
export function mergedMetadataSql(metadata: Record<string, unknown>) {
  return sql`coalesce(${schema.taxReturns.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`;
}
