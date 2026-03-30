import { db, schema } from "@repo/database";
import { decryptPortalCredentials } from "@repo/database/portal-credentials";
import { and, desc, eq, or } from "drizzle-orm";
import { createLogger } from "./logger";
import { runTaxSyncJob } from "./run-sync";

interface SchedulerTarget {
  orgId: string;
  orgSlug: string | null;
  jurisdictionId: string;
  jurisdictionCode: string;
  portalUsername?: string;
  portalPassword?: string;
}

interface SchedulerState {
  enabled: boolean;
  intervalMs: number;
  runOnBoot: boolean;
  isRunning: boolean;
  lastStartedAt: string | null;
  lastCompletedAt: string | null;
  lastError: string | null;
}

const schedulerLogger = createLogger("SCHEDULER");
const schedulerEnabled = parseBooleanEnv(
  process.env.TAX_SYNC_SCHEDULER_ENABLED,
  false,
);
const schedulerIntervalMs = parsePositiveIntEnv(
  process.env.TAX_SYNC_SCHEDULER_INTERVAL_MS,
  30 * 60 * 1000,
);
const schedulerRunOnBoot = parseBooleanEnv(
  process.env.TAX_SYNC_SCHEDULER_RUN_ON_BOOT,
  true,
);

let timer: NodeJS.Timeout | null = null;
let activeCycle: Promise<void> | null = null;
let lastStartedAt: Date | null = null;
let lastCompletedAt: Date | null = null;
let lastError: string | null = null;

function parseCsvEnv(value: string | undefined) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBooleanEnv(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (
    normalized === "1" ||
    normalized === "true" ||
    normalized === "yes" ||
    normalized === "on"
  ) {
    return true;
  }

  if (
    normalized === "0" ||
    normalized === "false" ||
    normalized === "no" ||
    normalized === "off"
  ) {
    return false;
  }

  return fallback;
}

function parsePositiveIntEnv(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRequestedJurisdictions() {
  const requested = parseCsvEnv(process.env.TAX_SYNC_SCHEDULER_JURISDICTIONS)
    .map((entry) => entry.toUpperCase());

  if (requested.length > 0) {
    return requested;
  }

  return ["GG", "JE"];
}

async function resolveTargetOrganisations() {
  const requestedOrgIds = new Set(parseCsvEnv(process.env.TAX_SYNC_SCHEDULER_ORG_IDS));
  const requestedOrgSlugs = new Set(
    parseCsvEnv(process.env.TAX_SYNC_SCHEDULER_ORG_SLUGS).map((entry) =>
      entry.toLowerCase(),
    ),
  );

  if (requestedOrgIds.size === 0 && requestedOrgSlugs.size === 0) {
    const settings = await db.query.jurisdictionSettings.findMany({
      with: {
        organisation: true,
      },
    });

    const orgMap = new Map<
      string,
      NonNullable<typeof settings[number]["organisation"]>
    >();
    for (const setting of settings) {
      if (setting.organisation) {
        orgMap.set(setting.organisation.id, setting.organisation);
      }
    }

    return [...orgMap.values()];
  }

  const organisations = await db.query.organisations.findMany();
  return organisations.filter((organisation) => {
    return (
      requestedOrgIds.has(organisation.id) ||
      requestedOrgSlugs.has(organisation.slug.toLowerCase())
    );
  });
}

async function resolveSchedulerTargets(): Promise<SchedulerTarget[]> {
  const requestedJurisdictions = new Set(getRequestedJurisdictions());
  const organisations = await resolveTargetOrganisations();

  if (organisations.length === 0) {
    schedulerLogger.warn("No scheduler target organisations resolved");
    return [];
  }

  const settings = await db.query.jurisdictionSettings.findMany({
    with: {
      organisation: true,
      jurisdiction: true,
    },
  });

  const settingMap = new Map<string, (typeof settings)[number]>();
  for (const setting of settings) {
    if (!setting.orgId || !setting.jurisdiction?.code) {
      continue;
    }

    settingMap.set(
      `${setting.orgId}:${setting.jurisdiction.code.toUpperCase()}`,
      setting,
    );
  }

  const jurisdictions = await db.query.jurisdictions.findMany();
  const jurisdictionMap = new Map(
    jurisdictions.map((jurisdiction) => [
      jurisdiction.code.toUpperCase(),
      jurisdiction,
    ]),
  );

  const targets: SchedulerTarget[] = [];

  for (const organisation of organisations) {
    for (const jurisdictionCode of requestedJurisdictions) {
      const jurisdiction = jurisdictionMap.get(jurisdictionCode);
      if (!jurisdiction) {
        schedulerLogger.warn("Skipping unknown jurisdiction", {
          orgId: organisation.id,
          jurisdictionCode,
        });
        continue;
      }

      const setting = settingMap.get(`${organisation.id}:${jurisdictionCode}`);
      const credentials = decryptPortalCredentials(
        setting?.portalCredentialsEncrypted,
      );

      if (!(credentials?.username && credentials?.password)) {
        schedulerLogger.warn("Skipping target without credentials", {
          orgId: organisation.id,
          orgSlug: organisation.slug,
          jurisdictionCode,
        });
        continue;
      }

      targets.push({
        orgId: organisation.id,
        orgSlug: organisation.slug,
        jurisdictionId: jurisdiction.id,
        jurisdictionCode,
        portalUsername: credentials?.username,
        portalPassword: credentials?.password,
      });
    }
  }

  return targets.sort((left, right) => {
    const leftKey = `${left.orgSlug ?? left.orgId}:${left.jurisdictionCode}`;
    const rightKey = `${right.orgSlug ?? right.orgId}:${right.jurisdictionCode}`;
    return leftKey.localeCompare(rightKey);
  });
}

async function hasActiveSyncJob(target: SchedulerTarget) {
  const activeJob = await db.query.taxSyncJobs.findFirst({
    where: and(
      eq(schema.taxSyncJobs.orgId, target.orgId),
      eq(schema.taxSyncJobs.jurisdictionId, target.jurisdictionId),
      or(
        eq(schema.taxSyncJobs.status, "pending"),
        eq(schema.taxSyncJobs.status, "running"),
      ),
    ),
    orderBy: desc(schema.taxSyncJobs.createdAt),
  });

  return activeJob;
}

async function runSchedulerCycleInternal() {
  lastStartedAt = new Date();
  lastError = null;

  const targets = await resolveSchedulerTargets();
  schedulerLogger.info("Scheduler cycle starting", {
    targets: targets.map((target) => ({
      orgId: target.orgId,
      orgSlug: target.orgSlug,
      jurisdictionCode: target.jurisdictionCode,
    })),
  });

  let failures = 0;

  for (const target of targets) {
    const targetLogger = schedulerLogger.child(
      `${target.orgSlug ?? target.orgId}:${target.jurisdictionCode}`,
    );

    const activeJob = await hasActiveSyncJob(target);
    if (activeJob) {
      targetLogger.warn("Skipping target with active sync job", {
        jobId: activeJob.id,
        status: activeJob.status,
      });
      continue;
    }

    try {
      const result = await runTaxSyncJob({
        orgId: target.orgId,
        jurisdictionCode: target.jurisdictionCode,
        trigger: "scheduler",
        portalUsername: target.portalUsername,
        portalPassword: target.portalPassword,
        logger: targetLogger,
      });

      targetLogger.info("Scheduled sync completed", {
        jobId: result.jobId,
        returnsFound: result.returnsFound,
      });
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      targetLogger.error("Scheduled sync failed", {
        error: message,
      });
    }
  }

  lastCompletedAt = new Date();

  if (failures > 0) {
    lastError = `${failures} scheduled sync target(s) failed`;
    throw new Error(lastError);
  }
}

export async function runSchedulerCycle() {
  if (activeCycle) {
    schedulerLogger.warn("Scheduler cycle already running, skipping trigger");
    return activeCycle;
  }

  activeCycle = runSchedulerCycleInternal()
    .catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
      throw error;
    })
    .finally(() => {
      activeCycle = null;
    });

  return activeCycle;
}

export function getSchedulerState(): SchedulerState {
  return {
    enabled: schedulerEnabled,
    intervalMs: schedulerIntervalMs,
    runOnBoot: schedulerRunOnBoot,
    isRunning: Boolean(activeCycle),
    lastStartedAt: lastStartedAt?.toISOString() ?? null,
    lastCompletedAt: lastCompletedAt?.toISOString() ?? null,
    lastError,
  };
}

export function startScheduler() {
  if (!schedulerEnabled) {
    schedulerLogger.info("Scheduler disabled");
    return;
  }

  if (timer) {
    schedulerLogger.warn("Scheduler already started");
    return;
  }

  schedulerLogger.info("Starting scheduler", {
    intervalMs: schedulerIntervalMs,
    runOnBoot: schedulerRunOnBoot,
    jurisdictions: getRequestedJurisdictions(),
    orgIds: parseCsvEnv(process.env.TAX_SYNC_SCHEDULER_ORG_IDS),
    orgSlugs: parseCsvEnv(process.env.TAX_SYNC_SCHEDULER_ORG_SLUGS),
  });

  timer = setInterval(() => {
    void runSchedulerCycle().catch((error) => {
      schedulerLogger.error("Scheduled cycle failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, schedulerIntervalMs);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  if (schedulerRunOnBoot) {
    void runSchedulerCycle().catch((error) => {
      schedulerLogger.error("Initial scheduled cycle failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }
}
