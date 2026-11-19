import "server-only";

import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { accounts, db } from "@repo/database";
import { createClient } from "@/lib/supabase/server";

/** Require an account with access to the internal LTS platform. */
export async function requireStaffAccount() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in again." });
  }

  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, user.id),
  });
  if (!account || account.accountType === "portal") {
    throw new TRPCError({ code: "FORBIDDEN", message: "LTS staff only." });
  }

  return account;
}
