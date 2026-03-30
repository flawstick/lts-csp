import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/database";
import { accounts, jurisdictionSettings } from "@repo/database";
import {
  decryptPortalCredentials,
  encryptPortalCredentials,
} from "@repo/database/portal-credentials";
import { eq, and } from "drizzle-orm";

// Check if user is global admin
async function checkGlobalAdmin(userId: string): Promise<boolean> {
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.userId, userId),
    with: {
      globalAdmin: true,
    },
  });
  return !!account?.globalAdmin;
}

// GET - Get all jurisdiction settings for an organization
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await checkGlobalAdmin(user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only global admins can view jurisdiction settings" },
        { status: 403 }
      );
    }

    const { orgId } = await params;

    const settings = await db.query.jurisdictionSettings.findMany({
      where: eq(jurisdictionSettings.orgId, orgId),
      with: {
        jurisdiction: true,
      },
    });

    // Decrypt credentials and return
    const result = settings.map((setting) => ({
      id: setting.id,
      jurisdictionId: setting.jurisdictionId,
      jurisdiction: setting.jurisdiction,
      credentials: setting.portalCredentialsEncrypted
        ? decryptPortalCredentials(setting.portalCredentialsEncrypted)
        : null,
      settings: setting.settings,
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get jurisdiction settings:", error);
    return NextResponse.json(
      { error: "Failed to get jurisdiction settings" },
      { status: 500 }
    );
  }
}

// POST - Create or update jurisdiction settings for an organization
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await checkGlobalAdmin(user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only global admins can update jurisdiction settings" },
        { status: 403 }
      );
    }

    const { orgId } = await params;
    const { jurisdictionId, credentials } = await request.json();

    if (!jurisdictionId) {
      return NextResponse.json(
        { error: "jurisdictionId is required" },
        { status: 400 }
      );
    }

    // Check if setting already exists
    const existing = await db.query.jurisdictionSettings.findFirst({
      where: and(
        eq(jurisdictionSettings.orgId, orgId),
        eq(jurisdictionSettings.jurisdictionId, jurisdictionId)
      ),
    });

    const encryptedCredentials = encryptPortalCredentials(credentials);

    if (existing) {
      // Update existing
      const [updated] = await db
        .update(jurisdictionSettings)
        .set({
          portalCredentialsEncrypted: encryptedCredentials,
        })
        .where(eq(jurisdictionSettings.id, existing.id))
        .returning();

      return NextResponse.json(updated);
    } else {
      // Create new
      const [created] = await db
        .insert(jurisdictionSettings)
        .values({
          orgId,
          jurisdictionId,
          portalCredentialsEncrypted: encryptedCredentials,
        })
        .returning();

      return NextResponse.json(created, { status: 201 });
    }
  } catch (error) {
    console.error("Failed to save jurisdiction settings:", error);
    return NextResponse.json(
      { error: "Failed to save jurisdiction settings" },
      { status: 500 }
    );
  }
}
