"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChevronRight, FileText } from "lucide-react";
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
import { DocumentsFilterCard, type FilterOption } from "../../_components/documents-filter-card";
import { DocumentsFilterCardSkeleton, DocumentsFolderGridSkeleton } from "../../_components/documents-skeletons";

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

    const years = Array.from(new Set(client.returns.map((item) => item.taxYear))).sort((a, b) => b - a);
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
      <section className="portal-card relative overflow-hidden p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.14),transparent_52%)]" />
        <div className="relative space-y-2">
          <DocumentsBackLink href="/documents" label="Back to clients" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
              {client ? client.name : "Client folders"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Choose a return folder to open its files.</p>
          </div>
        </div>
      </section>

      {!isLoading && !error && client ? (
        <DocumentsFilterCard
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search return folder, jurisdiction, or year"
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
          Client folder not found.
        </section>
      ) : null}

      {!isLoading && !error && client && filteredReturns.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredReturns.map((returnFolder) => {
            const href = getReturnHref(client.slug, returnFolder.id);
            const hiddenFiles = Math.max(returnFolder.files.length - 3, 0);

            return (
              <Link
                key={returnFolder.id}
                href={href}
                prefetch
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                className="portal-card group cursor-pointer rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:bg-muted/25"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                    <Folder
                      color={getFolderColor(returnFolder.id)}
                      size={0.82}
                      items={buildFolderPreviewItems(returnFolder.files.map((file) => file.name))}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="font-semibold leading-tight [overflow-wrap:anywhere]">{returnFolder.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                        {returnFolder.jurisdictionCode} • Updated {formatDateTime(returnFolder.updatedAt)}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
                    <FileText className="size-3.5" />
                    {returnFolder.files.length} file(s)
                  </span>
                  {hiddenFiles > 0 ? (
                    <span className="inline-flex rounded-md border border-primary/35 bg-primary/10 px-2 py-1 text-primary">
                      +{hiddenFiles} more inside
                    </span>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </section>
      ) : null}

      {!isLoading && !error && client && filteredReturns.length === 0 ? (
        <section className="portal-card border-dashed p-8 text-center text-sm text-muted-foreground">
          No return folders match your search/filter.
        </section>
      ) : null}
    </main>
  );
}
