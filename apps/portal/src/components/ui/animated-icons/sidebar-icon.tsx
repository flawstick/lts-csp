"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ForwardRefExoticComponent, HTMLAttributes, RefAttributes } from "react";
import type { LucideIcon } from "lucide-react";

import { FileTextIcon } from "@/components/ui/file-text";
import { HomeIcon } from "@/components/ui/home";
import { MessageSquareIcon } from "@/components/ui/message-square";
import { SettingsIcon } from "@/components/ui/settings";
import { UsersIcon } from "@/components/ui/users";
import { SearchIcon } from "@/components/ui/search";
import { LayersIcon } from "@/components/ui/layers";
import { CalendarDaysIcon } from "@/components/ui/calendar-days";
import { PlusIcon } from "@/components/ui/plus";
import { cn } from "@/lib/utils";

import { AnimatedLucideIcon } from "./animated-lucide-icon";

type AnimatedHandle = {
  startAnimation: () => void;
  stopAnimation: () => void;
};

type AnimatedPresetProps = HTMLAttributes<HTMLDivElement> & {
  size?: number;
};

type AnimatedPreset = ForwardRefExoticComponent<
  AnimatedPresetProps & RefAttributes<AnimatedHandle>
>;

export type SidebarIconKey =
  | "search"
  | "inbox"
  | "dashboard"
  | "tasks"
  | "projects"
  | "calendar"
  | "documents"
  | "teams"
  | "company"
  | "workgroup"
  | "create"
  | "support"
  | "dev"
  | "marketing"
  | "logout"
  | "invite"
  | "access"
  | "settings";

type SidebarIconProps = {
  icon: LucideIcon;
  iconKey?: SidebarIconKey;
  active?: boolean;
  size?: number;
  className?: string;
};

const ICON_PRESETS: Partial<Record<SidebarIconKey, AnimatedPreset>> = {
  search: SearchIcon as AnimatedPreset,
  dashboard: HomeIcon as AnimatedPreset,
  projects: LayersIcon as AnimatedPreset,
  calendar: CalendarDaysIcon as AnimatedPreset,
  documents: FileTextIcon as AnimatedPreset,
  teams: UsersIcon as AnimatedPreset,
  create: PlusIcon as AnimatedPreset,
  invite: MessageSquareIcon as AnimatedPreset,
  access: SettingsIcon as AnimatedPreset,
  settings: SettingsIcon as AnimatedPreset,
};

export function SidebarIcon({
  icon,
  iconKey,
  active = false,
  size = 18,
  className,
}: SidebarIconProps) {
  const presetIcon = iconKey ? ICON_PRESETS[iconKey] : undefined;
  const iconRef = useRef<AnimatedHandle>(null);
  const containerRef = useRef<HTMLSpanElement>(null);
  const [isRowHovered, setIsRowHovered] = useState(false);
  const [isIconHovered, setIsIconHovered] = useState(false);
  const isHovered = isRowHovered || isIconHovered;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const hoverTarget = container.closest("[data-sidebar='menu-button']");
    if (!hoverTarget) return;

    const handlePointerEnter = () => {
      setIsRowHovered(true);
    };

    const handlePointerLeave = () => {
      setIsRowHovered(false);
    };

    hoverTarget.addEventListener("pointerenter", handlePointerEnter);
    hoverTarget.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      hoverTarget.removeEventListener("pointerenter", handlePointerEnter);
      hoverTarget.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, []);

  useEffect(() => {
    if (!presetIcon || !active || isHovered) return;

    iconRef.current?.startAnimation();
    const timeout = window.setTimeout(() => {
      iconRef.current?.stopAnimation();
    }, 700);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [active, isHovered, presetIcon]);

  useEffect(() => {
    if (!presetIcon) return;

    if (isHovered) {
      iconRef.current?.startAnimation();
      return;
    }

    iconRef.current?.stopAnimation();
  }, [isHovered, presetIcon]);

  const animation = useMemo(() => {
    if (iconKey === "search") return "tilt" as const;
    if (iconKey === "inbox") return "bounce" as const;
    if (iconKey === "dashboard") return "bounce" as const;
    if (iconKey === "tasks") return "swing" as const;
    if (iconKey === "projects") return "pulse" as const;
    if (iconKey === "calendar") return "bounce" as const;
    if (iconKey === "documents") return "swing" as const;
    if (iconKey === "teams") return "pulse" as const;
    if (iconKey === "company") return "tilt" as const;
    if (iconKey === "workgroup") return "bounce" as const;
    if (iconKey === "create") return "pulse" as const;
    if (iconKey === "support") return "swing" as const;
    if (iconKey === "dev") return "tilt" as const;
    if (iconKey === "marketing") return "bounce" as const;
    if (iconKey === "logout") return "swing" as const;
    if (iconKey === "invite") return "tilt" as const;
    if (iconKey === "access") return "swing" as const;
    if (iconKey === "settings") return "swing" as const;
    return "pulse" as const;
  }, [iconKey]);

  if (presetIcon) {
    const PresetIcon = presetIcon;

    return (
      <span
        ref={containerRef}
        className={cn("inline-flex items-center justify-center", className)}
        onMouseEnter={() => {
          setIsIconHovered(true);
        }}
        onMouseLeave={() => {
          setIsIconHovered(false);
        }}
      >
        <PresetIcon ref={iconRef} size={size} />
      </span>
    );
  }

  return (
    <span
      ref={containerRef}
      className={cn("inline-flex items-center justify-center", className)}
      onMouseEnter={() => {
        setIsIconHovered(true);
      }}
      onMouseLeave={() => {
        setIsIconHovered(false);
      }}
    >
      <AnimatedLucideIcon
        icon={icon}
        size={size}
        active={active || isHovered}
        animation={animation}
      />
    </span>
  );
}
