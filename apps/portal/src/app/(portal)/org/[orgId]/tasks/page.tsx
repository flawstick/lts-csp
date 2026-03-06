"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { useMemo } from "react";

import { api } from "@/trpc/react";

export default function OrgTasksPage() {
  const params = useParams<{ orgId: string }>();
  const orgId = params.orgId;

  const { data, isLoading, error } = api.portalReturns.listByOrg.useQuery(
    { orgId },
    { enabled: !!orgId },
  );

  const tasks = useMemo(() => {
    return (data ?? []).filter((row) => row.status !== "completed");
  }, [data]);

  return (
    <main className="mx-auto max-w-6xl space-y-5">
      <section className="portal-card p-5">
        <h2 className="text-xl font-semibold">Tasks</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Active return tasks for this organization that need updates, uploads, or completion.
        </p>
      </section>

      {isLoading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading tasks...
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error.message}</p> : null}

      {!isLoading && !tasks.length ? (
        <section className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No active tasks. Everything is complete.
        </section>
      ) : null}

      <div className="grid gap-3">
        {tasks.map((row) => (
          <Link
            key={row.id}
            href={`/org/${orgId}/returns/${row.id}`}
            className="portal-card rounded-xl p-4 transition hover:bg-muted/40"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{row.entityName}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {row.jurisdictionCode} • {row.taxYear}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs capitalize">
                {row.status === "in_progress" ? (
                  <Clock3 className="size-3.5" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                {row.status.replace("_", " ")}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
