import { NextResponse } from "next/server";
import { getFlags, type FeatureFlagKey } from "@/lib/feature-flags";

/**
 * POST /api/feature-flags
 * Get multiple feature flags at once
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { keys } = body;

    if (!Array.isArray(keys)) {
      return NextResponse.json(
        { error: "keys must be an array" },
        { status: 400 }
      );
    }

    const flags = await getFlags(keys as FeatureFlagKey[]);

    return NextResponse.json({ flags });
  } catch (error) {
    console.error("Failed to fetch feature flags:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flags" },
      { status: 500 }
    );
  }
}
