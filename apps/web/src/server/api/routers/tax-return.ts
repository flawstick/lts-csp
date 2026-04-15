import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { env } from "@/env";
import {
  portalClientProfiles,
  portalReturnShares,
  createEmptyJerseyCompanyReturnFormData,
  db,
  getJerseyCompanyReturnMissingFields,
  isJerseyCompanyReturnComplete,
  jerseyCompanyReturnForms,
  jurisdictionSettings,
  taxReturns,
  jurisdictions,
  taxSyncJobs,
  taxSyncJobLogs,
  organisations,
  tasks,
  substanceForms,
  jobs,
  taxReturnFileCategories,
  taxReturnFileRoles,
} from "@repo/database";
import {
  getClientAccessRecipientEmails,
  hashClientAccessToken,
  normalizeClientEntityName,
} from "@repo/database/client-access";
import { asc, desc, sql, eq, and, lt, inArray, or } from "drizzle-orm";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import * as cheerio from "cheerio";
import { decryptPortalCredentials } from "@repo/database/portal-credentials";
import { launchBrowserTask } from "@/lib/ecs";
import { triggerTaxSync } from "@/lib/tax-sync-launcher";
import { sendClientReturnAccessEmail } from "@/lib/email";
import {
  jerseyCompanyReturnFormSchema,
  sanitizeJerseyCompanyReturnData,
} from "@/lib/schemas/jersey-company-return";

const taxReturnFileCategoryEnum = z.enum(taxReturnFileCategories);
const taxReturnFileRoleEnum = z.enum(taxReturnFileRoles);

type TaxReturnFileRecord = {
  url: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: string;
  category?: z.infer<typeof taxReturnFileCategoryEnum>;
  role?: z.infer<typeof taxReturnFileRoleEnum>;
  metadata?: Record<string, unknown>;
};

const BROWSER_HEARTBEAT_STALE_MS = 60_000;

function buildClientAccessUrl(token: string) {
  const baseUrl =
    process.env.PORTAL_BASE_URL ??
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL ??
    "http://localhost:3001";

  return `${baseUrl.replace(/\/$/, "")}/client-access/${token}`;
}

function getResultDataRecord(
  resultData: unknown,
): Record<string, unknown> | null {
  if (!resultData || typeof resultData !== "object" || Array.isArray(resultData)) {
    return null;
  }

  return resultData as Record<string, unknown>;
}

function getResultDataNumber(
  resultData: unknown,
  key: string,
): number | undefined {
  const record = getResultDataRecord(resultData);
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

function isActiveBrowserJobStatus(status: string) {
  return (
    status === "queued" ||
    status === "starting" ||
    status === "running" ||
    status === "paused"
  );
}

function getTaskDisplayStatus(
  taskStatus: string,
  latestJobStatus?: string | null,
) {
  if (!latestJobStatus) {
    return taskStatus;
  }

  if (
    latestJobStatus === "queued" ||
    latestJobStatus === "starting" ||
    latestJobStatus === "running" ||
    latestJobStatus === "paused" ||
    latestJobStatus === "completed" ||
    latestJobStatus === "failed" ||
    latestJobStatus === "cancelled"
  ) {
    return latestJobStatus;
  }

  return taskStatus;
}

function getBrowserJobStaleReason(job: {
  status: string;
  createdAt: Date | string;
  startedAt?: Date | string | null;
  updatedAt?: Date | string | null;
  resultData?: unknown;
}): string | null {
  const now = Date.now();

  if (job.status === "starting") {
    const startupStartedAt =
      getResultDataNumber(job.resultData, "startupStartedAt") ??
      (job.startedAt ? new Date(job.startedAt).getTime() : undefined) ??
      (job.updatedAt ? new Date(job.updatedAt).getTime() : undefined) ??
      new Date(job.createdAt).getTime();

    if (now - startupStartedAt > env.BROWSER_STARTUP_TIMEOUT_MS) {
      return "Browser Use session failed to initialize";
    }
  }

  if (job.status === "running" || job.status === "paused") {
    const lastHeartbeatAt =
      getResultDataNumber(job.resultData, "lastHeartbeatAt") ??
      (job.updatedAt ? new Date(job.updatedAt).getTime() : undefined) ??
      (job.startedAt ? new Date(job.startedAt).getTime() : undefined);

    if (lastHeartbeatAt && now - lastHeartbeatAt > BROWSER_HEARTBEAT_STALE_MS) {
      return "Browser worker heartbeat lost";
    }
  }

  return null;
}

async function maybeMarkBrowserJobStale<
  T extends {
    id: string;
    status: string;
    createdAt: Date | string;
    startedAt?: Date | string | null;
    updatedAt?: Date | string | null;
    errorMessage?: string | null;
    completedAt?: Date | string | null;
    resultData?: unknown;
  },
>(
  dbClient: typeof db,
  job: T,
  ids?: {
    taskId?: string | null;
    taxReturnId?: string | null;
  },
): Promise<T> {
  const reason = getBrowserJobStaleReason(job);
  if (!reason) {
    return job;
  }

  const nextResultData = {
    ...(getResultDataRecord(job.resultData) ?? {}),
    staleFailureAt: Date.now(),
    staleFailureReason: reason,
  };

  await dbClient
    .update(jobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage: reason,
      resultData: nextResultData,
    })
    .where(eq(jobs.id, job.id));

  if (ids?.taskId) {
    await dbClient
      .update(tasks)
      .set({
        status: "failed",
      })
      .where(eq(tasks.id, ids.taskId));
  }

  if (ids?.taxReturnId) {
    await dbClient
      .update(taxReturns)
      .set({
        status: "failed",
      })
      .where(eq(taxReturns.id, ids.taxReturnId));
  }

  return {
    ...job,
    status: "failed",
    completedAt: new Date(),
    errorMessage: reason,
    resultData: nextResultData,
  };
}

const SYNC_JOB_PENDING_STALE_MS = 5 * 60 * 1000;
const SYNC_JOB_RUNNING_STALE_MS = 30 * 60 * 1000;

async function maybeMarkSyncJobStale<
  T extends {
    id: string;
    status: string;
    createdAt: Date | string;
    startedAt?: Date | string | null;
    completedAt?: Date | string | null;
    errorMessage?: string | null;
  },
>(dbClient: typeof db, job: T): Promise<T> {
  const now = Date.now();
  let reason: string | null = null;

  if (job.status === "pending") {
    const ageMs = now - new Date(job.createdAt).getTime();
    if (ageMs > SYNC_JOB_PENDING_STALE_MS) {
      reason = "Sync did not start";
    }
  }

  if (job.status === "running") {
    const lastLog = await dbClient.query.taxSyncJobLogs.findFirst({
      where: eq(taxSyncJobLogs.jobId, job.id),
      orderBy: desc(taxSyncJobLogs.createdAt),
    });

    const lastActivityAt =
      lastLog?.createdAt ??
      (job.startedAt ? new Date(job.startedAt) : null) ??
      new Date(job.createdAt);

    if (now - new Date(lastActivityAt).getTime() > SYNC_JOB_RUNNING_STALE_MS) {
      reason = "Sync job stopped producing logs";
    }
  }

  if (!reason) {
    return job;
  }

  await dbClient
    .update(taxSyncJobs)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage: reason,
    })
    .where(eq(taxSyncJobs.id, job.id));

  return {
    ...job,
    status: "failed",
    completedAt: new Date(),
    errorMessage: reason,
  };
}

function getBrowserUseSessionId(
  resultData: Record<string, unknown> | null | undefined,
): string | null {
  if (!resultData) {
    return null;
  }

  const browserUseSessionId = resultData.browserUseSessionId;
  if (typeof browserUseSessionId === "string" && browserUseSessionId.trim()) {
    return browserUseSessionId.trim();
  }

  const sessionId = resultData.sessionId;
  if (typeof sessionId === "string" && sessionId.trim()) {
    return sessionId.trim();
  }

  return null;
}

async function stopBrowserUseSession(
  sessionId: string,
  strategy: "task" | "session",
): Promise<void> {
  const apiKey = process.env.BROWSER_USE_API_KEY?.trim();
  if (!apiKey) {
    return;
  }

  const response = await fetch(
    `https://api.browser-use.com/api/v3/sessions/${sessionId}/stop`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "X-Browser-Use-API-Key": apiKey,
      },
      body: JSON.stringify({ strategy }),
    },
  );

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Browser Use stop failed: ${response.status} ${response.statusText}`,
    );
  }
}

async function getBrowserUseSessionStatus(
  sessionId: string,
): Promise<string | null> {
  const apiKey = process.env.BROWSER_USE_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const response = await fetch(
    `https://api.browser-use.com/api/v3/sessions/${sessionId}`,
    {
      headers: {
        "X-Browser-Use-API-Key": apiKey,
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `Browser Use session lookup failed: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as { status?: string };
  return typeof data.status === "string" ? data.status : null;
}

async function waitForBrowserUseSessionToPause(
  sessionId: string,
  timeoutMs = 10_000,
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: string | null = null;

  while (Date.now() < deadline) {
    lastStatus = await getBrowserUseSessionStatus(sessionId);
    if (lastStatus !== "running") {
      return lastStatus;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return lastStatus;
}

function getBrowserJobLogWindowStartMs(job: {
  createdAt: Date | string;
  resultData?: unknown;
}) {
  const configuredStart =
    getResultDataNumber(job.resultData, "logWindowStartAt") ??
    getResultDataNumber(job.resultData, "queueClaimedAt") ??
    getResultDataNumber(job.resultData, "startupStartedAt");

  const fallbackStart = new Date(job.createdAt).getTime();
  const resolvedStart =
    typeof configuredStart === "number" && Number.isFinite(configuredStart)
      ? configuredStart
      : fallbackStart;

  return Math.max(0, resolvedStart - 5_000);
}

function parseBrowserWorkerLogMessage(rawMessage: string): {
  jobId: string | null;
  message: string;
  payload?: Record<string, unknown>;
} {
  const trimmed = rawMessage.trim();

  if (!trimmed) {
    return {
      jobId: null,
      message: "",
    };
  }

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      const jobId =
        typeof parsed.jobId === "string" && parsed.jobId.trim()
          ? parsed.jobId.trim()
          : null;
      const message =
        typeof parsed.message === "string" && parsed.message.trim()
          ? parsed.message.trim()
          : trimmed;

      return {
        jobId,
        message,
        payload: parsed,
      };
    } catch {
      return {
        jobId: null,
        message: trimmed,
      };
    }
  }

  const jobIdMatch = trimmed.match(/"jobId":"([^"]+)"/);
  return {
    jobId: jobIdMatch?.[1] ?? null,
    message: trimmed,
  };
}

const persistedOptionalString = z
  .string()
  .nullish()
  .transform((value) => (typeof value === "string" ? value : undefined));

const persistedOptionalNumber = z
  .number()
  .nullish()
  .transform((value) => (typeof value === "number" ? value : undefined));

const persistedStepSchema = z.object({
  stepNumber: persistedOptionalNumber.optional(),
  goal: persistedOptionalString.optional(),
  memory: persistedOptionalString.optional(),
  url: persistedOptionalString.optional(),
  message: persistedOptionalString.optional(),
});

export const taxReturnRouter = createTRPCRouter({
  sync: publicProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ input }) => {
      const url =
        "https://my.gov.gg/revenue/all-cases?taxReferenceType=All&year=All&formStatus=All&items_per_page=50&page=0";

      const response = await fetch(url, {
        headers: {
          Accept: "text/html",
          Cookie: input.token,
          "User-Agent": "Mozilla/5.0",
        },
      });

      if (!response.ok) throw new Error(`Failed: ${response.status}`);

      const html = await response.text();
      const $ = cheerio.load(html);
      const returns: {
        id: string;
        entity: string;
        jurisdiction: string;
        year: number;
        status: string;
        source: string;
      }[] = [];

      $("table tbody tr").each((_, row) => {
        const $row = $(row);
        const entityName = $row
          .find(".views-field-taxReferenceOwnerName")
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const trn = $row
          .find(".views-field-taxReferenceNumber")
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const year = $row
          .find(".views-field-year")
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const statusText = $row
          .find(".views-field-formStatus")
          .text()
          .replace(/\s+/g, " ")
          .trim();

        let status = "pending";
        if (statusText.includes("Submitted")) status = "completed";
        else if (statusText.includes("Prepared")) status = "in_progress";

        if (entityName && trn) {
          returns.push({
            id: `${trn}-${year}`,
            entity: entityName,
            jurisdiction: "Guernsey",
            year: parseInt(year) || 2024,
            status,
            source: "Guernsey Tax Portal",
          });
        }
      });

      return returns;
    }),

  delete: publicProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      if (input.length === 0) return;
      await ctx.db.delete(taxReturns).where(inArray(taxReturns.id, input));
    }),

  // Get a single tax return with substance form
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.id),
        with: {
          jurisdiction: true,
          substanceForm: true,
          jerseyCompanyReturnForm: true,
          tasks: true,
        },
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      return taxReturn;
    }),

  sendClientAccessLink: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        expiresInDays: z.number().int().min(1).max(30).default(14),
        sendEmail: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
        with: {
          jurisdiction: true,
        },
      });

      if (!taxReturn) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const normalizedEntityName = normalizeClientEntityName(
        taxReturn.entityName,
      );
      const clientProfile = await ctx.db.query.portalClientProfiles.findFirst({
        where: and(
          eq(portalClientProfiles.orgId, taxReturn.orgId),
          eq(portalClientProfiles.normalizedEntityName, normalizedEntityName),
        ),
      });

      const recipientEmails = getClientAccessRecipientEmails({
        primaryEmail: clientProfile?.primaryEmail ?? null,
        secondaryEmails: clientProfile?.secondaryEmails ?? [],
      });

      if (!recipientEmails.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Set a primary or secondary client email in the portal client page before sending access.",
        });
      }

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

      const shareIds: string[] = [];
      const accessUrls: string[] = [];

      for (const recipientEmail of recipientEmails) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const [share] = await ctx.db
          .insert(portalReturnShares)
          .values({
            orgId: taxReturn.orgId,
            taxReturnId: taxReturn.id,
            clientProfileId: clientProfile?.id ?? null,
            recipientEmail,
            tokenHash: hashClientAccessToken(rawToken),
            expiresAt,
            lastSentAt: new Date(),
            createdBy: null,
          })
          .returning();

        if (share?.id) {
          shareIds.push(share.id);
        }

        const accessUrl = buildClientAccessUrl(rawToken);
        accessUrls.push(accessUrl);

        if (input.sendEmail) {
          await sendClientReturnAccessEmail({
            to: recipientEmail,
            jurisdictionName: taxReturn.jurisdiction?.name ?? "Tax return",
            entityName: taxReturn.entityName,
            taxYear: taxReturn.taxYear,
            accessUrl,
            expiresAt,
          });
        }
      }

      return {
        shareId: shareIds[0] ?? null,
        shareIds,
        accessUrl: accessUrls[0] ?? null,
        accessUrls,
        recipientEmail: recipientEmails[0] ?? null,
        recipientEmails,
        emailed: input.sendEmail,
        expiresAt,
      };
    }),

  // Add file to a tax return
  addFile: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        file: z.object({
          url: z.string().url(),
          name: z.string(),
          size: z.number(),
          type: z.string(),
          category: taxReturnFileCategoryEnum.optional(),
          role: taxReturnFileRoleEnum.optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.file.role === "filed_return_pdf") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Filed return PDFs are system-managed and cannot be uploaded manually.",
        });
      }

      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      const currentFiles = (taxReturn.files ?? []) as TaxReturnFileRecord[];

      const newFile: TaxReturnFileRecord = {
        ...input.file,
        uploadedAt: new Date().toISOString(),
      };

      const nextFiles =
        newFile.role === "financial_statements"
          ? currentFiles.map((file) =>
              file.role === "financial_statements"
                ? { ...file, role: undefined }
                : file,
            )
          : currentFiles;

      const [updated] = await ctx.db
        .update(taxReturns)
        .set({
          files: [...nextFiles, newFile],
        })
        .where(eq(taxReturns.id, input.taxReturnId))
        .returning();

      return updated;
    }),

  // Remove file from a tax return
  removeFile: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        fileUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      const currentFiles = (taxReturn.files ?? []) as TaxReturnFileRecord[];

      const updatedFiles = currentFiles.filter((f) => f.url !== input.fileUrl);

      const [updated] = await ctx.db
        .update(taxReturns)
        .set({
          files: updatedFiles,
        })
        .where(eq(taxReturns.id, input.taxReturnId))
        .returning();

      return updated;
    }),

  assignFileRole: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        fileUrl: z.string().url(),
        role: taxReturnFileRoleEnum.nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.role === "filed_return_pdf") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Filed return PDFs are system-managed and cannot be assigned manually.",
        });
      }

      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      const currentFiles = (taxReturn.files ?? []) as TaxReturnFileRecord[];
      const hasTargetFile = currentFiles.some(
        (file) => file.url === input.fileUrl,
      );

      if (!hasTargetFile) {
        throw new Error("File not found on tax return");
      }

      const updatedFiles = currentFiles.map((file) => {
        if (file.url === input.fileUrl) {
          return {
            ...file,
            role: input.role ?? undefined,
          };
        }

        if (
          input.role === "financial_statements" &&
          file.role === "financial_statements"
        ) {
          return {
            ...file,
            role: undefined,
          };
        }

        return file;
      });

      const [updated] = await ctx.db
        .update(taxReturns)
        .set({
          files: updatedFiles,
        })
        .where(eq(taxReturns.id, input.taxReturnId))
        .returning();

      return updated;
    }),

  list: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid().optional(), // Optional for backwards compatibility, but should be provided
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        jurisdictionCode: z.string().trim().min(2).max(8).optional(),
        taxYear: z.number().int().optional(),
        status: z
          .enum([
            "pending",
            "in_progress",
            "review_required",
            "completed",
            "failed",
            "dismissed",
          ])
          .optional(),
        search: z.string().optional(),


      }),
    )
    .query(async ({ ctx, input }) => {
      const {
        orgId,
        page,
        pageSize,
        jurisdictionCode,
        taxYear,
        status,
        search,
      } = input;
      const offset = (page - 1) * pageSize;

      // Build where conditions
      const conditions = [];

      // Filter by orgId if provided
      if (orgId) {
        conditions.push(eq(taxReturns.orgId, orgId));
      }

      if (jurisdictionCode) {
        conditions.push(eq(jurisdictions.code, jurisdictionCode));
      }

      if (typeof taxYear === "number") {
        conditions.push(eq(taxReturns.taxYear, taxYear));
      }

      if (status) {
        conditions.push(eq(taxReturns.status, status));
      }
      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(
          sql`(${taxReturns.entityName} ILIKE ${searchPattern} OR ${taxReturns.externalId} ILIKE ${searchPattern})`,
        );
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const [returns, countResult] = await Promise.all([
        ctx.db
          .select({
            id: taxReturns.id,
            entityName: taxReturns.entityName,
            taxYear: taxReturns.taxYear,
            status: taxReturns.status,
            returnType: taxReturns.returnType,
            externalId: taxReturns.externalId,
            link: taxReturns.link,
            pdfUrl: taxReturns.pdfUrl,
            createdAt: taxReturns.createdAt,
            isSubstanceComplete: sql<boolean | null>`
              CASE
                WHEN ${taxReturns.returnType} = 'economic_substance' THEN ${substanceForms.isComplete}
                ELSE ${jerseyCompanyReturnForms.isComplete}
              END
            `,
            missingSubstanceFieldCount: sql<number>`
              CASE
                WHEN ${taxReturns.returnType} = 'economic_substance' THEN COALESCE(jsonb_array_length(${substanceForms.missingFields}), 0)
                ELSE COALESCE(jsonb_array_length(${jerseyCompanyReturnForms.missingFields}), 0)
              END
            `,
            jurisdiction: {
              name: jurisdictions.name,
              code: jurisdictions.code,
            },
          })
          .from(taxReturns)
          .leftJoin(substanceForms, eq(substanceForms.taxReturnId, taxReturns.id))
          .leftJoin(
            jerseyCompanyReturnForms,
            eq(jerseyCompanyReturnForms.taxReturnId, taxReturns.id),
          )
          .leftJoin(
            jurisdictions,
            eq(taxReturns.jurisdictionId, jurisdictions.id),
          )
          .where(whereClause)
          .orderBy(desc(taxReturns.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(taxReturns)
          .leftJoin(
            jurisdictions,
            eq(taxReturns.jurisdictionId, jurisdictions.id),
          )
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);
      const totalPages = Math.ceil(total / pageSize);

      return {
        returns,
        total,
        page,
        pageSize,
        totalPages,
      };
    }),

  listSyncJobs: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        jurisdictionCode: z.string().trim().min(2).max(8).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { orgId, page, pageSize, jurisdictionCode } = input;
      const offset = (page - 1) * pageSize;
      const conditions = [];

      if (orgId) {
        conditions.push(eq(taxSyncJobs.orgId, orgId));
      }

      if (jurisdictionCode) {
        conditions.push(eq(jurisdictions.code, jurisdictionCode));
      }

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const fiveMinutesAgo = new Date(Date.now() - SYNC_JOB_PENDING_STALE_MS);
      const thirtyMinutesAgo = new Date(Date.now() - SYNC_JOB_RUNNING_STALE_MS);
      await ctx.db
        .update(taxSyncJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: "Sync did not start",
        })
        .where(
          and(
            eq(taxSyncJobs.status, "pending"),
            lt(taxSyncJobs.createdAt, fiveMinutesAgo),
          ),
        );

      await ctx.db
        .update(taxSyncJobs)
        .set({
          status: "failed",
          completedAt: new Date(),
          errorMessage: "Sync job stopped producing logs",
        })
        .where(
          and(
            eq(taxSyncJobs.status, "running"),
            lt(taxSyncJobs.startedAt, thirtyMinutesAgo),
          ),
        );

      const [jobs, countResult] = await Promise.all([
        ctx.db
          .select({
            id: taxSyncJobs.id,
            status: taxSyncJobs.status,
            trigger: taxSyncJobs.trigger,
            returnsFound: taxSyncJobs.returnsFound,
            startedAt: taxSyncJobs.startedAt,
            completedAt: taxSyncJobs.completedAt,
            errorMessage: taxSyncJobs.errorMessage,
            createdAt: taxSyncJobs.createdAt,
            metadata: taxSyncJobs.metadata,
            jurisdiction: {
              name: jurisdictions.name,
              code: jurisdictions.code,
            },
          })
          .from(taxSyncJobs)
          .leftJoin(
            jurisdictions,
            eq(taxSyncJobs.jurisdictionId, jurisdictions.id),
          )
          .where(whereClause)
          .orderBy(desc(taxSyncJobs.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(taxSyncJobs)
          .leftJoin(
            jurisdictions,
            eq(taxSyncJobs.jurisdictionId, jurisdictions.id),
          )
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);
      const totalPages = Math.ceil(total / pageSize);

      return {
        jobs,
        total,
        page,
        pageSize,
        totalPages,
      };
    }),

  getSyncJobLogs: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      let job = await ctx.db.query.taxSyncJobs.findFirst({
        where: eq(taxSyncJobs.id, input.jobId),
        with: {
          organisation: true,
          jurisdiction: true,
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      job = await maybeMarkSyncJobStale(ctx.db, job);

      const logs = await ctx.db.query.taxSyncJobLogs.findMany({
        where: eq(taxSyncJobLogs.jobId, input.jobId),
        orderBy: [asc(taxSyncJobLogs.createdAt), asc(taxSyncJobLogs.id)],
        limit: 1000,
      });

      return {
        job,
        logs: logs.map((log) => ({
          id: log.id,
          timestamp: log.createdAt?.getTime(),
          message: log.message,
          level: log.level,
          scope: log.scope,
          payload: log.payload,
        })),
        pending: job.status === "pending" || job.status === "running",
      };
    }),

  getJobLogs: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      let job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      job = await maybeMarkBrowserJobStale(ctx.db, job, {
        taskId: job.taskId,
      });

      if (!job.cloudwatchLogGroup || !job.cloudwatchLogStream) {
        return {
          logs: [],
          job,
          pending: isActiveBrowserJobStatus(job.status),
        };
      }

      const startTime = getBrowserJobLogWindowStartMs(job);

      try {
        const client = new CloudWatchLogsClient({ region: "eu-west-2" });
        const command = new GetLogEventsCommand({
          logGroupName: job.cloudwatchLogGroup,
          logStreamName: job.cloudwatchLogStream,
          startFromHead: true,
          startTime,
          limit: 500,
        });

        const response = await client.send(command);
        const logs = (response.events || [])
          .map((event) => {
            const rawMessage = event.message || "";
            const parsed = parseBrowserWorkerLogMessage(rawMessage);
            return {
              timestamp: event.timestamp,
              rawMessage,
              parsed,
            };
          })
          .filter((event) => event.parsed.jobId === job.id)
          .map((event) => ({
            timestamp: event.timestamp,
            message: event.parsed.message,
            rawMessage: event.rawMessage,
            payload: event.parsed.payload,
          }));

        return {
          logs,
          job,
          pending: logs.length === 0 && isActiveBrowserJobStatus(job.status),
        };
      } catch (error) {
        const isResourceNotFound =
          (error as { name?: string })?.name === "ResourceNotFoundException";

        if (!isResourceNotFound) {
          console.error("Failed to fetch browser job logs:", error);
        }

        return {
          logs: [],
          job,
          pending: isResourceNotFound && isActiveBrowserJobStatus(job.status),
          error: isResourceNotFound
            ? "Waiting for worker logs..."
            : "Failed to fetch logs",
        };
      }
    }),

  startSyncJob: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        jurisdictionCode: z.string().trim().min(2).max(8).default("GG"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.orgId),
      });
      const jurisdiction = await ctx.db.query.jurisdictions.findFirst({
        where: eq(jurisdictions.code, input.jurisdictionCode),
      });

      if (!org || !jurisdiction) {
        throw new Error("Organisation or jurisdiction not found");
      }

      const jurisdictionSetting =
        await ctx.db.query.jurisdictionSettings.findFirst({
          where: and(
            eq(jurisdictionSettings.orgId, org.id),
            eq(jurisdictionSettings.jurisdictionId, jurisdiction.id),
          ),
        });
      const credentials = decryptPortalCredentials(
        jurisdictionSetting?.portalCredentialsEncrypted,
      );

      if (!credentials?.username || !credentials?.password) {
        throw new Error(
          `Portal credentials for ${jurisdiction.name} are not configured for this organisation. Update them in organisation settings first.`,
        );
      }

      // Create job record
      const [job] = await ctx.db
        .insert(taxSyncJobs)
        .values({
          orgId: org.id,
          jurisdictionId: jurisdiction.id,
          status: "pending",
          trigger: "manual",
          metadata: {
            requestedVia: "platform",
            executionMode: env.TAX_SYNC_EXECUTION_MODE,
          },
        })
        .returning();

      if (!job) throw new Error("Failed to create job");

      await ctx.db.insert(taxSyncJobLogs).values({
        jobId: job.id,
        level: "info",
        scope: "manual",
        message: "Manual sync requested",
        payload: {
          jurisdictionCode: jurisdiction.code,
          mode: env.TAX_SYNC_EXECUTION_MODE,
        },
      });

      try {
        const result = await triggerTaxSync({
          jobId: job.id,
          orgId: org.id,
          jurisdictionCode: jurisdiction.code,
          portalUsername: credentials?.username,
          portalPassword: credentials?.password,
        });

        await ctx.db.insert(taxSyncJobLogs).values({
          jobId: job.id,
          level: "info",
          scope: "manual",
          message: "Sync dispatched",
          payload: {
            mode: result.mode,
            taskArn: result.taskArn ?? null,
            accepted: result.accepted ?? null,
          },
        });

        if (result.mode === "ecs") {
          await ctx.db
            .update(taxSyncJobs)
            .set({
              ecsTaskArn: result.taskArn ?? null,
              cloudwatchLogGroup: "/ecs/lts-tax-sync",
              cloudwatchLogStream: result.taskArn
                ? `ecs/lts-tax-sync/${result.taskArn.split("/").pop()}`
                : null,
            })
            .where(eq(taxSyncJobs.id, job.id));
        }

        return {
          jobId: job.id,
          taskArn: result.taskArn,
          jurisdictionCode: jurisdiction.code,
          mode: result.mode,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        await ctx.db
          .update(taxSyncJobs)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorMessage: message,
          })
          .where(eq(taxSyncJobs.id, job.id));

        await ctx.db.insert(taxSyncJobLogs).values({
          jobId: job.id,
          level: "error",
          scope: "manual",
          message: "Failed to dispatch sync",
          payload: {
            error: message,
          },
        });

        throw error;
      }
    }),

  getActiveSyncJob: publicProcedure
    .input(z.object({ orgId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const filters = [
        or(eq(taxSyncJobs.status, "pending"), eq(taxSyncJobs.status, "running")),
      ];

      if (input?.orgId) {
        filters.push(eq(taxSyncJobs.orgId, input.orgId));
      }

      let activeJob = await ctx.db.query.taxSyncJobs.findFirst({
        where: and(...filters),
        orderBy: desc(taxSyncJobs.createdAt),
        with: {
          organisation: true,
          jurisdiction: true,
        },
      });

      if (!activeJob) {
        return null;
      }

      activeJob = await maybeMarkSyncJobStale(ctx.db, activeJob);
      if (activeJob.status === "failed") {
        return null;
      }

      return activeJob;
    }),

  deleteFailedSyncJobs: publicProcedure.mutation(async ({ ctx }) => {
    const result = await ctx.db
      .delete(taxSyncJobs)
      .where(eq(taxSyncJobs.status, "failed"))
      .returning({ id: taxSyncJobs.id });

    return { deleted: result.length };
  }),

  deleteTasks: publicProcedure
    .input(z.array(z.string()))
    .mutation(async ({ ctx, input }) => {
      if (input.length === 0) return;
      await ctx.db.delete(tasks).where(inArray(tasks.id, input));
    }),

  // List tasks with substance form status
  listTasks: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid().optional(), // Filter by org
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        jurisdictionCode: z.string().trim().min(2).max(8).optional(),
        status: z
          .enum(["pending", "in_progress", "completed", "failed", "cancelled"])
          .optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { orgId, page, pageSize, jurisdictionCode, status, search } = input;
      const offset = (page - 1) * pageSize;

      const conditions = [];

      // Filter by orgId if provided
      if (orgId) {
        conditions.push(eq(tasks.orgId, orgId));
      }

      if (jurisdictionCode) {
        conditions.push(eq(jurisdictions.code, jurisdictionCode));
      }

      if (status) {
        conditions.push(eq(tasks.status, status));
      }
      if (search) {
        const searchPattern = `%${search}%`;
        conditions.push(sql`(${tasks.name} ILIKE ${searchPattern})`);
      }
      conditions.push(
        sql`(${taxReturns.status} IS NULL OR ${taxReturns.status} <> 'dismissed')`,
      );

      const whereClause =
        conditions.length > 0 ? and(...conditions) : undefined;

      const [taskList, countResult] = await Promise.all([
        ctx.db
          .select({
            id: tasks.id,
            name: tasks.name,
            description: tasks.description,
            status: tasks.status,
            taskType: tasks.taskType,
            createdAt: tasks.createdAt,
            jurisdiction: {
              code: jurisdictions.code,
              name: jurisdictions.name,
            },
            taxReturn: {
              id: taxReturns.id,
              entityName: taxReturns.entityName,
              taxYear: taxReturns.taxYear,
              externalId: taxReturns.externalId,
            },
            substanceForm: {
              id: substanceForms.id,
              isComplete: substanceForms.isComplete,
              missingFields: substanceForms.missingFields,
            },
          })
          .from(tasks)
          .leftJoin(taxReturns, eq(tasks.taxReturnId, taxReturns.id))
          .leftJoin(jurisdictions, eq(tasks.jurisdictionId, jurisdictions.id))
          .leftJoin(
            substanceForms,
            eq(taxReturns.id, substanceForms.taxReturnId),
          )
          .where(whereClause)
          .orderBy(desc(tasks.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(tasks)
          .leftJoin(taxReturns, eq(tasks.taxReturnId, taxReturns.id))
          .leftJoin(jurisdictions, eq(tasks.jurisdictionId, jurisdictions.id))
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count || 0);
      const totalPages = Math.ceil(total / pageSize);

      const taskIds = taskList.map((task) => task.id);
      const latestJobsByTaskId = new Map<string, string>();

      if (taskIds.length > 0) {
        const pageJobs = await ctx.db.query.jobs.findMany({
          where: inArray(jobs.taskId, taskIds),
          orderBy: desc(jobs.createdAt),
        });

        for (const job of pageJobs) {
          if (latestJobsByTaskId.has(job.taskId)) {
            continue;
          }

          const relatedTask = taskList.find((task) => task.id === job.taskId);
          const normalizedJob = await maybeMarkBrowserJobStale(ctx.db, job, {
            taskId: job.taskId,
            taxReturnId: relatedTask?.taxReturn?.id ?? null,
          });

          latestJobsByTaskId.set(job.taskId, normalizedJob.status);
        }
      }

      const normalizedTasks = taskList.map((task) => ({
        ...task,
        status: getTaskDisplayStatus(
          task.status,
          latestJobsByTaskId.get(task.id),
        ),
      }));

      return {
        tasks: normalizedTasks,
        total,
        page,
        pageSize,
        totalPages,
      };
    }),

  getJerseyCompanyReturnForm: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const form = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId),
      });

      return form ?? null;
    }),

  createJerseyCompanyReturnForm: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
        with: { jurisdiction: true },
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      if (
        taxReturn.jurisdiction?.code !== "JE" ||
        taxReturn.returnType !== "company"
      ) {
        throw new Error(
          "Jersey company form is only available for Jersey company returns",
        );
      }

      const existing = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId),
      });

      if (existing) {
        return existing;
      }

      const initialData = createEmptyJerseyCompanyReturnFormData();
      const missingFields = getJerseyCompanyReturnMissingFields(initialData);

      const [created] = await ctx.db
        .insert(jerseyCompanyReturnForms)
        .values({
          taxReturnId: input.taxReturnId,
          section1: initialData.section1,
          scheduleA: initialData.scheduleA,
          distributions: initialData.distributions,
          compliance: initialData.compliance,
          economicSubstance: initialData.economicSubstance,
          additionalInfo: initialData.additionalInfo,
          missingFields,
          isComplete: missingFields.length === 0,
        })
        .returning();

      return created ?? null;
    }),

  updateJerseyCompanyReturnForm: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        data: jerseyCompanyReturnFormSchema.partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId),
      });

      if (!existing) {
        throw new Error("Jersey company return form has not been initialized");
      }

      const merged = sanitizeJerseyCompanyReturnData({
        section1: {
          ...(existing.section1 ?? {}),
          ...(input.data.section1 ?? {}),
        },
        scheduleA: {
          ...(existing.scheduleA ?? {}),
          ...(input.data.scheduleA ?? {}),
        },
        distributions: {
          ...(existing.distributions ?? {}),
          ...(input.data.distributions ?? {}),
        },
        compliance: {
          ...(existing.compliance ?? {}),
          ...(input.data.compliance ?? {}),
        },
        economicSubstance: {
          ...(existing.economicSubstance ?? {}),
          ...(input.data.economicSubstance ?? {}),
          relevantActivities:
            input.data.economicSubstance?.relevantActivities ??
            existing.economicSubstance?.relevantActivities ??
            [],
        },
        additionalInfo: {
          ...(existing.additionalInfo ?? {}),
          ...(input.data.additionalInfo ?? {}),
        },
      });

      const missingFields = getJerseyCompanyReturnMissingFields(merged);

      const [updated] = await ctx.db
        .update(jerseyCompanyReturnForms)
        .set({
          section1: merged.section1,
          scheduleA: merged.scheduleA,
          distributions: merged.distributions,
          compliance: merged.compliance,
          economicSubstance: merged.economicSubstance,
          additionalInfo: merged.additionalInfo,
          missingFields,
          isComplete: isJerseyCompanyReturnComplete(merged),
          lastEditedAt: new Date(),
        })
        .where(eq(jerseyCompanyReturnForms.taxReturnId, input.taxReturnId))
        .returning();

      return updated ?? null;
    }),

  // Create a task for a tax return
  createTask: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Get the tax return with substance form
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
        with: {
          jurisdiction: true,
          substanceForm: true,
          jerseyCompanyReturnForm: true,
        },
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      if (taxReturn.status === "completed") {
        throw new Error("Cannot create task for completed tax return");
      }

      // Check if task already exists
      const existingTask = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.taxReturnId, input.taxReturnId),
      });

      if (existingTask) {
        return existingTask;
      }

      // Create the task
      const [newTask] = await ctx.db
        .insert(tasks)
        .values({
          orgId: taxReturn.orgId,
          jurisdictionId: taxReturn.jurisdictionId,
          taxReturnId: input.taxReturnId,
          name: `${taxReturn.entityName} - ${taxReturn.taxYear}`,
          description: `Tax return processing for ${taxReturn.entityName}`,
          taskType: "tax_return",
          status: "pending",
        })
        .returning();

      // Create Guernsey substance form for the tax return if it doesn't exist
      if (
        taxReturn.returnType === "economic_substance" &&
        !taxReturn.substanceForm
      ) {
        await ctx.db.insert(substanceForms).values({
          taxReturnId: input.taxReturnId,
          entityName: taxReturn.entityName,
          taxReferenceNumber: taxReturn.externalId ?? undefined,
          accountingPeriodStart: `${taxReturn.taxYear}-01-01`,
          accountingPeriodEnd: `${taxReturn.taxYear}-12-31`,
        });
      }

      if (
        taxReturn.jurisdiction?.code === "JE" &&
        taxReturn.returnType === "company" &&
        !taxReturn.jerseyCompanyReturnForm
      ) {
        const initialData = createEmptyJerseyCompanyReturnFormData();
        const missingFields = getJerseyCompanyReturnMissingFields(initialData);

        await ctx.db.insert(jerseyCompanyReturnForms).values({
          taxReturnId: input.taxReturnId,
          section1: initialData.section1,
          scheduleA: initialData.scheduleA,
          distributions: initialData.distributions,
          compliance: initialData.compliance,
          economicSubstance: initialData.economicSubstance,
          additionalInfo: initialData.additionalInfo,
          missingFields,
          isComplete: missingFields.length === 0,
        });
      }

      return newTask;
    }),

  // Check if form is complete before starting task (now just returns warnings, doesn't block)
  canStartTask: publicProcedure
    .input(z.object({ taxReturnId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const taxReturn = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
        with: {
          jurisdiction: true,
          substanceForm: true,
          jerseyCompanyReturnForm: true,
        },
      });

      if (!taxReturn) {
        throw new Error("Tax return not found");
      }

      if (
        taxReturn.jurisdiction?.code === "JE" &&
        taxReturn.returnType === "company"
      ) {
        const form = taxReturn.jerseyCompanyReturnForm;

        if (!form) {
          return {
            canStart: false,
            warning:
              "Jersey return form not found. Complete the Jersey workflow first.",
          };
        }

        if (!form.isComplete) {
          return {
            canStart: false,
            warning: `Jersey return form incomplete. ${(form.missingFields as string[] | null)?.length ?? 0} fields missing.`,
            missingFields: (form.missingFields as string[] | null) ?? [],
          };
        }

        return {
          canStart: false,
          warning:
            "Jersey browser automation has not been implemented yet. Use the Jersey form pages to prepare the filing.",
        };
      }

      const form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!form) {
        // Still allow starting, but warn
        return {
          canStart: true,
          warning: "Substance form not found. Some fields may be missing.",
        };
      }

      if (!form.isComplete) {
        const missing = (form.missingFields as string[]) || [];
        // Allow starting with incomplete form, but include warning
        return {
          canStart: true,
          warning: `Substance form incomplete. ${missing.length} fields missing.`,
          missingFields: missing,
        };
      }

      return { canStart: true };
    }),

  // Get a single task with its jobs
  getTask: publicProcedure
    .input(z.object({ taskId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
        with: {
          taxReturn: {
            with: {
              jurisdiction: true,
              substanceForm: true,
              jerseyCompanyReturnForm: true,
            },
          },
          jobs: {
            orderBy: desc(jobs.createdAt),
          },
        },
      });

      if (!task) {
        throw new Error("Task not found");
      }

      const normalizedJobs = await Promise.all(
        task.jobs.map((job) =>
          maybeMarkBrowserJobStale(ctx.db, job, {
            taskId: task.id,
            taxReturnId: task.taxReturn?.id ?? null,
          }),
        ),
      );

      return {
        ...task,
        jobs: normalizedJobs,
      };
    }),

  // Get a single job
  getJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
        with: {
          task: {
            with: {
              taxReturn: {
                with: {
                  jurisdiction: true,
                  substanceForm: true,
                  jerseyCompanyReturnForm: true,
                },
              },
            },
          },
        },
      });

      if (!job) {
        throw new Error("Job not found");
      }

      return maybeMarkBrowserJobStale(ctx.db, job, {
        taskId: job.task?.id ?? null,
        taxReturnId: job.task?.taxReturn?.id ?? null,
      });
    }),

  // Start a new job for a task (enqueues to Postgres, optionally launches fallback ECS worker)
  startJob: publicProcedure
    .input(
      z.object({
        taskId: z.string().uuid(),
        overrideSaved: z.boolean().optional().default(false),
        submissionMode: z
          .enum(["prepare_only", "submit_and_capture_pdf"])
          .optional()
          .default("prepare_only"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the task with tax return
      const task = await ctx.db.query.tasks.findFirst({
        where: eq(tasks.id, input.taskId),
        with: {
          taxReturn: {
            with: {
              jurisdiction: true,
              substanceForm: true,
              jerseyCompanyReturnForm: true,
            },
          },
          jobs: true,
        },
      });

      if (!task) {
        throw new Error("Task not found");
      }

      if (!task.taxReturn) {
        throw new Error("Task has no associated tax return");
      }

      if (
        task.taxReturn.jurisdiction?.code === "JE" &&
        task.taxReturn.returnType === "company"
      ) {
        throw new Error(
          "Jersey browser automation is not implemented yet. Use the Jersey return form workflow instead.",
        );
      }

      const normalizedJobs = await Promise.all(
        task.jobs.map((job) =>
          maybeMarkBrowserJobStale(ctx.db, job, {
            taskId: task.id,
            taxReturnId: task.taxReturn?.id ?? null,
          }),
        ),
      );

      const activeJob = normalizedJobs.find((job) =>
        isActiveBrowserJobStatus(job.status),
      );
      if (activeJob) {
        throw new Error("A job is already running for this task");
      }

      // Get the next job number
      const jobNumber =
        normalizedJobs.reduce(
          (maxJobNumber, job) => Math.max(maxJobNumber, job.jobNumber),
          0,
        ) + 1;

      // Create job record
      const [newJob] = await ctx.db
        .insert(jobs)
        .values({
          taskId: input.taskId,
          jobNumber,
          status: "queued",
          aiModel: "bu-max",
          cloudwatchLogGroup: env.ECS_LOG_GROUP,
          resultData: {
            submissionMode: input.submissionMode,
            overrideSaved: input.overrideSaved,
            startupTimeoutMs: env.BROWSER_STARTUP_TIMEOUT_MS,
          },
        })
        .returning();

      if (!newJob) {
        throw new Error("Failed to create job");
      }

      // Update task status
      await ctx.db
        .update(tasks)
        .set({ status: "in_progress" })
        .where(eq(tasks.id, input.taskId));

      if (env.BROWSER_TASK_EXECUTION_MODE === "ecs_runtask") {
        try {
          const result = await launchBrowserTask({
            jobId: newJob.id,
            taxReturnId: task.taxReturn.id,
            taskId: input.taskId,
            overrideSaved: input.overrideSaved,
            submissionMode: input.submissionMode,
            workerMode: "single",
          });

          await ctx.db
            .update(jobs)
            .set({
              ecsTaskArn: result.taskArn,
              cloudwatchLogGroup: result.cloudwatchLogGroup,
              cloudwatchLogStream: result.cloudwatchLogStream,
            })
            .where(eq(jobs.id, newJob.id));

          return {
            jobId: newJob.id,
            taskArn: result.taskArn,
            status: "queued" as const,
          };
        } catch (err) {
          await ctx.db
            .update(jobs)
            .set({
              status: "failed",
              errorMessage:
                err instanceof Error
                  ? err.message
                  : "Failed to launch ECS task",
            })
            .where(eq(jobs.id, newJob.id));

          throw err;
        }
      }

      return {
        jobId: newJob.id,
        status: "queued" as const,
      };
    }),

  // Pause a running job (keeps browser alive for manual intervention)
  stopJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "running") {
        throw new Error("Job is not running");
      }

      // Pause the job - keeps browser session alive
      await ctx.db
        .update(jobs)
        .set({
          status: "paused",
        })
        .where(eq(jobs.id, input.jobId));

      const sessionId = getBrowserUseSessionId(job.resultData);
      if (sessionId) {
        try {
          await stopBrowserUseSession(sessionId, "task");
          await waitForBrowserUseSessionToPause(sessionId);
        } catch (error) {
          console.error("Failed to stop Browser Use task immediately:", error);
        }
      }

      return { success: true };
    }),

  // Cancel a job completely (kills browser session)
  cancelJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (
        job.status !== "queued" &&
        job.status !== "starting" &&
        job.status !== "running" &&
        job.status !== "paused"
      ) {
        throw new Error("Job is not active");
      }

      // TODO: Actually stop the ECS task via StopTaskCommand
      await ctx.db
        .update(jobs)
        .set({
          status: "cancelled",
          completedAt: new Date(),
        })
        .where(eq(jobs.id, input.jobId));

      await ctx.db
        .update(tasks)
        .set({
          status: "cancelled",
        })
        .where(eq(tasks.id, job.taskId));

      const sessionId = getBrowserUseSessionId(job.resultData);
      if (sessionId) {
        try {
          await stopBrowserUseSession(sessionId, "session");
          await waitForBrowserUseSessionToPause(sessionId);
        } catch (error) {
          console.error(
            "Failed to stop Browser Use session immediately:",
            error,
          );
        }
      }

      return { success: true };
    }),

  // Resume a paused job (user completed required action like login)
  resumeJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      if (job.status !== "paused") {
        throw new Error("Job is not paused");
      }

      // Set job back to running - the ECS task is polling for this change
      await ctx.db
        .update(jobs)
        .set({
          status: "running",
        })
        .where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  // Delete a job
  deleteJob: publicProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      // Don't allow deleting running jobs
      if (isActiveBrowserJobStatus(job.status)) {
        throw new Error("Cannot delete an active job. Stop it first.");
      }

      await ctx.db.delete(jobs).where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  // Update job chat and steps (for persistence)
  updateJobData: publicProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        chatMessages: z
          .array(
            z.object({
              id: z.string(),
              role: z.enum(["user", "assistant"]),
              content: z.string(),
              timestamp: z.number(),
            }),
          )
          .optional(),
        steps: z.array(persistedStepSchema).optional(),
        liveUrl: persistedOptionalString.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const job = await ctx.db.query.jobs.findFirst({
        where: eq(jobs.id, input.jobId),
      });

      if (!job) {
        throw new Error("Job not found");
      }

      const currentData = (job.resultData as Record<string, unknown>) || {};

      await ctx.db
        .update(jobs)
        .set({
          resultData: {
            ...currentData,
            ...(input.chatMessages && { chatMessages: input.chatMessages }),
            ...(input.steps && { steps: input.steps }),
            ...(input.liveUrl && { liveUrl: input.liveUrl }),
          },
        })
        .where(eq(jobs.id, input.jobId));

      return { success: true };
    }),

  dismissReturn: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: eq(taxReturns.id, input.taxReturnId),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      if (returnRecord.status === "completed") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot dismiss a completed return.",
        });
      }

      await ctx.db
        .update(taxReturns)
        .set({ status: "dismissed", updatedAt: new Date() })
        .where(eq(taxReturns.id, input.taxReturnId));

      return { success: true };
    }),

  undismissReturn: publicProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(taxReturns)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(taxReturns.id, input.taxReturnId));

      return { success: true };
    }),
});
