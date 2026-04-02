"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  FileText,
  LayoutGrid,
  Rows3,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getClientHref,
  getFolderColor,
  type ClientFolder,
  useDocumentsTree,
} from "./_components/documents-tree";
import { DocumentsFilterCard } from "./_components/documents-filter-card";
import {
  DocumentsFilterCardSkeleton,
  DocumentsFolderGridSkeleton,
} from "./_components/documents-skeletons";

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
    <div className="inline-flex h-9 items-center rounded-2xl border border-border/60 bg-background/75 p-1">
      <Button
        type="button"
        size="sm"
        variant={value === "grid" ? "default" : "ghost"}
        className="h-7 rounded-xl px-3"
        onClick={() => onChange("grid")}
      >
        <LayoutGrid className="size-3.5" />
        <span className="hidden sm:inline">Cards</span>
        <span className="sr-only">Card view</span>
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "list" ? "default" : "ghost"}
        className="h-7 rounded-xl px-3"
        onClick={() => onChange("list")}
      >
        <Rows3 className="size-3.5" />
        <span className="hidden sm:inline">List</span>
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

function getClientMonogram(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return letters || "CL";
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
        client.returns.some(
          (row) =>
            `${row.taxYear}`.includes(query) ||
            row.jurisdictionCode.toLowerCase().includes(query),
        )
      );
    });
  }, [clients, filterValue, searchValue]);

  const overview = useMemo(() => {
    const totalReturns = clients.reduce((sum, client) => sum + client.returns.length, 0);
    const totalFiles = clients.reduce((sum, client) => sum + client.totalFiles, 0);
    const autofillReadyClients = clients.filter((client) => client.autofillReadyCount > 0).length;

    return {
      totalReturns,
      totalFiles,
      autofillReadyClients,
    };
  }, [clients]);

  useEffect(() => {
    filteredClients.slice(0, 8).forEach((client) => {
      router.prefetch(getClientHref(client.slug));
    });
  }, [filteredClients, router]);

  return (
    <main className="mx-auto max-w-6xl space-y-3 pb-10">
      <section className="portal-card overflow-hidden rounded-[2rem] border border-border/60 p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.3fr)_22rem]">
          <div className="relative overflow-hidden p-6">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.18),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(16,185,129,0.14),transparent_36%)]" />
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                <Building2 className="size-3.5" />
                Clients
              </div>
              <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Open companies directly.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
                Browse each client as an account workspace with returns, uploaded files,
                and prior-return autofill availability in one place.
              </p>

              <div className="mt-6 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-sm">
                  <Building2 className="size-4 text-sky-600 dark:text-sky-300" />
                  {clients.length} clients
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-sm">
                  <FileText className="size-4 text-emerald-600 dark:text-emerald-300" />
                  {overview.totalReturns} returns
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/[0.08] px-3 py-1.5 text-sm text-blue-700 dark:text-blue-300">
                  <Sparkles className="size-4" />
                  {overview.autofillReadyClients} autofill-ready clients
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-border/60 bg-muted/20 p-6 lg:border-l lg:border-t-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Coverage
            </p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Files tracked</span>
                  <span className="text-lg font-semibold">{overview.totalFiles}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Clients with prior data</span>
                  <span className="text-lg font-semibold">{overview.autofillReadyClients}</span>
                </div>
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/85 p-4">
                <p className="text-sm text-muted-foreground">
                  Open a client to inspect return history, filed PDFs, financial statements,
                  and the exact fields that can be auto-initialized in GRS.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {!isLoading && !error ? (
        <DocumentsFilterCard
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search client, organisation, year, or jurisdiction"
          filterLabel="Filter"
          filterValue={filterValue}
          onFilterChange={(value) => setFilterValue(value as ClientFilter)}
          filterOptions={CLIENT_FILTER_OPTIONS}
          resultLabel={`${filteredClients.length}/${clients.length} clients`}
          actions={<ClientViewToggle value={viewMode} onChange={setViewMode} />}
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
              const clientColor = getFolderColor(client.id);

              return (
                <Link
                  key={client.id}
                  href={href}
                  prefetch
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  className="portal-card group relative overflow-hidden rounded-[1.85rem] border border-border/60 p-5 transition hover:-translate-y-0.5 hover:bg-muted/20"
                >
                  <div
                    className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-80"
                    style={{
                      background: `linear-gradient(135deg, ${clientColor}26 0%, ${clientColor}10 42%, transparent 100%)`,
                    }}
                  />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div
                          className="mb-4 flex size-14 items-center justify-center rounded-[1.4rem] border border-white/50 text-base font-semibold text-slate-900 shadow-sm"
                          style={{
                            background: `linear-gradient(145deg, ${clientColor}25, ${clientColor}55)`,
                          }}
                        >
                          {getClientMonogram(client.name)}
                        </div>
                        <p className="text-base font-semibold leading-tight [overflow-wrap:anywhere]">
                          {client.name}
                        </p>
                        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted-foreground [overflow-wrap:anywhere]">
                          {client.orgName}
                        </p>
                      </div>

                      <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2">
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Returns
                        </p>
                        <p className="mt-2 text-lg font-semibold">{client.returns.length}</p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Files
                        </p>
                        <p className="mt-2 text-lg font-semibold">{client.totalFiles}</p>
                      </div>
                      <div className="rounded-2xl border border-border/60 bg-background/80 p-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                          Autofill
                        </p>
                        <p className="mt-2 text-lg font-semibold">{client.autofillReadyCount}</p>
                      </div>
                    </div>

                    <div className="mt-5 rounded-[1.4rem] border border-border/60 bg-background/75 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                          Recent returns
                        </p>
                        <span className="text-xs text-muted-foreground">
                          {returnPreview[0]?.taxYear ?? "No history"}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2.5">
                        {returnPreview.map((row) => (
                          <div
                            key={row.id}
                            className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-muted/20 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{row.taxYear} return</p>
                              <p className="truncate text-[11px] text-muted-foreground">
                                {row.jurisdictionCode} • {row.files.length} file
                                {row.files.length === 1 ? "" : "s"}
                              </p>
                            </div>
                            {row.autofillFieldCount > 0 ? (
                              <span className="shrink-0 rounded-full border border-blue-500/25 bg-blue-500/[0.08] px-2 py-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                {row.autofillFieldCount} fields
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="mt-5">
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
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="portal-card overflow-hidden rounded-[1.85rem] border border-border/60 p-0">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(10rem,0.75fr)_minmax(0,1.2fr)] gap-4 border-b border-border/60 bg-muted/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              <span>Client</span>
              <span>Recent years</span>
              <span>Coverage</span>
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
                    className="group grid grid-cols-[minmax(0,1.4fr)_minmax(12rem,0.8fr)_minmax(10rem,0.75fr)_minmax(0,1.2fr)] gap-4 px-4 py-4 transition hover:bg-muted/20"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <div
                          className="flex size-9 items-center justify-center rounded-2xl text-xs font-semibold text-slate-900"
                          style={{
                            background: `linear-gradient(145deg, ${getFolderColor(client.id)}22, ${getFolderColor(client.id)}55)`,
                          }}
                        >
                          {getClientMonogram(client.name)}
                        </div>
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
                      <span>{client.returns.length} returns</span>
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
