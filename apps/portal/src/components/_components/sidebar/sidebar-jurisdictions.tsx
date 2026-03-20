"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  Folder,
  GripVertical,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

import { getJurisdictionGradient } from "./gradients";
import type { SidebarJurisdiction } from "./types";

type SidebarJurisdictionsProps = {
  isLoading: boolean;
  jurisdictions: SidebarJurisdiction[];
  openJurisdictions: string[];
  onToggleJurisdiction: (jurisdictionId: string) => void;
  sidebarOrgId: string | null;
  returnsUrl: string;
};

function getStorageKey(orgId: string | null) {
  return `jurisdiction-order${orgId ? `-${orgId}` : ""}`;
}

function applySavedOrder(
  jurisdictions: SidebarJurisdiction[],
  orgId: string | null,
): SidebarJurisdiction[] {
  if (!jurisdictions.length) return jurisdictions;
  try {
    const raw = localStorage.getItem(getStorageKey(orgId));
    if (!raw) return jurisdictions;
    const savedIds: string[] = JSON.parse(raw) as string[];
    const map = new Map(jurisdictions.map((j) => [j.jurisdictionId, j]));
    const ordered: SidebarJurisdiction[] = [];
    for (const id of savedIds) {
      const j = map.get(id);
      if (j) {
        ordered.push(j);
        map.delete(id);
      }
    }
    for (const j of map.values()) {
      ordered.push(j);
    }
    return ordered;
  } catch {
    return jurisdictions;
  }
}

function saveOrder(ids: string[], orgId: string | null) {
  try {
    localStorage.setItem(getStorageKey(orgId), JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function ReturnLink({
  href,
  entityName,
  taxYear,
  status,
}: {
  href: string;
  entityName: string;
  taxYear: string | number;
  status: string;
}) {
  return (
    <div className="relative">
      <span className="border-sidebar-border/70 absolute top-4 -left-3 h-px w-2 border-t" />
      <Link
        href={href}
        className="group/return hover:border-border hover:bg-muted/60 block rounded-md border border-transparent px-2 py-1.5 text-xs transition"
      >
        <p className="flex items-center gap-1.5 truncate font-medium">
          <Folder size={13} className="text-muted-foreground group-hover/return:text-foreground shrink-0 transition-colors" />
          <span className="truncate whitespace-nowrap">
            {entityName}
          </span>
        </p>
        <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <Calendar className="size-3" />
          <span className="truncate whitespace-nowrap">
            {taxYear} • {status.replaceAll("_", " ")}
          </span>
        </p>
      </Link>
    </div>
  );
}

function SortableJurisdictionItem({
  jurisdiction,
  index,
  isOpen,
  onToggle,
  sidebarOrgId,
  returnsUrl,
}: {
  jurisdiction: SidebarJurisdiction;
  index: number;
  isOpen: boolean;
  onToggle: () => void;
  sidebarOrgId: string | null;
  returnsUrl: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: jurisdiction.jurisdictionId });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const [from, to] = getJurisdictionGradient(jurisdiction.code, index);

  return (
    <SidebarMenuItem
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "relative z-10 opacity-80")}
    >
      <div className="flex items-center">
        <button
          type="button"
          className="text-muted-foreground/40 hover:text-muted-foreground flex shrink-0 cursor-grab items-center py-2 pr-0.5 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-3" />
        </button>
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={`jurisdiction-panel-${jurisdiction.jurisdictionId}`}
          onClick={onToggle}
          className={cn(
            "group/jurisdiction flex h-9 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition",
            isOpen ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/70",
          )}
        >
          <span
            className="relative inline-flex size-5 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold text-white shadow-sm transition-transform duration-300 group-hover/jurisdiction:scale-105 group-hover/jurisdiction:-rotate-6"
            style={{
              backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
            }}
          >
            <span
              aria-hidden
              className="pointer-events-none absolute -inset-y-1 -left-5 w-2 rotate-12 bg-white/50 opacity-0 blur-[2px] transition-all duration-500 group-hover/jurisdiction:left-6 group-hover/jurisdiction:opacity-80"
            />
          </span>
          <span className="flex-1 truncate whitespace-nowrap">
            {jurisdiction.name}
          </span>
          <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-[10px] font-medium">
            {jurisdiction.totalReturns}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform duration-200",
              isOpen ? "rotate-180" : "",
            )}
          />
        </button>
      </div>

      {/* Animated collapsible panel */}
      <div
        className="grid transition-[grid-template-rows,opacity] duration-200 ease-in-out"
        style={{
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="overflow-hidden">
          <div
            id={`jurisdiction-panel-${jurisdiction.jurisdictionId}`}
            className="border-sidebar-border/70 relative mt-1 ml-2 space-y-1 border-l pl-3"
          >
            {jurisdiction.returns.map((item) => {
              const focusHref = sidebarOrgId
                ? `/org/${sidebarOrgId}/returns/${item.id}`
                : returnsUrl;

              return (
                <ReturnLink
                  key={item.id}
                  href={focusHref}
                  entityName={item.entityName}
                  taxYear={item.taxYear}
                  status={item.status}
                />
              );
            })}
            <div className="relative pt-1">
              <span className="border-sidebar-border/70 absolute top-3 -left-3 h-px w-2 border-t" />
              <Link
                href={
                  sidebarOrgId
                    ? `/org/${sidebarOrgId}/returns?jurisdiction=${jurisdiction.code}`
                    : `${returnsUrl}?jurisdiction=${jurisdiction.code}`
                }
                className="border-sidebar-border/70 text-muted-foreground hover:border-sidebar-border hover:bg-muted/60 hover:text-foreground inline-flex items-center gap-1.5 rounded-md border border-dashed px-2 py-1 text-[11px] font-medium transition"
              >
                Show all
                <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SidebarMenuItem>
  );
}

export function SidebarJurisdictions({
  isLoading,
  jurisdictions,
  openJurisdictions,
  onToggleJurisdiction,
  sidebarOrgId,
  returnsUrl,
}: SidebarJurisdictionsProps) {
  const [scrolledTop, setScrolledTop] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [orderedJurisdictions, setOrderedJurisdictions] = useState<SidebarJurisdiction[]>(jurisdictions);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setOrderedJurisdictions((prev) => applySavedOrder(prev, sidebarOrgId));
  }, []);

  // Sync incoming jurisdictions with saved order (only apply localStorage order after mount)
  const sourceIds = jurisdictions.map((j) => j.jurisdictionId).join(",");
  const lastSourceIdsRef = useRef("");
  if (sourceIds !== lastSourceIdsRef.current) {
    lastSourceIdsRef.current = sourceIds;
    setOrderedJurisdictions(mounted ? applySavedOrder(jurisdictions, sidebarOrgId) : jurisdictions);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrderedJurisdictions((prev) => {
      const oldIndex = prev.findIndex((j) => j.jurisdictionId === active.id);
      const newIndex = prev.findIndex((j) => j.jurisdictionId === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(oldIndex, 1);
      next.splice(newIndex, 0, moved!);

      saveOrder(
        next.map((j) => j.jurisdictionId),
        sidebarOrgId,
      );

      return next;
    });
  };

  const handleViewportRef = useCallback((node: HTMLDivElement | null) => {
    if (viewportRef.current) {
      viewportRef.current.removeEventListener("scroll", handleScroll);
    }
    viewportRef.current = node;
    if (node) {
      node.addEventListener("scroll", handleScroll, { passive: true });
      setScrolledTop(node.scrollTop > 0);
    }
  }, []);

  const handleScroll = () => {
    if (viewportRef.current) {
      setScrolledTop(viewportRef.current.scrollTop > 0);
    }
  };

  return (
    <>
      <SidebarGroup className="mt-4 min-h-0 flex-1 overflow-hidden pb-0 transition-opacity duration-150 ease-linear group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:mt-0 group-data-[collapsible=icon]:h-0 group-data-[collapsible=icon]:flex-none group-data-[collapsible=icon]:opacity-0">
        <SidebarGroupLabel className="text-muted-foreground px-2 text-[11px]">
          Jurisdictions
        </SidebarGroupLabel>

        <div className="relative min-h-0 flex-1">
          <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]]:overscroll-contain [&_[data-slot=scroll-area-scrollbar]]:w-1.5" ref={(node) => {
            const viewport = node?.querySelector<HTMLDivElement>("[data-slot=scroll-area-viewport]");
            handleViewportRef(viewport ?? null);
          }}>
            <SidebarMenu>
              {isLoading ? (
                <>
                  {[0, 1].map((i) => (
                    <SidebarMenuItem key={`skel-${i}`}>
                      <div className="flex h-9 items-center gap-2 px-2">
                        <Skeleton className="size-5 shrink-0 rounded-full" />
                        <Skeleton className="h-3.5 flex-1 rounded" />
                        <Skeleton className="h-4 w-6 rounded-md" />
                      </div>
                    </SidebarMenuItem>
                  ))}
                </>
              ) : null}

              {!isLoading && !orderedJurisdictions.length ? (
                <SidebarMenuItem>
                  <div className="text-muted-foreground rounded-lg border px-3 py-2 text-xs">
                    No jurisdiction returns available.
                  </div>
                </SidebarMenuItem>
              ) : null}

              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={orderedJurisdictions.map((j) => j.jurisdictionId)}
                  strategy={verticalListSortingStrategy}
                >
                  {orderedJurisdictions.map((jurisdiction, index) => (
                    <SortableJurisdictionItem
                      key={jurisdiction.jurisdictionId}
                      jurisdiction={jurisdiction}
                      index={index}
                      isOpen={openJurisdictions.includes(jurisdiction.jurisdictionId)}
                      onToggle={() => onToggleJurisdiction(jurisdiction.jurisdictionId)}
                      sidebarOrgId={sidebarOrgId}
                      returnsUrl={returnsUrl}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </SidebarMenu>
            <div className="h-4" aria-hidden />
          </ScrollArea>

          {/* Top fade overlay */}
          <div
            className={cn(
              "pointer-events-none absolute top-0 right-0 left-0 h-6 transition-opacity duration-200",
              scrolledTop ? "opacity-100" : "opacity-0",
            )}
            style={{
              background: "linear-gradient(to bottom, var(--sidebar), transparent)",
            }}
            aria-hidden
          />

          {/* Bottom fade overlay */}
          <div
            className="pointer-events-none absolute right-0 bottom-0 left-0 h-8"
            style={{
              background: "linear-gradient(to top, var(--sidebar), transparent)",
            }}
            aria-hidden
          />
        </div>
      </SidebarGroup>

      <SidebarGroup className="pointer-events-none h-0 -translate-y-1 overflow-hidden pt-2 opacity-0 transition-[opacity,transform] duration-150 ease-linear group-data-[collapsible=icon]:pointer-events-auto group-data-[collapsible=icon]:h-auto group-data-[collapsible=icon]:translate-y-0 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:opacity-100">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:gap-1.5">
          {orderedJurisdictions.map((jurisdiction, index) => {
            const [from, to] = getJurisdictionGradient(
              jurisdiction.code,
              index,
            );
            const href = sidebarOrgId
              ? `/org/${sidebarOrgId}/returns?jurisdiction=${jurisdiction.code}`
              : `${returnsUrl}?jurisdiction=${jurisdiction.code}`;

            return (
              <SidebarMenuItem
                key={`icon-${jurisdiction.jurisdictionId}`}
                className="group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center"
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={href}
                      className="group/collapsed-jurisdiction bg-sidebar-accent/20 hover:bg-sidebar-accent/60 flex size-9 items-center justify-center rounded-lg transition"
                    >
                      <span
                        className="relative inline-flex size-5 items-center justify-center overflow-hidden rounded-full text-white shadow-sm transition-transform duration-300 group-hover/collapsed-jurisdiction:scale-105 group-hover/collapsed-jurisdiction:-rotate-6"
                        style={{
                          backgroundImage: `linear-gradient(135deg, ${from}, ${to})`,
                        }}
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -inset-y-1 -left-5 w-2 rotate-12 bg-white/50 opacity-0 blur-[2px] transition-all duration-500 group-hover/collapsed-jurisdiction:left-6 group-hover/collapsed-jurisdiction:opacity-80"
                        />
                      </span>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {jurisdiction.name} ({jurisdiction.totalReturns})
                  </TooltipContent>
                </Tooltip>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroup>
    </>
  );
}
