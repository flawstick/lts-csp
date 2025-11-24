import { db } from "./index";
import { accounts, orgMembers, globalAdmins, organisations } from "./schema";
import { eq } from "drizzle-orm";

async function addFlawstick() {
  const FLAWSTICK_USER_ID = "5596011a-38cb-45ea-98c2-2351bb24439c";

  console.log("Adding flawstick...");

  // Get the LTS org
  const ltsOrg = await db.query.organisations.findFirst({
    where: eq(organisations.slug, "lts"),
  });

  if (!ltsOrg) {
    console.error("LTS organisation not found! Run seed first.");
    process.exit(1);
  }

  console.log("Found LTS org:", ltsOrg.id);

  // Create account if not exists
  let account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, FLAWSTICK_USER_ID),
  });

  if (!account) {
    const [newAccount] = await db
      .insert(accounts)
      .values({
        userId: FLAWSTICK_USER_ID,
        fullName: "flawstick",
      })
      .returning();
    account = newAccount;
    console.log("Created account:", account?.id);
  } else {
    console.log("Account already exists:", account.id);
  }

  if (!account) {
    console.error("Failed to create account");
    process.exit(1);
  }

  // Add as org owner
  const existingMember = await db.query.orgMembers.findFirst({
    where: eq(orgMembers.accountId, account.id),
  });

  if (!existingMember) {
    await db.insert(orgMembers).values({
      orgId: ltsOrg.id,
      accountId: account.id,
      role: "owner",
    });
    console.log("Added as owner of LTS");
  } else {
    console.log("Already a member of LTS with role:", existingMember.role);
  }

  // Add as global admin
  const existingAdmin = await db.query.globalAdmins.findFirst({
    where: eq(globalAdmins.accountId, account.id),
  });

  if (!existingAdmin) {
    await db.insert(globalAdmins).values({
      accountId: account.id,
    });
    console.log("Added as global admin");
  } else {
    console.log("Already a global admin");
  }

  console.log("Done!");
  process.exit(0);
}

addFlawstick().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
