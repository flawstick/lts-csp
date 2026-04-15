import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { z } from "zod";

import { getRedis } from "@repo/redis";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const resend = new Resend(process.env.RESEND_API_KEY);

const RATE_LIMIT_KEY_PREFIX = "portal:feedback:";
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 3600; // 1 hour

export const portalFeedbackRouter = createTRPCRouter({
  send: protectedProcedure
    .input(
      z.object({
        message: z.string().min(5, "Feedback must be at least 5 characters").max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const redis = getRedis();
      const key = `${RATE_LIMIT_KEY_PREFIX}${ctx.user.id}`;

      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, RATE_LIMIT_WINDOW_SECONDS);
      }

      if (current > RATE_LIMIT_MAX) {
        const ttl = await redis.ttl(key);
        const minutes = Math.ceil(ttl / 60);
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `You can only send ${RATE_LIMIT_MAX} feedback messages per hour. Try again in ${minutes} min.`,
        });
      }

      const userName =
        (ctx.user.user_metadata as Record<string, unknown> | undefined)?.full_name as string | undefined
        ?? ctx.user.email
        ?? "Portal User";

      const { error } = await resend.emails.send({
        from: "LTS Tax Portal <noreply@lts-tax.com>",
        to: ["dev@flawstick.com"],
        replyTo: ctx.user.email ?? undefined,
        subject: `Portal Feedback from ${userName}`,
        html: `
          <!DOCTYPE html>
          <html>
            <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Portal Feedback</h1>
              </div>
              <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
                <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 0 0 20px 0;">
                  <p style="margin: 0; color: #6b7280; font-size: 14px;">
                    <strong>From:</strong> ${userName}<br>
                    <strong>Email:</strong> ${ctx.user.email ?? "N/A"}<br>
                    <strong>Date:</strong> ${new Date().toLocaleString("en-GB")}
                  </p>
                </div>
                <div style="background: #ffffff; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                  <h3 style="color: #1f2937; margin-top: 0;">Message:</h3>
                  <p style="color: #4b5563; white-space: pre-wrap;">${input.message}</p>
                </div>
              </div>
              <div style="text-align: center; padding: 20px; color: #9ca3af; font-size: 12px;">
                <p>&copy; ${new Date().getFullYear()} LTS Tax. All rights reserved.</p>
              </div>
            </body>
          </html>
        `,
      });

      if (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to send feedback. Please try again.",
        });
      }

      return { success: true };
    }),
});
