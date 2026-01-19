import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { db } from "@repo/database";
import { organisations, accounts, globalAdmins } from "@repo/database";
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

// GET - List all client organizations
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await checkGlobalAdmin(user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only global admins can manage organizations" },
        { status: 403 }
      );
    }

    const orgs = await db.query.organisations.findMany({
      orderBy: (organisations, { asc }) => [asc(organisations.name)],
    });

    return NextResponse.json(orgs);
  } catch (error) {
    console.error("Failed to get organizations:", error);
    return NextResponse.json(
      { error: "Failed to get organizations" },
      { status: 500 }
    );
  }
}

// POST - Create a new client organization
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = await checkGlobalAdmin(user.id);
    if (!isAdmin) {
      return NextResponse.json(
        { error: "Only global admins can create organizations" },
        { status: 403 }
      );
    }

    const { name, slug } = await request.json();

    if (!name || !slug) {
      return NextResponse.json(
        { error: "Name and slug are required" },
        { status: 400 }
      );
    }

    // Check if slug already exists
    const existing = await db.query.organisations.findFirst({
      where: eq(organisations.slug, slug),
    });

    if (existing) {
      return NextResponse.json(
        { error: "Organization with this slug already exists" },
        { status: 400 }
      );
    }

    const [org] = await db
      .insert(organisations)
      .values({ name, slug })
      .returning();

    return NextResponse.json(org, { status: 201 });
  } catch (error) {
    console.error("Failed to create organization:", error);
    return NextResponse.json(
      { error: "Failed to create organization" },
      { status: 500 }
    );
  }
}
