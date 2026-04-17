"use client";

import { useParams } from "next/navigation";

import { DirectionalTransition } from "@/components/view-transitions";

import { OrgTasksTable } from "./_components/org-tasks-table";

export default function OrgTasksPage() {
  const params = useParams<{ orgId: string }>();

  return (
    <DirectionalTransition>
      <OrgTasksTable orgId={params.orgId} />
    </DirectionalTransition>
  );
}
