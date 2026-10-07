"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock,
  Coffee,
  Utensils,
  Play,
  LogOut,
  CalendarDays,
  Loader2,
} from "lucide-react";
import { Button } from "@balm/ui";
import { api, type Shift } from "@/lib/api-client";
import { useAuth } from "../auth";

const today = () => new Date().toISOString().slice(0, 10);

/** Format a minute count as "Hh Mm" (e.g. 95 → "1h 35m", 40 → "0h 40m"). */
function fmtMinutes(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/** Live elapsed since an ISO timestamp, formatted "Hh Mm". */
function elapsed(fromIso: string): string {
  return fmtMinutes((Date.now() - new Date(fromIso).getTime()) / 60000);
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—";

export default function TimeClockPage() {
  const { user } = useAuth();
  const isManager = user?.role === "admin" || user?.role === "manager";

  const [date, setDate] = useState(today);
  const [myShift, setMyShift] = useState<Shift | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!user) return;
    setError(false);
    try {
      const [active, list] = await Promise.all([
        api.activeShift(user.id),
        api.listShifts(isManager ? { date } : { userId: user.id, date }),
      ]);
      setMyShift(active);
      setShifts(list);
    } catch {
      setError(true);
      setMyShift(null);
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, [user, isManager, date]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  // Re-render every 30s so the live "on shift" timer stays current.
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const onBreak = useMemo(() => myShift?.breaks.some((b) => !b.end) ?? false, [myShift]);
  const paidUsed = useMemo(
    () => myShift?.breaks.filter((b) => b.type === "paid").length ?? 0,
    [myShift],
  );

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      /* surfaced via offline note on next load */
    } finally {
      await load();
      setBusy(false);
    }
  };

  if (!user) return null;

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-6 w-6 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
              Time Clock
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Shifts over 5h auto-deduct a 30-min unpaid meal break &middot; up to two paid 10-min breaks.
            </p>
          </div>
        </div>
        <label className="flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)]">
          <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          <input
            type="date"
            value={date}
            max={today()}
            onChange={(e) => setDate(e.target.value || today())}
            className="bg-transparent text-[var(--color-text-primary)] outline-none [color-scheme:dark]"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-4">
          {/* ── My Shift card ────────────────────────────────────── */}
          <section
            className={`rounded-[var(--radius-lg)] border p-5 ${
              myShift
                ? "border-[var(--color-moss-500)] bg-[var(--color-moss-100)]"
                : "border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  My Shift &middot; {user.name}
                </p>
                {myShift ? (
                  <>
                    <p className="mt-1 font-display text-3xl font-bold text-[var(--color-moss-700)]">
                      {onBreak ? "On break" : elapsed(myShift.clockIn)}
                    </p>
                    <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                      Clocked in {fmtTime(myShift.clockIn)} &middot; paid breaks used {paidUsed}/2
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                    You&apos;re not clocked in.
                  </p>
                )}
              </div>

              {/* Actions */}
              {!myShift ? (
                <Button
                  size="lg"
                  onClick={() => act(() => api.clockIn(user.id))}
                  disabled={busy}
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
                  Clock In
                </Button>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {onBreak ? (
                    <Button variant="secondary" onClick={() => act(() => api.endBreak(myShift.id))} disabled={busy}>
                      <Play className="h-4 w-4" /> End Break
                    </Button>
                  ) : (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => act(() => api.startBreak(myShift.id, "paid"))}
                        disabled={busy || paidUsed >= 2}
                        title={paidUsed >= 2 ? "Two paid breaks already taken" : undefined}
                      >
                        <Coffee className="h-4 w-4" /> Paid 10
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => act(() => api.startBreak(myShift.id, "unpaid"))}
                        disabled={busy}
                      >
                        <Utensils className="h-4 w-4" /> Meal 30
                      </Button>
                    </>
                  )}
                  <Button variant="destructive" onClick={() => act(() => api.clockOut(myShift.id))} disabled={busy}>
                    <LogOut className="h-4 w-4" /> Clock Out
                  </Button>
                </div>
              )}
            </div>
          </section>

          {/* ── Timesheet ────────────────────────────────────────── */}
          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
              <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                Timesheet
              </h2>
              <span className="ml-auto text-xs text-[var(--color-text-muted)]">
                {isManager ? "All employees" : "Your shifts"} &middot; {date}
              </span>
            </div>

            {error ? (
              <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
                Can&apos;t reach the API — start it with{" "}
                <code className="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-text-primary)]">
                  pnpm dev
                </code>{" "}
                in apps/api.
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-[var(--color-text-muted)]">
                Loading timesheet…
              </div>
            ) : shifts.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)]">
                      <th className="pb-2 font-medium">Employee</th>
                      <th className="pb-2 font-medium">Clock In</th>
                      <th className="pb-2 font-medium">Clock Out</th>
                      <th className="pb-2 text-right font-medium">Worked span</th>
                      <th className="pb-2 text-right font-medium">Paid breaks</th>
                      <th className="pb-2 text-right font-medium">Meal (unpaid)</th>
                      <th className="pb-2 text-right font-medium">PAID hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {shifts.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 text-[var(--color-text-primary)]">
                          {s.userName}
                          {s.status === "open" && (
                            <span className="ml-2 rounded-full bg-[var(--color-moss-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-moss-700)]">
                              open
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-[var(--color-text-secondary)]">{fmtTime(s.clockIn)}</td>
                        <td className="py-2 text-[var(--color-text-secondary)]">{fmtTime(s.clockOut)}</td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">
                          {fmtMinutes(s.spanMinutes)}
                        </td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">
                          {fmtMinutes(s.paidBreakMinutes)}
                        </td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">
                          {s.unpaidBreakMinutes > 0 ? `−${fmtMinutes(s.unpaidBreakMinutes)}` : "—"}
                        </td>
                        <td className="py-2 text-right font-medium text-[var(--color-text-primary)]">
                          {fmtMinutes(s.paidMinutes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-text-muted)]">
                No shifts recorded for this day.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
