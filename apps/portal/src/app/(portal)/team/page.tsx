"use client";

import { Building2, Loader2, ShieldCheck } from "lucide-react";

import { api } from "@/trpc/react";

export default function TeamPage() {
  const { data, isLoading, error } = api.portalAccess.getMyMemberships.useQuery();

  return (
    <main className="mx-auto max-w-4xl space-y-5">
      <section className="portal-card p-5">
        <h2 className="text-xl font-semibold">Team</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Organizations and roles attached to your current portal identity.
        </p>
      </section>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading team access...
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error.message}</p> : null}

      {!isLoading && !(data?.memberships.length ?? 0) ? (
        <section className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No team memberships found.
        </section>
      ) : null}

      <div className="grid gap-3">
        {data?.memberships.map((membership) => (
          <section key={membership.id} className="portal-card rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{membership.orgName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{membership.orgSlug}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs uppercase tracking-wide">
                  <Building2 className="size-3.5" />
                  {membership.role}
                </span>
                <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs uppercase tracking-wide">
                  <ShieldCheck className="size-3.5" />
                  {membership.status}
                </span>
              </div>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
