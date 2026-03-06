import { and, eq } from "drizzle-orm";
import { db, accounts, portalMemberships, organisations } from "@repo/database";
import { createClient } from "@/lib/supabase/server";

export async function getPortalViewer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !user.email) {
    return null;
  }

  let account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  });

  if (!account) {
    const [created] = await db
      .insert(accounts)
      .values({
        userId: user.id,
        fullName: user.user_metadata.full_name ?? user.user_metadata.name ?? null,
        avatarUrl: user.user_metadata.avatar_url ?? user.user_metadata.picture ?? null,
        accountType: "portal",
      })
      .returning();

    account = created ?? undefined;
  }

  if (!account) {
    return null;
  }

  const memberships = await db
    .select({
      id: portalMemberships.id,
      role: portalMemberships.role,
      orgId: portalMemberships.orgId,
      orgName: organisations.name,
      orgSlug: organisations.slug,
      status: portalMemberships.status,
    })
    .from(portalMemberships)
    .innerJoin(organisations, eq(portalMemberships.orgId, organisations.id))
    .where(and(eq(portalMemberships.accountId, account.id), eq(portalMemberships.status, "active")));

  return {
    user,
    account,
    memberships,
  };
}
