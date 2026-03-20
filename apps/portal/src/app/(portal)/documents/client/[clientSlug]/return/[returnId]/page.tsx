"use client";

import { useParams } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";

import { DocumentsBackLink } from "../../../../_components/documents-back-link";
import { formatBytes, formatDateTime, getClientHref, useDocumentsTree } from "../../../../_components/documents-tree";
import { DocumentsFilterCard, type FilterOption } from "../../../../_components/documents-filter-card";
import { DocumentsFilesListSkeleton, DocumentsFilterCardSkeleton } from "../../../../_components/documents-skeletons";

type FileTypeFilter = "all" | "pdf" | "sheet" | "image" | "text" | "other";

function getFileTypeLabel(value: FileTypeFilter) {
  if (value === "pdf") return "PDF";
  if (value === "sheet") return "Spreadsheet";
  if (value === "image") return "Image";
  if (value === "text") return "Text/Docs";
  if (value === "other") return "Other";
  return "All types";
}

function detectFileType(name: string, type: string): FileTypeFilter {
  const haystack = `${name} ${type}`.toLowerCase();
  if (haystack.includes("pdf") || name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (
    haystack.includes("excel") ||
    haystack.includes("spreadsheet") ||
    haystack.includes("csv") ||
    haystack.includes("xls")
  ) {
    return "sheet";
  }
  if (
    haystack.includes("image") ||
    haystack.includes("png") ||
    haystack.includes("jpg") ||
    haystack.includes("jpeg") ||
    haystack.includes("webp") ||
    haystack.includes("gif")
  ) {
    return "image";
  }
  if (
    haystack.includes("text") ||
    haystack.includes("plain") ||
    haystack.includes("doc") ||
    haystack.includes("word")
  ) {
    return "text";
  }
  return "other";
}

export default function ReturnDocumentsPage() {
  const params = useParams<{ clientSlug: string; returnId: string }>();
  const { clients, error, isLoading } = useDocumentsTree();
  const [searchValue, setSearchValue] = useState("");
  const [typeFilter, setTypeFilter] = useState<FileTypeFilter>("all");

  const clientSlug = params.clientSlug;
  const returnId = params.returnId;

  const client = useMemo(
    () => clients.find((entry) => entry.slug === clientSlug) ?? null,
    [clientSlug, clients],
  );
  const returnFolder = useMemo(
    () => client?.returns.find((entry) => entry.id === returnId) ?? null,
    [client, returnId],
  );
  const typeOptions = useMemo<FilterOption[]>(() => {
    if (!returnFolder) {
      return [{ label: "All types", value: "all" }];
    }
    const available = new Set<FileTypeFilter>(["all"]);
    returnFolder.files.forEach((file) => available.add(detectFileType(file.name, file.type)));
    return Array.from(available).map((value) => ({
      value,
      label: getFileTypeLabel(value),
    }));
  }, [returnFolder]);
  const filteredFiles = useMemo(() => {
    if (!returnFolder) return [];
    const query = searchValue.trim().toLowerCase();

    return returnFolder.files.filter((file) => {
      const fileType = detectFileType(file.name, file.type);
      if (typeFilter !== "all" && fileType !== typeFilter) {
        return false;
      }
      if (!query) return true;
      return file.name.toLowerCase().includes(query) || file.type.toLowerCase().includes(query);
    });
  }, [returnFolder, searchValue, typeFilter]);

  return (
    <main className="mx-auto max-w-6xl space-y-3 pb-10">
      <section className="portal-card p-5">
        <div className="space-y-2">
          <DocumentsBackLink
            href={client ? getClientHref(client.slug) : "/documents"}
            label="Back to return folders"
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">
              {returnFolder ? returnFolder.name : "Return files"}
            </h1>
            {returnFolder ? (
              <p className="mt-1 text-sm text-muted-foreground [overflow-wrap:anywhere]">
                {returnFolder.jurisdictionName} ({returnFolder.jurisdictionCode}) • {returnFolder.taxYear}
              </p>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Open and review documents for this return.</p>
            )}
          </div>
        </div>
      </section>

      {!isLoading && !error && returnFolder ? (
        <DocumentsFilterCard
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          searchPlaceholder="Search file name or type"
          filterLabel="Type"
          filterValue={typeFilter}
          onFilterChange={(value) => setTypeFilter(value as FileTypeFilter)}
          filterOptions={typeOptions}
          resultLabel={`${filteredFiles.length}/${returnFolder.files.length} files`}
        />
      ) : null}

      {isLoading ? <DocumentsFilterCardSkeleton /> : null}

      {isLoading ? <DocumentsFilesListSkeleton /> : null}

      {error ? <p className="px-1 text-sm text-red-600">{error.message}</p> : null}

      {!isLoading && !error && !returnFolder ? (
        <section className="portal-card p-10 text-center text-sm text-muted-foreground">
          Return folder not found.
        </section>
      ) : null}

      {!isLoading && !error && returnFolder ? (
        <section className="portal-card overflow-hidden rounded-2xl">
          {filteredFiles.length ? (
            <div className="divide-y">
              {filteredFiles.map((file, index) => (
                <a
                  key={`${file.url}-${index}`}
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex cursor-pointer items-center justify-between gap-3 px-4 py-3 transition hover:bg-muted/35"
                >
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <p className="font-medium [overflow-wrap:anywhere]">{file.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
                      {file.type.toUpperCase()} • {formatDateTime(file.uploadedAt)}
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                    {formatBytes(file.size)}
                    <ChevronRight className="size-3.5 transition group-hover:translate-x-0.5" />
                  </span>
                </a>
              ))}
            </div>
          ) : returnFolder.files.length ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No files match your search/filter.
            </div>
          ) : (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No files uploaded for this return yet.
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
