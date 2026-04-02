"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  Clock3,
  FileText,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { DocumentsBackLink } from "../../_components/documents-back-link";
import {
  formatDateTime,
  getFolderColor,
  getReturnHref,
  useDocumentsTree,
} from "../../_components/documents-tree";
import {
  DocumentsFilterCard,
  type FilterOption,
} from "../../_components/documents-filter-card";
import {
  DocumentsFilterCardSkeleton,
  DocumentsFolderGridSkeleton,
} from "../../_components/documents-skeletons";

export default function ClientDocumentsPage() {
  const params = useParams<{ clientSlug: string }>();
  const router = useRouter();
  const { clients, error, isLoading } = useDocumentsTree();
  const [searchValue, setSearchValue] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  const clientSlug = params.clientSlug;
  const client = useMemo(
    () => clients.find((entry) => entry.slug === clientSlug) ?? null,
    [clientSlug, clients],
  );
  const yearOptions = useMemo<FilterOption[]>(() => {
    if (!client) return [{ label: "All years", value: "all" }];

    const years = Array.from(new Set(client.returns.map((item) => item.taxYear))).sort(
      (a, b) => b - a,
    );
    return [
      { label: "All years", value: "all" },
      ...years.map((year) => ({ label: `${year}`, value: `${year}` })),
    ];
  }, [client]);
  const filteredReturns = useMemo(() => {
    if (!client) return [];
    const query = searchValue.trim().toLowerCase();

    return client.returns.filter((returnFolder) => {
      if (yearFilter !== "all" && `${returnFolder.taxYear}` !== yearFilter) {
        return false;
      }

      if (!query) return true;

      return (
        returnFolder.name.toLowerCase().includes(query) ||
        returnFolder.jurisdictionCode.toLowerCase().includes(query) ||
        returnFolder.jurisdictionName.toLowerCase().includes(query) ||
        `${returnFolder.taxYear}`.includes(query)
      );
    });
  }, [client, searchValue, yearFilter]);

  useEffect(() => {
    if (!client || !filteredReturns.length) return;

    filteredReturns.slice(0, 10).forEach((returnFolder) => {
      router.prefetch(getReturnHref(client.slug, returnFolder.id));
    });
  }, [client, filteredReturns, router]);

  const clientSummary = useMemo(() => {
    if (!client) {
      return {
        files: 0,
        latestYear: null as number | null,
      };
    }

    return {
      files: client.totalFiles,
      latestYear: client.returns[0]?.taxYear ?? null,
    };
  }, [client]);

  return (
    <main className="mx-auto max-w-6xl space-y-3 pb-10">
      <section className="portal-card overflow-hidden rounded-[1.9rem] border border-border/60 p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.25fr)_20rem]">
          <div className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.14),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.12),transparent_35%)]" />
            <div className="relative space-y-3">
              <DocumentsBackLink href="/documents" label="Back to clients" />
              <div>
                <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere]">
                  {client ? client.name : "Clients"}
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                  Review this client’s return history, open their files, and see what
                  can be initialized from the previous Guernsey return.
                </p>
              </div>

              {client ? (
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-sm">
                    <Building2 className="size-4 text-sky-600 dark:text-sky-300" />
                    {client.orgName}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-sm">
                    <FileText className="size-4 text-emerald-600 dark:text-emerald-300" />
                    {client.returns.length} returns
                  </span>
                  {client.autofillReadyCount > 0 ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-3 py-1.5 text-sm text-blue-700 dark:text-blue-300">
                      <Sparkles className="size-4" />
                      {client.autofillReadyCount} autofill-ready
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="border-t border-border/60 bg-muted/20 p-6 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Snapshot
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Latest return</span>
                  <span className="text-lg font-semibold">
                    {clientSummary.latestYear ?? "N/A"}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Files tracked</span>
                  <span className="text-lg font-semibold">{clientSummary.files}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!isLoading && !error && client ? (
        <DocumentsFilterCard
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search return, jurisdiction, or year"
          filterLabel="Year"
          filterValue={yearFilter}
          onFilterChange={setYearFilter}
          filterOptions={yearOptions}
          resultLabel={`${filteredReturns.length}/${client.returns.length} returns`}
        />
      ) : null}

      {isLoading ? <DocumentsFilterCardSkeleton /> : null}
      {isLoading ? <DocumentsFolderGridSkeleton /> : null}
      {error ? <p className="px-1 text-sm text-red-600">{error.message}</p> : null}

      {!isLoading && !error && !client ? (
        <section className="portal-card p-10 text-center text-sm text-muted-foreground">
          Client not found.
        </section>
      ) : null}

      {!isLoading && !error && client && filteredReturns.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredReturns.map((returnFolder) => {
            const href = getReturnHref(client.slug, returnFolder.id);
            const accentColor = getFolderColor(returnFolder.id);
            const filePreview = returnFolder.files.slice(0, 3);

            return (
              <Link
                key={returnFolder.id}
                href={href}
                prefetch
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                className="portal-card group relative overflow-hidden rounded-[1.7rem] border border-border/60 p-5 transition hover:-translate-y-0.5 hover:bg-muted/20"
              >
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 h-1"
                  style={{ backgroundColor: accentColor }}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {returnFolder.taxYear}
                      </span>
                      <span className="rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {returnFolder.jurisdictionCode}
                      </span>
                    </div>
                    <p className="mt-3 text-base font-semibold leading-tight [overflow-wrap:anywhere]">
                      {returnFolder.name}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                      {returnFolder.jurisdictionName}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1">
                    <FileText className="size-3.5" />
                    {returnFolder.files.length} file{returnFolder.files.length === 1 ? "" : "s"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1 text-muted-foreground">
                    <Clock3 className="size-3.5" />
                    Updated {formatDateTime(returnFolder.updatedAt)}
                  </span>
                  {returnFolder.autofillFieldCount > 0 ? (
                    <span className="inline-flex rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-700 dark:text-blue-300">
                      {returnFolder.autofillFieldCount} autofill field
                      {returnFolder.autofillFieldCount === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>

                <div className="mt-4 rounded-[1.35rem] border border-border/60 bg-background/75 p-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <FileText className="size-3.5" />
                    File preview
                  </div>
                  <div className="mt-3 space-y-2">
                    {filePreview.length > 0 ? (
                      filePreview.map((file) => (
                        <div
                          key={`${returnFolder.id}-${file.url}`}
                          className="truncate rounded-xl border border-border/50 bg-muted/20 px-3 py-2 text-sm"
                        >
                          {file.name}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No files uploaded yet for this return.
                      </p>
                    )}
                  </div>
                </div>

                {returnFolder.autofillFields.length > 0 ? (
                  <div className="mt-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      <Sparkles className="size-3.5" />
                      Autofill from {returnFolder.autofillSourceTaxYear}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {returnFolder.autofillFields.slice(0, 4).map((field) => (
                        <span
                          key={field.key}
                          className="inline-flex rounded-full border border-blue-500/25 bg-blue-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300"
                        >
                          {field.label}
                        </span>
                      ))}
                      {returnFolder.autofillFields.length > 4 ? (
                        <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                          +{returnFolder.autofillFields.length - 4} more
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </section>
      ) : null}

      {!isLoading && !error && client && filteredReturns.length === 0 ? (
        <section className="portal-card border-dashed p-8 text-center text-sm text-muted-foreground">
          No returns match your search/filter.
        </section>
      ) : null}
    </main>
  );
}
