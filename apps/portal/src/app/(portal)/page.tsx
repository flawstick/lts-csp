import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Building2, FolderArchive, ShieldCheck } from "lucide-react";

import { getPortalViewer } from "@/lib/portal-auth";

export default async function PortalHomePage() {
  const viewer = await getPortalViewer();

  if (!viewer) {
    redirect("/login");
  }

  if (viewer.account.accountType === "internal") {
    redirect("/waiting-for-invite");
  }

  if (viewer.memberships.length === 0) {
    redirect("/waiting-for-invite");
  }

  if (viewer.memberships.length === 1) {
    redirect(`/org/${viewer.memberships[0]!.orgId}`);
  }

  return (
    <main className="mx-auto max-w-7xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white">
        <div className="absolute -right-12 -top-10 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
        <div className="absolute -bottom-14 left-16 h-44 w-44 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="relative grid gap-5 md:grid-cols-[1.7fr_1fr]">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-blue-100/80">Portal Control Plane</p>
            <h1 className="mt-2 text-3xl font-semibold">Choose Client Organization</h1>
            <p className="mt-3 max-w-2xl text-sm text-blue-100/90">
              Your session can operate across multiple trusts. Pick a client organization to continue
              return preparation and document workflows.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-blue-100/70">Organizations</p>
              <p className="text-2xl font-semibold">{viewer.memberships.length}</p>
            </div>
            <div className="rounded-2xl border border-white/15 bg-white/10 p-3">
              <p className="text-xs text-blue-100/70">Access profile</p>
              <p className="text-lg font-semibold capitalize">{viewer.account.accountType}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="portal-card bg-card/80 p-4">
          <p className="text-xs text-muted-foreground">Security</p>
          <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium">
            <ShieldCheck className="size-4 text-emerald-600" />
            Session verified
          </p>
        </div>
        <div className="portal-card bg-card/80 p-4">
          <p className="text-xs text-muted-foreground">Workspace</p>
          <p className="mt-1 inline-flex items-center gap-2 text-sm font-medium">
            <FolderArchive className="size-4 text-blue-600" />
            Returns and ESR vault
          </p>
        </div>
        <div className="portal-card bg-card/80 p-4">
          <p className="text-xs text-muted-foreground">Identity</p>
          <p className="mt-1 text-sm font-medium">{viewer.user.email ?? "Authenticated user"}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {viewer.memberships.map((membership) => (
          <Link
            key={membership.id}
            href={`/org/${membership.orgId}`}
            className="portal-card group bg-card/90 p-5 transition hover:-translate-y-0.5 hover:border-blue-400/40 hover:shadow-lg"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="rounded-xl bg-blue-600/10 p-2 text-blue-600">
                <Building2 className="size-5" />
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">{membership.orgName}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{membership.orgSlug}</p>
            <div className="mt-4 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {membership.role}
            </div>
          </Link>
        ))}
      </section>
    </main>
  );
}
