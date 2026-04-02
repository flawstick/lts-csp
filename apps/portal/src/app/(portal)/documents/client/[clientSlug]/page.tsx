"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronRight,
  FileText,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Folder from "@/components/Folder";
import { DocumentsBackLink } from "../../_components/documents-back-link";
import {
  buildFolderPreviewItems,
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

  return (
    <main className="mx-auto max-w-6xl space-y-3 pb-10">
      <section className="portal-card p-5">
        <div className="space-y-2">
          <DocumentsBackLink href="/documents" label="Back to clients" />
          <div>
            <h1 className="text-lg font-semibold tracking-tight [overflow-wrap:anywhere]">
              {client ? client.name : "Clients"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a return to review files and available autofill from prior Guernsey filings.
            </p>
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
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filteredReturns.map((returnFolder) => {
            const href = getReturnHref(client.slug, returnFolder.id);
            const filePreview = returnFolder.files.slice(0, 2);
            const folderItems = buildFolderPreviewItems(
              returnFolder.files.map((file) => file.name),
            );

            return (
              <Link
                key={returnFolder.id}
                href={href}
                prefetch
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                className="portal-card group rounded-xl border border-border/60 p-4 transition hover:bg-muted/20"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {returnFolder.taxYear}
                      </span>
                      <span className="rounded-full border border-border/60 bg-background/85 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {returnFolder.jurisdictionCode}
                      </span>
                      {returnFolder.autofillFieldCount > 0 ? (
                        <span className="rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300">
                          {returnFolder.autofillFieldCount} autofill
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2.5 text-sm font-semibold leading-tight [overflow-wrap:anywhere]">
                      {returnFolder.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {returnFolder.jurisdictionName}
                    </p>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <Sparkles className="size-3.5" />
                    Autofill
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {returnFolder.autofillFields.length > 0 ? (
                      <>
                        {returnFolder.autofillFields.slice(0, 3).map((field) => (
                          <span
                            key={field.key}
                            className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300"
                          >
                            {field.label}
                          </span>
                        ))}
                        {returnFolder.autofillFields.length > 3 ? (
                          <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            +{returnFolder.autofillFields.length - 3} more
                          </span>
                        ) : null}
                        {returnFolder.autofillSourceTaxYear ? (
                          <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            From {returnFolder.autofillSourceTaxYear}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No autofill available for this return.
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    <FileText className="size-3.5" />
                    Files
                  </div>
                  {filePreview.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {filePreview.map((file) => (
                        <div
                          key={`${returnFolder.id}-${file.url}`}
                          className="truncate rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"
                        >
                          {file.name}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">
                      No files uploaded yet.
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-end justify-between gap-4 border-t border-border/50 pt-3">
                  <div className="min-w-0 text-xs text-muted-foreground">
                    <p>{returnFolder.files.length} file{returnFolder.files.length === 1 ? "" : "s"} attached</p>
                    <p className="mt-1 truncate">Updated {formatDateTime(returnFolder.updatedAt)}</p>
                  </div>
                  <Folder
                    color={getFolderColor(returnFolder.id)}
                    size={0.62}
                    items={folderItems}
                    className="shrink-0"
                  />
                </div>
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
