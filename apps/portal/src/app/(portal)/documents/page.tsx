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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  getClientHref,
  getFolderColor,
  useDocumentsTree,
} from "./_components/documents-tree";
import { DocumentsFilterCard } from "./_components/documents-filter-card";
import {
  DocumentsFilterCardSkeleton,
  DocumentsFolderGridSkeleton,
} from "./_components/documents-skeletons";

type ClientFilter = "all" | "multi_return" | "with_files";
type ViewMode = "grid" | "list";

const PAGE_SIZE = 12;

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

function getClientMonogram(name: string) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return letters || "CL";
}

function ClientMonogram({ name, id }: { name: string; id: string }) {
  const color = getFolderColor(id);
  return (
    <div
      className="flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
      style={{
        backgroundColor: `${color}14`,
        color,
      }}
    >
      {getClientMonogram(name)}
    </div>
  );
}

export default function DocumentsPage() {
  const router = useRouter();
  const { clients, error, isLoading } = useDocumentsTree();
  const [searchValue, setSearchValue] = useState("");
  const [filterValue, setFilterValue] = useState<ClientFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

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

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [searchValue, filterValue]);

  const visibleClients = useMemo(
    () => filteredClients.slice(0, visibleCount),
    [filteredClients, visibleCount],
  );
  const hasMore = visibleCount < filteredClients.length;

  // Infinite scroll: load more when sentinel enters viewport
  const loadMore = useCallback(() => {
    setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, filteredClients.length));
  }, [filteredClients.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  useEffect(() => {
    visibleClients.slice(0, 8).forEach((client) => {
      router.prefetch(getClientHref(client.slug));
    });
  }, [visibleClients, router]);

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
            {visibleClients.map((client) => {
              const href = getClientHref(client.slug);
              const years = Array.from(
                new Set(client.returns.map((r) => r.taxYear)),
              )
                .sort((a, b) => b - a)
                .slice(0, 4);

              return (
                <Link
                  key={client.id}
                  href={href}
                  prefetch
                  onMouseEnter={() => router.prefetch(href)}
                  onFocus={() => router.prefetch(href)}
                  className="portal-card group flex flex-col rounded-xl border border-border/60 p-4 transition hover:border-border hover:bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <ClientMonogram name={client.name} id={client.id} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold leading-snug">
                          {client.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {client.orgName}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="mt-2.5 size-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                  </div>

                  <div className="mt-auto pt-4">
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <FileText className="size-3" />
                        {client.returns.length} return{client.returns.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-border/80">|</span>
                      <span>{client.totalFiles} file{client.totalFiles !== 1 ? "s" : ""}</span>
                      {client.autofillFieldCount > 0 ? (
                        <>
                          <span className="text-border/80">|</span>
                          <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Sparkles className="size-3" />
                            {client.autofillFieldCount} autofill
                          </span>
                        </>
                      ) : null}
                    </div>

                    {years.length > 0 ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {years.map((year) => (
                          <span
                            key={year}
                            className="rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                          >
                            {year}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="portal-card overflow-hidden rounded-xl border border-border/60 p-0">
            <div className="hidden border-b border-border/60 bg-muted/30 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1.5fr)_8rem_10rem_minmax(0,1fr)_1.25rem] sm:gap-4">
              <span>Client</span>
              <span>Years</span>
              <span>Coverage</span>
              <span>Autofill</span>
              <span />
            </div>
            <div className="divide-y divide-border/50">
              {visibleClients.map((client) => {
                const href = getClientHref(client.slug);
                const years = Array.from(
                  new Set(client.returns.map((r) => r.taxYear)),
                )
                  .sort((a, b) => b - a)
                  .slice(0, 4);

                return (
                  <Link
                    key={client.id}
                    href={href}
                    prefetch
                    onMouseEnter={() => router.prefetch(href)}
                    onFocus={() => router.prefetch(href)}
                    className="group flex flex-col gap-2 px-4 py-3.5 transition hover:bg-muted/20 sm:grid sm:grid-cols-[minmax(0,1.5fr)_8rem_10rem_minmax(0,1fr)_1.25rem] sm:items-center sm:gap-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <ClientMonogram name={client.name} id={client.id} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{client.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {client.orgName}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pl-[3.25rem] sm:pl-0">
                      {years.map((year) => (
                        <span
                          key={year}
                          className="rounded-md bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        >
                          {year}
                        </span>
                      ))}
                    </div>

                    <p className="pl-[3.25rem] text-sm text-muted-foreground sm:pl-0">
                      {client.returns.length} return{client.returns.length !== 1 ? "s" : ""}
                      <span className="mx-1.5 text-border">·</span>
                      {client.totalFiles} file{client.totalFiles !== 1 ? "s" : ""}
                    </p>

                    <div className="min-w-0 pl-[3.25rem] sm:pl-0">
                      {client.autofillFieldCount > 0 ? (
                        <p className="truncate text-sm text-blue-600 dark:text-blue-400">
                          {client.autofillFieldCount} field{client.autofillFieldCount !== 1 ? "s" : ""}
                        </p>
                      ) : (
                        <p className="truncate text-sm text-muted-foreground/60">
                          None
                        </p>
                      )}
                    </div>

                    <ChevronRight className="hidden size-4 shrink-0 text-muted-foreground/40 transition group-hover:translate-x-0.5 group-hover:text-muted-foreground sm:block" />
                  </Link>
                );
              })}
            </div>
          </section>
        )
      ) : null}

      {hasMore ? (
        <div ref={sentinelRef} className="flex justify-center py-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 px-6"
            onClick={loadMore}
          >
            Show more ({filteredClients.length - visibleCount} remaining)
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && clients.length > 0 && filteredClients.length === 0 ? (
        <section className="portal-card border-dashed p-8 text-center text-sm text-muted-foreground">
          No clients match your search/filter.
        </section>
      ) : null}
    </main>
  );
}
