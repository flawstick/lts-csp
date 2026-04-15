import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNull } from "drizzle-orm";

import {
  portalClientProfiles,
  portalReturnShares,
  taxReturns,
} from "@repo/database";
import {
  getClientAccessRecipientEmails,
  hashClientAccessToken,
  normalizeClientEntityName,
  sanitizeClientSecondaryEmails,
} from "@repo/database/client-access";

import type { TRPCContext } from "@/server/api/trpc";

type DatabaseClient = TRPCContext["db"];

export async function getPortalClientProfileByEntityName(input: {
  db: DatabaseClient;
  orgId: string;
  entityName: string;
}) {
  const normalizedEntityName = normalizeClientEntityName(input.entityName);

  return input.db.query.portalClientProfiles.findFirst({
    where: and(
      eq(portalClientProfiles.orgId, input.orgId),
      eq(portalClientProfiles.normalizedEntityName, normalizedEntityName),
    ),
  });
}

export async function upsertPortalClientProfile(input: {
  db: DatabaseClient;
  orgId: string;
  entityName: string;
  displayName?: string | null;
  primaryEmail?: string | null;
  secondaryEmails?: string[] | null;
}) {
  const normalizedEntityName = normalizeClientEntityName(input.entityName);
  const trimmedDisplayName = input.displayName?.trim();
  const displayName =
    trimmedDisplayName && trimmedDisplayName.length > 0
      ? trimmedDisplayName
      : input.entityName.trim();
  const trimmedPrimaryEmail = input.primaryEmail?.trim().toLowerCase();
  const primaryEmail =
    trimmedPrimaryEmail && trimmedPrimaryEmail.length > 0
      ? trimmedPrimaryEmail
      : null;
  const secondaryEmails = sanitizeClientSecondaryEmails(input.secondaryEmails);

  const existing = await input.db.query.portalClientProfiles.findFirst({
    where: and(
      eq(portalClientProfiles.orgId, input.orgId),
      eq(portalClientProfiles.normalizedEntityName, normalizedEntityName),
    ),
  });

  if (existing) {
    const [updated] = await input.db
      .update(portalClientProfiles)
      .set({
        displayName,
        primaryEmail,
        secondaryEmails,
        updatedAt: new Date(),
      })
      .where(eq(portalClientProfiles.id, existing.id))
      .returning();

    return updated ?? existing;
  }

  const [created] = await input.db
    .insert(portalClientProfiles)
    .values({
      orgId: input.orgId,
      normalizedEntityName,
      displayName,
      primaryEmail,
      secondaryEmails,
    })
    .returning();

  return created ?? null;
}

export function getPortalClientAccessRecipientEmails(profile: {
  primaryEmail?: string | null;
  secondaryEmails?: string[] | null;
} | null | undefined) {
  return getClientAccessRecipientEmails({
    primaryEmail: profile?.primaryEmail ?? null,
    secondaryEmails: profile?.secondaryEmails ?? [],
  });
}

export async function getLatestPortalReturnShareForReturn(input: {
  db: DatabaseClient;
  taxReturnId: string;
}) {
  return input.db.query.portalReturnShares.findFirst({
    where: eq(portalReturnShares.taxReturnId, input.taxReturnId),
    with: {
      clientProfile: true,
    },
    orderBy: desc(portalReturnShares.createdAt),
  });
}

export async function resolvePortalClientAccessShare(input: {
  db: DatabaseClient;
  token: string;
}) {
  const share = await input.db.query.portalReturnShares.findFirst({
    where: and(
      eq(portalReturnShares.tokenHash, hashClientAccessToken(input.token)),
      isNull(portalReturnShares.revokedAt),
    ),
    with: {
      organisation: true,
      clientProfile: true,
      taxReturn: {
        with: {
          jurisdiction: true,
          substanceForm: true,
          jerseyCompanyReturnForm: true,
        },
      },
    },
    orderBy: desc(portalReturnShares.createdAt),
  });

  if (!share) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Client access link not found.",
    });
  }

  if (new Date(share.expiresAt) < new Date()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Client access link has expired.",
    });
  }

  if (!share.taxReturn) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Return not found for this access link.",
    });
  }

  return share;
}

export async function touchPortalClientAccessShare(input: {
  db: DatabaseClient;
  shareId: string;
}) {
  await input.db
    .update(portalReturnShares)
    .set({
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(portalReturnShares.id, input.shareId));
}

export async function getReturnClientProfile(input: {
  db: DatabaseClient;
  taxReturnId: string;
}) {
  const returnRow = await input.db.query.taxReturns.findFirst({
    where: eq(taxReturns.id, input.taxReturnId),
    columns: {
      id: true,
      orgId: true,
      entityName: true,
    },
  });

  if (!returnRow) {
    return null;
  }

  const clientProfile = await getPortalClientProfileByEntityName({
    db: input.db,
    orgId: returnRow.orgId,
    entityName: returnRow.entityName,
  });

  return {
    returnRow,
    clientProfile,
  };
}
