import { useMemo, type ReactNode } from "react";

import { api } from "@/trpc/react";

type ListMyReturnsRow = {
  entityName: string;
  files: unknown;
  id: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  orgId: string;
  orgName: string;
  taxYear: number;
  updatedAt: Date | string | null;
};

export type ExplorerFile = {
  name: string;
  metadata?: Record<string, unknown>;
  role?: "financial_statements" | "filed_return_pdf";
  size: number;
  type: string;
  uploadedAt: string | null;
  url: string;
};

export type ReturnFolder = {
  files: ExplorerFile[];
  id: string;
  jurisdictionCode: string;
  jurisdictionName: string;
  name: string;
  taxYear: number;
  updatedAt: Date | string | null;
};

export type ClientFolder = {
  id: string;
  name: string;
  orgId: string;
  orgName: string;
  returns: ReturnFolder[];
  slug: string;
  totalFiles: number;
};

const FOLDER_COLORS = ["#0EA5E9", "#F97316", "#0EA05A", "#6366F1", "#EC4899", "#14B8A6", "#F43F5E"];

function normalizePathnamePart(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function toTimestamp(value: Date | string | null | undefined) {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function normalizeFiles(raw: unknown): ExplorerFile[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const file = entry as Record<string, unknown>;
      if (typeof file.url !== "string" || typeof file.name !== "string") {
        return [];
      }

      const parsedSize =
        typeof file.size === "number"
          ? file.size
          : typeof file.size === "string"
            ? Number(file.size)
            : 0;
      const role: ExplorerFile["role"] =
        file.role === "financial_statements"
          ? "financial_statements"
          : file.role === "filed_return_pdf"
            ? "filed_return_pdf"
            : undefined;

      return [
        {
          url: file.url,
          name: file.name,
          size: Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 0,
          type: typeof file.type === "string" ? file.type : "file",
          uploadedAt: typeof file.uploadedAt === "string" ? file.uploadedAt : null,
          role,
          metadata:
            file.metadata && typeof file.metadata === "object"
              ? (file.metadata as Record<string, unknown>)
              : undefined,
        },
      ];
    })
    .sort((a, b) => {
      const timeDiff = toTimestamp(b.uploadedAt) - toTimestamp(a.uploadedAt);
      if (timeDiff !== 0) return timeDiff;
      return a.name.localeCompare(b.name);
    });
}

function createClientSlug(orgId: string, clientName: string) {
  const normalizedName = normalizePathnamePart(clientName) || "client";
  const orgPrefix = normalizePathnamePart(orgId).slice(0, 8) || "org";
  const suffix = hashString(`${orgId}:${clientName.toLowerCase()}`).toString(36).slice(0, 6) || "client";
  return `${normalizedName}-${orgPrefix}-${suffix}`;
}

function buildClientFolders(rows: ListMyReturnsRow[]): ClientFolder[] {
  const grouped = new Map<string, ClientFolder>();

  for (const row of rows) {
    const clientName = row.entityName.trim() || "Unnamed Client";
    const clientId = `${row.orgId}::${clientName.toLowerCase()}`;
    const files = normalizeFiles(row.files);

    const returnFolder: ReturnFolder = {
      id: row.id,
      name: `${clientName}-${row.taxYear}`,
      taxYear: row.taxYear,
      files,
      updatedAt: row.updatedAt,
      jurisdictionCode: row.jurisdictionCode,
      jurisdictionName: row.jurisdictionName,
    };

    const existingClient = grouped.get(clientId);
    if (!existingClient) {
      grouped.set(clientId, {
        id: clientId,
        name: clientName,
        orgId: row.orgId,
        orgName: row.orgName,
        returns: [returnFolder],
        totalFiles: files.length,
        slug: createClientSlug(row.orgId, clientName),
      });
    } else {
      existingClient.returns.push(returnFolder);
      existingClient.totalFiles += files.length;
    }
  }

  return Array.from(grouped.values())
    .map((client) => ({
      ...client,
      returns: [...client.returns].sort((a, b) => {
        const yearDiff = b.taxYear - a.taxYear;
        if (yearDiff !== 0) return yearDiff;
        return toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function useDocumentsTree() {
  const query = api.portalReturns.listMyReturns.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  const clients = useMemo(() => buildClientFolders((query.data ?? []) as ListMyReturnsRow[]), [query.data]);

  return {
    ...query,
    clients,
  };
}

export function getFolderColor(key: string) {
  const index = hashString(key) % FOLDER_COLORS.length;
  return FOLDER_COLORS[index] ?? FOLDER_COLORS[0]!;
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size}B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)}KB`;
  return `${(size / (1024 * 1024)).toFixed(2)}MB`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "Unknown date";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString();
}

export function buildFolderPreviewItems(items: string[]): ReactNode[] {
  return items.slice(0, 3).map((item, index) => (
    <div key={`${item}-${index}`} className="flex h-full w-full items-end p-1.5">
      <span className="block w-full truncate rounded bg-slate-100/80 px-1 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-700">
        {item}
      </span>
    </div>
  ));
}

export function getClientHref(clientSlug: string) {
  return `/documents/client/${clientSlug}`;
}

export function getReturnHref(clientSlug: string, returnId: string) {
  return `/documents/client/${clientSlug}/return/${returnId}`;
}
