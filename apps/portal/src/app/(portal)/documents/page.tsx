"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  ChevronRight,
  LayoutGrid,
  Rows3,
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
  return client.autofillFields.map((field) => field.label);
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

  useEffect(() => {
    filteredClients.slice(0, 8).forEach((client) => {
      router.prefetch(getClientHref(client.slug));
    });
  }, [filteredClients, router]);

  return (
    <main className="mx-auto max-w-6xl space-y-3 pb-10">
      <section className="portal-card p-5">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 items-center justify-center rounded-lg border border-border/70 bg-muted/60 text-foreground">
            <Building2 className="size-4.5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Clients</h1>
            <p className="text-sm text-muted-foreground">
              Browse client returns, files, and autofill availability.
            </p>
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
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
                  className="portal-card group rounded-xl border border-border/60 p-4 transition hover:bg-muted/20"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50 text-xs font-semibold"
                        style={{ color: getFolderColor(client.id) }}
                      >
                        {getClientMonogram(client.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{client.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {client.orgName}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                    <span className="rounded-full border border-border/60 px-2 py-1 text-muted-foreground">
                      {client.returns.length} returns
                    </span>
                    <span className="rounded-full border border-border/60 px-2 py-1 text-muted-foreground">
                      {client.totalFiles} files
                    </span>
                    {client.autofillFieldCount > 0 ? (
                      <span className="rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-2 py-1 text-blue-700 dark:text-blue-300">
                        {client.autofillFieldCount} autofill field{client.autofillFieldCount === 1 ? "" : "s"}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {returnPreview.map((row) => (
                      <span
                        key={row.id}
                        className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
                      >
                        {row.taxYear} {row.jurisdictionCode}
                      </span>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {autofillLabels.length > 0 ? (
                      <>
                        {autofillLabels.slice(0, 3).map((label) => (
                          <span
                            key={label}
                            className="inline-flex rounded-full border border-blue-500/20 bg-blue-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:text-blue-300"
                          >
                            {label}
                          </span>
                        ))}
                        {autofillLabels.length > 3 ? (
                          <span className="inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                            +{autofillLabels.length - 3}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No prior-return autofill
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="portal-card overflow-hidden rounded-xl border border-border/60 p-0">
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
