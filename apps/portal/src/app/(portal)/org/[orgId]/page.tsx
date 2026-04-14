import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { getPortalViewer } from "@/lib/portal-auth";
import { OrgDashboardSkeleton } from "@/components/org-dashboard-skeleton";
import { OrgDashboardView } from "@/components/org-dashboard-view";
import { api } from "@/trpc/server";

function normalizeStatus(status: string) {
  if (status === "pending") return "pending" as const;
  if (status === "in_progress") return "in_progress" as const;
  if (status === "completed") return "completed" as const;
  if (status === "failed") return "failed" as const;
  return "review_required" as const;
}

async function OrgDashboardData({
  orgId,
  orgName,
  accountName,
}: {
  orgId: string;
  orgName: string;
  accountName?: string | null;
}) {
  const rows = await api.portalReturns.listByOrgSummary({ orgId }).catch(() => null);

  if (!rows) {
    notFound();
  }

  return (
    <OrgDashboardView
      orgId={orgId}
      orgName={orgName}
      accountName={accountName}
      rows={rows.map((row) => ({
        id: row.id,
        entityName: row.entityName,
        taxYear: row.taxYear,
        status: normalizeStatus(row.status),
        jurisdictionCode: row.jurisdictionCode,
        jurisdictionName: row.jurisdictionName,
        isSubstanceComplete: !!row.isSubstanceComplete,
        fileCount: Number(row.fileCount) || 0,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date(0).toISOString(),
      }))}
    />
  );
}

export default async function OrgPortalPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const viewer = await getPortalViewer();

  if (!viewer) {
    redirect("/login");
  }

  const membership = viewer.memberships.find((item) => item.orgId === orgId);
  if (!membership) {
    redirect("/waiting-for-invite");
  }

  return (
    <Suspense fallback={<OrgDashboardSkeleton />}>
      <OrgDashboardData
        orgId={orgId}
        orgName={membership.orgName}
        accountName={viewer.account.fullName}
      />
    </Suspense>
  );
}
