"use client";

import { useRouter } from "next/navigation";
import { ChevronRight, Search, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getClientHref,
  getFolderColor,
  useDocumentsTree,
  type ClientFolder,
} from "./_components/documents-tree";

type ClientFilter = "all" | "multi_return" | "with_files" | "with_autofill";

const PAGE_SIZE = 20;

const CLIENT_FILTER_OPTIONS: Array<{ label: string; value: ClientFilter }> = [
  { value: "all", label: "All clients" },
  { value: "multi_return", label: "Multi-return clients" },
  { value: "with_files", label: "With files" },
  { value: "with_autofill", label: "With autofill" },
];

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
      className="flex size-9 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
      style={{
        backgroundColor: `${color}26`,
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
  const [query, setQuery] = useState("");
  const [filterValue, setFilterValue] = useState<ClientFilter>("all");
  const [page, setPage] = useState(1);

  const filteredClients = useMemo(() => {
    const q = query.trim().toLowerCase();

    return clients.filter((client) => {
      if (filterValue === "multi_return" && client.returns.length < 2) return false;
      if (filterValue === "with_files" && client.totalFiles === 0) return false;
      if (filterValue === "with_autofill" && client.autofillFieldCount === 0) return false;

      if (!q) return true;

      return (
        client.name.toLowerCase().includes(q) ||
        client.orgName.toLowerCase().includes(q) ||
        client.returns.some(
          (row) =>
            `${row.taxYear}`.includes(q) ||
            row.jurisdictionCode.toLowerCase().includes(q),
        )
      );
    });
  }, [clients, filterValue, query]);

  useEffect(() => {
    setPage(1);
  }, [query, filterValue]);

  const totalCount = filteredClients.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(
    () =>
      filteredClients.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE,
      ),
    [filteredClients, currentPage],
  );

  useEffect(() => {
    pageRows.slice(0, 8).forEach((client) => {
      router.prefetch(getClientHref(client.slug));
    });
  }, [pageRows, router]);

  const totalReturns = clients.reduce((acc, c) => acc + c.returns.length, 0);
  const withAutofill = clients.filter((c) => c.autofillFieldCount > 0).length;

  return (
    <main className="mx-auto max-w-[1280px] space-y-4">
      <section className="portal-card overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4">
          <div>
            <h1 className="text-xl font-semibold">Clients</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Browse client returns, files, and autofill availability.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="bg-muted/40 text-muted-foreground rounded-lg border px-2.5 py-1.5">
              {isLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                `${clients.length} clients`
              )}
            </span>
            <span className="bg-muted/40 text-muted-foreground rounded-lg border px-2.5 py-1.5">
              {isLoading ? (
                <Skeleton className="h-4 w-16" />
              ) : (
                `${totalReturns} returns`
              )}
            </span>
            <span className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1.5 text-blue-700 dark:text-blue-300">
              {isLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="size-3" />
                  {withAutofill} autofill
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="bg-muted/20 flex flex-wrap items-center gap-2 border-b p-4">
          <div className="relative w-full max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search client, organisation, year, or jurisdiction"
              className="bg-background h-9 pl-9"
            />
          </div>

          <Select
            value={filterValue}
            onValueChange={(value) => setFilterValue(value as ClientFilter)}
          >
            <SelectTrigger
              aria-label="Filter clients"
              className="bg-background h-9 w-[200px]"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {CLIENT_FILTER_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-muted-foreground ml-auto text-xs">
            {isLoading ? (
              <Skeleton className="h-4 w-24" />
            ) : (
              `${totalCount}/${clients.length} shown`
            )}
          </span>
        </div>

        {error ? (
          <p className="p-6 text-sm text-red-600">{error.message}</p>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Organisation</th>
                <th className="px-4 py-3 font-medium">Years</th>
                <th className="px-4 py-3 font-medium">Returns</th>
                <th className="px-4 py-3 font-medium">Files</th>
                <th className="px-4 py-3 font-medium">Autofill</th>
                <th className="w-10 px-4 py-3 text-right font-medium">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, index) => (
                    <tr key={index} className="border-b last:border-b-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="size-9 rounded-lg" />
                          <Skeleton className="h-4 w-40" />
                        </div>
                      </td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="px-4 py-3"><Skeleton className="ml-auto size-4" /></td>
                    </tr>
                  ))
                : pageRows.map((client) => (
                    <ClientRow
                      key={client.id}
                      client={client}
                      onHover={() => router.prefetch(getClientHref(client.slug))}
                      onOpen={() => router.push(getClientHref(client.slug))}
                    />
                  ))}

              {!isLoading && !error && pageRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="text-muted-foreground px-4 py-10 text-center"
                  >
                    {clients.length === 0
                      ? "No clients or return files are available yet."
                      : "No clients match your search/filter."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {!isLoading && !error && totalCount > 0 ? (
          <div className="flex items-center justify-between border-t p-4 text-sm">
            <p className="text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}-
              {Math.min(currentPage * PAGE_SIZE, totalCount)} of {totalCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Prev
              </Button>
              <span className="text-muted-foreground text-xs">
                {currentPage} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function ClientRow({
  client,
  onHover,
  onOpen,
}: {
  client: ClientFolder;
  onHover: () => void;
  onOpen: () => void;
}) {
  const years = useMemo(
    () =>
      Array.from(new Set(client.returns.map((r) => r.taxYear)))
        .sort((a, b) => b - a)
        .slice(0, 4),
    [client.returns],
  );

  return (
    <tr
      className="hover:bg-muted/25 cursor-pointer border-b transition last:border-b-0"
      onMouseEnter={onHover}
      onFocus={onHover}
      onClick={onOpen}
    >
      <td className="px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <ClientMonogram name={client.name} id={client.id} />
          <p className="truncate font-medium">{client.name}</p>
        </div>
      </td>
      <td className="text-muted-foreground max-w-[220px] px-4 py-3">
        <p className="truncate">{client.orgName}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {years.length === 0 ? (
            <span className="text-muted-foreground text-xs">—</span>
          ) : (
            years.map((year) => (
              <span
                key={year}
                className="bg-muted/70 text-muted-foreground rounded-md px-1.5 py-0.5 text-[11px] font-medium"
              >
                {year}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="text-muted-foreground px-4 py-3">{client.returns.length}</td>
      <td className="text-muted-foreground px-4 py-3">{client.totalFiles}</td>
      <td className="px-4 py-3">
        {client.autofillFieldCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-md border border-blue-500/35 bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
            <Sparkles className="size-3" />
            {client.autofillFieldCount}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-xs">None</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <ChevronRight className="text-muted-foreground/60 ml-auto size-4" />
      </td>
    </tr>
  );
}
