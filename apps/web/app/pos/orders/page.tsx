"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ReceiptText,
  Filter,
  Check,
  Ban,
  DollarSign,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@balm/ui";
import {
  api,
  type Order,
  type OrderType,
  type OrderStatus,
} from "@/lib/api-client";

const OFFLINE_NOTE =
  "Can't reach the API — start it with `pnpm dev` in apps/api.";

const inputCls =
  "h-9 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] outline-none";

function money(n: number) {
  return (n ?? 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// ── Filter option lists ────────────────────────────────────────────────
const TYPE_OPTIONS: { value: "" | OrderType; label: string }[] = [
  { value: "", label: "All" },
  { value: "sale", label: "Sale" },
  { value: "delivery", label: "Delivery" },
  { value: "quote", label: "Quote" },
  { value: "will_call", label: "Will Call" },
  { value: "ship", label: "Ship" },
];

const STATUS_ORDER: OrderStatus[] = [
  "draft",
  "waiting_pickup",
  "complete",
  "unscheduled",
  "scheduled",
  "dispatched",
  "delivered",
  "void",
];

const STATUS_OPTIONS: { value: "" | OrderStatus; label: string }[] = [
  { value: "", label: "All" },
  ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) })),
];

function statusLabel(s: OrderStatus): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function typeLabel(t: OrderType): string {
  return t === "will_call" ? "Will Call" : t.charAt(0).toUpperCase() + t.slice(1);
}

// Color-coded status → semantic token
function statusColor(s: OrderStatus): string {
  switch (s) {
    case "complete":
    case "delivered":
      return "var(--color-success)";
    case "scheduled":
    case "dispatched":
    case "waiting_pickup":
      return "var(--color-info)";
    case "void":
      return "var(--color-danger)";
    case "unscheduled":
    case "draft":
    default:
      return "var(--color-text-muted)";
  }
}

function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color: statusColor(status), background: "var(--color-bg-surface)" }}
    >
      {statusLabel(status)}
    </span>
  );
}

function TypeBadge({ type }: { type: OrderType }) {
  // Quote type gets a warning accent; others a muted/moss accent.
  const isQuote = type === "quote";
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize"
      style={{
        color: isQuote ? "var(--color-warning)" : "var(--color-moss-700)",
        background: isQuote ? "var(--color-bg-surface)" : "var(--color-moss-100)",
      }}
    >
      {typeLabel(type)}
    </span>
  );
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<"" | OrderType>("");
  const [statusFilter, setStatusFilter] = useState<"" | OrderStatus>("");

  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const [selected, setSelected] = useState<Order | null>(null);
  const [mutating, setMutating] = useState(false);

  const PAGE = 50;

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const page = await api.pageOrders({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        limit: PAGE,
      });
      setOrders(page.data);
      setCursor(page.nextCursor);
    } catch {
      setError(OFFLINE_NOTE);
      setOrders([]);
      setCursor(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.pageOrders({
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        limit: PAGE,
        cursor,
      });
      setOrders((prev) => [...prev, ...page.data]);
      setCursor(page.nextCursor);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  const sorted = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [orders],
  );

  // Summary: revenue of filtered set where type != quote && status != void
  const revenue = useMemo(
    () =>
      orders
        .filter((o) => o.type !== "quote" && o.status !== "void")
        .reduce((sum, o) => sum + o.total, 0),
    [orders],
  );

  const dueCount = useMemo(
    () => orders.filter((o) => o.due > 0 && o.status !== "void").length,
    [orders],
  );

  async function refreshSelected(id: string) {
    try {
      const fresh = await api.getOrder(id);
      setSelected(fresh);
    } catch {
      // best-effort; list refresh below covers it
    }
  }

  async function changeStatus(order: Order, status: OrderStatus) {
    if (status === order.status) return;
    setMutating(true);
    try {
      await api.updateOrder(order.id, { status });
      await Promise.all([load(), refreshSelected(order.id)]);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setMutating(false);
    }
  }

  async function markPaid(order: Order) {
    setMutating(true);
    try {
      await api.updateOrder(order.id, { paid: true });
      await Promise.all([load(), refreshSelected(order.id)]);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setMutating(false);
    }
  }

  async function voidOrder(order: Order) {
    if (!window.confirm(`Void order ${order.number}? This cannot be undone.`)) return;
    setMutating(true);
    try {
      await api.updateOrder(order.id, { status: "void" });
      await Promise.all([load(), refreshSelected(order.id)]);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setMutating(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-[var(--color-text-primary)]">
            <ReceiptText className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
            Orders
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Sales, deliveries, quotes &amp; will-calls — track status and payment.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <Filter className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
            Filter
          </span>
          <label className="sr-only" htmlFor="type-filter">
            Type
          </label>
          <select
            id="type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "" | OrderType)}
            className={inputCls}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.value ? o.label : "All types"}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="status-filter">
            Status
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | OrderStatus)}
            className={inputCls}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.value ? o.label : "All statuses"}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Summary strip ───────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-2.5 text-xs text-[var(--color-text-muted)]">
        <span className="font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          {sorted.length} order{sorted.length === 1 ? "" : "s"}
          {cursor ? " shown" : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <DollarSign className="h-3.5 w-3.5 text-[var(--color-success)]" strokeWidth={1.75} aria-hidden />
          Revenue{" "}
          <span className="font-semibold text-[var(--color-text-primary)]">{money(revenue)}</span>
          <span className="text-[var(--color-text-muted)]">
            {cursor ? "(shown orders — see Reports for full totals)" : "(excl. quotes & voids)"}
          </span>
        </span>
        {dueCount > 0 && (
          <span className="font-medium text-[var(--color-danger)]">
            {dueCount} with balance due
          </span>
        )}
      </div>

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3.5 py-2.5 text-sm text-[var(--color-text-secondary)]">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-warning)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
            Loading orders…
          </div>
        ) : sorted.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-16 text-center">
            <ReceiptText
              className="mx-auto h-8 w-8 text-[var(--color-text-muted)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-3 text-sm font-medium text-[var(--color-text-secondary)]">
              {error ? "No orders to show" : "No orders match these filters"}
            </p>
            {!error && (typeFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter("");
                  setStatusFilter("");
                }}
                className="mt-2 text-xs font-medium text-[var(--color-text-brand)] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="px-3 py-2.5 font-medium">Order #</th>
                  <th className="px-3 py-2.5 font-medium">Date</th>
                  <th className="px-3 py-2.5 font-medium">Customer</th>
                  <th className="px-3 py-2.5 font-medium">Type</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Payment</th>
                  <th className="px-3 py-2.5 text-right font-medium">Total</th>
                  <th className="px-3 py-2.5 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {sorted.map((o) => (
                  <tr
                    key={o.id}
                    onClick={() => setSelected(o)}
                    className="cursor-pointer transition-colors hover:bg-[var(--color-bg-surface)]"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-[var(--color-text-primary)]">
                      {o.number}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[var(--color-text-secondary)]">
                      {new Date(o.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5 text-[var(--color-text-primary)]">
                      {o.customerName || "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <TypeBadge type={o.type} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={o.status} />
                    </td>
                    <td className="px-3 py-2.5 capitalize text-[var(--color-text-secondary)]">
                      {o.paymentMethod}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium text-[var(--color-text-primary)]">
                      {money(o.total)}
                    </td>
                    <td className="px-3 py-2.5">
                      {o.paid || o.due <= 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success)]">
                          <Check className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          Paid
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-[var(--color-danger)]">
                          Due {money(o.due)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {cursor && !loading && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden /> : null}
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Detail modal ────────────────────────────────────────── */}
      {selected && (
        <OrderDetail
          order={selected}
          mutating={mutating}
          onClose={() => setSelected(null)}
          onStatus={(s) => changeStatus(selected, s)}
          onMarkPaid={() => markPaid(selected)}
          onVoid={() => voidOrder(selected)}
        />
      )}
    </div>
  );
}

// ── Detail panel ────────────────────────────────────────────────────────
function OrderDetail({
  order,
  mutating,
  onClose,
  onStatus,
  onMarkPaid,
  onVoid,
}: {
  order: Order;
  mutating: boolean;
  onClose: () => void;
  onStatus: (s: OrderStatus) => void;
  onMarkPaid: () => void;
  onVoid: () => void;
}) {
  const canManage = order.status !== "void" && order.type !== "quote";
  const hasDue = order.due > 0 && order.status !== "void";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
      onClick={() => !mutating && onClose()}
    >
      <div
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-lg)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-base font-bold text-[var(--color-text-primary)]">
                {order.number}
              </span>
              <TypeBadge type={order.type} />
              <StatusBadge status={order.status} />
            </div>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {order.customerName || "Walk-in"} &middot;{" "}
              <span className="text-[var(--color-text-muted)]">
                {new Date(order.createdAt).toLocaleString()}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)]"
            aria-label="Close"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
          {/* Line items */}
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg-surface)] text-left text-xs text-[var(--color-text-muted)]">
                  <th className="px-3 py-2 font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Qty</th>
                  <th className="px-3 py-2 text-right font-medium">Unit</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {order.lines.map((l, i) => (
                  <tr key={`${l.productId}-${i}`}>
                    <td className="px-3 py-2 text-[var(--color-text-primary)]">{l.name}</td>
                    <td className="px-3 py-2 text-right text-[var(--color-text-secondary)]">
                      {l.qty}
                      {l.unitLabel ? (
                        <span className="text-[var(--color-text-muted)]"> {l.unitLabel}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right text-[var(--color-text-secondary)]">
                      {money(l.unitPrice)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-[var(--color-text-primary)]">
                      {money(l.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <dl className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-[var(--color-text-secondary)]">Subtotal</dt>
              <dd className="font-medium text-[var(--color-text-primary)]">{money(order.subtotal)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[var(--color-text-secondary)]">
                Tax{" "}
                <span className="text-[var(--color-text-muted)]">
                  ({(order.taxRate * 100).toFixed(2).replace(/\.?0+$/, "")}%)
                </span>
              </dt>
              <dd className="font-medium text-[var(--color-text-primary)]">{money(order.tax)}</dd>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-1.5">
              <dt className="text-[var(--color-text-primary)]">Total</dt>
              <dd className="font-display text-base font-bold text-[var(--color-text-primary)]">
                {money(order.total)}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[var(--color-text-secondary)]">Payment</dt>
              <dd className="capitalize text-[var(--color-text-primary)]">{order.paymentMethod}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-[var(--color-text-secondary)]">Balance</dt>
              <dd>
                {order.paid || order.due <= 0 ? (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--color-success)]">
                    <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                    Paid
                  </span>
                ) : (
                  <span className="text-sm font-semibold text-[var(--color-danger)]">
                    Due {money(order.due)}
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </div>

        {/* Footer — controls */}
        {canManage ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
            <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Status
              <select
                value={order.status}
                onChange={(e) => onStatus(e.target.value as OrderStatus)}
                disabled={mutating}
                className={`${inputCls} normal-case`}
              >
                {STATUS_ORDER.filter((s) => s !== "void").map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              {hasDue && (
                <Button size="sm" variant="secondary" onClick={onMarkPaid} disabled={mutating}>
                  {mutating ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
                  ) : (
                    <DollarSign className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  )}
                  Mark paid
                </Button>
              )}
              <Button size="sm" variant="destructive" onClick={onVoid} disabled={mutating}>
                <Ban className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Void
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-[var(--color-border)] px-5 py-3 text-xs text-[var(--color-text-muted)]">
            {order.status === "void"
              ? "This order is void — no further actions."
              : "Quotes are read-only here. Convert to a sale to manage status & payment."}
          </div>
        )}
      </div>
    </div>
  );
}
