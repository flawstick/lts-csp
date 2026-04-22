"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  FileText,
  FolderOpen,
  ShieldCheck,
  UploadCloud,
} from "lucide-react";
import { resolveGuernseyCertificateType } from "@repo/database/guernsey-filing";

import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

function Stepper({ steps }: { steps: string[] }) {
  return (
    <ol className="relative space-y-4">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        return (
          <li key={step} className="relative flex gap-3">
            {!isLast ? (
              <span
                className="absolute left-[14px] top-7 h-[calc(100%-4px)] w-px bg-border"
                aria-hidden
              />
            ) : null}
            <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground">
              {index + 1}
            </span>
            <p className="pt-0.5 text-sm leading-relaxed text-foreground">
              {step}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

function CapabilityRow({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

export default function ClientAccessOverviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const accessQuery = api.clientAccess.getAccess.useQuery({ token });

  if (accessQuery.isLoading) {
    return (
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <Skeleton className="h-[420px] rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-[180px] rounded-xl" />
          <Skeleton className="h-[220px] rounded-xl" />
        </div>
      </section>
    );
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
    returnRecord.jurisdictionCode === "JE" &&
    returnRecord.returnType === "company";
  const certificateResolution = resolveGuernseyCertificateType({
    metadata:
      returnRecord.metadata && typeof returnRecord.metadata === "object"
        ? returnRecord.metadata
        : null,
    savedCertificateType: null,
  });
  const isGuernseyCertificateUnresolved =
    isGuernsey &&
    returnRecord.returnType === "economic_substance" &&
    certificateResolution.unresolved;
  const isCertificateTwo =
    certificateResolution.certificateType === "Certificate 2";
  const guidedFinishHref = isGuernsey
    ? `/client-access/${token}/guided-finish`
    : isJerseyCompany
      ? `/client-access/${token}/jersey-guided-finish`
      : null;

  const checklist = isGuernseyCertificateUnresolved
    ? [
        "Upload the ESR or supporting documents in the workspace.",
        "LTS Tax will confirm whether this filing is Certificate 2 or Certificate 3.",
        "Guided finish will become available once that confirmation is complete.",
      ]
    : isCertificateTwo
      ? [
          "Open the workspace and review the reduced Certificate 2 form.",
          "Upload supporting documents only if something exceptional needs review.",
          "Use guided finish for a quick final review before submission.",
        ]
      : isGuernsey
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
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)]">
      <article className="client-access-card">
        <div className="space-y-1.5">
          <p className="client-access-kicker">Getting started</p>
          <h2 className="text-xl font-semibold tracking-tight">
            Here&apos;s how to complete this return
          </h2>
          <p className="text-sm text-muted-foreground">
            Everything you need is in this secure workspace. You can close this
            page and come back anytime using the same link.
          </p>
        </div>

        <div className="mt-6">
          <Stepper steps={checklist} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/client-access/${token}/workspace`}>
              Open workspace
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          {guidedFinishHref && !isGuernseyCertificateUnresolved ? (
            <Button variant="outline" asChild>
              <Link href={guidedFinishHref}>
                <FolderOpen className="size-4" />
                Open guided finish
              </Link>
            </Button>
          ) : null}
        </div>
      </article>

      <aside className="space-y-4">
        <div className="client-access-card">
          <p className="client-access-kicker">At a glance</p>
          <dl className="mt-4 divide-y divide-border text-sm">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted-foreground">Jurisdiction</dt>
              <dd className="font-medium">{returnRecord.jurisdictionName}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted-foreground">Tax year</dt>
              <dd className="font-medium">{returnRecord.taxYear}</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-muted-foreground">Files uploaded</dt>
              <dd className="font-medium">{returnRecord.files.length}</dd>
            </div>
          </dl>
        </div>

        <div className="client-access-card">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-muted-foreground" />
            <p className="text-sm font-semibold">What this link lets you do</p>
          </div>
          <div className="mt-4 space-y-3.5">
            <CapabilityRow
              icon={UploadCloud}
              title="Upload documents"
              description="Attach signed accounts, ESR files, and supporting material."
            />
            <CapabilityRow
              icon={FileText}
              title="Review & edit the return"
              description="Work through the form section by section and save as you go."
            />
            <CapabilityRow
              icon={CheckCircle2}
              title="Finish with guided flow"
              description="Walk through the full step-by-step completion when you're ready."
            />
          </div>
        </div>
      </aside>
    </section>
  );
}
