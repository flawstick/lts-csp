import { db, schema } from "@repo/database";
import { eq, sql } from "drizzle-orm";
import { syncGuernseyReturns } from "./guernsey";
import { createTaxSyncJobLogger } from "./job-logger";
import { syncJerseyReturns } from "./jersey";
import { combineLoggers, createLogger } from "./logger";
import type { SyncedTaxReturn, SyncedReturnType, SyncLogger } from "./types";

export interface EnsureTaxSyncJobInput {
  jobId?: string;
  orgId: string;
  jurisdictionCode: string;
  trigger?: "manual" | "scheduler";
}

export interface RunTaxSyncJobInput extends EnsureTaxSyncJobInput {
  portalUsername?: string;
  portalPassword?: string;
  logger?: SyncLogger;
}

export interface RunTaxSyncJobResult {
  jobId: string;
  orgId: string;
  jurisdictionCode: string;
  returnsFound: number;
  summary: {
    total: number;
    byStatus: Record<string, number>;
    byReturnType: Record<SyncedReturnType | string, number>;
  };
}

function resolveCredentials(
  input: Pick<
    RunTaxSyncJobInput,
    "jurisdictionCode" | "portalUsername" | "portalPassword"
  >,
): { username: string; password: string } | null {
  const requestUsername = input.portalUsername?.trim();
  const requestPassword = input.portalPassword?.trim();

  if (requestUsername && requestPassword) {
    return {
      username: requestUsername,
      password: requestPassword,
    };
  }

  return null;
}

function summarizeReturns(returns: SyncedTaxReturn[]) {
  const byStatus = returns.reduce<Record<string, number>>((acc, current) => {
    acc[current.status] = (acc[current.status] ?? 0) + 1;
    return acc;
  }, {});

  const byReturnType = returns.reduce<Record<SyncedReturnType | string, number>>(
    (acc, current) => {
      acc[current.returnType] = (acc[current.returnType] ?? 0) + 1;
      return acc;
    },
    {},
  );

  return {
    total: returns.length,
    byStatus,
    byReturnType,
  };
}

async function markJob(
  jobId: string,
  values: Partial<typeof schema.taxSyncJobs.$inferInsert>,
): Promise<void> {
  await db
    .update(schema.taxSyncJobs)
    .set(values)
    .where(eq(schema.taxSyncJobs.id, jobId));
}

export async function ensureTaxSyncJobId(
  input: EnsureTaxSyncJobInput,
): Promise<string> {
  if (input.jobId?.trim()) {
    return input.jobId.trim();
  }

  const jurisdictionCode = input.jurisdictionCode.trim().toUpperCase();
  const jurisdiction = await db.query.jurisdictions.findFirst({
    where: eq(schema.jurisdictions.code, jurisdictionCode),
  });

  if (!jurisdiction) {
    throw new Error(`Jurisdiction not found: ${jurisdictionCode}`);
  }

  const [job] = await db
    .insert(schema.taxSyncJobs)
    .values({
      orgId: input.orgId,
      jurisdictionId: jurisdiction.id,
      status: "pending",
      trigger: input.trigger ?? "manual",
    })
    .returning({ id: schema.taxSyncJobs.id });

  if (!job) {
    throw new Error("Failed to create tax sync job");
  }

  return job.id;
}

export async function runTaxSyncJob(
  input: RunTaxSyncJobInput,
): Promise<RunTaxSyncJobResult> {
  const jurisdictionCode = input.jurisdictionCode.trim().toUpperCase();
  const jobId = await ensureTaxSyncJobId({
    jobId: input.jobId,
    orgId: input.orgId,
    jurisdictionCode,
    trigger: input.trigger,
  });
  const consoleLogger =
    input.logger ?? createLogger("WORKER", jurisdictionCode, jobId.slice(0, 8));
  const logger = combineLoggers(
    consoleLogger,
    createTaxSyncJobLogger(jobId, "WORKER", jurisdictionCode, jobId.slice(0, 8)),
  );

  logger.info("Worker starting", {
    jobId,
    orgId: input.orgId,
    jurisdictionCode,
    trigger: input.trigger ?? "manual",
  });

  try {
    if (!input.orgId) {
      throw new Error("ORG_ID is required");
    }

    const credentials = resolveCredentials({
      jurisdictionCode,
      portalUsername: input.portalUsername,
      portalPassword: input.portalPassword,
    });

    if (!credentials) {
      throw new Error(
        `No portal credentials available for ${jurisdictionCode}. Expected org-specific credentials from jurisdiction settings or explicit request credentials.`,
      );
    }

    await markJob(jobId, {
      status: "running",
      startedAt: new Date(),
      completedAt: null,
      errorMessage: null,
    });

    const organisation = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, input.orgId),
    });
    const jurisdiction = await db.query.jurisdictions.findFirst({
      where: eq(schema.jurisdictions.code, jurisdictionCode),
    });

    if (!organisation || !jurisdiction) {
      throw new Error("Organisation or jurisdiction not found");
    }

    let syncedReturns: SyncedTaxReturn[];

    switch (jurisdictionCode) {
      case "GG":
        syncedReturns = await syncGuernseyReturns({
          username: credentials.username,
          password: credentials.password,
          logger,
        });
        break;
      case "JE":
        syncedReturns = await syncJerseyReturns({
          username: credentials.username,
          password: credentials.password,
          logger,
        });
        break;
      default:
        throw new Error(`Unsupported jurisdiction: ${jurisdictionCode}`);
    }

    const summary = summarizeReturns(syncedReturns);
    logger.info("Sync summary", summary);

    for (const syncedReturn of syncedReturns) {
      await db
        .insert(schema.taxReturns)
        .values({
          orgId: organisation.id,
          jurisdictionId: jurisdiction.id,
          entityName: syncedReturn.entityName,
          taxYear: syncedReturn.taxYear,
          status: syncedReturn.status,
          returnType: syncedReturn.returnType,
          externalId: syncedReturn.externalId,
          link: syncedReturn.link,
          pdfUrl: syncedReturn.pdfUrl ?? null,
          metadata: syncedReturn.metadata,
        })
        .onConflictDoUpdate({
          target: [
            schema.taxReturns.jurisdictionId,
            schema.taxReturns.externalId,
            schema.taxReturns.taxYear,
            schema.taxReturns.returnType,
          ],
          set: {
            entityName: syncedReturn.entityName,
            status: sql`CASE
              WHEN ${schema.taxReturns.status} = 'dismissed' THEN ${schema.taxReturns.status}
              ELSE ${syncedReturn.status}
            END`,
            link: syncedReturn.link,
            pdfUrl: syncedReturn.pdfUrl ?? null,
            metadata: syncedReturn.metadata,
            updatedAt: new Date(),
          },
        });
    }

    await markJob(jobId, {
      status: "completed",
      completedAt: new Date(),
      returnsFound: syncedReturns.length,
      errorMessage: null,
    });

    logger.info("Worker completed", {
      returnsFound: syncedReturns.length,
    });
    await logger.flush();

    return {
      jobId,
      orgId: organisation.id,
      jurisdictionCode,
      returnsFound: syncedReturns.length,
      summary,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Worker failed", {
      error: message,
    });

    await markJob(jobId, {
      status: "failed",
      completedAt: new Date(),
      errorMessage: message,
    });
    await logger.flush();

    throw error;
  }
}
