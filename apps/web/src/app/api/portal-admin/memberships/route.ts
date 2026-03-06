import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  accounts,
  db,
  globalAdmins,
  organisations,
  portalMemberships,
} from "@repo/database";
import { createClient } from "@/lib/supabase/server";

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

export async function POST(request: Request) {
  const auth = await requireGlobalAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = (await request.json().catch(() => ({}))) as {
    accountId?: string;
    orgId?: string;
    role?: "viewer" | "editor" | "admin";
    status?: "pending" | "active" | "suspended";
  };

  if (!body.accountId || !body.orgId) {
    return NextResponse.json({ error: "accountId and orgId are required" }, { status: 400 });
  }

  const account = await db.query.accounts.findFirst({ where: eq(accounts.id, body.accountId) });
  if (!account) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  const org = await db.query.organisations.findFirst({ where: eq(organisations.id, body.orgId) });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const existing = await db.query.portalMemberships.findFirst({
    where: and(eq(portalMemberships.accountId, account.id), eq(portalMemberships.orgId, org.id)),
  });

  if (existing) {
    const [updated] = await db
      .update(portalMemberships)
      .set({
        role: body.role ?? existing.role,
        status: body.status ?? existing.status,
        invitedBy: existing.invitedBy ?? auth.account.id,
        joinedAt:
          (body.status ?? existing.status) === "active"
            ? (existing.joinedAt ?? new Date())
            : existing.joinedAt,
      })
      .where(eq(portalMemberships.id, existing.id))
      .returning();

    if (account.accountType === "internal") {
      await db.update(accounts).set({ accountType: "dual" }).where(eq(accounts.id, account.id));
    }

    return NextResponse.json({ membership: updated });
  }

  const status = body.status ?? "active";
  const [created] = await db
    .insert(portalMemberships)
    .values({
      accountId: account.id,
      orgId: org.id,
      role: body.role ?? "viewer",
      status,
      invitedBy: auth.account.id,
      joinedAt: status === "active" ? new Date() : null,
    })
    .returning();

  if (account.accountType === "internal") {
    await db.update(accounts).set({ accountType: "dual" }).where(eq(accounts.id, account.id));
  }

  return NextResponse.json({ membership: created }, { status: 201 });
}
