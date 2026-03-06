"use client";

import { createClient } from "@/lib/supabase/client";

type RecentReturnMeta = {
  id: string;
  orgId: string;
  at: string;
};

const METADATA_KEY = "portal_recent_returns";
const MAX_ITEMS = 30;

function parseRecentMetadata(raw: unknown): RecentReturnMeta[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Record<string, unknown>;
      if (typeof row.id !== "string" || typeof row.orgId !== "string") {
        return null;
      }

      return {
        id: row.id,
        orgId: row.orgId,
        at: typeof row.at === "string" ? row.at : new Date(0).toISOString(),
      };
    })
    .filter((item): item is RecentReturnMeta => item !== null);
}

export async function trackPortalRecentReturn(input: {
  orgId: string;
  returnId: string;
}) {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return;
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const existing = parseRecentMetadata(metadata[METADATA_KEY]);

  const next: RecentReturnMeta[] = [
    {
      id: input.returnId,
      orgId: input.orgId,
      at: new Date().toISOString(),
    },
    ...existing.filter((item) => !(item.id === input.returnId && item.orgId === input.orgId)),
  ].slice(0, MAX_ITEMS);

  await supabase.auth.updateUser({
    data: {
      ...metadata,
      [METADATA_KEY]: next,
    },
  });
}
