import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { getRedis } from "@repo/redis";
import {
  accounts,
  db,
  portalInvitations,
  portalMemberships,
} from "@repo/database";

const inputSchema = z.object({
  email: z.string().trim().email(),
});

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

function keyHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function canAccessPortal(email: string) {
  const pendingInvitation = await db.query.portalInvitations.findFirst({
    where: and(
      sql`lower(${portalInvitations.email}) = ${email}`,
      eq(portalInvitations.status, "pending"),
    ),
    columns: { id: true },
  });

  if (pendingInvitation) return true;

  const [membership] = await db
    .select({ id: portalMemberships.id })
    .from(portalMemberships)
    .innerJoin(accounts, eq(portalMemberships.accountId, accounts.id))
    .where(
      and(
        eq(portalMemberships.status, "active"),
        sql`exists (
          select 1 from auth.users
          where auth.users.id = ${accounts.userId}
            and lower(auth.users.email) = ${email}
        )`,
      ),
    )
    .limit(1);

  return Boolean(membership);
}

async function enforceCooldown(email: string, request: Request) {
  if (!process.env.REDIS_URL) return;

  const forwardedFor = request.headers.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() ?? "unknown";
  const redis = getRedis();
  const emailKey = `portal:login-otp:email:${keyHash(email)}`;
  const ipKey = `portal:login-otp:ip:${keyHash(ipAddress)}`;

  const emailAllowed = await redis.set(emailKey, "1", "EX", 30, "NX");
  if (!emailAllowed) {
    throw new Error("COOLDOWN");
  }

  const ipRequests = await redis.incr(ipKey);
  if (ipRequests === 1) await redis.expire(ipKey, 60 * 60);
  if (ipRequests > 100) {
    throw new Error("IP_LIMIT");
  }
}

export async function POST(request: Request) {
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }

    if (!resend || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Email login is temporarily unavailable." },
        { status: 503 },
      );
    }

    const email = parsed.data.email.toLowerCase();
    if (!(await canAccessPortal(email))) {
      return NextResponse.json(
        { error: "No active portal invitation or membership was found for this email." },
        { status: 403 },
      );
    }

    try {
      await enforceCooldown(email, request);
    } catch (error) {
      if (error instanceof Error && error.message === "COOLDOWN") {
        return NextResponse.json(
          { error: "A code was already sent. Please wait 30 seconds before requesting another." },
          { status: 429 },
        );
      }
      if (error instanceof Error && error.message === "IP_LIMIT") {
        return NextResponse.json(
          { error: "Too many login-code requests. Please try again later." },
          { status: 429 },
        );
      }

      // Login should remain available if the optional Redis safeguard is down.
      console.error("Portal OTP rate-limit check failed", error);
    }

    const { data, error: generateError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (generateError || !data.properties.email_otp) {
      console.error("Failed to generate portal login OTP", generateError);
      return NextResponse.json(
        { error: "Unable to generate a login code. Please try again." },
        { status: 500 },
      );
    }

    const { error: emailError } = await resend.emails.send({
      from:
        process.env.RESEND_FROM_EMAIL ??
        "LTS Tax <noreply@email.aionarete.com>",
      to: [email],
      subject: "Your LTS Client Portal login code",
      tags: [{ name: "category", value: "portal-login-otp" }],
      html: `
        <!DOCTYPE html>
        <html>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; line-height: 1.6; color: #334155; max-width: 560px; margin: 0 auto; padding: 20px;">
            <div style="background: #0f172a; padding: 28px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px;">LTS Client Portal</h1>
            </div>
            <div style="border: 1px solid #e2e8f0; border-top: 0; border-radius: 0 0 10px 10px; padding: 30px; text-align: center;">
              <h2 style="color: #0f172a; margin-top: 0;">Your login code</h2>
              <p>Enter this six-digit code to continue:</p>
              <div style="font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #0f172a; margin: 24px 0;">
                ${data.properties.email_otp}
              </div>
              <p style="color: #64748b; font-size: 13px;">If you did not request this code, you can safely ignore this email.</p>
            </div>
          </body>
        </html>
      `,
    });

    if (emailError) {
      console.error("Failed to send portal login OTP", emailError);
      return NextResponse.json(
        { error: "Unable to send the login code. Please try again." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Portal login OTP request failed", error);
    return NextResponse.json(
      { error: "Unable to send the login code. Please try again." },
      { status: 500 },
    );
  }
}
