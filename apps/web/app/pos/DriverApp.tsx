"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MapPin,
  Phone,
  Package,
  Clock,
  ChevronRight,
  ChevronLeft,
  LogOut,
  Check,
  Navigation,
  Loader2,
  CheckCircle2,
  Truck,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { api, type Delivery } from "@/lib/api-client";
import { STAGE_ORDER, STAGE_META, stageIndex, nextStage, stageColor } from "@/lib/delivery-stages";
import { useAuth } from "./auth";

export function DriverApp() {
  const { user, logout } = useAuth();
  const [jobs, setJobs] = useState<Delivery[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const all = await api.listDeliveries();
      const mine = all.filter((d) => d.driverId === user.id || d.driverName === user.name);
      setJobs(mine);
    } catch {
      /* offline */
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const selected = jobs.find((j) => j.id === selId) ?? null;

  const advance = async (job: Delivery) => {
    const ns = nextStage(job.stage);
    if (!ns) return;
    setBusy(true);
    try {
      await api.advanceDeliveryStage(job.id, ns);
      await load();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  if (!user) return null;

  const active = jobs.filter((j) => j.stage !== "completed");
  const done = jobs.filter((j) => j.stage === "completed");
  const firstName = user.name.split(" ")[0];

  return (
    <div data-theme="dark" className="flex h-[100dvh] flex-col bg-[var(--color-moss-950)] text-white">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
        {selected ? (
          <button onClick={() => setSelId(null)} className="flex items-center gap-1 text-sm font-medium text-[var(--color-moss-200)]">
            <ChevronLeft className="h-5 w-5" /> Jobs
          </button>
        ) : (
          <Logo tone="inverted" height={34} />
        )}
        <div className="flex items-center gap-3">
          <span className="text-sm text-[var(--color-moss-200)]">Hi, {firstName}</span>
          <button
            onClick={logout}
            title="Sign out (clocks you out)"
            className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-white/10 text-white hover:bg-white/20"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </header>

      {/* Body */}
      <main className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <div className="grid h-full place-items-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--color-moss-300)]" /></div>
        ) : selected ? (
          <JobDetail job={selected} busy={busy} onAdvance={() => advance(selected)} />
        ) : (
          <div className="mx-auto max-w-md p-4">
            <h1 className="mb-1 font-display text-2xl font-extrabold">Today&apos;s Deliveries</h1>
            <p className="mb-4 text-sm text-[var(--color-moss-200)]">
              {active.length} active · {done.length} done
            </p>

            {jobs.length === 0 && (
              <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-8 text-center text-[var(--color-moss-200)]">
                <Truck className="mx-auto mb-3 h-10 w-10 opacity-40" strokeWidth={1.5} />
                No deliveries assigned to you yet.
              </div>
            )}

            <ul className="space-y-3">
              {[...active, ...done].map((job) => {
                const meta = STAGE_META[job.stage];
                const idx = stageIndex(job.stage);
                return (
                  <li key={job.id}>
                    <button
                      onClick={() => setSelId(job.id)}
                      className="w-full rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4 text-left transition-colors hover:bg-white/10"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-[var(--color-moss-300)]">{job.code}</span>
                        <span
                          className="rounded-full px-2.5 py-0.5 text-xs font-semibold text-white"
                          style={{ background: stageColor(job.stage) }}
                        >
                          {meta.short}
                        </span>
                      </div>
                      <p className="mt-1 text-lg font-bold">{job.customer}</p>
                      <p className="flex items-center gap-1.5 text-sm text-[var(--color-moss-200)]">
                        <MapPin className="h-3.5 w-3.5 shrink-0" /> {job.address}
                      </p>
                      <div className="mt-3 flex items-center justify-between">
                        {/* Progress bar */}
                        <div className="mr-3 h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-[var(--color-moss-400)]"
                            style={{ width: `${(idx / (STAGE_ORDER.length - 1)) * 100}%` }}
                          />
                        </div>
                        <ChevronRight className="h-5 w-5 text-[var(--color-moss-300)]" />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function JobDetail({ job, busy, onAdvance }: { job: Delivery; busy: boolean; onAdvance: () => void }) {
  const meta = STAGE_META[job.stage];
  const curIdx = stageIndex(job.stage);
  const isDone = job.stage === "completed";
  const mapHref = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`;

  return (
    <div className="mx-auto flex h-full max-w-md flex-col">
      <div className="p-4">
        <span className="font-mono text-xs text-[var(--color-moss-300)]">{job.code}</span>
        <h1 className="font-display text-2xl font-extrabold">{job.customer}</h1>
        <p className="mt-1 flex items-start gap-1.5 text-[var(--color-moss-200)]">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {job.address}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm text-[var(--color-moss-200)]">
          <span className="flex items-center gap-1.5"><Package className="h-4 w-4" /> {job.items}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {job.window}</span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <a href={`tel:${job.phone}`} className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10">
            <Phone className="h-4 w-4" /> Call
          </a>
          <a href={mapHref} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-[var(--radius-md)] border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white hover:bg-white/10">
            <Navigation className="h-4 w-4" /> Navigate
          </a>
        </div>
      </div>

      {/* Stage stepper */}
      <div className="min-h-0 flex-1 overflow-auto px-4">
        <ol className="relative space-y-0 border-l border-white/15 pl-6">
          {STAGE_ORDER.map((s, i) => {
            const done = i < curIdx || isDone;
            const current = i === curIdx && !isDone;
            return (
              <li key={s} className="relative py-2">
                <span
                  className={`absolute -left-[31px] grid h-5 w-5 place-items-center rounded-full ${
                    done ? "bg-[var(--color-moss-400)] text-[var(--color-moss-950)]" : current ? "bg-white text-[var(--color-moss-950)] ring-4 ring-white/20" : "bg-white/15 text-transparent"
                  }`}
                >
                  {done ? <Check className="h-3 w-3" strokeWidth={3} /> : current ? <span className="h-2 w-2 rounded-full bg-[var(--color-moss-600)]" /> : null}
                </span>
                <span className={`text-sm ${current ? "font-bold text-white" : done ? "text-[var(--color-moss-200)]" : "text-white/40"}`}>
                  {STAGE_META[s].label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Action */}
      <div className="shrink-0 border-t border-white/10 p-4">
        {isDone ? (
          <div className="flex items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-moss-700)] py-4 text-lg font-bold text-white">
            <CheckCircle2 className="h-6 w-6" /> Delivery complete
          </div>
        ) : (
          <button
            onClick={onAdvance}
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-lg)] bg-[var(--color-action)] py-4 text-lg font-bold text-[var(--color-action-fg)] shadow-[var(--shadow-lg)] active:translate-y-px disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <ChevronRight className="h-6 w-6" />}
            {meta.action}
          </button>
        )}
        <p className="mt-2 text-center text-xs text-[var(--color-moss-300)]">Confirms live to dispatch</p>
      </div>
    </div>
  );
}
