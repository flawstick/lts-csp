"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, FolderOpen, Search, Sparkles } from "lucide-react";

import { PORTAL_ASK_AI_OPEN_EVENT, PORTAL_COMMAND_OPEN_EVENT } from "@/lib/portal-command";
import type { PortalNavItem } from "@/lib/portal-navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";

type PortalCommandMenuProps = {
  navItems: PortalNavItem[];
  currentOrgId: string | null;
};

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

function createClientSlug(orgId: string, clientName: string) {
  const normalizedName = normalizePathnamePart(clientName) || "client";
  const orgPrefix = normalizePathnamePart(orgId).slice(0, 8) || "org";
  const suffix = hashString(`${orgId}:${clientName.toLowerCase()}`).toString(36).slice(0, 6) || "client";
  return `${normalizedName}-${orgPrefix}-${suffix}`;
}

function SkeletonItems({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-4 shrink-0 rounded" />
          <Skeleton className="h-3.5 flex-1 rounded" />
          <Skeleton className="h-3 w-8 rounded" />
        </div>
      ))}
    </>
  );
}

export function PortalCommandMenu({ navItems, currentOrgId }: PortalCommandMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedQuery(commandQuery.trim());
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [commandQuery]);

  const { data: returnsData, isLoading: isLoadingRecent } = api.portalReturns.listMyReturns.useQuery(undefined, {
    staleTime: 30_000,
    enabled: open && debouncedQuery.length === 0,
  });

  const { data: searchedReturns, isFetching: isSearchingReturns } =
    api.portalReturns.searchMyReturns.useQuery(
      {
        query: debouncedQuery,
        limit: 24,
      },
      {
        staleTime: 15_000,
        enabled: open && debouncedQuery.length > 0,
      },
    );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditableTarget =
        !!target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.getAttribute("role") === "textbox");

      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isEditableTarget) {
        event.preventDefault();
        setOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onCommandOpen = () => setOpen(true);
    window.addEventListener(PORTAL_COMMAND_OPEN_EVENT, onCommandOpen);

    return () => {
      window.removeEventListener(PORTAL_COMMAND_OPEN_EVENT, onCommandOpen);
    };
  }, []);

  const navigationItems = useMemo(
    () => navItems.filter((item) => item.key !== "search"),
    [navItems],
  );

  const recentReturns = useMemo(() => {
    return [...(returnsData ?? [])]
      .sort((a, b) => {
        const aTime = a.updatedAt ? Date.parse(String(a.updatedAt)) : 0;
        const bTime = b.updatedAt ? Date.parse(String(b.updatedAt)) : 0;
        return bTime - aTime;
      })
      .slice(0, 8);
  }, [returnsData]);

  const navigateTo = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const openAskAi = () => {
    const prompt = commandQuery.trim();
    setOpen(false);
    window.dispatchEvent(new CustomEvent(PORTAL_ASK_AI_OPEN_EVENT, { detail: prompt || undefined }));
  };

  const returnSearchResults = useMemo(
    () => (debouncedQuery.length > 0 ? searchedReturns ?? [] : []),
    [debouncedQuery.length, searchedReturns],
  );
  const folderSearchResults = useMemo(() => {
    if (debouncedQuery.length === 0) return [];

    const grouped = new Map<string, { id: string; name: string; orgName: string; slug: string; matchCount: number }>();

    for (const row of returnSearchResults) {
      const folderName = row.entityName.trim() || "Unnamed Client";
      const key = `${row.orgId}::${folderName.toLowerCase()}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.matchCount += 1;
      } else {
        grouped.set(key, {
          id: key,
          name: folderName,
          orgName: row.orgName,
          slug: createClientSlug(row.orgId, folderName),
          matchCount: 1,
        });
      }
    }

    return Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 10);
  }, [debouncedQuery.length, returnSearchResults]);

  const hasNoSearchResults =
    debouncedQuery.length > 0 &&
    !isSearchingReturns &&
    returnSearchResults.length === 0 &&
    folderSearchResults.length === 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-2"
        onClick={() => setOpen(true)}
      >
        <Search className="size-3.5" />
        <span className="sr-only">Open command menu</span>
        <span className="rounded-md border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          /
        </span>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            setCommandQuery("");
            setDebouncedQuery("");
          }
        }}
      >
        <CommandInput
          value={commandQuery}
          onValueChange={setCommandQuery}
          placeholder="Search pages, returns, actions..."
          onKeyDown={(e) => {
            if (e.key === "Enter" && commandQuery.trim() && hasNoSearchResults) {
              e.preventDefault();
              openAskAi();
            }
          }}
        />
        <CommandList>
          <CommandEmpty className="hidden" />

          <CommandGroup heading="Navigation">
            {navigationItems.map((item) => {
              const ItemIcon = item.icon;

              return (
                <CommandItem
                  key={item.key}
                  value={`${item.title} ${item.href}`}
                  onSelect={() => navigateTo(item.href)}
                >
                  <ItemIcon className="size-4" />
                  <span>{item.title}</span>
                  {item.isActive ? <CommandShortcut>Current</CommandShortcut> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>

          {currentOrgId ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Quick Actions">
              <CommandItem onSelect={() => navigateTo(`/org/${currentOrgId}/returns`)}>
                <FileSpreadsheet className="size-4" />
                <span>Open Current Org Returns</span>
              </CommandItem>
              </CommandGroup>
            </>
          ) : null}

          {/* Ask AI — always visible */}
          <CommandSeparator />
          <CommandGroup heading="AI">
            <CommandItem
              value="ask ai assistant question help"
              onSelect={openAskAi}
            >
              <Sparkles className="size-4" />
              <span>Ask AI</span>
              <CommandShortcut>Assistant</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          {commandQuery.trim().length > 0 ? (
            <>
              <CommandSeparator />
              <CommandGroup heading="Returns">
                {isSearchingReturns || commandQuery.trim() !== debouncedQuery ? (
                  <SkeletonItems count={3} />
                ) : null}
                {returnSearchResults.map((row) => (
                  <CommandItem
                    key={row.id}
                    value={`${row.entityName} ${row.orgName} ${row.jurisdictionCode} ${row.jurisdictionName} ${row.taxYear} ${row.externalId ?? ""}`}
                    onSelect={() => navigateTo(`/org/${row.orgId}/returns/${row.id}`)}
                  >
                    <FileSpreadsheet className="size-4" />
                    <span className="truncate">{row.entityName}</span>
                    <CommandShortcut>{row.taxYear} · {row.jurisdictionCode}</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>

              {folderSearchResults.length ? (
                <>
                  <CommandSeparator />
                  <CommandGroup heading="Folders">
                    {folderSearchResults.map((folder) => (
                      <CommandItem
                        key={folder.id}
                        value={`${folder.name} ${folder.orgName} folder documents`}
                        onSelect={() => navigateTo(`/documents/client/${folder.slug}`)}
                      >
                        <FolderOpen className="size-4" />
                        <span className="truncate">{folder.name}</span>
                        <CommandShortcut>{folder.matchCount} returns</CommandShortcut>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              ) : null}
            </>
          ) : (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent Returns">
                {isLoadingRecent ? (
                  <SkeletonItems count={4} />
                ) : recentReturns.length ? (
                  recentReturns.map((row) => (
                    <CommandItem
                      key={row.id}
                      value={`${row.entityName} ${row.orgName} ${row.jurisdictionCode} ${row.jurisdictionName} ${row.taxYear} ${row.externalId ?? ""}`}
                      onSelect={() => navigateTo(`/org/${row.orgId}/returns/${row.id}`)}
                    >
                      <FileSpreadsheet className="size-4" />
                      <span className="truncate">{row.entityName}</span>
                      <CommandShortcut>{row.taxYear} · {row.jurisdictionCode}</CommandShortcut>
                    </CommandItem>
                  ))
                ) : (
                  <div className="px-3 py-2.5 text-sm text-muted-foreground">No recent returns.</div>
                )}
              </CommandGroup>
            </>
          )}

          {isSearchingReturns || commandQuery.trim() !== debouncedQuery ? (
            <div className="px-2 py-2">
              <SkeletonItems count={3} />
            </div>
          ) : null}

          {hasNoSearchResults ? (
            <div className="px-2 py-4">
              <button
                type="button"
                onClick={openAskAi}
                className="portal-card mx-auto flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10">
                  <Sparkles className="size-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium">Ask AI instead</p>
                  <p className="text-[11px] text-muted-foreground">
                    Get help with &ldquo;{commandQuery || "your question"}&rdquo;
                  </p>
                </div>
              </button>
            </div>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
