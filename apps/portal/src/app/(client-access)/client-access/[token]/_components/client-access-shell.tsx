"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FileText, FolderOpen, Mail, Phone, Sparkles } from "lucide-react";

import { api } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

function buildTabs(
  token: string,
  jurisdictionCode: string | null,
  returnType: string | null,
) {
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

  if (jurisdictionCode === "GG") {
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

function StatusPill({ status }: { status: string }) {
  const normalized = status.replace(/_/g, " ");

  return (
    <span className="inline-flex items-center rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-foreground">
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
          <section className="client-access-surface">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="mt-3 h-9 w-64" />
            <Skeleton className="mt-2 h-4 w-96 max-w-full" />
            <div className="mt-5 flex flex-wrap gap-2">
              <Skeleton className="h-10 w-28 rounded-xl" />
              <Skeleton className="h-10 w-36 rounded-xl" />
              <Skeleton className="h-10 w-40 rounded-xl" />
            </div>
          </section>
          <Skeleton className="h-[520px] rounded-[1.75rem]" />
        </div>
      </div>
    );
  }

  if (accessQuery.error || !accessQuery.data) {
    return (
      <div className="client-access-page">
        <div className="client-access-wrap">
          <section className="client-access-surface max-w-3xl">
            <p className="text-lg font-semibold">Access unavailable</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {accessQuery.error?.message ?? "The access link could not be loaded."}
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
  );

  return (
    <div className="client-access-page">
      <div className="client-access-wrap">
        <section className="client-access-surface">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <p className="client-access-kicker">
                {organisation.accountName ?? organisation.name}
              </p>
              <div className="space-y-2">
                <h1 className="client-access-title">{returnRecord.entityName}</h1>
                <div className="client-access-meta">
                  <span>
                    {returnRecord.jurisdictionName} return for tax year{" "}
                    {returnRecord.taxYear}
                  </span>
                  {returnRecord.externalId ? (
                    <span className="client-access-chip font-mono text-[11px]">
                      {returnRecord.externalId}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <StatusPill status={returnRecord.status} />
              <div className="client-access-chip gap-2">
                <Building2 className="size-3.5" />
                <span>
                  {clientProfile?.displayName ?? returnRecord.entityName}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <nav className="client-access-nav" aria-label="Client access sections">
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
                    className={cn(
                      "client-access-nav-link",
                      isActive
                        ? "bg-foreground text-background shadow-sm"
                        : "hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className="size-4" />
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-5 rounded-2xl border border-border bg-background px-4 py-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Need help?
                </p>
              </div>
              <div className="flex flex-col gap-1.5 text-sm sm:items-end">
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="size-4" />
                  {contactInfo.email}
                </a>
                <a
                  href={`tel:${contactInfo.phone.replace(/\s+/g, "")}`}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Phone className="size-4" />
                  {contactInfo.phone}
                </a>
              </div>
            </div>
          </div>
        </section>

        <div>{children}</div>
      </div>
    </div>
  );
}
