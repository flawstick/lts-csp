import { TRPCError } from "@trpc/server";
import type { User } from "@supabase/supabase-js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { createGateway } from "@ai-sdk/gateway";
import { generateObject } from "ai";
import * as XLSX from "xlsx";

import {
  accounts,
  jurisdictions,
  organisations,
  portalMemberships,
  substanceForms,
  tasks,
  taxReturns,
  taxReturnFileCategories,
  taxReturnFileRoles,
} from "@repo/database";
import {
  CIGA_BY_ACTIVITY,
  getMissingFields,
  substanceFormSchema,
  type SubstanceFormData,
} from "@/lib/schemas/substance-form";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { TRPCContext } from "@/server/api/trpc";

const portalFileSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().min(1),
  category: z.enum(taxReturnFileCategories).optional(),
  role: z.enum(taxReturnFileRoles).optional(),
});

const aiExtractionSchema = z.object({
  entityName: z.string().optional(),
  entityType: z.enum(["Company", "Partnership"]).optional(),
  accountingPeriodStart: z.string().optional(),
  accountingPeriodEnd: z.string().optional(),
  isCollectiveInvestmentVehicle: z.enum(["Yes", "No"]).optional(),
  companyNumber: z.string().optional(),
  taxReferenceNumber: z.string().optional(),
  registeredAddress: z.string().optional(),
  principalPlaceOfBusiness: z.string().optional(),
  isIncorporatedInGuernsey: z.enum(["Yes", "No"]).optional(),
  economicClassificationCode: z.string().optional().describe("REQUIRED for 2025 returns — Company Activity Code dropdown"),
  certificateType: z.string().optional(),
  entityActivity: z.string().optional().describe("Nature of the entity's business activity (e.g., 'Property Holdings') — extract from Directors Report"),
  partnershipName: z.string().optional(),
  partnershipNumber: z.string().optional(),
  areFinancialStatementsConsolidated: z.enum(["Yes", "No"]).optional(),
  accountsPreparerName: z.string().optional().describe("Name of the ACCOUNTANT/AUDITOR who prepared the financial accounts, NOT the ESR form preparer"),
  accountsPreparerQualification: z.string().optional().describe("Qualification of the accounts preparer/auditor (ACCA, ICAEW, etc.)"),
  netBookValue: z.string().optional().describe("Net book value from Balance Sheet — if negative, return '0'"),
  totalProfit: z.string().optional().describe("Total profit from P&L — if negative (a loss), return '0'"),
  profitAllocation: z.enum(["Investment", "Business"]).optional().describe("Profit before tax allocation — REQUIRED, always pick one"),
  isGuernseyFiFatca: z.enum(["Yes", "No"]).optional(),
  isGuernseyFiCrs: z.enum(["Yes", "No"]).optional(),
  isRegisteredOnIgor: z.enum(["Yes", "No"]).optional().describe("Is registered on IGOR — must be Yes if FATCA is Yes"),
  relevantActivity: z
    .enum([
      "Banking",
      "Insurance",
      "Fund management",
      "Financing and leasing",
      "Distribution and Service Centre",
      "Headquarters",
      "Shipping",
      "Self-managed fund",
      "Intellectual Property Holding Company",
      "Pure Equity Holding Company",
      "None of the above",
    ])
    .optional(),
  hasMultipleRelevantActivities: z.enum(["Yes", "No"]).optional(),
  hasIntellectualPropertyHolding: z.enum(["Yes", "No"]).optional(),
  isHighRiskIpEntity: z.enum(["Yes", "No"]).optional(),
  wantsToRebutHighRiskStatus: z.enum(["Yes", "No"]).optional(),
  highRiskRebuttalNarrative: z.string().optional(),
  ipIncomeType: z.string().optional(),
  hasAdequateExpenditure: z.enum(["Yes", "No", "N/A"]).optional(),
  hasAdequatePhysicalPresence: z.enum(["Yes", "No", "N/A"]).optional(),
  adequacyExpenditureDetails: z.string().optional(),
  adequacyPhysicalPresenceDetails: z.string().optional(),
  cigaPerformed: z.string().optional(),
  cigaDetails: z.string().optional(),
  employees: z
    .array(
      z.object({
        name: z.string().optional(),
        qualifiedForReporting: z.boolean().optional(),
        unitsOnCompany: z.number().optional(),
        totalUnits: z.number().optional(),
        fteFraction: z.number().optional(),
        qualifiedFteFraction: z.number().optional(),
      }),
    )
    .optional(),
  totalFte: z.number().optional(),
  totalQualifiedFte: z.number().optional(),
  hasCigaOutsourcing: z.enum(["Yes", "No", "N/A"]).optional(),
  outsourcingDetails: z.string().optional(),
  immediateParents: z
    .array(
      z.object({
        name: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional(),
        tinCountry: z.string().optional(),
        registeredAddress: z.string().optional(),
      }),
    )
    .optional(),
  ultimateParents: z
    .array(
      z.object({
        name: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional(),
        tinCountry: z.string().optional(),
        registeredAddress: z.string().optional(),
      }),
    )
    .optional(),
  ultimateBeneficialOwners: z
    .array(
      z.object({
        name: z.string().optional(),
        dateOfBirth: z.string().optional(),
        placeOfBirth: z.string().optional(),
        nationality: z.string().optional(),
        countryOfTaxResidence: z.string().optional(),
        tin: z.string().optional(),
        tinCountry: z.string().optional(),
        address: z.string().optional(),
      }),
    )
    .optional(),
  allBoardMeetingsInGuernsey: z.enum(["Yes", "No"]).optional(),
  totalBoardMeetings: z.number().optional(),
  boardMeetingsInGuernsey: z.number().optional(),
  adequateMeetingFrequency: z.enum(["Yes", "No", "N/A"]).optional(),
  enoughDirectorsPresent: z.enum(["Yes", "No", "N/A"]).optional(),
  directorsHaveExpertise: z.enum(["Yes", "No", "N/A"]).optional(),
  strategicDecisionsMadeInGuernsey: z.enum(["Yes", "No", "N/A"]).optional(),
  recordsMaintainedInGuernsey: z.enum(["Yes", "No", "N/A"]).optional(),
  boardMeetingLocation: z.string().optional(),
  directors: z
    .array(
      z.object({
        name: z.string().optional(),
        initials: z.string().optional(),
      }),
    )
    .optional(),
  boardMeetings: z
    .array(
      z.object({
        date: z.string().optional(),
        attendees: z.string().optional(),
        allPresentInGuernsey: z.boolean().optional(),
        agendaPoints: z.string().optional(),
      }),
    )
    .optional(),
  preparedBy: z.string().optional(),
  preparedDate: z.string().optional(),
  managerSignOff: z.string().optional(),
  managerSignOffDate: z.string().optional(),
  isConstituentEntity: z.enum(["Yes", "No"]).optional(),
  hasPostBalanceSheetEvent: z.enum(["Yes", "No"]).optional(),
  postBalanceSheetEventDetails: z.string().optional(),
  hasC42Association: z.enum(["Yes", "No"]).optional(),
  c42AssociatedCompanies: z.string().optional(),
  contractInformation: z.string().optional(),
});

type RecentReturnMeta = {
  id: string;
  orgId: string;
  at: string;
};

function parseRecentReturnMetadata(user: User, orgId: string): string[] {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const raw = metadata.portal_recent_returns;

  if (!Array.isArray(raw)) {
    return [];
  }

  const parsed: RecentReturnMeta[] = raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.orgId !== "string") {
        return null;
      }

      return {
        id: row.id,
        orgId: row.orgId,
        at: typeof row.at === "string" ? row.at : "",
      };
    })
    .filter((item): item is RecentReturnMeta => item !== null)
    .filter((item) => item.orgId === orgId);

  parsed.sort((a, b) => {
    const aTime = Number.isFinite(Date.parse(a.at)) ? Date.parse(a.at) : 0;
    const bTime = Number.isFinite(Date.parse(b.at)) ? Date.parse(b.at) : 0;
    return bTime - aTime;
  });

  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const item of parsed) {
    if (seen.has(item.id)) {
      continue;
    }
    seen.add(item.id);
    ordered.push(item.id);
  }

  return ordered;
}

async function ensurePortalAccount(ctx: { db: TRPCContext["db"]; user: User }) {
  let account = await ctx.db.query.accounts.findFirst({
    where: eq(accounts.userId, ctx.user.id),
  });

  if (!account) {
    const metadata = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
    const avatarUrl =
      typeof metadata.avatar_url === "string"
        ? metadata.avatar_url
        : typeof metadata.picture === "string"
          ? metadata.picture
          : null;

    const [created] = await ctx.db
      .insert(accounts)
      .values({
        userId: ctx.user.id,
        fullName,
        avatarUrl,
        accountType: "portal",
      })
      .returning();
    account = created ?? undefined;
  }

  if (!account) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load account",
    });
  }

  return account;
}

async function assertActiveMembership(ctx: {
  db: TRPCContext["db"];
  accountId: string;
  orgId: string;
}) {
  const membership = await ctx.db.query.portalMemberships.findFirst({
    where: and(
      eq(portalMemberships.accountId, ctx.accountId),
      eq(portalMemberships.orgId, ctx.orgId),
      eq(portalMemberships.status, "active"),
    ),
  });

  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You do not have active access to this organization.",
    });
  }

  return membership;
}

export const portalReturnsRouter = createTRPCRouter({
  sidebarJurisdictions: protectedProcedure
    .input(
      z
        .object({
          orgId: z.string().uuid().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      const memberships = await ctx.db
        .select({
          orgId: portalMemberships.orgId,
          orgName: organisations.name,
          orgSlug: organisations.slug,
        })
        .from(portalMemberships)
        .innerJoin(organisations, eq(portalMemberships.orgId, organisations.id))
        .where(
          and(
            eq(portalMemberships.accountId, account.id),
            eq(portalMemberships.status, "active"),
          ),
        );

      if (!memberships.length) {
        return {
          orgId: null,
          orgName: null,
          orgSlug: null,
          jurisdictions: [],
        };
      }

      const selectedOrg =
        (input?.orgId
          ? memberships.find((row) => row.orgId === input.orgId)
          : undefined) ?? memberships[0]!;

      const rows = await ctx.db
        .select({
          id: taxReturns.id,
          orgId: taxReturns.orgId,
          entityName: taxReturns.entityName,
          taxYear: taxReturns.taxYear,
          status: taxReturns.status,
          updatedAt: taxReturns.updatedAt,
          createdAt: taxReturns.createdAt,
          jurisdictionId: jurisdictions.id,
          jurisdictionCode: jurisdictions.code,
          jurisdictionName: jurisdictions.name,
        })
        .from(taxReturns)
        .innerJoin(
          jurisdictions,
          eq(taxReturns.jurisdictionId, jurisdictions.id),
        )
        .where(eq(taxReturns.orgId, selectedOrg.orgId))
        .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt));

      const recentReturnIds = parseRecentReturnMetadata(
        ctx.user,
        selectedOrg.orgId,
      );

      const grouped = new Map<
        string,
        {
          jurisdictionId: string;
          code: string;
          name: string;
          rows: typeof rows;
        }
      >();

      for (const row of rows) {
        const entry = grouped.get(row.jurisdictionId);
        if (entry) {
          entry.rows.push(row);
        } else {
          grouped.set(row.jurisdictionId, {
            jurisdictionId: row.jurisdictionId,
            code: row.jurisdictionCode,
            name: row.jurisdictionName,
            rows: [row],
          });
        }
      }

      const jurisdictionsList = Array.from(grouped.values())
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((jurisdictionGroup) => {
          const recentRows = recentReturnIds
            .map((id) => jurisdictionGroup.rows.find((row) => row.id === id))
            .filter((row): row is NonNullable<typeof row> => !!row);

          const selectedIds = new Set(recentRows.map((row) => row.id));
          const latestRows = jurisdictionGroup.rows.filter(
            (row) => !selectedIds.has(row.id),
          );
          const pinned = [...recentRows, ...latestRows].slice(0, 3);

          return {
            jurisdictionId: jurisdictionGroup.jurisdictionId,
            code: jurisdictionGroup.code,
            name: jurisdictionGroup.name,
            returns: pinned.map((row) => ({
              id: row.id,
              entityName: row.entityName,
              taxYear: row.taxYear,
              status: row.status,
              updatedAt: row.updatedAt ?? row.createdAt,
            })),
            totalReturns: jurisdictionGroup.rows.length,
          };
        });

      return {
        orgId: selectedOrg.orgId,
        orgName: selectedOrg.orgName,
        orgSlug: selectedOrg.orgSlug,
        jurisdictions: jurisdictionsList,
      };
    }),

  listMyReturns: protectedProcedure.query(async ({ ctx }) => {
    const account = await ensurePortalAccount(ctx);
    const memberships = await ctx.db
      .select({
        orgId: portalMemberships.orgId,
      })
      .from(portalMemberships)
      .where(
        and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.status, "active"),
        ),
      );

    if (memberships.length === 0) {
      return [];
    }

    const orgIds = memberships.map((m) => m.orgId);
    const rows = await ctx.db
      .select({
        id: taxReturns.id,
        orgId: taxReturns.orgId,
        entityName: taxReturns.entityName,
        taxYear: taxReturns.taxYear,
        status: taxReturns.status,
        externalId: taxReturns.externalId,
        files: taxReturns.files,
        updatedAt: taxReturns.updatedAt,
        orgName: organisations.name,
        orgSlug: organisations.slug,
        jurisdictionCode: jurisdictions.code,
        jurisdictionName: jurisdictions.name,
      })
      .from(taxReturns)
      .innerJoin(organisations, eq(taxReturns.orgId, organisations.id))
      .innerJoin(jurisdictions, eq(taxReturns.jurisdictionId, jurisdictions.id))
      .where(inArray(taxReturns.orgId, orgIds))
      .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt));

    return rows;
  }),

  searchMyReturns: protectedProcedure
    .input(
      z.object({
        query: z.string().trim().min(1),
        limit: z.number().min(1).max(50).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      const memberships = await ctx.db
        .select({
          orgId: portalMemberships.orgId,
        })
        .from(portalMemberships)
        .where(
          and(
            eq(portalMemberships.accountId, account.id),
            eq(portalMemberships.status, "active"),
          ),
        );

      if (memberships.length === 0) {
        return [];
      }

      const orgIds = memberships.map((m) => m.orgId);
      const searchPattern = `%${input.query}%`;

      const rows = await ctx.db
        .select({
          id: taxReturns.id,
          orgId: taxReturns.orgId,
          entityName: taxReturns.entityName,
          taxYear: taxReturns.taxYear,
          status: taxReturns.status,
          externalId: taxReturns.externalId,
          updatedAt: taxReturns.updatedAt,
          orgName: organisations.name,
          jurisdictionCode: jurisdictions.code,
          jurisdictionName: jurisdictions.name,
        })
        .from(taxReturns)
        .innerJoin(organisations, eq(taxReturns.orgId, organisations.id))
        .innerJoin(
          jurisdictions,
          eq(taxReturns.jurisdictionId, jurisdictions.id),
        )
        .where(
          and(
            inArray(taxReturns.orgId, orgIds),
            sql`(
              ${taxReturns.entityName} ILIKE ${searchPattern}
              OR COALESCE(${taxReturns.externalId}, '') ILIKE ${searchPattern}
              OR ${organisations.name} ILIKE ${searchPattern}
              OR ${jurisdictions.code} ILIKE ${searchPattern}
              OR CAST(${taxReturns.taxYear} AS TEXT) ILIKE ${searchPattern}
            )`,
          ),
        )
        .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt))
        .limit(input.limit);

      return rows;
    }),

  listByOrg: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const rows = await ctx.db
        .select({
          id: taxReturns.id,
          orgId: taxReturns.orgId,
          entityName: taxReturns.entityName,
          taxYear: taxReturns.taxYear,
          status: taxReturns.status,
          externalId: taxReturns.externalId,
          link: taxReturns.link,
          pdfUrl: taxReturns.pdfUrl,
          files: taxReturns.files,
          metadata: taxReturns.metadata,
          updatedAt: taxReturns.updatedAt,
          jurisdictionCode: jurisdictions.code,
          jurisdictionName: jurisdictions.name,
          substanceId: substanceForms.id,
          isSubstanceComplete: substanceForms.isComplete,
          missingSubstanceFields: substanceForms.missingFields,
        })
        .from(taxReturns)
        .innerJoin(
          jurisdictions,
          eq(taxReturns.jurisdictionId, jurisdictions.id),
        )
        .leftJoin(substanceForms, eq(substanceForms.taxReturnId, taxReturns.id))
        .where(eq(taxReturns.orgId, input.orgId))
        .orderBy(desc(taxReturns.updatedAt), desc(taxReturns.createdAt));

      return rows;
    }),

  getSubstanceForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      return form ?? null;
    }),

  createSubstanceForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (existing) {
        return existing;
      }

      const [created] = await ctx.db
        .insert(substanceForms)
        .values({
          taxReturnId: input.taxReturnId,
          entityName: returnRecord.entityName,
          taxReferenceNumber: returnRecord.externalId ?? undefined,
          accountingPeriodStart: `${returnRecord.taxYear}-01-01`,
          accountingPeriodEnd: `${returnRecord.taxYear}-12-31`,
          missingFields: getMissingFields({}),
          lastEditedBy: account.id,
        })
        .returning();

      return created ?? null;
    }),

  updateSubstanceForm: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        data: substanceFormSchema.partial(),
        clearForm: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Substance form has not been initialized for this return.",
        });
      }

      const updateData = input.clearForm
        ? Object.fromEntries(
            Object.keys(substanceFormSchema.shape).map((key) => [key, null]),
          )
        : input.data;

      const merged = input.clearForm
        ? ({} as SubstanceFormData)
        : ({ ...existing, ...input.data } as SubstanceFormData);
      const missingFields = getMissingFields(merged);

      const [updated] = await ctx.db
        .update(substanceForms)
        .set({
          ...updateData,
          missingFields,
          isComplete: missingFields.length === 0,
          lastEditedAt: new Date(),
          lastEditedBy: account.id,
        })
        .where(eq(substanceForms.taxReturnId, input.taxReturnId))
        .returning();

      return updated ?? null;
    }),

  addReturnDocuments: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        documents: z.array(portalFileSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const existingFiles = returnRecord.files ?? [];
      const uploadedAt = new Date().toISOString();
      const incomingFinancialStatements = input.documents.find(
        (doc) => doc.role === "financial_statements",
      );
      const baseFiles = incomingFinancialStatements
        ? existingFiles.map((file) =>
            file.role === "financial_statements"
              ? { ...file, role: undefined }
              : file,
          )
        : existingFiles;
      const mergedFiles = [
        ...baseFiles,
        ...input.documents.map((doc) => ({ ...doc, uploadedAt })),
      ];

      await ctx.db
        .update(taxReturns)
        .set({
          files: mergedFiles,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true, files: mergedFiles };
    }),

  assignReturnDocumentRole: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        fileUrl: z.string().url(),
        role: z.enum(taxReturnFileRoles).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const existingFiles = returnRecord.files ?? [];
      const hasTargetFile = existingFiles.some(
        (file) => file.url === input.fileUrl,
      );

      if (!hasTargetFile) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found on this return.",
        });
      }

      const updatedFiles = existingFiles.map((file) => {
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

      await ctx.db
        .update(taxReturns)
        .set({
          files: updatedFiles,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true, files: updatedFiles };
    }),

  removeReturnDocument: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        fileUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const existingFiles = returnRecord.files ?? [];
      const updatedFiles = existingFiles.filter(
        (file) => file.url !== input.fileUrl,
      );

      if (updatedFiles.length === existingFiles.length) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "File not found on this return.",
        });
      }

      await ctx.db
        .update(taxReturns)
        .set({
          files: updatedFiles,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true };
    }),

  saveReturnIntake: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        intake: z.object({
          contactEmail: z.string().email().optional(),
          notes: z.string().max(5000).optional(),
          esrSource: z.enum(["manual", "xlsx"]).optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const existingMetadata: Record<string, unknown> =
        returnRecord.metadata && typeof returnRecord.metadata === "object"
          ? returnRecord.metadata
          : {};
      const nextMetadata = {
        ...existingMetadata,
        portalIntake: {
          ...((existingMetadata.portalIntake as
            | Record<string, unknown>
            | undefined) ?? {}),
          ...input.intake,
          updatedAt: new Date().toISOString(),
          updatedByAccountId: account.id,
        },
      };

      await ctx.db
        .update(taxReturns)
        .set({
          metadata: nextMetadata,
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return { success: true };
    }),

  extractSubstanceFormFromFiles: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        fileUrls: z.array(z.string().url()).min(1).max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const apiKey = process.env.AI_GATEWAY_API_KEY;
      if (!apiKey) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "AI gateway key is not configured.",
        });
      }

      let form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, input.taxReturnId),
      });

      if (!form) {
        const [created] = await ctx.db
          .insert(substanceForms)
          .values({
            taxReturnId: input.taxReturnId,
            entityName: returnRecord.entityName,
            taxReferenceNumber: returnRecord.externalId ?? undefined,
            accountingPeriodStart: `${returnRecord.taxYear}-01-01`,
            accountingPeriodEnd: `${returnRecord.taxYear}-12-31`,
            isGuernseyFiFatca: "No",
            isGuernseyFiCrs: "No",
            isRegisteredOnIgor: "No",
            isConstituentEntity: "No",
            missingFields: getMissingFields({
              isConstituentEntity: "No",
            }),
            lastEditedBy: account.id,
          })
          .returning();

        form = created ?? undefined;
      }

      type FileContent = { type: "file"; data: string; mediaType: string };
      type TextContent = { type: "text"; text: string };

      const fileContents: FileContent[] = [];
      const textContents: TextContent[] = [];

      const supportedFileTypes = [
        "application/pdf",
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
      ];
      const excelTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
      ];

      for (const url of input.fileUrls) {
        const response = await fetch(url);
        if (!response.ok) {
          continue;
        }

        const mediaType =
          response.headers.get("content-type") ?? "application/octet-stream";
        const normalizedMedia = mediaType.toLowerCase();
        const isCsv =
          normalizedMedia.includes("text/csv") ||
          url.toLowerCase().endsWith(".csv");
        const isExcel =
          excelTypes.some((type) => normalizedMedia.includes(type)) ||
          normalizedMedia.includes("spreadsheet") ||
          normalizedMedia.includes("excel");

        if (isCsv) {
          const csvText = await response.text();
          if (csvText.trim().length > 0) {
            textContents.push({
              type: "text",
              text: `[CSV File Content]\n${csvText}`,
            });
          }
          continue;
        }

        const buffer = await response.arrayBuffer();

        if (isExcel) {
          try {
            const workbook = XLSX.read(buffer, { type: "array" });
            const csvParts: string[] = [];

            for (const sheetName of workbook.SheetNames) {
              const sheet = workbook.Sheets[sheetName];
              if (!sheet) {
                continue;
              }
              const csv = XLSX.utils.sheet_to_csv(sheet);
              csvParts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
            }

            const allCsv = csvParts.join("\n\n");
            if (allCsv.trim().length > 0) {
              textContents.push({
                type: "text",
                text: `[Excel File Content]\n${allCsv}`,
              });
            }
          } catch {
            // Ignore malformed spreadsheets and continue processing valid files.
          }
          continue;
        }

        if (
          supportedFileTypes.some(
            (type) =>
              normalizedMedia === type ||
              normalizedMedia.startsWith(type.split("/")[0]!),
          )
        ) {
          fileContents.push({
            type: "file",
            data: Buffer.from(buffer).toString("base64"),
            mediaType,
          });
        }
      }

      if (fileContents.length === 0 && textContents.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No supported files to extract from. Use PDF, image, CSV, or Excel.",
        });
      }

      const gateway = createGateway({
        apiKey,
        baseURL: "https://ai-gateway.vercel.sh/v3/ai",
      });
      const model = gateway("google/gemini-3-pro-preview");

      const cigaOptionsText = Object.entries(CIGA_BY_ACTIVITY)
        .map(
          ([activity, options]) =>
            `${activity}:\n  - ${options.join("\n  - ")}`,
        )
        .join("\n\n");

      const prompt = `You are extracting data for a Guernsey Economic Substance Register form.

Read all attached files and return values only when they are explicitly stated or clearly inferable.
If a value is unknown, leave it empty.

Use these strict output rules:
- Dates: YYYY-MM-DD
- Yes/No fields: "Yes" or "No"
- Yes/No/N/A fields: "Yes", "No", or "N/A"
- relevantActivity: pick exactly one allowed option from the enum.
- If total profit is negative (a loss), return "0". The portal does not accept negative values.
- If net book value is negative, return "0".
- profitAllocation is REQUIRED — always pick "Investment" or "Business".
- economicClassificationCode is REQUIRED for 2025 returns.
- isConstituentEntity (CbCR) is REQUIRED for 2025 returns — default to "No" if not stated.
- accountsPreparerName is the ACCOUNTANT who prepared the financial accounts, NOT "LTS Tax Limited".
- entityActivity: always try to extract the nature of the entity's activity (e.g., "Property Holdings").
- If the entity has no relevant activity ("None of the above"), leave adequacy, CIGA, employees, outsourcing, and beneficial ownership sections empty.

For CIGA, use these activity mappings:
${cigaOptionsText}
`;

      const messageContent: Array<TextContent | FileContent> = [
        { type: "text", text: prompt },
        ...fileContents,
        ...textContents,
      ];

      const result = await generateObject({
        model,
        output: "object",
        schema: aiExtractionSchema,
        schemaName: "PortalGuernseySubstanceForm",
        schemaDescription:
          "Guernsey Economic Substance Register form extraction for portal clients",
        messages: [
          {
            role: "user",
            content: messageContent,
          },
        ],
      });

      const extractedData = result.object;

      // Clamp negative financial values to "0"
      if (extractedData.totalProfit) {
        const num = parseFloat(extractedData.totalProfit.replace(/[^0-9.-]/g, ""));
        if (!isNaN(num) && num < 0) extractedData.totalProfit = "0";
      }
      if (extractedData.netBookValue) {
        const num = parseFloat(extractedData.netBookValue.replace(/[^0-9.-]/g, ""));
        if (!isNaN(num) && num < 0) extractedData.netBookValue = "0";
      }

      // Default profitAllocation to "Investment" if not extracted
      if (!extractedData.profitAllocation) {
        extractedData.profitAllocation = "Investment";
      }

      // FATCA/CRS defaults
      if (!extractedData.isGuernseyFiFatca) extractedData.isGuernseyFiFatca = "No";
      if (!extractedData.isGuernseyFiCrs) extractedData.isGuernseyFiCrs = "No";

      // IGOR: "Yes" if FI under FATCA or CRS, "No" otherwise
      if (!extractedData.isRegisteredOnIgor) {
        if (extractedData.isGuernseyFiFatca === "Yes" || extractedData.isGuernseyFiCrs === "Yes") {
          extractedData.isRegisteredOnIgor = "Yes";
        } else {
          extractedData.isRegisteredOnIgor = "No";
        }
      }

      // CbCR default
      if (!extractedData.isConstituentEntity) extractedData.isConstituentEntity = "No";

      const merged = { ...form, ...extractedData } as SubstanceFormData;
      const missingFields = getMissingFields(merged);

      const [updated] = await ctx.db
        .update(substanceForms)
        .set({
          ...extractedData,
          missingFields,
          isComplete: missingFields.length === 0,
          aiExtractedAt: new Date(),
          lastEditedAt: new Date(),
          lastEditedBy: account.id,
        })
        .where(eq(substanceForms.taxReturnId, input.taxReturnId))
        .returning();

      const extractedFields = Object.keys(extractedData).filter(
        (field) =>
          extractedData[field as keyof typeof extractedData] !== undefined,
      );

      return {
        form: updated ?? null,
        extractedFields,
      };
    }),

  requestEsrAnalysis: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        taxReturnId: z.string().uuid(),
        esrDocument: portalFileSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);
      await assertActiveMembership({
        db: ctx.db,
        accountId: account.id,
        orgId: input.orgId,
      });

      const returnRecord = await ctx.db.query.taxReturns.findFirst({
        where: and(
          eq(taxReturns.id, input.taxReturnId),
          eq(taxReturns.orgId, input.orgId),
        ),
      });

      if (!returnRecord) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Return not found.",
        });
      }

      const [createdTask] = await ctx.db
        .insert(tasks)
        .values({
          orgId: input.orgId,
          jurisdictionId: returnRecord.jurisdictionId,
          taxReturnId: returnRecord.id,
          taskType: "validation",
          status: "pending",
          name: `Portal ESR Analysis - ${returnRecord.entityName} (${returnRecord.taxYear})`,
          description: "Requested by portal client upload flow",
          metadata: {
            source: "portal",
            flow: "esr-analysis",
            document: input.esrDocument,
            requestedAt: new Date().toISOString(),
          },
          createdBy: account.id,
        })
        .returning({ id: tasks.id, status: tasks.status });

      const existingFiles = returnRecord.files ?? [];
      const uploadedAt = new Date().toISOString();
      await ctx.db
        .update(taxReturns)
        .set({
          files: [...existingFiles, { ...input.esrDocument, uploadedAt }],
          updatedAt: new Date(),
        })
        .where(eq(taxReturns.id, returnRecord.id));

      return {
        success: true,
        task: createdTask ?? null,
      };
    }),
});
