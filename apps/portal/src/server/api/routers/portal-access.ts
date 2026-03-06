import { TRPCError } from "@trpc/server";
import type { User } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  accounts,
  organisations,
  portalInvitations,
  portalMemberships,
} from "@repo/database";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import type { TRPCContext } from "@/server/api/trpc";

const tokenInput = z.object({
  token: z.string().min(1, "Token is required"),
});

async function ensurePortalAccount(ctx: {
  db: TRPCContext["db"];
  user: User;
}) {
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

export const portalAccessRouter = createTRPCRouter({
  getMyMemberships: protectedProcedure.query(async ({ ctx }) => {
    const account = await ensurePortalAccount(ctx);

    const memberships = await ctx.db
      .select({
        id: portalMemberships.id,
        role: portalMemberships.role,
        orgId: portalMemberships.orgId,
        orgName: organisations.name,
        orgSlug: organisations.slug,
        orgLogoUrl: organisations.logoUrl,
        status: portalMemberships.status,
      })
      .from(portalMemberships)
      .innerJoin(organisations, eq(portalMemberships.orgId, organisations.id))
      .where(and(eq(portalMemberships.accountId, account.id), eq(portalMemberships.status, "active")));

    return {
      account: {
        id: account.id,
        accountType: account.accountType,
        email: ctx.user.email,
      },
      memberships,
    };
  }),

  getInvitationByToken: publicProcedure
    .input(tokenInput)
    .query(async ({ ctx, input }) => {
      const invitation = await ctx.db.query.portalInvitations.findFirst({
        where: and(
          eq(portalInvitations.token, input.token),
          eq(portalInvitations.status, "pending"),
        ),
        with: {
          organisation: {
            columns: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      }

      if (new Date(invitation.expiresAt) < new Date()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Invitation expired" });
      }

      return {
        invitation: {
          id: invitation.id,
          email: invitation.email,
          status: invitation.status,
          org: invitation.organisation,
          expiresAt: invitation.expiresAt,
        },
      };
    }),

  acceptInvitation: protectedProcedure
    .input(tokenInput)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      }

      const invitation = await ctx.db.query.portalInvitations.findFirst({
        where: eq(portalInvitations.token, input.token),
      });

      if (!invitation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      }

      if (invitation.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invitation already ${invitation.status}`,
        });
      }

      if (new Date(invitation.expiresAt) < new Date()) {
        await ctx.db
          .update(portalInvitations)
          .set({ status: "expired" })
          .where(eq(portalInvitations.id, invitation.id));

        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Invitation expired" });
      }

      if (invitation.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invitation email does not match signed-in user",
        });
      }

      const account = await ensurePortalAccount(ctx);

      const existingMembership = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.orgId, invitation.orgId),
        ),
      });

      if (existingMembership) {
        await ctx.db
          .update(portalMemberships)
          .set({
            status: "active",
            joinedAt: existingMembership.joinedAt ?? new Date(),
          })
          .where(eq(portalMemberships.id, existingMembership.id));
      } else {
        await ctx.db.insert(portalMemberships).values({
          accountId: account.id,
          orgId: invitation.orgId,
          invitedBy: invitation.invitedBy,
          role: "viewer",
          status: "active",
          joinedAt: new Date(),
        });
      }

      if (account.accountType === "internal") {
        await ctx.db
          .update(accounts)
          .set({ accountType: "dual" })
          .where(eq(accounts.id, account.id));
      }

      await ctx.db
        .update(portalInvitations)
        .set({ status: "accepted", acceptedAt: new Date() })
        .where(eq(portalInvitations.id, invitation.id));

      return {
        success: true,
        orgId: invitation.orgId,
      };
    }),

  requestAccess: protectedProcedure.mutation(async ({ ctx }) => {
    if (!ctx.user.email) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
    }

    console.log("[portal_signup] access requested", {
      userId: ctx.user.id,
      email: ctx.user.email,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      message: "Access request received. Please wait for an invitation.",
    };
  }),
});
