"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Phone, FileText } from "lucide-react";
import { COMPANY } from "@/lib/company";
import { openState, type OpenState } from "@/lib/hours";

/**
 * Mobile-only sticky action bar — Call + Get a quote.
 *
 * Below 768px only (`md:hidden`); the desktop header already carries both
 * actions. The phone link is a plain `tel:` anchor so the one delegated
 * listener in TrackingListeners picks it up as `sticky_bar` — no per-component
 * handler, no chance of a double-fire.
 *
 * The open/closed line is computed CLIENT-SIDE ONLY. Rendering it on the server
 * would freeze a build-time answer into the static HTML and hydrate wrong, so
 * the bar renders without it on the first paint and fills it in on mount.
 * `openState` resolves in the yard's timezone, not the visitor's.
 */
export function StickyCallBar() {
  const [hours, setHours] = useState<OpenState | null>(null);

  useEffect(() => {
    setHours(openState());
    // Re-check every minute so the bar doesn't sit on a stale "Open until…"
    // through a closing time.
    const timer = setInterval(() => setHours(openState()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <aside
      aria-label="Call or get a quote"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] md:hidden"
      // Keep the buttons clear of the iOS home indicator / gesture bar.
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* The line is always there so the bar keeps its height when the label
          fills in on mount (no layout shift); empty until then. */}
      <p className="px-4 pt-1.5 text-center text-[0.7rem] font-medium text-[var(--color-text-muted)]">
        {hours ? (
          <>
            <span
              aria-hidden
              className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                hours.open ? "bg-[var(--color-moss-500)]" : "bg-[var(--color-text-muted)]"
              }`}
            />
            {hours.label}
          </>
        ) : (
          " "
        )}
      </p>

      <div className="grid grid-cols-[1.35fr_1fr] items-stretch gap-2 p-2">
        <a
          href={`tel:${COMPANY.phoneE164}`}
          data-call-location="sticky_bar"
          className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-action)] whitespace-nowrap px-3 py-3 text-sm font-semibold text-[var(--color-action-fg)]"
        >
          <Phone className="h-4 w-4" strokeWidth={2} aria-hidden />
          Call<span className="hidden min-[360px]:inline"> {COMPANY.phone}</span>
        </a>
        <Link
          href="/request-quote"
          className="flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] whitespace-nowrap px-3 py-3 text-sm font-semibold text-[var(--color-text-primary)]"
        >
          <FileText className="h-4 w-4" strokeWidth={2} aria-hidden />
          Get a quote
        </Link>
      </div>
    </aside>
  );
}
