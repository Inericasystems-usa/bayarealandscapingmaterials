"use client";

import { CloudOff, RefreshCw } from "lucide-react";
import { useOfflineSync } from "@/lib/useOfflineSync";

/**
 * Header status pill. Also mounts the offline-sync driver (once), so queued
 * sales replay regardless of which POS page is open. Hidden when online with an
 * empty queue.
 */
export function OfflineIndicator() {
  const { pending, syncing, online } = useOfflineSync();
  if (online && pending === 0) return null;

  return (
    <span
      title={online ? "Syncing offline sales" : "Offline — new sales are queued and will sync automatically"}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        online
          ? "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
          : "bg-[var(--color-clay-500)]/15 text-[var(--color-warning)]"
      }`}
    >
      {online ? (
        <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} aria-hidden />
      ) : (
        <CloudOff className="h-3.5 w-3.5" aria-hidden />
      )}
      {online ? `Syncing ${pending}` : `Offline${pending ? ` · ${pending} queued` : ""}`}
    </span>
  );
}
