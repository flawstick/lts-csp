import { db, schema } from "@repo/database";
import { eq, sql } from "drizzle-orm";
import { syncGuernseyReturns } from "./guernsey";
import { syncJerseyReturns } from "./jersey";
import { createLogger } from "./logger";
import type { SyncedTaxReturn, SyncedReturnType } from "./types";

const JOB_ID = process.env.TAX_SYNC_JOB_ID || "";
const ORG_ID = process.env.ORG_ID || "";
const JURISDICTION_CODE = (process.env.JURISDICTION_CODE || "GG").trim().toUpperCase();

function resolveCredentials(): { username: string; password: string } | null {
  const genericUsername = process.env.PORTAL_USERNAME?.trim();
  const genericPassword = process.env.PORTAL_PASSWORD?.trim();

  if (genericUsername && genericPassword) {
    return {
      username: genericUsername,
      password: genericPassword,
    };
  }

  if (JURISDICTION_CODE === "GG") {
    const username = process.env.MYGOV_USERNAME?.trim();
    const password = process.env.MYGOV_PASSWORD?.trim();
    return username && password ? { username, password } : null;
  }

  if (JURISDICTION_CODE === "JE") {
    const username = process.env.JSYTAX_USERNAME?.trim();
    const password = process.env.JSYTAX_PASSWORD?.trim();
    return username && password ? { username, password } : null;
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
  values: Partial<typeof schema.taxSyncJobs.$inferInsert>,
): Promise<void> {
  if (!JOB_ID) {
    return;
  }

  await db
    .update(schema.taxSyncJobs)
    .set(values)
    .where(eq(schema.taxSyncJobs.id, JOB_ID));
}

async function main() {
  const logger = createLogger(JURISDICTION_CODE);

  logger.info("Worker starting", {
    jobId: JOB_ID || null,
    orgId: ORG_ID || null,
    jurisdictionCode: JURISDICTION_CODE,
  });

  try {
    if (!ORG_ID) {
      throw new Error("ORG_ID environment variable is required");
    }

    const credentials = resolveCredentials();
    if (!credentials) {
      throw new Error(
        `No portal credentials available for ${JURISDICTION_CODE}. Expected PORTAL_USERNAME/PORTAL_PASSWORD or jurisdiction-specific env vars.`,
      );
    }

    await markJob({
      status: "running",
      startedAt: new Date(),
      errorMessage: null,
    });

    const organisation = await db.query.organisations.findFirst({
      where: eq(schema.organisations.id, ORG_ID),
    });
    const jurisdiction = await db.query.jurisdictions.findFirst({
      where: eq(schema.jurisdictions.code, JURISDICTION_CODE),
    });

    if (!organisation || !jurisdiction) {
      throw new Error("Organisation or jurisdiction not found");
    }

    let syncedReturns: SyncedTaxReturn[];

    switch (JURISDICTION_CODE) {
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
        throw new Error(`Unsupported jurisdiction: ${JURISDICTION_CODE}`);
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
            // Don't regress returns that were dismissed or touched by automation.
            status: sql`CASE
              WHEN ${schema.taxReturns.status} IN ('dismissed', 'completed', 'failed', 'review_required') THEN ${schema.taxReturns.status}
              ELSE ${syncedReturn.status}
            END`,
            link: syncedReturn.link,
            pdfUrl: syncedReturn.pdfUrl ?? null,
            metadata: syncedReturn.metadata,
            updatedAt: new Date(),
          },
        });
    }

    await markJob({
      status: "completed",
      completedAt: new Date(),
      returnsFound: syncedReturns.length,
      errorMessage: null,
    });

    logger.info("Worker completed", {
      returnsFound: syncedReturns.length,
    });
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Worker failed", {
      error: message,
    });

    await markJob({
      status: "failed",
      completedAt: new Date(),
      errorMessage: message,
    });
    process.exit(1);
  }
}

main();
