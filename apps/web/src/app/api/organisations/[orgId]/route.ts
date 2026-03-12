import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/database";
import { organisations, accounts } from "@repo/database";
import { eq } from "drizzle-orm";

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

// PATCH - Update organization
export async function PATCH(
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
        { error: "Only global admins can update organizations" },
        { status: 403 }
      );
    }

    const { orgId } = await params;
    const body = await request.json();
    const { name, slug, accountName } = body as { name?: string; slug?: string; accountName?: string | null };

    // If name/slug provided, validate them
    if ((name !== undefined || slug !== undefined) && (!name || !slug)) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    // Check if slug is taken by another org
    if (slug) {
      const existing = await db.query.organisations.findFirst({
        where: eq(organisations.slug, slug),
      });

      if (existing && existing.id !== orgId) {
        return NextResponse.json(
          { error: "Slug already taken by another organization" },
          { status: 400 }
        );
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name;
    if (slug !== undefined) updates.slug = slug;
    if (accountName !== undefined) updates.accountName = accountName;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No fields to update" },
        { status: 400 }
      );
    }

    const [updatedOrg] = await db
      .update(organisations)
      .set(updates)
      .where(eq(organisations.id, orgId))
      .returning();

    if (!updatedOrg) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(updatedOrg);
  } catch (error) {
    console.error("Failed to update organization:", error);
    return NextResponse.json(
      { error: "Failed to update organization" },
      { status: 500 }
    );
  }
}

// DELETE - Delete organization
export async function DELETE(
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
        { error: "Only global admins can delete organizations" },
        { status: 403 }
      );
    }

    const { orgId } = await params;

    // Check if org has any tax returns or tasks
    const org = await db.query.organisations.findFirst({
      where: eq(organisations.id, orgId),
      with: {
        taxReturns: {
          limit: 1,
        },
        tasks: {
          limit: 1,
        },
      },
    });

    if (!org) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    if (org.taxReturns.length > 0 || org.tasks.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete organization with existing tax returns or tasks" },
        { status: 400 }
      );
    }

    await db.delete(organisations).where(eq(organisations.id, orgId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete organization:", error);
    return NextResponse.json(
      { error: "Failed to delete organization" },
      { status: 500 }
    );
  }
}
