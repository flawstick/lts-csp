import { TRPCError } from "@trpc/server";
import { and, eq, desc, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { z } from "zod";

import {
  accounts,
  organisations,
  portalInvitations,
  portalMemberships,
} from "@repo/database";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import type { TRPCContext } from "@/server/api/trpc";

type AuthCtx = Pick<TRPCContext, "db"> & { user: { id: string } };

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

function buildInvitationUrl(token: string) {
  const baseUrl =
    process.env.PORTAL_BASE_URL ??
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL ??
    "https://portal.lts-tax.com";

  return `${baseUrl.replace(/\/$/, "")}/accept-invite?token=${token}`;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

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
          email: sql<string | null>`(select email from auth.users where id = ${accounts.userId})`,
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

      if (!resend) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Email delivery is not configured",
        });
      }

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

      const organisation = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.orgId),
        columns: { name: true },
      });

      if (!organisation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organisation not found",
        });
      }

      const [invitation] = await ctx.db
        .insert(portalInvitations)
        .values({
          orgId: input.orgId,
          email: input.email.toLowerCase(),
          token,
          status: "pending",
          expiresAt,
          invitedBy: accountId,
        })
        .returning({ id: portalInvitations.id });

      if (!invitation) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create invitation",
        });
      }

      const acceptUrl = buildInvitationUrl(token);
      const fromEmail =
        process.env.RESEND_FROM_EMAIL ??
        "LTS Tax <noreply@email.aionarete.com>";
      const expiryDate = expiresAt.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      const organisationName = escapeHtml(organisation.name);

      try {
        const { error } = await resend.emails.send({
          from: fromEmail,
          to: [input.email.toLowerCase()],
          subject: `You've been invited to join ${organisation.name}`,
          tags: [{ name: "category", value: "portal-invitation" }],
          html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #0f172a; padding: 28px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 28px;">LTS Client Portal</h1>
              </div>
              <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 10px 10px;">
                <h2 style="color: #0f172a; margin-top: 0;">You're invited</h2>
                <p>You have been invited to join <strong>${organisationName}</strong> on the LTS Client Portal.</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${acceptUrl}" style="background: #0f172a; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">Accept invitation</a>
                </div>
                <p style="color: #64748b; font-size: 13px;">This invitation expires on ${expiryDate}. If you did not expect it, you can safely ignore this email.</p>
              </div>
            </body>
          </html>
        `,
        });

        if (error) {
          throw new Error(`Resend rejected invitation email: ${error.message}`);
        }
      } catch (error) {
        console.error("Failed to send portal invitation email", {
          invitationId: invitation.id,
          error,
        });
        await ctx.db
          .delete(portalInvitations)
          .where(eq(portalInvitations.id, invitation.id));
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send invitation email",
        });
      }

      return { success: true };
    }),
});
