"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  UploadCloud,
} from "lucide-react";

import { api } from "@/trpc/react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

function OverviewChecklist({ items }: { items: string[] }) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={item}
          className="rounded-2xl border border-border bg-background px-4 py-4"
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium">{item}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ClientAccessOverviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const accessQuery = api.clientAccess.getAccess.useQuery({ token });

  if (accessQuery.isLoading) {
    return <Skeleton className="h-[420px] rounded-[1.75rem]" />;
  }

  if (accessQuery.error || !accessQuery.data) {
    return (
      <section className="client-access-card text-sm text-muted-foreground">
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

  const checklist = isGuernsey
    ? [
        "Upload the ESR, signed financial statements, and any supporting files.",
        "Run AI extraction to prefill the Guernsey economic substance form.",
        "Review the sections, fix anything missing, and finish the guided flow.",
      ]
    : [
        "Upload signed financial statements and the documents needed for the Jersey return.",
        "Review the return workspace and confirm the available company details.",
        "Complete the guided form section by section and save progress as needed.",
      ];

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
      <div className="client-access-card">
        <div className="space-y-2">
          <p className="client-access-kicker">How to complete this return</p>
          <h2 className="text-xl font-semibold tracking-tight">
            Everything you need is inside this secure workspace
          </h2>
          <p className="text-sm text-muted-foreground">
            Upload files, complete the form, and return later using the same link.
          </p>
        </div>

        <div className="mt-5">
          <OverviewChecklist items={checklist} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/client-access/${token}/workspace`}>
              Open workspace
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          {guidedFinishHref ? (
            <Button variant="outline" asChild>
              <Link href={guidedFinishHref}>
                Open guided finish
                <FolderOpen className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-4">
        <section className="client-access-card">
          <div className="client-access-stat-grid">
            <div className="client-access-stat">
              <p className="client-access-stat-label">Jurisdiction</p>
              <p className="client-access-stat-value text-base">
                {returnRecord.jurisdictionName}
              </p>
            </div>
            <div className="client-access-stat">
              <p className="client-access-stat-label">Tax year</p>
              <p className="client-access-stat-value">{returnRecord.taxYear}</p>
            </div>
            <div className="client-access-stat">
              <p className="client-access-stat-label">Files</p>
              <p className="client-access-stat-value">{returnRecord.files.length}</p>
            </div>
          </div>
        </section>

        <section className="client-access-card">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="size-4" />
              What this link allows
            </div>
            <div className="grid gap-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-3">
                <UploadCloud className="mt-0.5 size-4 shrink-0 text-foreground" />
                <span>Upload documents directly to this return.</span>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-3">
                <FileText className="mt-0.5 size-4 shrink-0 text-foreground" />
                <span>Review and complete the return form.</span>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-border bg-background px-3 py-3">
                <FolderOpen className="mt-0.5 size-4 shrink-0 text-foreground" />
                <span>Use guided finish for the full step-by-step flow.</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
