import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  createEmptyJerseyCompanyReturnFormData,
  getJerseyCompanyReturnMissingFields,
  isJerseyCompanyReturnComplete,
  jerseyCompanyReturnForms,
  substanceForms,
  taxReturnFileCategories,
  taxReturnFileRoles,
  taxReturns,
} from "@repo/database";

import {
  resolvePortalClientAccessShare,
  touchPortalClientAccessShare,
} from "@/server/client-access";
import {
  assertGuernseyPortalReturnUnlocked,
  buildInitializedSubstanceFormValues,
  extractSubstanceFormFromFilesInternal,
  findPreviousSubstanceAutofillSource,
} from "@/server/api/routers/portal-returns";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { getMissingFields, substanceFormSchema } from "@/lib/schemas/substance-form";
import {
  jerseyCompanyReturnFormSchema,
  sanitizeJerseyCompanyReturnData,
} from "@/lib/schemas/jersey-company-return";

const tokenInput = z.object({
  token: z.string().min(1),
});

const portalFileSchema = z.object({
  url: z.string().url(),
  name: z.string().min(1),
  size: z.number().int().nonnegative(),
  type: z.string().min(1),
  category: z.enum(taxReturnFileCategories).optional(),
  role: z.enum(taxReturnFileRoles).optional(),
});

async function getResolvedShare(db: Parameters<typeof resolvePortalClientAccessShare>[0]["db"], token: string) {
  const share = await resolvePortalClientAccessShare({
    db,
    token,
  });

  await touchPortalClientAccessShare({
    db,
    shareId: share.id,
  });

  return share;
}

function serializeSharedReturn(
  share: Awaited<ReturnType<typeof resolvePortalClientAccessShare>>,
) {
  const returnRecord = share.taxReturn;

  return {
    id: returnRecord.id,
    orgId: returnRecord.orgId,
    jurisdictionId: returnRecord.jurisdictionId,
    jurisdictionCode: returnRecord.jurisdiction?.code ?? null,
    jurisdictionName: returnRecord.jurisdiction?.name ?? null,
    entityName: returnRecord.entityName,
    taxYear: returnRecord.taxYear,
    status: returnRecord.status,
    returnType: returnRecord.returnType,
    externalId: returnRecord.externalId,
    link: returnRecord.link,
    pdfUrl: returnRecord.pdfUrl,
    files: returnRecord.files ?? [],
    metadata: returnRecord.metadata ?? {},
  };
}

export const clientAccessRouter = createTRPCRouter({
  getAccess: publicProcedure.input(tokenInput).query(async ({ ctx, input }) => {
    const share = await getResolvedShare(ctx.db, input.token);

    return {
      share: {
        id: share.id,
        recipientEmail: share.recipientEmail,
        expiresAt: share.expiresAt,
        lastAccessedAt: share.lastAccessedAt,
        lastSentAt: share.lastSentAt,
      },
      organisation: {
        id: share.organisation.id,
        name: share.organisation.name,
        slug: share.organisation.slug,
        accountName: share.organisation.accountName,
        logoUrl: share.organisation.logoUrl,
      },
      clientProfile: share.clientProfile
        ? {
            id: share.clientProfile.id,
            displayName: share.clientProfile.displayName,
            primaryEmail: share.clientProfile.primaryEmail,
          }
        : null,
      return: serializeSharedReturn(share),
    };
  }),

  getSubstanceForm: publicProcedure
    .input(tokenInput)
    .query(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      if (returnRecord.jurisdiction?.code !== "GG") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Substance form is only available for Guernsey returns.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const form = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, returnRecord.id),
      });

      return form ?? null;
    }),

  createSubstanceForm: publicProcedure
    .input(tokenInput)
    .mutation(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      if (returnRecord.jurisdiction?.code !== "GG") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Substance form is only available for Guernsey returns.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, returnRecord.id),
      });

      if (existing) {
        return existing;
      }

      const preparedByName =
        share.organisation.accountName ??
        share.organisation.name ??
        "LTS Tax Limited";
      const previousForm = await findPreviousSubstanceAutofillSource(
        ctx.db,
        returnRecord,
      );

      const [created] = await ctx.db
        .insert(substanceForms)
        .values(
          buildInitializedSubstanceFormValues({
            taxReturnId: returnRecord.id,
            taxYear: returnRecord.taxYear,
            entityName: returnRecord.entityName,
            externalId: returnRecord.externalId,
            preparedByName,
            sourceForm: previousForm,
          }),
        )
        .returning();

      return created ?? null;
    }),

  updateSubstanceForm: publicProcedure
    .input(
      tokenInput.extend({
        data: substanceFormSchema.partial(),
        clearForm: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      if (returnRecord.jurisdiction?.code !== "GG") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Substance form is only available for Guernsey returns.",
        });
      }

      assertGuernseyPortalReturnUnlocked(returnRecord);

      const existing = await ctx.db.query.substanceForms.findFirst({
        where: eq(substanceForms.taxReturnId, returnRecord.id),
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
        ? {}
        : { ...existing, ...input.data };
      const missingFields = getMissingFields(merged);

      const [updated] = await ctx.db
        .update(substanceForms)
        .set({
          ...updateData,
          missingFields,
          isComplete: missingFields.length === 0,
          lastEditedAt: new Date(),
          lastEditedBy: null,
        })
        .where(eq(substanceForms.taxReturnId, returnRecord.id))
        .returning();

      return updated ?? null;
    }),

  addReturnDocuments: publicProcedure
    .input(
      tokenInput.extend({
        documents: z.array(portalFileSchema).min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.documents.some((doc) => doc.role === "filed_return_pdf")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Filed return PDFs are system-managed and cannot be uploaded manually.",
        });
      }

      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      assertGuernseyPortalReturnUnlocked(returnRecord);

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

  assignReturnDocumentRole: publicProcedure
    .input(
      tokenInput.extend({
        fileUrl: z.string().url(),
        role: z.enum(taxReturnFileRoles).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.role === "filed_return_pdf") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Filed return PDFs are system-managed and cannot be assigned manually.",
        });
      }

      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      assertGuernseyPortalReturnUnlocked(returnRecord);

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

  removeReturnDocument: publicProcedure
    .input(
      tokenInput.extend({
        fileUrl: z.string().url(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      assertGuernseyPortalReturnUnlocked(returnRecord);

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

  extractSubstanceFormFromFiles: publicProcedure
    .input(
      tokenInput.extend({
        fileUrls: z.array(z.string().url()).min(1).max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);

      if (share.taxReturn.jurisdiction?.code !== "GG") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Substance extraction is only available for Guernsey returns.",
        });
      }

      return extractSubstanceFormFromFilesInternal({
        db: ctx.db,
        orgId: share.taxReturn.orgId,
        taxReturnId: share.taxReturn.id,
        fileUrls: input.fileUrls,
        returnRecord: share.taxReturn,
      });
    }),

  getJerseyCompanyReturnForm: publicProcedure
    .input(tokenInput)
    .query(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      if (
        returnRecord.jurisdiction?.code !== "JE" ||
        returnRecord.returnType !== "company"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Jersey company form is only available for Jersey company returns.",
        });
      }

      const form = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, returnRecord.id),
      });

      return form ?? null;
    }),

  createJerseyCompanyReturnForm: publicProcedure
    .input(tokenInput)
    .mutation(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      if (
        returnRecord.jurisdiction?.code !== "JE" ||
        returnRecord.returnType !== "company"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Jersey company form is only available for Jersey company returns.",
        });
      }

      const existing = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, returnRecord.id),
      });

      if (existing) {
        return existing;
      }

      const initialData = createEmptyJerseyCompanyReturnFormData();
      const missingFields = getJerseyCompanyReturnMissingFields(initialData);

      const [created] = await ctx.db
        .insert(jerseyCompanyReturnForms)
        .values({
          taxReturnId: returnRecord.id,
          section1: initialData.section1,
          scheduleA: initialData.scheduleA,
          distributions: initialData.distributions,
          compliance: initialData.compliance,
          economicSubstance: initialData.economicSubstance,
          additionalInfo: initialData.additionalInfo,
          missingFields,
          isComplete: missingFields.length === 0,
          lastEditedBy: null,
        })
        .returning();

      return created ?? null;
    }),

  updateJerseyCompanyReturnForm: publicProcedure
    .input(
      tokenInput.extend({
        data: jerseyCompanyReturnFormSchema.partial(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const share = await getResolvedShare(ctx.db, input.token);
      const returnRecord = share.taxReturn;

      if (
        returnRecord.jurisdiction?.code !== "JE" ||
        returnRecord.returnType !== "company"
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Jersey company form is only available for Jersey company returns.",
        });
      }

      const existing = await ctx.db.query.jerseyCompanyReturnForms.findFirst({
        where: eq(jerseyCompanyReturnForms.taxReturnId, returnRecord.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message:
            "Jersey company return form has not been initialized for this return.",
        });
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
          lastEditedBy: null,
        })
        .where(eq(jerseyCompanyReturnForms.taxReturnId, returnRecord.id))
        .returning();

      return updated ?? null;
    }),
});
