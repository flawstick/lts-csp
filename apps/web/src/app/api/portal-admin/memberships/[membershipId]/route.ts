import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { accounts, db, globalAdmins, portalMemberships } from "@repo/database";
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ membershipId: string }> },
) {
  const auth = await requireGlobalAdmin();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { membershipId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    status?: "pending" | "active" | "suspended";
    role?: "viewer" | "editor" | "admin";
  };

  const existing = await db.query.portalMemberships.findFirst({
    where: eq(portalMemberships.id, membershipId),
  });

  if (!existing) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(portalMemberships)
    .set({
      status: body.status ?? existing.status,
      role: body.role ?? existing.role,
      joinedAt:
        (body.status ?? existing.status) === "active"
          ? (existing.joinedAt ?? new Date())
          : existing.joinedAt,
    })
    .where(eq(portalMemberships.id, existing.id))
    .returning();

  return NextResponse.json({ membership: updated });
}
