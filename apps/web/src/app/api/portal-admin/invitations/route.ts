import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  accounts,
  db,
  globalAdmins,
  organisations,
  portalInvitations,
} from "@repo/database";
import { createClient } from "@/lib/supabase/server";
import { generateSecureToken } from "@/lib/email";

async function requireGlobalAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Unauthorized", status: 401 as const };

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  });

  if (!account) return { error: "Account not found", status: 404 as const };

  const admin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, account.id),
  });

  if (!admin) return { error: "Forbidden", status: 403 as const };

  return { account };
}

export async function GET(request: Request) {
  const auth = await requireGlobalAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const orgId = searchParams.get("orgId");

  const where = orgId
    ? eq(portalInvitations.orgId, orgId)
    : undefined;

  const invitations = await db.query.portalInvitations.findMany({
    where,
    orderBy: (portalInvitations, { desc }) => [desc(portalInvitations.createdAt)],
  });

  return NextResponse.json(invitations);
}

export async function POST(request: Request) {
  const auth = await requireGlobalAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    orgId?: string;
    email?: string;
    expiresInDays?: number;
  };

  if (!body.orgId || !body.email) {
    return NextResponse.json({ error: "orgId and email are required" }, { status: 400 });
  }

  const org = await db.query.organisations.findFirst({
    where: eq(organisations.id, body.orgId),
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const existingPending = await db.query.portalInvitations.findFirst({
    where: and(
      eq(portalInvitations.orgId, org.id),
      eq(portalInvitations.email, body.email.toLowerCase()),
      eq(portalInvitations.status, "pending"),
    ),
  });

  if (existingPending) {
    return NextResponse.json(
      {
        invitationId: existingPending.id,
        token: existingPending.token,
        acceptUrl: `/accept-invite?token=${existingPending.token}`,
      },
      { status: 200 },
    );
  }

  const expiresInDays = Math.max(1, Math.min(30, body.expiresInDays ?? 7));
  const token = generateSecureToken(24);
  const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

  const [created] = await db
    .insert(portalInvitations)
    .values({
      orgId: org.id,
      email: body.email.toLowerCase(),
      token,
      status: "pending",
      expiresAt,
      invitedBy: auth.account.id,
    })
    .returning();

  return NextResponse.json(
    {
      invitationId: created?.id,
      token,
      acceptUrl: `/accept-invite?token=${token}`,
      expiresAt,
    },
    { status: 201 },
  );
}

export async function PATCH(request: Request) {
  const auth = await requireGlobalAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    invitationId?: string;
    action?: "revoke" | "resend";
  };

  if (!body.invitationId || !body.action) {
    return NextResponse.json({ error: "invitationId and action are required" }, { status: 400 });
  }

  const invitation = await db.query.portalInvitations.findFirst({
    where: eq(portalInvitations.id, body.invitationId),
  });

  if (!invitation) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  if (body.action === "revoke") {
    await db
      .update(portalInvitations)
      .set({ status: "revoked" })
      .where(eq(portalInvitations.id, invitation.id));
    return NextResponse.json({ success: true });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json({ error: "Only pending invitations can be resent" }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db
    .update(portalInvitations)
    .set({ expiresAt })
    .where(eq(portalInvitations.id, invitation.id));

  return NextResponse.json({
    success: true,
    invitationId: invitation.id,
    token: invitation.token,
    acceptUrl: `/accept-invite?token=${invitation.token}`,
    expiresAt,
  });
}
