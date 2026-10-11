"use client";

import { useCallback, useEffect, useState } from "react";
import { ScrollText, Search, RefreshCw, Loader2 } from "lucide-react";
import { api, type AuditEntry } from "@/lib/api-client";

const FILTERS = [
  { label: "All activity", value: "" },
  { label: "Voids", value: "order.void" },
  { label: "Discounts", value: "order.discount" },
  { label: "A/R payments", value: "ar.payment" },
  { label: "Loyalty redemptions", value: "loyalty.redeem" },
  { label: "Drawer closes", value: "register.close" },
  { label: "Settings changes", value: "settings" },
  { label: "Product deletes", value: "product.delete" },
  { label: "User changes", value: "user" },
];

const ACTION_TONE: Record<string, string> = {
  "order.void": "bg-[color-mix(in_oklab,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]",
  "product.delete": "bg-[color-mix(in_oklab,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]",
  "user.deactivate": "bg-[color-mix(in_oklab,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]",
  "order.discount": "bg-[color-mix(in_oklab,var(--color-clay-500)_15%,transparent)] text-[var(--color-warning)]",
  "ar.payment": "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]",
  "loyalty.redeem": "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]",
  "user.create": "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]",
  "register.close": "bg-[color-mix(in_oklab,var(--color-clay-500)_15%,transparent)] text-[var(--color-warning)]",
  "user.update": "bg-[color-mix(in_oklab,var(--color-clay-500)_15%,transparent)] text-[var(--color-warning)]",
  "settings.update": "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]",
};

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api
      .listAudit({ action: action || undefined, q: q || undefined, limit: 250 })
      .then((d) => {
        setEntries(d);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [action, q]);

  useEffect(() => {
    load();
  }, [action]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div className="mr-auto">
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-[var(--color-text-primary)]">
            <ScrollText className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
            Audit Log
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">Append-only record of sensitive actions — voids, payments, redemptions, config changes</p>
        </div>

        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)]"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search details / user…"
            className="h-9 w-56 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-8 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
          />
        </div>

        <button
          onClick={load}
          className="flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
        >
          <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Refresh
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
            Can&apos;t load the audit log.
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center py-16 text-[var(--color-text-muted)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-16 text-center text-sm text-[var(--color-text-muted)]">
            No activity recorded{action ? " for this filter" : ""} yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-4 py-2.5">When</th>
                  <th className="px-4 py-2.5">Who</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-text-secondary)]">{new Date(e.at).toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-[var(--color-text-primary)]">{e.userName}</span>
                      <span className="ml-1 text-xs capitalize text-[var(--color-text-muted)]">· {e.role}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${ACTION_TONE[e.action] ?? "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]"}`}>
                        {e.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-primary)]">{e.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
