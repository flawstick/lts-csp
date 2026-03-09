import { TRPCError } from "@trpc/server";
import { and, eq, desc } from "drizzle-orm";
import { randomBytes } from "crypto";
import { z } from "zod";

import {
  accounts,
  portalInvitations,
  portalMemberships,
} from "@repo/database";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { TRPCContext } from "@/server/api/trpc";

type AuthCtx = Pick<TRPCContext, "db"> & { user: { id: string } };

async function getAccountId(ctx: AuthCtx) {
  const account = await ctx.db.query.accounts.findFirst({
    where: eq(accounts.userId, ctx.user.id),
  });
  if (!account) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Account not found" });
  }
  return account.id;
}

async function assertOrgAdmin(ctx: AuthCtx, orgId: string) {
  const accountId = await getAccountId(ctx);
  const membership = await ctx.db.query.portalMemberships.findFirst({
    where: and(
      eq(portalMemberships.accountId, accountId),
      eq(portalMemberships.orgId, orgId),
      eq(portalMemberships.status, "active"),
    ),
  });
  if (!membership?.role || membership.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return { accountId, membership };
}

export const portalTeamRouter = createTRPCRouter({
  listMembers: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const members = await ctx.db
        .select({
          id: portalMemberships.id,
          role: portalMemberships.role,
          status: portalMemberships.status,
          joinedAt: portalMemberships.joinedAt,
          accountId: portalMemberships.accountId,
          fullName: accounts.fullName,
          avatarUrl: accounts.avatarUrl,
          userId: accounts.userId,
        })
        .from(portalMemberships)
        .innerJoin(accounts, eq(portalMemberships.accountId, accounts.id))
        .where(eq(portalMemberships.orgId, input.orgId))
        .orderBy(desc(portalMemberships.joinedAt));

      return members;
    }),

  listInvitations: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const invitations = await ctx.db
        .select({
          id: portalInvitations.id,
          email: portalInvitations.email,
          status: portalInvitations.status,
          expiresAt: portalInvitations.expiresAt,
          createdAt: portalInvitations.createdAt,
          invitedByName: accounts.fullName,
        })
        .from(portalInvitations)
        .innerJoin(accounts, eq(portalInvitations.invitedBy, accounts.id))
        .where(eq(portalInvitations.orgId, input.orgId))
        .orderBy(desc(portalInvitations.createdAt));

      return invitations;
    }),

  updateRole: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        membershipId: z.string().uuid(),
        role: z.enum(["viewer", "editor", "admin"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.orgId);

      await ctx.db
        .update(portalMemberships)
        .set({ role: input.role })
        .where(
          and(
            eq(portalMemberships.id, input.membershipId),
            eq(portalMemberships.orgId, input.orgId),
          ),
        );

      return { success: true };
    }),

  removeMember: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        membershipId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { accountId } = await assertOrgAdmin(ctx, input.orgId);

      const target = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.id, input.membershipId),
          eq(portalMemberships.orgId, input.orgId),
        ),
      });

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Member not found" });
      }

      if (target.accountId === accountId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot remove yourself" });
      }

      await ctx.db
        .update(portalMemberships)
        .set({ status: "suspended" })
        .where(eq(portalMemberships.id, input.membershipId));

      return { success: true };
    }),

  revokeInvitation: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        invitationId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrgAdmin(ctx, input.orgId);

      await ctx.db
        .update(portalInvitations)
        .set({ status: "expired" })
        .where(
          and(
            eq(portalInvitations.id, input.invitationId),
            eq(portalInvitations.orgId, input.orgId),
            eq(portalInvitations.status, "pending"),
          ),
        );

      return { success: true };
    }),

  inviteMember: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        email: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { accountId } = await assertOrgAdmin(ctx, input.orgId);

      const existing = await ctx.db.query.portalInvitations.findFirst({
        where: and(
          eq(portalInvitations.orgId, input.orgId),
          eq(portalInvitations.email, input.email.toLowerCase()),
          eq(portalInvitations.status, "pending"),
        ),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "An invitation is already pending for this email",
        });
      }

      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      await ctx.db.insert(portalInvitations).values({
        orgId: input.orgId,
        email: input.email.toLowerCase(),
        token,
        status: "pending",
        expiresAt,
        invitedBy: accountId,
      });

      return { success: true, token };
    }),
});
