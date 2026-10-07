"use client";

import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  Receipt,
  DollarSign,
  Percent,
  BarChart3,
  Calendar,
  Download,
  Boxes,
  Wallet,
  Coins,
  FileText,
} from "lucide-react";
import { api, type ReportSummary, type InventoryValuation, type ArAging } from "@/lib/api-client";
import { salesReportPdf } from "@/lib/pdf";
import { OfflineConversions } from "./OfflineConversions";

const today = () => new Date().toISOString().slice(0, 10);

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${((n ?? 0) * 100).toFixed(1)}%`;

type Mode = "day" | "range";

export default function ReportsPage() {
  const [mode, setMode] = useState<Mode>("day");
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const [data, setData] = useState<ReportSummary | null>(null);
  const [valuation, setValuation] = useState<InventoryValuation | null>(null);
  const [aging, setAging] = useState<ArAging | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const params = mode === "day" ? { date } : { from, to };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .reportSummary(params)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, date, from, to]);

  // Valuation + aging are point-in-time (not date-scoped) — load once.
  useEffect(() => {
    api.inventoryValuation().then(setValuation).catch(() => setValuation(null));
    api.arAging().then(setAging).catch(() => setAging(null));
  }, []);

  const exportCsv = useCallback(() => {
    if (mode === "day") void api.exportSalesCsv(date, date);
    else void api.exportSalesCsv(from, to);
  }, [mode, date, from, to]);

  const z = data?.z;
  const kpis = [
    { label: "Sales", value: String(z?.count ?? 0), icon: Receipt },
    { label: "Gross", value: money(z?.subtotal ?? 0), icon: DollarSign },
    { label: "COGS", value: money(z?.cogs ?? 0), icon: Coins },
    { label: "Gross profit", value: money(z?.grossProfit ?? 0), icon: TrendingUp },
    { label: "Margin", value: pct(z?.margin ?? 0), icon: Percent },
    { label: "Tax", value: money(z?.tax ?? 0), icon: Percent },
    { label: "Total", value: money(z?.total ?? 0), icon: DollarSign },
    { label: "Avg sale", value: money(z?.avgSale ?? 0), icon: BarChart3 },
  ];

  const maxRevenue = Math.max(1, ...(data?.topSellers ?? []).map((t) => t.revenue));

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Sales &amp; Reports
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Z-report, profit, inventory valuation &amp; A/R aging
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Day / Range toggle */}
          <div className="flex rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-0.5 text-sm">
            {(["day", "range"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`rounded-[calc(var(--radius-md)-2px)] px-3 py-1 capitalize transition ${
                  mode === m
                    ? "bg-[var(--color-bg-elevated)] font-medium text-[var(--color-text-primary)]"
                    : "text-[var(--color-text-muted)]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === "day" ? (
            <label className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)]">
              <Calendar className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <input
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value || today())}
                className="bg-transparent text-[var(--color-text-primary)] outline-none [color-scheme:dark]"
              />
            </label>
          ) : (
            <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3 py-1.5 text-sm text-[var(--color-text-secondary)]">
              <Calendar className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              <input
                type="date"
                value={from}
                max={to || today()}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-transparent text-[var(--color-text-primary)] outline-none [color-scheme:dark]"
              />
              <span className="text-[var(--color-text-muted)]">→</span>
              <input
                type="date"
                value={to}
                max={today()}
                onChange={(e) => setTo(e.target.value)}
                className="bg-transparent text-[var(--color-text-primary)] outline-none [color-scheme:dark]"
              />
            </div>
          )}

          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-moss-100)] px-3 py-1.5 text-sm font-medium text-[var(--color-moss-700)] transition hover:brightness-95"
          >
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            CSV
          </button>
          <button
            type="button"
            onClick={() => data && void salesReportPdf(data)}
            disabled={!data}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-moss-100)] px-3 py-1.5 text-sm font-medium text-[var(--color-moss-700)] transition hover:brightness-95 disabled:opacity-50"
          >
            <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            PDF
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
            Can&apos;t reach the API — start it with{" "}
            <code className="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-text-primary)]">
              pnpm dev
            </code>{" "}
            in apps/api.
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center py-16 text-sm text-[var(--color-text-muted)]">
            Loading report…
          </div>
        ) : data ? (
          <div className="flex flex-col gap-4">
            {/* ── KPI cards ──────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {kpis.map((k) => {
                const Icon = k.icon;
                return (
                  <div
                    key={k.label}
                    className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
                  >
                    <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                      <Icon className="h-4 w-4 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
                      <span className="text-xs font-semibold uppercase tracking-wide">{k.label}</span>
                    </div>
                    <p className="mt-2 font-display text-2xl font-bold text-[var(--color-text-primary)]">
                      {k.value}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* ── Z-Report ─────────────────────────────────────── */}
              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                <div className="flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
                  <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">Z-Report</h2>
                  <span className="ml-auto text-xs text-[var(--color-text-muted)]">{data.date}</span>
                </div>

                <dl className="mt-3 space-y-1.5 text-sm">
                  <Row label="Transactions" value={String(z?.count ?? 0)} />
                  <Row label="Gross subtotal" value={money(z?.subtotal ?? 0)} />
                  <Row label="Cost of goods" value={money(z?.cogs ?? 0)} />
                  <Row label="Gross profit" value={`${money(z?.grossProfit ?? 0)} · ${pct(z?.margin ?? 0)}`} />
                  <Row label="Tax" value={money(z?.tax ?? 0)} />
                  <Row label="Total" value={money(z?.total ?? 0)} strong />
                </dl>

                <h3 className="mt-4 mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  By payment method
                </h3>
                {z && z.byPayment && Object.keys(z.byPayment).length > 0 ? (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)]">
                        <th className="pb-1.5 font-medium">Method</th>
                        <th className="pb-1.5 text-right font-medium">Count</th>
                        <th className="pb-1.5 text-right font-medium">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {Object.entries(z.byPayment).map(([method, p]) => (
                        <tr key={method}>
                          <td className="py-1.5 capitalize text-[var(--color-text-primary)]">{method}</td>
                          <td className="py-1.5 text-right text-[var(--color-text-secondary)]">{p.count}</td>
                          <td className="py-1.5 text-right font-medium text-[var(--color-text-primary)]">
                            {money(p.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-[var(--color-text-muted)]">No payments recorded.</p>
                )}
              </section>

              {/* ── Top Sellers ──────────────────────────────────── */}
              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
                  <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">Top Sellers</h2>
                </div>

                {data.topSellers.length > 0 ? (
                  <ul className="mt-3 space-y-3">
                    {data.topSellers.map((t) => (
                      <li key={t.productId}>
                        <div className="flex items-baseline justify-between gap-2 text-sm">
                          <span className="min-w-0 truncate text-[var(--color-text-primary)]">{t.name}</span>
                          <span className="shrink-0 text-[var(--color-text-secondary)]">
                            {t.qty} sold &middot;{" "}
                            <span className="font-medium text-[var(--color-text-primary)]">{money(t.revenue)}</span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-surface)]">
                          <div
                            className="h-full rounded-full bg-[var(--color-moss-100)]"
                            style={{ width: `${(t.revenue / maxRevenue) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">No sales to rank.</p>
                )}
              </section>
            </div>

            {/* ── Inventory valuation + A/R aging ──────────────────── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                <div className="flex items-center gap-2">
                  <Boxes className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
                  <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                    Inventory Valuation
                  </h2>
                  <span className="ml-auto font-display text-lg font-bold text-[var(--color-text-primary)]">
                    {money(valuation?.totalValue ?? 0)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {valuation
                    ? `${valuation.totalUnits.toLocaleString()} units${valuation.untracked ? ` · ${valuation.untracked} without captured cost` : ""}`
                    : "Loading…"}
                </p>
                {valuation && valuation.items.length > 0 && (
                  <table className="mt-3 w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)]">
                        <th className="pb-1.5 font-medium">Product</th>
                        <th className="pb-1.5 text-right font-medium">On hand</th>
                        <th className="pb-1.5 text-right font-medium">Cost</th>
                        <th className="pb-1.5 text-right font-medium">Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {valuation.items.slice(0, 8).map((it) => (
                        <tr key={it.productId}>
                          <td className="py-1.5 text-[var(--color-text-primary)]">{it.name}</td>
                          <td className="py-1.5 text-right text-[var(--color-text-secondary)]">
                            {it.qtyOnHand} {it.unit}
                          </td>
                          <td className="py-1.5 text-right text-[var(--color-text-secondary)]">{money(it.cost)}</td>
                          <td className="py-1.5 text-right font-medium text-[var(--color-text-primary)]">
                            {money(it.value)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>

              <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
                  <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">A/R Aging</h2>
                  <span className="ml-auto font-display text-lg font-bold text-[var(--color-text-primary)]">
                    {money(aging?.totals.total ?? 0)}
                  </span>
                </div>
                {aging && aging.customers.length > 0 ? (
                  <>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
                      <Bucket label="Current" value={money(aging.totals.current)} />
                      <Bucket label="31–60" value={money(aging.totals.d31_60)} />
                      <Bucket label="61–90" value={money(aging.totals.d61_90)} warn />
                      <Bucket label="90+" value={money(aging.totals.d90plus)} warn />
                    </div>
                    <table className="mt-3 w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-[var(--color-text-muted)]">
                          <th className="pb-1.5 font-medium">Customer</th>
                          <th className="pb-1.5 text-right font-medium">90+</th>
                          <th className="pb-1.5 text-right font-medium">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--color-border)]">
                        {aging.customers.slice(0, 8).map((c) => (
                          <tr key={c.customerId ?? c.customerName}>
                            <td className="py-1.5 text-[var(--color-text-primary)]">{c.customerName}</td>
                            <td className="py-1.5 text-right text-[var(--color-text-secondary)]">
                              {c.d90plus > 0 ? money(c.d90plus) : "—"}
                            </td>
                            <td className="py-1.5 text-right font-medium text-[var(--color-text-primary)]">
                              {money(c.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <p className="mt-3 text-sm text-[var(--color-text-muted)]">No open account balances.</p>
                )}
              </section>
            </div>

            {/* ── Transactions ───────────────────────────────────── */}
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">Transactions</h2>

              {z && z.count > 0 ? (
                <table className="mt-3 w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)]">
                      <th className="pb-2 font-medium">Sale</th>
                      <th className="pb-2 font-medium">Time</th>
                      <th className="pb-2 text-right font-medium">Items</th>
                      <th className="pb-2 font-medium">Payment</th>
                      <th className="pb-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {data.sales.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2 font-mono text-xs text-[var(--color-text-secondary)]">{s.number}</td>
                        <td className="py-2 text-[var(--color-text-secondary)]">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">{s.lines.length}</td>
                        <td className="py-2">
                          <span className="rounded-full bg-[var(--color-moss-100)] px-2 py-0.5 text-xs font-medium capitalize text-[var(--color-moss-700)]">
                            {s.paymentMethod}
                          </span>
                        </td>
                        <td className="py-2 text-right font-medium text-[var(--color-text-primary)]">
                          {money(s.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="mt-3 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-text-muted)]">
                  No sales recorded for this period.
                </div>
              )}
            </section>

            {/* ── Google Ads offline conversions ─────────────────── */}
            <OfflineConversions
              from={mode === "day" ? date : from}
              to={mode === "day" ? date : to}
            />

            {/* ── All-time footer ────────────────────────────────── */}
            <footer className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
              <span className="font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                All-time
              </span>
              <span>{data.allTime.count} sales</span>
              <span>Gross {money(data.allTime.subtotal)}</span>
              <span>Profit {money(data.allTime.grossProfit)}</span>
              <span>Tax {money(data.allTime.tax)}</span>
              <span>Total {money(data.allTime.total)}</span>
            </footer>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd
        className={
          strong
            ? "font-display text-base font-bold text-[var(--color-text-primary)]"
            : "font-medium text-[var(--color-text-primary)]"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function Bucket({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-2 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className={`font-medium ${warn ? "text-[var(--color-danger)]" : "text-[var(--color-text-primary)]"}`}>
        {value}
      </p>
    </div>
  );
}
