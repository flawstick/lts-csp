import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db as dbInstance, invoices, organisations, accounts, globalAdmins } from "@repo/database";
import { desc, sql, eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createClient } from "@/lib/supabase/server";

type DbType = typeof dbInstance;

// Helper to get current user's account and check if they're a global admin
async function getCurrentAccountWithGlobalAdminCheck(db: DbType) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in",
    });
  }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  });

  if (!account) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Account not found",
    });
  }

  const globalAdmin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, account.id),
  });

  return { account, isGlobalAdmin: !!globalAdmin };
}

// Require global admin for certain operations
async function requireGlobalAdmin(db: DbType) {
  const { account, isGlobalAdmin } = await getCurrentAccountWithGlobalAdminCheck(db);

  if (!isGlobalAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only global admins can perform this action",
    });
  }

  return account;
}

export const invoiceRouter = createTRPCRouter({
  // List all invoices (global admin sees all, org members see their org's)
  list: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid().optional(),
        page: z.number().min(1).default(1),
        pageSize: z.number().min(1).max(100).default(20),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, pageSize, status, orgId } = input;
      const offset = (page - 1) * pageSize;

      const { isGlobalAdmin } = await getCurrentAccountWithGlobalAdminCheck(ctx.db);

      // Build conditions
      const conditions = [];
      if (status) {
        conditions.push(eq(invoices.status, status));
      }
      if (orgId) {
        conditions.push(eq(invoices.orgId, orgId));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [invoiceList, countResult] = await Promise.all([
        ctx.db
          .select({
            id: invoices.id,
            invoiceNumber: invoices.invoiceNumber,
            status: invoices.status,
            amount: invoices.amount,
            currency: invoices.currency,
            description: invoices.description,
            dueDate: invoices.dueDate,
            paidAt: invoices.paidAt,
            pdfUrl: invoices.pdfUrl,
            createdAt: invoices.createdAt,
            organisation: {
              id: organisations.id,
              name: organisations.name,
              slug: organisations.slug,
            },
          })
          .from(invoices)
          .leftJoin(organisations, eq(invoices.orgId, organisations.id))
          .where(whereClause)
          .orderBy(desc(invoices.createdAt))
          .limit(pageSize)
          .offset(offset),
        ctx.db
          .select({ count: sql<number>`count(*)` })
          .from(invoices)
          .where(whereClause),
      ]);

      const total = Number(countResult[0]?.count ?? 0);
      const totalPages = Math.ceil(total / pageSize);

      return {
        invoices: invoiceList,
        total,
        page,
        pageSize,
        totalPages,
        isGlobalAdmin,
      };
    }),

  // Get a single invoice
  getById: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
        with: {
          organisation: true,
          createdByAccount: {
            columns: {
              id: true,
              fullName: true,
              avatarUrl: true,
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

  // Create invoice (global admin only)
  create: publicProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        invoiceNumber: z.string().min(1).max(64),
        amount: z.number().int().positive(), // Amount in cents
        currency: z.string().length(3).default("GBP"),
        description: z.string().optional(),
        dueDate: z.date().optional(),
        pdfUrl: z.string().url().optional(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).default("draft"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const account = await requireGlobalAdmin(ctx.db);

      // Verify org exists
      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation not found",
        });
      }

      // Check for duplicate invoice number
      const existing = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.invoiceNumber, input.invoiceNumber),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invoice with this number already exists",
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
          pdfUrl: input.pdfUrl,
          status: input.status,
          createdBy: account.id,
        })
        .returning();

      return invoice;
    }),

  // Update invoice (global admin only)
  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        invoiceNumber: z.string().min(1).max(64).optional(),
        amount: z.number().int().positive().optional(),
        currency: z.string().length(3).optional(),
        description: z.string().optional(),
        dueDate: z.date().nullable().optional(),
        pdfUrl: z.string().url().nullable().optional(),
        status: z.enum(["draft", "sent", "paid", "overdue", "cancelled"]).optional(),
        paidAt: z.date().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireGlobalAdmin(ctx.db);

      const existing = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      // If invoice number is changing, check for duplicates
      if (input.invoiceNumber && input.invoiceNumber !== existing.invoiceNumber) {
        const duplicate = await ctx.db.query.invoices.findFirst({
          where: eq(invoices.invoiceNumber, input.invoiceNumber),
        });

        if (duplicate) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An invoice with this number already exists",
          });
        }
      }

      const { id, ...updateData } = input;

      const [updated] = await ctx.db
        .update(invoices)
        .set(updateData)
        .where(eq(invoices.id, id))
        .returning();

      return updated;
    }),

  // Delete invoice (global admin only)
  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireGlobalAdmin(ctx.db);

      const existing = await ctx.db.query.invoices.findFirst({
        where: eq(invoices.id, input.id),
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invoice not found",
        });
      }

      await ctx.db.delete(invoices).where(eq(invoices.id, input.id));

      return { success: true };
    }),

  // Mark invoice as paid (global admin only)
  markPaid: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await requireGlobalAdmin(ctx.db);

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

  // Get all organisations (for dropdown when creating invoices)
  getOrganisations: publicProcedure.query(async ({ ctx }) => {
    await requireGlobalAdmin(ctx.db);

    const orgs = await ctx.db
      .select({
        id: organisations.id,
        name: organisations.name,
        slug: organisations.slug,
      })
      .from(organisations)
      .orderBy(organisations.name);

    return orgs;
  }),

  // Generate next invoice number
  getNextInvoiceNumber: publicProcedure.query(async ({ ctx }) => {
    await requireGlobalAdmin(ctx.db);

    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;

    // Get the latest invoice number for this year
    const latest = await ctx.db
      .select({ invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(sql`${invoices.invoiceNumber} LIKE ${prefix + "%"}`)
      .orderBy(desc(invoices.invoiceNumber))
      .limit(1);

    let nextNumber = 1;
    if (latest.length > 0 && latest[0]) {
      const regex = /INV-\d{4}-(\d+)/;
      const match = regex.exec(latest[0].invoiceNumber);
      if (match?.[1]) {
        nextNumber = parseInt(match[1], 10) + 1;
      }
    }

    return `${prefix}${nextNumber.toString().padStart(4, "0")}`;
  }),
});
