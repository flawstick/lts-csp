"use client";

import { useEffect, useState } from "react";
import { Pause } from "@/lib/icons";

// setTimeout cannot wait longer than this (about 24.8 days).
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Shows that new filing runs are paused, and hides itself when the
 * maintenance window ends without a reload.
 */
export function FilingMaintenanceBanner({
  message,
  until,
}: {
  message: string;
  until: string | null;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!until) return;
    const remaining = new Date(until).getTime() - Date.now();
    if (remaining <= 0) {
      setVisible(false);
      return;
    }
    if (remaining > MAX_TIMEOUT_MS) return;
    const timer = setTimeout(() => setVisible(false), remaining);
    return () => clearTimeout(timer);
  }, [until]);

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <Pause className="size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
