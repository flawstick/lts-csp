"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarClock,
  FileText,
  FolderOpen,
  LifeBuoy,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { resolveGuernseyCertificateType } from "@repo/database/guernsey-filing";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

function buildTabs(
  token: string,
  jurisdictionCode: string | null,
  returnType: string | null,
  metadata: Record<string, unknown> | null,
) {
  const certificateResolution = resolveGuernseyCertificateType({
    metadata,
    savedCertificateType: null,
  });
  const allowGuidedFinish = !(
    jurisdictionCode === "GG" &&
    returnType === "economic_substance" &&
    certificateResolution.unresolved
  );

  const tabs = [
    {
      href: `/client-access/${token}`,
      label: "Overview",
      icon: Sparkles,
    },
    {
      href: `/client-access/${token}/workspace`,
      label: "Workspace",
      icon: FileText,
    },
  ];

  if (jurisdictionCode === "GG" && allowGuidedFinish) {
    tabs.push({
      href: `/client-access/${token}/guided-finish`,
      label: "Guided finish",
      icon: FolderOpen,
    });
  } else if (jurisdictionCode === "JE" && returnType === "company") {
    tabs.push({
      href: `/client-access/${token}/jersey-guided-finish`,
      label: "Guided finish",
      icon: FolderOpen,
    });
  }

  return tabs;
}

const STATUS_TONE: Record<string, string> = {
  pending:
    "bg-amber-500/10 text-amber-700 ring-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  in_progress:
    "bg-blue-500/10 text-blue-700 ring-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  review_required:
    "bg-violet-500/10 text-violet-700 ring-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
  completed:
    "bg-emerald-500/10 text-emerald-700 ring-emerald-500/30 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  dismissed:
    "bg-zinc-500/10 text-zinc-600 ring-zinc-500/30 dark:bg-zinc-500/15 dark:text-zinc-300 dark:ring-zinc-500/30",
  failed:
    "bg-rose-500/10 text-rose-700 ring-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
};

function StatusPill({ status }: { status: string }) {
  const normalized = status.replace(/_/g, " ");
  const tone = STATUS_TONE[status] ?? "bg-muted text-muted-foreground ring-border";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ring-1 ring-inset",
        tone,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {normalized}
    </span>
  );
}

export function ClientAccessShell({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const accessQuery = api.clientAccess.getAccess.useQuery({ token });

  if (accessQuery.isLoading) {
    return (
      <div className="client-access-page">
        <div className="client-access-wrap">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-44 rounded-md" />
            <Skeleton className="h-8 w-28 rounded-md" />
          </div>
          <section className="client-access-surface">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-3 h-9 w-64 max-w-full" />
            <Skeleton className="mt-3 h-4 w-80 max-w-full" />
            <div className="mt-6 flex gap-4 border-b border-border pb-3">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-28" />
            </div>
          </section>
          <Skeleton className="h-[480px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (accessQuery.error || !accessQuery.data) {
    return (
      <div className="client-access-page">
        <div className="client-access-wrap">
          <section className="client-access-surface max-w-2xl">
            <div className="flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldCheck className="size-5" />
            </div>
            <p className="mt-4 text-lg font-semibold">Access unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {accessQuery.error?.message ??
                "The access link could not be loaded."}
            </p>
          </section>
        </div>
      </div>
    );
  }

  const { organisation, clientProfile, return: returnRecord } = accessQuery.data;
  const contactInfo = accessQuery.data.contactInfo;
  const tabs = buildTabs(
    token,
    returnRecord.jurisdictionCode,
    returnRecord.returnType,
    returnRecord.metadata && typeof returnRecord.metadata === "object"
      ? returnRecord.metadata
      : null,
  );

  const orgName = organisation.accountName ?? organisation.name;
  const orgInitial = orgName.slice(0, 1).toUpperCase();

  return (
    <div className="client-access-page">
      <div className="client-access-wrap">
        {/* Top bar — brand on left, help on right */}
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-semibold text-background">
              {orgInitial}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight">
                {orgName}
              </p>
              <p className="text-xs text-muted-foreground">Secure return portal</p>
            </div>
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <LifeBuoy className="size-4" />
                Need help?
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72 p-4">
              <p className="text-sm font-semibold">Contact {orgName}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Reach out if you have any questions about this return.
              </p>
              <Separator className="my-3" />
              <div className="space-y-2 text-sm">
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="flex items-center gap-2 text-foreground hover:underline"
                >
                  <Mail className="size-4 text-muted-foreground" />
                  <span className="truncate">{contactInfo.email}</span>
                </a>
                <a
                  href={`tel:${contactInfo.phone.replace(/\s+/g, "")}`}
                  className="flex items-center gap-2 text-foreground hover:underline"
                >
                  <Phone className="size-4 text-muted-foreground" />
                  {contactInfo.phone}
                </a>
              </div>
            </PopoverContent>
          </Popover>
        </header>

        {/* Hero + tabs */}
        <section className="client-access-surface">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-3">
              <p className="client-access-kicker">Return workspace</p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {returnRecord.entityName}
              </h1>
              <div className="client-access-meta">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5" />
                  {returnRecord.jurisdictionName} ({returnRecord.jurisdictionCode})
                </span>
                <span className="text-border" aria-hidden>
                  •
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-3.5" />
                  Tax year {returnRecord.taxYear}
                </span>
                {returnRecord.externalId ? (
                  <>
                    <span className="text-border" aria-hidden>
                      •
                    </span>
                    <span className="font-mono text-[11px]">
                      {returnRecord.externalId}
                    </span>
                  </>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
              <StatusPill status={returnRecord.status} />
              <p className="text-xs text-muted-foreground">
                Prepared for{" "}
                <span className="text-foreground">
                  {clientProfile?.displayName ?? returnRecord.entityName}
                </span>
              </p>
            </div>
          </div>

          <nav
            className="client-access-nav mt-6"
            aria-label="Client access sections"
          >
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive =
                pathname === tab.href ||
                (tab.href !== `/client-access/${token}` &&
                  pathname.startsWith(tab.href));

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "client-access-nav-link",
                    isActive
                      ? "text-foreground"
                      : "hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {tab.label}
                  {isActive ? (
                    <span
                      className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground"
                      aria-hidden
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </section>

        <div>{children}</div>
      </div>
    </div>
  );
}
