import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { invoices, globalAdmins, organisations, accounts } from "@repo/database";
import { eq, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createClient } from "@/lib/supabase/server";

type DbType = typeof import("@repo/database").db;

async function getAccountAndCheckGlobalAdmin(db: DbType) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Not authenticated",
    });
  }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  });

  if (!account) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Account not found",
    });
  }

  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, account.id),
  });

  return { account, isGlobalAdmin: !!admin };
}

export const invoiceRouter = createTRPCRouter({
  list: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid().optional(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

      if (!isGlobalAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only global admins can view invoices",
        });
      }

      const conditions = [];
      if (input.orgId) {
        conditions.push(eq(invoices.orgId, input.orgId));
      }
      if (input.status) {
        conditions.push(eq(invoices.status, input.status));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const results = await ctx.db.query.invoices.findMany({
        where: whereClause,
        with: {
          organisation: {
            columns: {
              id: true,
              name: true,
              slug: true,
            },
          },
          createdByAccount: {
            columns: {
              id: true,
              fullName: true,
            },
          },
        },
        orderBy: [desc(invoices.createdAt)],
        limit: input.limit,
        offset: input.offset,
      });

      return results;
    }),

  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

      if (!isGlobalAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only global admins can view invoices",
        });
      }

      const invoice = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
        with: {
          organisation: true,
          createdByAccount: {
            columns: {
              id: true,
              fullName: true,
            },
          },
        },
      });

      if (!invoice) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      return invoice;
    }),

  create: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        invoiceNumber: z.string().min(1).max(64),
        amount: z.number().int().positive(),
        currency: z.string().length(3).default("GBP"),
        description: z.string().optional(),
        dueDate: z.date().optional(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).default("draft"),
        pdfUrl: z.string().url().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { account, isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

      if (!isGlobalAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only global admins can create invoices",
        });
      }

      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation not found",
        });
      }

      const [invoice] = await ctx.db
        .insert(invoices)
        .values({
          orgId: input.orgId,
          invoiceNumber: input.invoiceNumber,
          amount: input.amount,
          currency: input.currency,
          description: input.description,
          dueDate: input.dueDate,
          status: input.status,
          pdfUrl: input.pdfUrl,
          metadata: input.metadata,
          createdBy: account.id,
        })
        .returning();

      return invoice;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        invoiceNumber: z.string().min(1).max(64).optional(),
        amount: z.number().int().positive().optional(),
        currency: z.string().length(3).optional(),
        description: z.string().optional(),
        dueDate: z.date().optional(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
        pdfUrl: z.string().url().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

      if (!isGlobalAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only global admins can update invoices",
        });
      }

      const { id, ...updateData } = input;

      const [updated] = await ctx.db
        .update(invoices)
        .set(updateData)
        .where(eq(invoices.id, id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      return updated;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

      if (!isGlobalAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only global admins can delete invoices",
        });
      }

      const [deleted] = await ctx.db
        .delete(invoices)
        .where(eq(invoices.id, input.id))
        .returning();

      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      return { success: true };
    }),

  markPaid: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

      if (!isGlobalAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only global admins can mark invoices as paid",
        });
      }

      const [updated] = await ctx.db
        .update(invoices)
        .set({
          status: "paid",
          paidAt: new Date(),
        })
        .where(eq(invoices.id, input.id))
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      return updated;
    }),

  getOrganisations: publicProcedure.query(async ({ ctx }) => {
    const { isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

    if (!isGlobalAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only global admins can list organisations",
      });
    }

    const orgs = await ctx.db.query.organisations.findMany({
      columns: {
        id: true,
        name: true,
        slug: true,
      },
      orderBy: [desc(organisations.name)],
    });

    return orgs;
  }),

  getNextInvoiceNumber: publicProcedure.query(async ({ ctx }) => {
    const { isGlobalAdmin } = await getAccountAndCheckGlobalAdmin(ctx.db);

    if (!isGlobalAdmin) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Only global admins can generate invoice numbers",
      });
    }

    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    const latestInvoice = await ctx.db.query.invoices.findFirst({
      where: (invoices, { like }) => like(invoices.invoiceNumber, `${prefix}%`),
      orderBy: [desc(invoices.invoiceNumber)],
    });

    let nextNumber = 1;
    if (latestInvoice) {
      const regex = new RegExp(`^INV-${year}-(\\d+)$`);
      const match = regex.exec(latestInvoice.invoiceNumber);
      if (match?.[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${nextNumber.toString().padStart(4, "0")}`;
  }),
});
