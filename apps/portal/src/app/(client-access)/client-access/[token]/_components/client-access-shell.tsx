"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FileText, FolderOpen, Sparkles } from "lucide-react";

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
      label: "Return workspace",
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
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <div className="rounded-2xl border bg-card p-5">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-8 w-56" />
          <Skeleton className="mt-2 h-4 w-80" />
          <div className="mt-5 flex gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <Skeleton className="h-[480px] rounded-2xl" />
      </div>
    );
  }

  if (accessQuery.error || !accessQuery.data) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full rounded-2xl border bg-card p-8 text-center">
          <p className="text-lg font-semibold">Client access unavailable</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {accessQuery.error?.message ?? "The access link could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  const { organisation, return: returnRecord } = accessQuery.data;
  const tabs = buildTabs(
    token,
    returnRecord.jurisdictionCode,
    returnRecord.returnType,
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {organisation.accountName ?? organisation.name}
              </p>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">
                  {returnRecord.entityName}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  {returnRecord.jurisdictionName} return for tax year{" "}
                  {returnRecord.taxYear}
                </p>
              </div>
            </div>

            <div className="rounded-xl border px-3 py-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {returnRecord.status.replace(/_/g, " ")}
              </span>
              {returnRecord.externalId ? (
                <span className="ml-2 font-mono text-xs">{returnRecord.externalId}</span>
              ) : null}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
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
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                    isActive
                      ? "border-foreground/20 bg-foreground text-background"
                      : "border-border/70 bg-background hover:bg-muted/40",
                  )}
                >
                  <Icon className="size-4" />
                  {tab.label}
                </Link>
              );
            })}
          </div>
        </section>

        <div>{children}</div>
      </div>
    </div>
  );
}
