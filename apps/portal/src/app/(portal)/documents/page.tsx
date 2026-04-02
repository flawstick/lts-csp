"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronRight, FileText, FolderArchive, LayoutGrid, Rows3, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import Folder from "@/components/Folder";
import { Button } from "@/components/ui/button";
import {
  buildFolderPreviewItems,
  getClientHref,
  getFolderColor,
  type ClientFolder,
  useDocumentsTree,
} from "./_components/documents-tree";
import { DocumentsFilterCard } from "./_components/documents-filter-card";
import { DocumentsFilterCardSkeleton, DocumentsFolderGridSkeleton } from "./_components/documents-skeletons";

type ClientFilter = "all" | "multi_return" | "with_files";
type ViewMode = "grid" | "list";

const CLIENT_FILTER_OPTIONS: Array<{ label: string; value: ClientFilter }> = [
  { value: "all", label: "All clients" },
  { value: "multi_return", label: "Multi-return clients" },
  { value: "with_files", label: "With files" },
];

function ClientViewToggle({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (next: ViewMode) => void;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-xl border border-muted-foreground/20 bg-background/75 p-1">
      <Button
        type="button"
        size="sm"
        variant={value === "grid" ? "default" : "ghost"}
        className="h-7 rounded-lg px-2.5"
        onClick={() => onChange("grid")}
      >
        <LayoutGrid className="size-3.5" />
        <span className="sr-only">Grid view</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "list" ? "default" : "ghost"}
        className="h-7 rounded-lg px-2.5"
        onClick={() => onChange("list")}
      >
        <Rows3 className="size-3.5" />
        <span className="sr-only">List view</span>
      </Button>
    </div>
  );
}

function collectAutofillLabels(client: ClientFolder) {
  return Array.from(
    new Set(
      client.returns.flatMap((returnFolder) =>
        returnFolder.autofillFields.map((field) => field.label),
      ),
    ),
  );
}

export default function DocumentsPage() {
  const router = useRouter();
  const { clients, error, isLoading } = useDocumentsTree();
  const [searchValue, setSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState<ClientFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  useEffect(() => {
    const saved = window.localStorage.getItem("portal-clients-view");
    if (saved === "grid" || saved === "list") {
      setViewMode(saved);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("portal-clients-view", viewMode);
  }, [viewMode]);

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
      <section className="portal-card p-5">
        <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
        <p className="mt-1 text-sm text-muted-foreground">Open a client to browse yearly return folders, files, and available autofill from prior Guernsey returns.</p>
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
          actions={
            <ClientViewToggle value={viewMode} onChange={setViewMode} />
          }
        />
      ) : null}

      {isLoading ? <DocumentsFilterCardSkeleton /> : null}

      {isLoading ? <DocumentsFolderGridSkeleton /> : null}

      {error ? <p className="px-1 text-sm text-red-600">{error.message}</p> : null}

      {!isLoading && !error && clients.length === 0 ? (
        <section className="portal-card border-dashed p-10 text-center text-sm text-muted-foreground">
          No clients or return files are available yet.
        </section>
      ) : null}

      {!isLoading && !error && filteredClients.length > 0 ? (
        viewMode === "grid" ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filteredClients.map((client) => {
              const href = getClientHref(client.slug);
              const autofillLabels = collectAutofillLabels(client);
              const returnPreview = client.returns.slice(0, 3);

              return (
                <Link
                  key={client.id}
                  href={href}
                  prefetch
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  className="portal-card group relative cursor-pointer overflow-hidden rounded-[1.7rem] border border-border/60 p-5 text-left transition hover:-translate-y-0.5 hover:bg-muted/25"
                >
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-r from-sky-500/[0.12] via-emerald-500/[0.08] to-transparent" />
                  <div className="relative flex items-start justify-between gap-3">
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

                  <div className="relative mt-4 flex flex-wrap items-center gap-2 text-xs">
                    <span className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1">
                      <Building2 className="size-3.5" />
                      {client.returns.length} return folder{client.returns.length === 1 ? "" : "s"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md border bg-background/80 px-2 py-1">
                      <FileText className="size-3.5" />
                      {client.totalFiles} file{client.totalFiles === 1 ? "" : "s"}
                    </span>
                    {client.autofillReadyCount > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/30 bg-blue-500/10 px-2 py-1 text-blue-700 dark:text-blue-300">
                        <Sparkles className="size-3.5" />
                        {client.autofillReadyCount} autofill-ready
                      </span>
                    ) : null}
                  </div>

                  <div className="relative mt-4 rounded-2xl border border-border/60 bg-background/70 p-3.5">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      <FolderArchive className="size-3.5" />
                      Folder preview
                    </div>
                    <div className="mt-3 space-y-2">
                      {returnPreview.map((row) => (
                        <div
                          key={row.id}
                          className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-muted/20 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{row.taxYear} return</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {row.jurisdictionCode} • {row.files.length} file{row.files.length === 1 ? "" : "s"}
                            </p>
                          </div>
                          {row.autofillFieldCount > 0 ? (
                            <span className="shrink-0 rounded-full border border-blue-500/25 bg-blue-500/[0.08] px-2 py-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                              {row.autofillFieldCount} autofill
                            </span>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="relative mt-4">
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      <Sparkles className="size-3.5" />
                      Available autofill
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {autofillLabels.length > 0 ? (
                        <>
                          {autofillLabels.slice(0, 4).map((label) => (
                            <span
                              key={label}
                              className="inline-flex rounded-full border border-blue-500/25 bg-blue-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300"
                            >
                              {label}
                            </span>
                          ))}
                          {autofillLabels.length > 4 ? (
                            <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                              +{autofillLabels.length - 4} more
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          No prior-return autofill detected yet.
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="portal-card overflow-hidden rounded-[1.75rem] p-0">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(10rem,0.8fr)_minmax(0,1.2fr)] gap-4 border-b border-border/60 bg-muted/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span>Client</span>
              <span>Folders</span>
              <span>Files</span>
              <span>Autofill</span>
            </div>
            <div className="divide-y divide-border/60">
              {filteredClients.map((client) => {
                const href = getClientHref(client.slug);
                const autofillLabels = collectAutofillLabels(client);
                const years = client.returns.slice(0, 4).map((row) => row.taxYear);

                return (
                  <Link
                    key={client.id}
                    href={href}
                    prefetch
                    onMouseEnter={() => router.prefetch(href)}
                    onFocus={() => router.prefetch(href)}
                    className="group grid grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(10rem,0.8fr)_minmax(0,1.2fr)] gap-4 px-4 py-4 transition hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div
                          className="size-3 rounded-full ring-4 ring-background"
                          style={{ backgroundColor: getFolderColor(client.id) }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{client.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{client.orgName}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {years.map((year) => (
                        <span
                          key={year}
                          className="rounded-full border bg-background/80 px-2.5 py-1 text-[11px] font-medium"
                        >
                          {year}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{client.returns.length} folders</span>
                      <span className="text-border">•</span>
                      <span>{client.totalFiles} files</span>
                    </div>
                    <div className="flex min-w-0 items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        {autofillLabels.length > 0 ? (
                          <p className="truncate text-sm text-blue-700 dark:text-blue-300">
                            {autofillLabels.slice(0, 2).join(" • ")}
                            {autofillLabels.length > 2 ? ` +${autofillLabels.length - 2}` : ""}
                          </p>
                        ) : (
                          <p className="truncate text-sm text-muted-foreground">
                            No prior-return autofill
                          </p>
                        )}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )
      ) : null}

      {!isLoading && !error && clients.length > 0 && filteredClients.length === 0 ? (
        <section className="portal-card border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients match your search/filter.
        </section>
      ) : null}
    </main>
  );
}
