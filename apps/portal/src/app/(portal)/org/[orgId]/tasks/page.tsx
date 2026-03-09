"use client";

import { useParams } from "next/navigation";

import { OrgTasksTable } from "./_components/org-tasks-table";

export default function OrgTasksPage() {
  const params = useParams<{ orgId: string }>();

  return <OrgTasksTable orgId={params.orgId} />;
}
