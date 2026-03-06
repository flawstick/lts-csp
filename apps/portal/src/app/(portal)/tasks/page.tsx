import { redirect } from "next/navigation";

import { getPortalViewer } from "@/lib/portal-auth";

export default async function TasksRedirectPage() {
  const viewer = await getPortalViewer();

  if (!viewer) {
    redirect("/login");
  }

  if (viewer.account.accountType === "internal") {
    redirect("/waiting-for-invite");
  }

  const primaryMembership = viewer.memberships[0];
  if (!primaryMembership) {
    redirect("/waiting-for-invite");
  }

  redirect(`/org/${primaryMembership.orgId}/tasks`);
}
