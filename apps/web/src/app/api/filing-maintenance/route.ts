import { NextResponse } from "next/server";
import { getFilingMaintenance } from "@/lib/filing-maintenance";

export const dynamic = "force-dynamic";

/**
 * GET /api/filing-maintenance
 * Whether new filing automation runs are paused for maintenance right now.
 */
export function GET() {
  const now = new Date();
  return NextResponse.json(
    { ...getFilingMaintenance(now), now: now.toISOString() },
    { headers: { "Cache-Control": "no-store" } },
  );
}
