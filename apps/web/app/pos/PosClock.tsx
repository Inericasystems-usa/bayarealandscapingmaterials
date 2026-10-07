"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Clock, Coffee, Utensils, Play, Loader2, ArrowRight } from "lucide-react";
import { api, type Shift } from "@/lib/api-client";
import { useAuth } from "./auth";

function elapsed(fromIso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Top-bar time clock. The shift is opened automatically at sign-in and closed
 * at sign-out, so this widget is just for punching breaks (two paid 10-min,
 * meal auto-deducts after 5h) and seeing time on shift.
 */
export function PosClock() {
  const { user } = useAuth();
  const [shift, setShift] = useState<Shift | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setShift(await api.activeShift(user.id));
    } catch {
      /* offline */
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const onBreak = shift?.breaks.some((b) => !b.end) ?? false;
  const paidUsed = shift?.breaks.filter((b) => b.type === "paid").length ?? 0;

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch {
      /* surfaced elsewhere */
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-9 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-medium ${
          onBreak
            ? "border-[var(--color-warning)] bg-[var(--color-clay-500)]/15 text-[var(--color-warning)]"
            : shift
              ? "border-[var(--color-moss-500)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
        }`}
      >
        <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        <span className="hidden sm:inline">
          {shift ? (onBreak ? "On break" : elapsed(shift.clockIn)) : "Off shift"}
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 top-11 z-50 w-64 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-[var(--shadow-xl)]">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              Time clock · {user.name.split(" ")[0]}
            </p>

            {!shift ? (
              <button
                onClick={() => act(() => api.clockIn(user.id))}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-action)] py-2.5 text-sm font-semibold text-[var(--color-action-fg)] disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Clock In
              </button>
            ) : (
              <div className="space-y-2">
                <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm">
                  <div className="flex justify-between text-[var(--color-text-secondary)]">
                    <span>On shift</span>
                    <span className="font-semibold text-[var(--color-text-primary)]">{elapsed(shift.clockIn)}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    Paid breaks: {paidUsed}/2 · meal auto-deducts after 5h
                  </div>
                </div>

                {onBreak ? (
                  <button
                    onClick={() => act(() => api.endBreak(shift.id))}
                    disabled={busy}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-50"
                  >
                    End break
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => act(() => api.startBreak(shift.id, "paid"))}
                      disabled={busy || paidUsed >= 2}
                      className="flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-40"
                    >
                      <Coffee className="h-3.5 w-3.5" /> Paid 10
                    </button>
                    <button
                      onClick={() => act(() => api.startBreak(shift.id, "unpaid"))}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] py-2 text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-40"
                    >
                      <Utensils className="h-3.5 w-3.5" /> Meal 30
                    </button>
                  </div>
                )}

                <p className="text-center text-[11px] text-[var(--color-text-muted)]">
                  Sign out to clock out.
                </p>
              </div>
            )}

            <Link
              href="/pos/timeclock"
              onClick={() => setOpen(false)}
              className="mt-2 flex items-center justify-center gap-1 rounded-[var(--radius-md)] py-1.5 text-xs font-medium text-[var(--color-text-brand)] hover:bg-[var(--color-bg-surface)]"
            >
              View timesheet <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
