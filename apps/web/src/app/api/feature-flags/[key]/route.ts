import { NextResponse } from "next/server";
import { getFlag, type FeatureFlagKey, FEATURE_FLAGS } from "@/lib/feature-flags";

/**
 * GET /api/feature-flags/[key]
 * Get a single feature flag value
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  try {
    const { key } = await params;

    // Validate key
    if (!(key in FEATURE_FLAGS)) {
      return NextResponse.json(
        { error: `Unknown feature flag: ${key}` },
        { status: 404 }
      );
    }

    const value = await getFlag(key as FeatureFlagKey);

    return NextResponse.json({
      key,
      value,
      metadata: FEATURE_FLAGS[key as FeatureFlagKey],
    });
  } catch (error) {
    console.error("Failed to fetch feature flag:", error);
    return NextResponse.json(
      { error: "Failed to fetch feature flag" },
      { status: 500 }
    );
  }
}
