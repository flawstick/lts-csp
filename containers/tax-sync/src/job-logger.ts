import { db, schema } from "@repo/database";
import { createLoggerWithSink } from "./logger";
import type { SyncLogEntry, SyncLogger } from "./types";

async function persistSyncJobLog(jobId: string, entry: SyncLogEntry) {
  await db.insert(schema.taxSyncJobLogs).values({
    jobId,
    level: entry.level,
    scope: entry.prefix.join(":") || null,
    message: entry.message,
    payload: entry.data,
    createdAt: new Date(entry.timestamp),
  });
}

export function createTaxSyncJobLogger(
  jobId: string,
  ...prefix: string[]
): SyncLogger {
  return createLoggerWithSink((entry) => persistSyncJobLog(jobId, entry), ...prefix);
}
