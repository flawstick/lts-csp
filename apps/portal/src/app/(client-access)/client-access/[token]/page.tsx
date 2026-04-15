"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowRight, FileText, Sparkles, UploadCloud } from "lucide-react";

import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ClientAccessOverviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const accessQuery = api.clientAccess.getAccess.useQuery({ token });

  if (accessQuery.isLoading) {
    return <Skeleton className="h-[360px] rounded-2xl" />;
  }

  if (accessQuery.error || !accessQuery.data) {
    return (
      <section className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
        {accessQuery.error?.message ?? "The access link could not be loaded."}
      </section>
    );
  }

  const { return: returnRecord } = accessQuery.data;
  const isGuernsey = returnRecord.jurisdictionCode === "GG";
  const isJerseyCompany =
    returnRecord.jurisdictionCode === "JE" && returnRecord.returnType === "company";
  const guidedFinishHref = isGuernsey
    ? `/client-access/${token}/guided-finish`
    : isJerseyCompany
      ? `/client-access/${token}/jersey-guided-finish`
      : null;

  return (
    <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <Sparkles className="size-3.5" />
          What you can do here
        </div>
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">1. Upload your documents</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add ESRs, signed accounts, or supporting files in the workspace.
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">2. Run extraction</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Guernsey returns can extract data from uploaded files directly into the form.
            </p>
          </div>
          <div className="rounded-xl border p-4">
            <p className="text-sm font-semibold">3. Complete the return</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Review the populated fields, finish the missing answers, and work through the guided flow where available.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={`/client-access/${token}/workspace`}
            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-sm font-medium text-background"
          >
            Open workspace
            <ArrowRight className="size-4" />
          </Link>
          {guidedFinishHref ? (
            <Link
              href={guidedFinishHref}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium"
            >
              Open guided finish
            </Link>
          ) : null}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <div className="space-y-4">
          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <FileText className="size-4" />
              Return
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {returnRecord.jurisdictionName} · Tax year {returnRecord.taxYear}
            </p>
          </div>

          <div className="rounded-xl border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <UploadCloud className="size-4" />
              Files already attached
            </div>
            <p className="mt-2 text-2xl font-semibold">
              {returnRecord.files.length}
            </p>
            <p className="text-sm text-muted-foreground">
              Existing files are visible inside the workspace.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
