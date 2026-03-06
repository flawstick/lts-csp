"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, FileText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Folder from "@/components/Folder";
import {
  buildFolderPreviewItems,
  getClientHref,
  getFolderColor,
  useDocumentsTree,
} from "./_components/documents-tree";
import { DocumentsFilterCard } from "./_components/documents-filter-card";
import { DocumentsFilterCardSkeleton, DocumentsFolderGridSkeleton } from "./_components/documents-skeletons";

type ClientFilter = "all" | "multi_return" | "with_files";

const CLIENT_FILTER_OPTIONS: Array<{ label: string; value: ClientFilter }> = [
  { value: "all", label: "All clients" },
  { value: "multi_return", label: "Multi-return clients" },
  { value: "with_files", label: "With files" },
];

export default function DocumentsPage() {
  const router = useRouter();
  const { clients, error, isLoading } = useDocumentsTree();
  const [searchValue, setSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState<ClientFilter>("all");

  const filteredClients = useMemo(() => {
    const query = searchValue.trim().toLowerCase();

    return clients.filter((client) => {
      if (filterValue === "multi_return" && client.returns.length < 2) {
        return false;
      }
      if (filterValue === "with_files" && client.totalFiles === 0) {
        return false;
      }

      if (!query) return true;

      return (
        client.name.toLowerCase().includes(query) ||
        client.orgName.toLowerCase().includes(query) ||
        client.returns.some((row) => `${row.taxYear}`.includes(query) || row.jurisdictionCode.toLowerCase().includes(query))
      );
    });
  }, [clients, filterValue, searchValue]);

  useEffect(() => {
    filteredClients.slice(0, 8).forEach((client) => {
      router.prefetch(getClientHref(client.slug));
    });
  }, [filteredClients, router]);

  return (
    <main className="mx-auto max-w-6xl space-y-3 pb-10">
      <section className="portal-card relative overflow-hidden p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,0.18),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.14),transparent_52%)]" />
        <div className="relative">
          <h1 className="text-xl font-semibold tracking-tight">Documents Explorer</h1>
          <p className="mt-1 text-sm text-muted-foreground">Open a client folder to browse yearly return folders and files.</p>
        </div>
      </section>

      {!isLoading && !error ? (
        <DocumentsFilterCard
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search client, org, year, or jurisdiction code"
          filterLabel="Filter"
          filterValue={filterValue}
          onFilterChange={(value) => setFilterValue(value as ClientFilter)}
          filterOptions={CLIENT_FILTER_OPTIONS}
          resultLabel={`${filteredClients.length}/${clients.length} clients`}
        />
      ) : null}

      {isLoading ? <DocumentsFilterCardSkeleton /> : null}

      {isLoading ? <DocumentsFolderGridSkeleton /> : null}

      {error ? <p className="px-1 text-sm text-red-600">{error.message}</p> : null}

      {!isLoading && !error && clients.length === 0 ? (
        <section className="portal-card border-dashed p-10 text-center text-sm text-muted-foreground">
          No clients or files are available yet.
        </section>
      ) : null}

      {!isLoading && !error && filteredClients.length > 0 ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredClients.map((client) => {
            const href = getClientHref(client.slug);

            return (
              <Link
                key={client.id}
                href={href}
                prefetch
                onMouseEnter={() => router.prefetch(href)}
                onFocus={() => router.prefetch(href)}
                className="portal-card group cursor-pointer rounded-2xl p-4 text-left transition hover:-translate-y-0.5 hover:bg-muted/25"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
                    <Folder
                      color={getFolderColor(client.id)}
                      size={0.82}
                      items={buildFolderPreviewItems(client.returns.map((row) => `${row.taxYear}`))}
                      className="shrink-0"
                    />
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <p className="font-semibold leading-tight [overflow-wrap:anywhere]">{client.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">{client.orgName}</p>
                    </div>
                  </div>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
                    <Building2 className="size-3.5" />
                    {client.returns.length} return folder(s)
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md border bg-muted/30 px-2 py-1">
                    <FileText className="size-3.5" />
                    {client.totalFiles} file(s)
                  </span>
                </div>
              </Link>
            );
          })}
        </section>
      ) : null}

      {!isLoading && !error && clients.length > 0 && filteredClients.length === 0 ? (
        <section className="portal-card border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients match your search/filter.
        </section>
      ) : null}
    </main>
  );
}
