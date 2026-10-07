"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  X,
  ClipboardList,
  PackageCheck,
  AlertTriangle,
  Trash2,
  Truck,
  Loader2,
  Package,
} from "lucide-react";
import { Button } from "@balm/ui";
import {
  api,
  type PurchaseOrder,
  type Vendor,
  type InventoryRow,
} from "@/lib/api-client";

const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]";

const OFFLINE_NOTE =
  "Can't reach the API — start it with `pnpm dev` in apps/api.";

const STATUS: Record<
  PurchaseOrder["status"],
  { label: string; color: string }
> = {
  draft: { label: "Draft", color: "var(--color-text-muted)" },
  ordered: { label: "Ordered", color: "var(--color-info)" },
  received: { label: "Received", color: "var(--color-success)" },
  cancelled: { label: "Cancelled", color: "var(--color-danger)" },
};

function money(n: number) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface DraftLine {
  productId: string;
  name: string;
  qty: number;
  unitCost: number;
}

export default function PurchasingPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<string | null>(null);

  // builder state
  const [showBuilder, setShowBuilder] = useState(false);
  const [vendorId, setVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [picker, setPicker] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [builderError, setBuilderError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [po, vs, inv] = await Promise.all([
        api.listPurchaseOrders(),
        api.listVendors(),
        api.listInventory(),
      ]);
      setOrders(po);
      setVendors(vs);
      setInventory(inv);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const sortedOrders = useMemo(
    () =>
      [...orders].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    [orders],
  );

  const openCount = useMemo(
    () => orders.filter((o) => o.status === "draft" || o.status === "ordered").length,
    [orders],
  );

  const lowStock = useMemo(() => inventory.filter((r) => r.low), [inventory]);

  const builderTotal = useMemo(
    () => lines.reduce((sum, l) => sum + l.qty * l.unitCost, 0),
    [lines],
  );

  const filteredInventory = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return inventory;
    return inventory.filter(
      (r) =>
        r.name.toLowerCase().includes(q) || r.sku.toLowerCase().includes(q),
    );
  }, [inventory, search]);

  async function receive(id: string) {
    setReceiving(id);
    try {
      await api.receivePurchaseOrder(id);
      await load();
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setReceiving(null);
    }
  }

  function openBuilder() {
    setVendorId(vendors[0]?.id ?? "");
    setNotes("");
    setLines([]);
    setPicker("");
    setSearch("");
    setBuilderError(null);
    setShowBuilder(true);
  }

  function addLine(row: InventoryRow) {
    setLines((prev) => {
      if (prev.some((l) => l.productId === row.productId)) return prev;
      return [
        ...prev,
        {
          productId: row.productId,
          name: row.name,
          qty: row.reorderQty || 1,
          unitCost: 0,
        },
      ];
    });
  }

  function fillFromLowStock() {
    setLines((prev) => {
      const next = [...prev];
      for (const row of lowStock) {
        if (!next.some((l) => l.productId === row.productId)) {
          next.push({
            productId: row.productId,
            name: row.name,
            qty: row.reorderQty || 1,
            unitCost: 0,
          });
        }
      }
      return next;
    });
  }

  function updateLine(productId: string, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((l) => (l.productId === productId ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(productId: string) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendorId) {
      setBuilderError("Pick a vendor.");
      return;
    }
    if (lines.length === 0) {
      setBuilderError("Add at least one line item.");
      return;
    }
    setSubmitting(true);
    setBuilderError(null);
    try {
      await api.createPurchaseOrder({
        vendorId,
        lines: lines.map((l) => ({
          productId: l.productId,
          name: l.name,
          qty: l.qty,
          unitCost: l.unitCost,
        })),
        notes: notes.trim() || undefined,
      });
      setShowBuilder(false);
      await load();
    } catch {
      setBuilderError(OFFLINE_NOTE);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Purchasing
          </h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[var(--color-text-muted)]">
            <span>
              {openCount} open purchase order{openCount === 1 ? "" : "s"}
            </span>
            {lowStock.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[var(--color-warning)]">
                <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                {lowStock.length} suggested reorder{lowStock.length === 1 ? "" : "s"}
              </span>
            )}
          </p>
        </div>
        <Button size="sm" onClick={openBuilder} disabled={loading && orders.length === 0}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          New Purchase Order
        </Button>
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
            Loading purchase orders…
          </div>
        ) : sortedOrders.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-16 text-center">
            <ClipboardList
              className="mx-auto h-8 w-8 text-[var(--color-text-muted)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-3 text-sm font-medium text-[var(--color-text-secondary)]">
              {error ? "No purchase orders to show" : "No purchase orders yet"}
            </p>
            {!error && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                Create one to restock from a vendor.
              </p>
            )}
          </div>
        ) : (
          <ul className="space-y-2.5">
            {sortedOrders.map((po) => {
              const s = STATUS[po.status];
              const canReceive = po.status === "draft" || po.status === "ordered";
              return (
                <li
                  key={po.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3.5 shadow-[var(--shadow-sm)]"
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-mono text-sm font-semibold text-[var(--color-text-primary)]">
                      {po.number}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={{ color: s.color, background: "var(--color-bg-surface)" }}
                    >
                      {s.label}
                    </span>
                    <span className="text-sm text-[var(--color-text-secondary)]">
                      {po.vendorName}
                    </span>
                    <div className="ml-auto flex items-center gap-3">
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {money(po.total)}
                      </span>
                      {canReceive && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => receive(po.id)}
                          disabled={receiving === po.id}
                        >
                          {receiving === po.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
                          ) : (
                            <PackageCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          )}
                          Receive
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                      {po.lines.length} line{po.lines.length === 1 ? "" : "s"}
                    </span>
                    <span>Created {fmtDate(po.createdAt)}</span>
                    {po.receivedAt && <span>Received {fmtDate(po.receivedAt)}</span>}
                    {po.notes && (
                      <span className="truncate text-[var(--color-text-secondary)]">{po.notes}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Builder modal ───────────────────────────────────────── */}
      {showBuilder && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
          onClick={() => !submitting && setShowBuilder(false)}
        >
          <div
            className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)] sm:rounded-[var(--radius-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-[var(--color-text-secondary)]" strokeWidth={1.75} aria-hidden />
                <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                  New Purchase Order
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowBuilder(false)}
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>

            <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
                {/* Vendor */}
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Vendor
                  </span>
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="" disabled>
                      Select a vendor…
                    </option>
                    {vendors.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </label>

                {/* Add products */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                      Line items
                    </span>
                    {lowStock.length > 0 && (
                      <button
                        type="button"
                        onClick={fillFromLowStock}
                        className="inline-flex items-center gap-1 text-xs font-medium text-[var(--color-text-brand)] hover:underline"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                        Fill from low stock ({lowStock.length})
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search products by name or SKU…"
                      className={inputCls}
                    />
                    <select
                      value={picker}
                      onChange={(e) => {
                        const row = inventory.find((r) => r.productId === e.target.value);
                        if (row) addLine(row);
                        setPicker("");
                      }}
                      className={`${inputCls} w-48`}
                    >
                      <option value="">Add product…</option>
                      {filteredInventory.map((r) => (
                        <option key={r.productId} value={r.productId}>
                          {r.name}
                          {r.low ? " · low" : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Lines */}
                  {lines.length === 0 ? (
                    <div className="mt-2.5 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-text-muted)]">
                      No line items yet — search and add products above.
                    </div>
                  ) : (
                    <div className="mt-2.5 space-y-2">
                      {lines.map((l) => (
                        <div
                          key={l.productId}
                          className="grid grid-cols-[1fr_70px_96px_auto] items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-2"
                        >
                          <span className="truncate text-sm text-[var(--color-text-primary)]">
                            {l.name}
                          </span>
                          <input
                            type="number"
                            min={0}
                            value={l.qty}
                            onChange={(e) =>
                              updateLine(l.productId, { qty: Number(e.target.value) || 0 })
                            }
                            aria-label="Quantity"
                            className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 text-sm text-[var(--color-text-primary)]"
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-[var(--color-text-muted)]">$</span>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={l.unitCost}
                              onChange={(e) =>
                                updateLine(l.productId, {
                                  unitCost: Number(e.target.value) || 0,
                                })
                              }
                              aria-label="Unit cost"
                              className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 text-sm text-[var(--color-text-primary)]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeLine(l.productId)}
                            className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-danger)]"
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.75} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Notes */}
                <label className="block">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                    Notes <span className="font-normal normal-case text-[var(--color-text-muted)]">(optional)</span>
                  </span>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Delivery instructions, PO reference…"
                    className={inputCls}
                  />
                </label>

                {builderError && (
                  <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-danger)]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                    <span>{builderError}</span>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-4">
                <div className="text-sm text-[var(--color-text-muted)]">
                  Total{" "}
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {money(builderTotal)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowBuilder(false)}
                    disabled={submitting}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden />
                    ) : (
                      <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    )}
                    Create order
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
