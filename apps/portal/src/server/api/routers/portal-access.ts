import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import type { User } from "@supabase/supabase-js";
import { Resend } from "resend";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import {
  accounts,
  mergeOrgDemoModeSettings,
  orgSettings,
  organisations,
  parseOrgDemoModeSettings,
  portalReturnShares,
  portalInvitations,
  portalMemberships,
  taxReturns,
} from "@repo/database";
import { hashClientAccessToken } from "@repo/database/client-access";
import {
  getPortalClientProfileByEntityName,
  upsertPortalClientProfile,
} from "@/server/client-access";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import type { TRPCContext } from "@/server/api/trpc";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;
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

  const metadata = (ctx.user.user_metadata ?? {}) as Record<string, unknown>;
  const latestFullName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : null;
  const latestAvatarUrl =
    typeof metadata.avatar_url === "string"
      ? metadata.avatar_url
      : typeof metadata.picture === "string"
        ? metadata.picture
        : null;

  if (!account) {
    const [created] = await ctx.db
      .insert(accounts)
      .values({
        userId: ctx.user.id,
        fullName: latestFullName,
        avatarUrl: latestAvatarUrl,
        accountType: "portal",
      })
      .returning();

    account = created ?? undefined;
  } else if (
    account.fullName !== latestFullName ||
    account.avatarUrl !== latestAvatarUrl
  ) {
    const [updated] = await ctx.db
      .update(accounts)
      .set({
        fullName: latestFullName ?? account.fullName,
        avatarUrl: latestAvatarUrl ?? account.avatarUrl,
      })
      .where(eq(accounts.id, account.id))
      .returning();

    account = updated ?? account;
  }

  if (!account) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Failed to load account",
    });
  }

  return account;
}

function buildClientAccessUrl(token: string) {
  const baseUrl =
    process.env.PORTAL_BASE_URL ??
    process.env.NEXT_PUBLIC_PORTAL_BASE_URL ??
    "http://localhost:3001";

  return `${baseUrl.replace(/\/$/, "")}/client-access/${token}`;
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
        fullName: account.fullName,
        avatarUrl: account.avatarUrl,
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

  getMyPendingInvitations: protectedProcedure
    .query(async ({ ctx }) => {
      if (!ctx.user.email) {
        return { invitations: [] };
      }

      const pending = await ctx.db.query.portalInvitations.findMany({
        where: and(
          sql`lower(${portalInvitations.email}) = ${ctx.user.email.toLowerCase()}`,
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

      // Filter out expired
      const now = new Date();
      const valid = pending.filter((inv) => new Date(inv.expiresAt) > now);

      return {
        invitations: valid.map((inv) => ({
          id: inv.id,
          email: inv.email,
          org: inv.organisation,
          expiresAt: inv.expiresAt.toISOString(),
        })),
      };
    }),

  acceptInvitationById: protectedProcedure
    .input(z.object({ invitationId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Unauthorized" });
      }

      const invitation = await ctx.db.query.portalInvitations.findFirst({
        where: and(
          eq(portalInvitations.id, input.invitationId),
          eq(portalInvitations.status, "pending"),
        ),
      });

      if (!invitation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found" });
      }

      if (invitation.email.toLowerCase() !== ctx.user.email.toLowerCase()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Invitation email does not match signed-in user",
        });
      }

      if (new Date(invitation.expiresAt) < new Date()) {
        await ctx.db
          .update(portalInvitations)
          .set({ status: "expired" })
          .where(eq(portalInvitations.id, invitation.id));

        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Invitation expired" });
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

  getOrg: protectedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);

      // Verify membership
      const membership = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.orgId, input.orgId),
          eq(portalMemberships.status, "active"),
        ),
      });

      if (!membership) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not a member of this organization" });
      }

      const org = await ctx.db.query.organisations.findFirst({
        where: eq(organisations.id, input.orgId),
        with: {
          settings: true,
        },
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const demoClientRows = await ctx.db
        .select({
          entityName: taxReturns.entityName,
        })
        .from(taxReturns)
        .where(eq(taxReturns.orgId, input.orgId));

      const availableDemoClients = Array.from(
        new Set(
          demoClientRows
            .map((row) => row.entityName.trim())
            .filter((entityName) => entityName.length > 0),
        ),
      ).sort((a, b) => a.localeCompare(b));

      return {
        id: org.id,
        name: org.name,
        accountName: org.accountName,
        slug: org.slug,
        logoUrl: org.logoUrl,
        role: membership.role,
        demoMode: parseOrgDemoModeSettings(org.settings?.settings),
        availableDemoClients,
      };
    }),

  updateAccountName: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        accountName: z.string().max(256).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);

      // Only admins can update
      const membership = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.orgId, input.orgId),
          eq(portalMemberships.status, "active"),
        ),
      });

      if (membership?.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can update settings" });
      }

      const [updated] = await ctx.db
        .update(organisations)
        .set({ accountName: input.accountName })
        .where(eq(organisations.id, input.orgId))
        .returning();

      return { accountName: updated?.accountName ?? null };
    }),

  updateDemoMode: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        enabled: z.boolean(),
        visibleClientNames: z.array(z.string().min(1)).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);

      const membership = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.orgId, input.orgId),
          eq(portalMemberships.status, "active"),
        ),
      });

      if (membership?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update settings",
        });
      }

      const existingSettings = await ctx.db.query.orgSettings.findFirst({
        where: eq(orgSettings.orgId, input.orgId),
      });

      const nextSettings = mergeOrgDemoModeSettings(
        existingSettings?.settings,
        {
          enabled: input.enabled,
          visibleClientNames: input.visibleClientNames,
        },
      );

      if (existingSettings) {
        await ctx.db
          .update(orgSettings)
          .set({
            settings: nextSettings,
            updatedAt: new Date(),
          })
          .where(eq(orgSettings.orgId, input.orgId));
      } else {
        await ctx.db.insert(orgSettings).values({
          orgId: input.orgId,
          settings: nextSettings,
        });
      }

      return {
        demoMode: parseOrgDemoModeSettings(nextSettings),
      };
    }),

  getClientProfile: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        entityName: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);

      const membership = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.orgId, input.orgId),
          eq(portalMemberships.status, "active"),
        ),
      });

      if (!membership) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not a member of this organization",
        });
      }

      return getPortalClientProfileByEntityName({
        db: ctx.db,
        orgId: input.orgId,
        entityName: input.entityName,
      });
    }),

  upsertClientProfile: protectedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        entityName: z.string().min(1),
        displayName: z.string().min(1).max(256).optional(),
        primaryEmail: z.string().email().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);

      const membership = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.orgId, input.orgId),
          eq(portalMemberships.status, "active"),
        ),
      });

      if (membership?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can update client settings",
        });
      }

      return upsertPortalClientProfile({
        db: ctx.db,
        orgId: input.orgId,
        entityName: input.entityName,
        displayName: input.displayName ?? input.entityName,
        primaryEmail: input.primaryEmail ?? null,
      });
    }),

  sendClientAccessLink: protectedProcedure
    .input(
      z.object({
        taxReturnId: z.string().uuid(),
        email: z.string().email().optional(),
        expiresInDays: z.number().int().min(1).max(30).default(14),
        sendEmail: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const account = await ensurePortalAccount(ctx);

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

      const membership = await ctx.db.query.portalMemberships.findFirst({
        where: and(
          eq(portalMemberships.accountId, account.id),
          eq(portalMemberships.orgId, taxReturn.orgId),
          eq(portalMemberships.status, "active"),
        ),
      });

      if (membership?.role !== "admin") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins can send client access links",
        });
      }

      const clientProfile = await upsertPortalClientProfile({
        db: ctx.db,
        orgId: taxReturn.orgId,
        entityName: taxReturn.entityName,
        displayName: taxReturn.entityName,
        primaryEmail:
          input.email ??
          (
            await getPortalClientProfileByEntityName({
              db: ctx.db,
              orgId: taxReturn.orgId,
              entityName: taxReturn.entityName,
            })
          )?.primaryEmail ??
          null,
      });

      const recipientEmail = input.email ?? clientProfile?.primaryEmail ?? null;
      if (!recipientEmail) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Set a primary email for this client before sending access.",
        });
      }

      const rawToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + input.expiresInDays);

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
          createdBy: account.id,
        })
        .returning();

      const accessUrl = buildClientAccessUrl(rawToken);

      if (input.sendEmail) {
        if (!resend) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "RESEND_API_KEY is not configured.",
          });
        }

        const { error } = await resend.emails.send({
          from: "LTS Client Portal <noreply@ltstax.com>",
          to: [recipientEmail],
          subject: `${taxReturn.entityName} ${taxReturn.taxYear} return ready for completion`,
          html: `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #0f172a; padding: 28px; border-radius: 10px 10px 0 0; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">LTS Client Portal</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
                  <h2 style="color: #1f2937; margin-top: 0;">Return ready for completion</h2>
                  <p style="color: #4b5563;">
                    You can now review and complete the <strong>${taxReturn.jurisdiction?.name ?? "tax"}</strong> return for <strong>${taxReturn.entityName}</strong> for tax year <strong>${taxReturn.taxYear}</strong>.
                  </p>
                  <div style="background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; color: #475569; font-size: 14px;">
                      <strong>Client:</strong> ${taxReturn.entityName}<br>
                      <strong>Jurisdiction:</strong> ${taxReturn.jurisdiction?.name ?? "Tax return"}<br>
                      <strong>Tax year:</strong> ${taxReturn.taxYear}<br>
                      <strong>Link expires:</strong> ${expiresAt.toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <p style="color: #4b5563;">
                    The link below opens a dedicated client view where you can upload documents, run extraction, and complete the return without using the internal portal sidebar.
                  </p>
                  <div style="text-align: center; margin: 30px 0;">
                    <a href="${accessUrl}" style="background: #0f172a; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: 600; display: inline-block;">
                      Open return
                    </a>
                  </div>
                </div>
              </body>
            </html>
          `,
        });

        if (error) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: error.message,
          });
        }
      }

      return {
        shareId: share?.id ?? null,
        accessUrl,
        expiresAt,
        recipientEmail,
        emailed: input.sendEmail,
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
