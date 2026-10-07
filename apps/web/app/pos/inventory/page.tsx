"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Package,
  Plus,
  Minus,
  Search,
  AlertTriangle,
  Pencil,
  Trash2,
  X,
  Loader2,
  MapPin,
  Upload,
  Download,
  Image as ImageIcon,
  Tag,
  Ruler,
  ShoppingCart,
  Barcode,
  Printer,
} from "lucide-react";
import { Button } from "@balm/ui";
import { api, type InventoryRow, type ApiProduct, type Taxonomy, type Vendor } from "@/lib/api-client";
import { printLabels } from "@/lib/labels";
import { parseCsv, csvCell } from "@/lib/csv";
import { compressImage } from "@/lib/image";

const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none";

const API_DOWN = "Can't reach the API — start it with `pnpm dev` in apps/api.";

const bulkBtn =
  "rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-40";

interface ProductForm {
  name: string;
  category: string;
  subcategory: string;
  description: string;
  price: string;
  image: string;
  active: boolean;
  unit: string;
}

const EMPTY_FORM: ProductForm = {
  name: "",
  category: "",
  subcategory: "",
  description: "",
  price: "",
  image: "",
  active: true,
  unit: "Cubic Yard",
};


export default function InventoryPage() {
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy>({ categories: [], units: [] });
  const [managerOpen, setManagerOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkCat, setBulkCat] = useState("");
  const [bulkReorder, setBulkReorder] = useState("");
  const [bulkLocation, setBulkLocation] = useState("");
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [replenOpen, setReplenOpen] = useState(false);
  const [replenVendor, setReplenVendor] = useState("");
  const [replenLines, setReplenLines] = useState<{ productId: string; name: string; qty: number; unitCost: number; include: boolean }[]>([]);
  const [replenBusy, setReplenBusy] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [inv, prods, tax, vends] = await Promise.all([api.listInventory(), api.listProducts(), api.getTaxonomy(), api.listVendors()]);
      setRows(inv);
      setProducts(prods);
      setTaxonomy(tax);
      setVendors(vends);
    } catch {
      setError(API_DOWN);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const productById = useMemo(() => {
    const m = new Map<string, ApiProduct>();
    for (const p of products) m.set(p.id, p);
    return m;
  }, [products]);

  const lowCount = useMemo(() => rows.filter((r) => r.low).length, [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (lowOnly && !r.low) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q) ||
        r.location.toLowerCase().includes(q)
      );
    });
  }, [rows, search, lowOnly]);

  const setBusyFor = (id: string, v: boolean) =>
    setBusy((b) => ({ ...b, [id]: v }));

  const patchRow = (next: InventoryRow) =>
    setRows((prev) => prev.map((r) => (r.productId === next.productId ? next : r)));

  // ── Inventory mutations ──────────────────────────────────────────────
  const adjust = async (row: InventoryRow, delta: number) => {
    if (delta < 0 && row.qtyOnHand <= 0) return;
    setBusyFor(row.productId, true);
    setError(null);
    try {
      const updated = await api.adjustStock(row.productId, delta);
      patchRow(updated);
    } catch {
      setError(API_DOWN);
    } finally {
      setBusyFor(row.productId, false);
    }
  };

  const saveReorderPoint = async (row: InventoryRow, value: string) => {
    const reorderPoint = Number(value);
    if (!Number.isFinite(reorderPoint) || reorderPoint === row.reorderPoint) return;
    setBusyFor(row.productId, true);
    setError(null);
    try {
      const updated = await api.updateInventory(row.productId, { reorderPoint });
      patchRow(updated);
    } catch {
      setError(API_DOWN);
    } finally {
      setBusyFor(row.productId, false);
    }
  };

  // ── Product form ─────────────────────────────────────────────────────
  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setFormOpen(true);
  };

  const openEditForProduct = (productId: string) => {
    const p = productById.get(productId);
    if (!p) return;
    const inv = rows.find((r) => r.productId === productId);
    setEditingId(p.id);
    setForm({
      name: p.name,
      category: p.category,
      subcategory: p.subcategory,
      description: p.description,
      price: p.price,
      image: p.image,
      active: p.active,
      unit: inv?.unit ?? "Cubic Yard",
    });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const updField = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ── Bulk edit ────────────────────────────────────────────────────────
  const toggleSelect = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleSelectAll = () =>
    setSelected((s) => {
      const n = new Set(s);
      const all = visibleRows.every((r) => n.has(r.productId));
      visibleRows.forEach((r) => (all ? n.delete(r.productId) : n.add(r.productId)));
      return n;
    });
  const clearSelection = () => setSelected(new Set());

  async function applyBulk(opts: { category?: string; active?: boolean; reorderPoint?: number; location?: string }) {
    if (selected.size === 0) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const productId of selected) {
        const prodPatch: Partial<ApiProduct> = {};
        if (opts.category !== undefined) prodPatch.category = opts.category;
        if (opts.active !== undefined) prodPatch.active = opts.active;
        if (Object.keys(prodPatch).length) await api.updateProduct(productId, prodPatch);
        const invPatch: Partial<InventoryRow> = {};
        if (opts.reorderPoint !== undefined) invPatch.reorderPoint = opts.reorderPoint;
        if (opts.location !== undefined) invPatch.location = opts.location;
        if (Object.keys(invPatch).length) await api.updateInventory(productId, invPatch);
      }
      await refresh();
      setImportMsg(`Updated ${selected.size} product${selected.size === 1 ? "" : "s"}.`);
      clearSelection();
      setBulkCat("");
      setBulkReorder("");
      setBulkLocation("");
    } catch {
      setError(API_DOWN);
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelected() {
    if (selected.size === 0) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete ${selected.size} selected product(s)? This removes them from the website too.`)) return;
    setBulkBusy(true);
    setError(null);
    try {
      for (const id of selected) await api.deleteProduct(id);
      await refresh();
      clearSelection();
    } catch {
      setError(API_DOWN);
    } finally {
      setBulkBusy(false);
    }
  }

  async function saveTaxonomy(next: Taxonomy) {
    try {
      const saved = await api.updateTaxonomy(next);
      setTaxonomy(saved);
      setManagerOpen(false);
    } catch {
      setError(API_DOWN);
    }
  }

  // ── SKUs / barcodes / labels ─────────────────────────────────────────
  async function generateSkus() {
    const missing = rows.filter((r) => !r.sku || !r.sku.trim());
    if (missing.length === 0) {
      setImportMsg("Every product already has a SKU/barcode.");
      return;
    }
    setError(null);
    try {
      const used = new Set(rows.map((r) => (r.sku || "").toUpperCase()));
      const counters = new Map<string, number>();
      for (const r of missing) {
        const cat = productById.get(r.productId)?.category ?? "SKU";
        const prefix = cat.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "SKU";
        let n = (counters.get(prefix) ?? 0) + 1;
        let sku = `${prefix}-${String(n).padStart(4, "0")}`;
        while (used.has(sku)) {
          n++;
          sku = `${prefix}-${String(n).padStart(4, "0")}`;
        }
        counters.set(prefix, n);
        used.add(sku);
        await api.updateInventory(r.productId, { sku });
      }
      await refresh();
      setImportMsg(`Generated ${missing.length} SKU${missing.length === 1 ? "" : "s"}.`);
    } catch {
      setError(API_DOWN);
    }
  }

  const printSelectedLabels = () => {
    const source = selected.size > 0 ? rows.filter((r) => selected.has(r.productId)) : visibleRows;
    void printLabels(
      source.map((r) => ({ name: r.name, price: productById.get(r.productId)?.price ?? "", sku: r.sku || r.productId })),
      null,
    );
  };

  // ── Replenishment (auto-PO from low stock) ───────────────────────────
  const openReplenishment = () => {
    const low = rows.filter((r) => r.low);
    setReplenLines(
      low.map((r) => ({
        productId: r.productId,
        name: r.name,
        qty: r.reorderQty > 0 ? r.reorderQty : Math.max(1, r.reorderPoint * 2 - r.qtyOnHand),
        unitCost: r.cost ?? 0,
        include: true,
      })),
    );
    setReplenVendor(vendors[0]?.id ?? "");
    setReplenOpen(true);
  };
  const updReplen = (productId: string, patch: Partial<{ qty: number; unitCost: number; include: boolean }>) =>
    setReplenLines((ls) => ls.map((l) => (l.productId === productId ? { ...l, ...patch } : l)));
  const replenTotal = replenLines.reduce((s, l) => (l.include ? s + l.qty * l.unitCost : s), 0);

  async function submitReplenishment() {
    const lines = replenLines
      .filter((l) => l.include && l.qty > 0)
      .map((l) => ({ productId: l.productId, name: l.name, qty: Math.max(1, Math.round(l.qty)), unitCost: l.unitCost }));
    if (!replenVendor || lines.length === 0) return;
    setReplenBusy(true);
    setError(null);
    try {
      const po = await api.createPurchaseOrder({ vendorId: replenVendor, lines, notes: "Auto-replenishment from low stock", status: "draft" });
      setReplenOpen(false);
      setImportMsg(`Created draft ${po.number} with ${lines.length} item${lines.length === 1 ? "" : "s"} — review & send it in Purchasing.`);
    } catch {
      setError(API_DOWN);
    } finally {
      setReplenBusy(false);
    }
  }

  // ── CSV export / import ──────────────────────────────────────────────
  const exportCsv = () => {
    const header = ["sku", "name", "category", "subcategory", "description", "price", "qtyOnHand", "reorderPoint", "location", "active", "image"];
    const body = products.map((p) => {
      const inv = rows.find((r) => r.productId === p.id);
      return [p.id, p.name, p.category, p.subcategory, p.description, p.price, inv?.qtyOnHand ?? 0, inv?.reorderPoint ?? 0, inv?.location ?? "", p.active ? "yes" : "no", p.image]
        .map(csvCell)
        .join(",");
    });
    const csv = [header.join(","), ...body].join("\n") + "\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `balm-inventory-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportMsg(null);
    setError(null);
    try {
      const records = parseCsv(await file.text());
      const byName = new Map(products.map((p) => [p.name.trim().toLowerCase(), p]));
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const rec of records) {
        const name = (rec.name ?? "").trim();
        if (!name) { skipped++; continue; }
        const productBody = {
          name,
          category: rec.category ?? "",
          subcategory: rec.subcategory ?? "",
          description: rec.description ?? "",
          price: rec.price ?? "",
          image: rec.image ?? "",
          active: rec.active ? !/^(no|false|0)$/i.test(rec.active) : true,
        };
        const existing = byName.get(name.toLowerCase());
        let productId: string;
        if (existing) {
          await api.updateProduct(existing.id, productBody);
          productId = existing.id;
          updated++;
        } else {
          const p = await api.createProduct(productBody);
          productId = p.id;
          await api.ensureInventory(productId);
          created++;
        }
        const invPatch: Partial<InventoryRow> = {};
        if (rec.qtyonhand) invPatch.qtyOnHand = Number(rec.qtyonhand);
        if (rec.reorderpoint) invPatch.reorderPoint = Number(rec.reorderpoint);
        if (rec.location) invPatch.location = rec.location;
        if (Object.keys(invPatch).length) {
          await api.ensureInventory(productId);
          await api.updateInventory(productId, invPatch);
        }
      }
      await refresh();
      setImportMsg(`Imported ${created} new, updated ${updated}${skipped ? `, skipped ${skipped}` : ""}.`);
    } catch {
      setError("Import failed — the CSV needs at least a 'name' column (matching the Export format).");
    } finally {
      setImporting(false);
    }
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const dataUrl = await compressImage(file, 1280, "image/jpeg", 0.82);
      const url = await api.uploadImage(dataUrl);
      updField("image", url);
    } catch {
      setFormError("Couldn't upload that image — try a smaller file or paste a URL.");
    } finally {
      setUploading(false);
    }
  };

  const submitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const { unit, ...productBody } = form;
      if (editingId) {
        await api.updateProduct(editingId, productBody);
        await api.updateInventory(editingId, { unit });
      } else {
        const created = await api.createProduct(productBody);
        // New products need a stock row, otherwise they never show in inventory.
        await api.ensureInventory(created.id);
        await api.updateInventory(created.id, { unit });
      }
      await refresh();
      closeForm();
    } catch {
      setFormError(API_DOWN);
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (productId: string) => {
    const p = productById.get(productId);
    if (!p) return;
    if (typeof window !== "undefined" && !window.confirm(`Delete "${p.name}"? This removes it from the website too.`))
      return;
    setBusyFor(productId, true);
    setError(null);
    try {
      await api.deleteProduct(p.id);
      await refresh();
    } catch {
      setError(API_DOWN);
    } finally {
      setBusyFor(productId, false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div className="mr-auto">
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
            Inventory
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {rows.length} SKU{rows.length === 1 ? "" : "s"}
            {lowCount > 0 && (
              <>
                {" · "}
                <span className="font-medium text-[var(--color-warning)]">
                  {lowCount} low
                </span>
              </>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setLowOnly((v) => !v)}
          className={`flex h-9 items-center gap-2 rounded-[var(--radius-md)] border px-3 text-sm font-medium ${
            lowOnly
              ? "border-[var(--color-warning)] bg-[var(--color-clay-500)]/15 text-[var(--color-warning)]"
              : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
          }`}
        >
          <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Low stock only
        </button>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU, location…"
            className={`${inputCls} w-60 pl-8`}
          />
        </div>

        <Button size="sm" variant="secondary" onClick={openReplenishment} disabled={lowCount === 0}>
          <ShoppingCart className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Replenish{lowCount > 0 ? ` (${lowCount})` : ""}
        </Button>

        <Button size="sm" variant="secondary" onClick={() => void generateSkus()}>
          <Barcode className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Generate SKUs
        </Button>

        <Button size="sm" variant="secondary" onClick={printSelectedLabels} disabled={rows.length === 0}>
          <Printer className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Print Labels{selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>

        <Button size="sm" variant="secondary" onClick={() => setManagerOpen(true)}>
          <Tag className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Categories &amp; Units
        </Button>

        <Button size="sm" variant="secondary" onClick={exportCsv}>
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Export CSV
        </Button>

        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-transparent px-3 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]">
          {importing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          {importing ? "Importing…" : "Import CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            disabled={importing}
            onChange={(e) => void onImportFile(e.target.files?.[0])}
          />
        </label>

        <Button size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
          Add Product
        </Button>
      </div>

      {importMsg && (
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-moss-100)] px-5 py-2 text-sm text-[var(--color-moss-700)]">
          <span>{importMsg}</span>
          <button onClick={() => setImportMsg(null)} aria-label="Dismiss" className="hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Bulk edit bar ─────────────────────────────────────────────── */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-action)] bg-[var(--color-moss-100)]/60 px-5 py-2.5 text-sm">
          <span className="font-semibold text-[var(--color-text-primary)]">{selected.size} selected</span>
          <button onClick={clearSelection} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">Clear</button>
          <span className="mx-1 h-5 w-px bg-[var(--color-border)]" />

          <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} className="h-8 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 text-sm text-[var(--color-text-primary)]">
            <option value="">Category…</option>
            {taxonomy.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button disabled={!bulkCat || bulkBusy} onClick={() => void applyBulk({ category: bulkCat })} className={bulkBtn}>Set</button>

          <button disabled={bulkBusy} onClick={() => void applyBulk({ active: true })} className={bulkBtn}>Activate</button>
          <button disabled={bulkBusy} onClick={() => void applyBulk({ active: false })} className={bulkBtn}>Deactivate</button>

          <input type="number" min="0" value={bulkReorder} onChange={(e) => setBulkReorder(e.target.value)} placeholder="Reorder pt" className="h-8 w-24 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 text-sm text-[var(--color-text-primary)]" />
          <button disabled={bulkReorder === "" || bulkBusy} onClick={() => void applyBulk({ reorderPoint: Number(bulkReorder) })} className={bulkBtn}>Set</button>

          <input value={bulkLocation} onChange={(e) => setBulkLocation(e.target.value)} placeholder="Location" className="h-8 w-28 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 text-sm text-[var(--color-text-primary)]" />
          <button disabled={!bulkLocation || bulkBusy} onClick={() => void applyBulk({ location: bulkLocation })} className={bulkBtn}>Set</button>

          <button disabled={bulkBusy} onClick={() => void deleteSelected()} className="ml-auto flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-danger)] px-2.5 py-1 text-xs font-medium text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 disabled:opacity-50">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
          {bulkBusy && <Loader2 className="h-4 w-4 animate-spin text-[var(--color-action)]" />}
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-clay-500)]/15 px-3.5 py-2.5 text-sm text-[var(--color-warning)]">
            <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
            <span className="font-mono">{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-[var(--color-text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Loading inventory…
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-20 text-center">
            <Package className="h-8 w-8 text-[var(--color-text-muted)]" strokeWidth={1.5} aria-hidden />
            <p className="text-sm font-medium text-[var(--color-text-secondary)]">
              {rows.length === 0
                ? "No inventory yet"
                : lowOnly
                  ? "No low-stock items"
                  : "No items match your search"}
            </p>
            {rows.length === 0 && !error && (
              <Button size="sm" variant="secondary" onClick={openAdd}>
                <Plus className="h-4 w-4" aria-hidden />
                Add your first product
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="w-8 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={visibleRows.length > 0 && visibleRows.every((r) => selected.has(r.productId))}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="h-4 w-4 accent-[var(--color-action)]"
                    />
                  </th>
                  <th className="px-4 py-2.5">Item</th>
                  <th className="px-4 py-2.5">SKU</th>
                  <th className="px-4 py-2.5">Location</th>
                  <th className="px-4 py-2.5 text-center">On hand</th>
                  <th className="px-4 py-2.5 text-center">Reorder pt</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((r) => {
                  const isBusy = !!busy[r.productId];
                  const hasProduct = productById.has(r.productId);
                  return (
                    <tr
                      key={r.id}
                      className={`border-b border-[var(--color-border)] last:border-b-0 ${
                        selected.has(r.productId) ? "bg-[var(--color-moss-100)]/40" : r.low ? "bg-[var(--color-clay-500)]/[0.06]" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selected.has(r.productId)}
                          onChange={() => toggleSelect(r.productId)}
                          aria-label={`Select ${r.name}`}
                          className="h-4 w-4 accent-[var(--color-action)]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--color-text-primary)]">
                            {r.name}
                          </span>
                          <span className="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-text-muted)]">{r.unit}</span>
                          {r.low && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-clay-500)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--color-warning)]">
                              <AlertTriangle className="h-3 w-3" strokeWidth={2} aria-hidden />
                              Low
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-muted)]">
                        {r.sku}
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden />
                          {r.location || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy || r.qtyOnHand <= 0}
                            onClick={() => adjust(r, -1)}
                            aria-label={`Decrease ${r.name}`}
                            className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-40"
                          >
                            <Minus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          </button>
                          <span className="min-w-[3.5rem] text-center font-medium text-[var(--color-text-primary)]">
                            {r.qtyOnHand}
                            <span className="ml-1 text-xs text-[var(--color-text-muted)]">{r.unit}</span>
                          </span>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => adjust(r, 1)}
                            aria-label={`Increase ${r.name}`}
                            className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-40"
                          >
                            <Plus className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <input
                          type="number"
                          min={0}
                          defaultValue={r.reorderPoint}
                          disabled={isBusy}
                          key={`${r.productId}-${r.reorderPoint}`}
                          onBlur={(e) => saveReorderPoint(r, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          aria-label={`Reorder point for ${r.name}`}
                          className="h-8 w-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2 text-center text-sm text-[var(--color-text-primary)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none disabled:opacity-40"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {isBusy && (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin text-[var(--color-text-muted)]" aria-hidden />
                          )}
                          <button
                            type="button"
                            disabled={!hasProduct || isBusy}
                            onClick={() => openEditForProduct(r.productId)}
                            aria-label={`Edit ${r.name}`}
                            title={hasProduct ? "Edit product" : "No linked product"}
                            className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)] disabled:opacity-30"
                          >
                            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                          </button>
                          <button
                            type="button"
                            disabled={!hasProduct || isBusy}
                            onClick={() => deleteProduct(r.productId)}
                            aria-label={`Delete ${r.name}`}
                            title={hasProduct ? "Delete product" : "No linked product"}
                            className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-danger)]/15 hover:text-[var(--color-danger)] disabled:opacity-30"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add / Edit product modal ────────────────────────────────── */}
      {managerOpen && (
        <TaxonomyManager taxonomy={taxonomy} onClose={() => setManagerOpen(false)} onSave={saveTaxonomy} />
      )}

      {replenOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={() => setReplenOpen(false)}>
          <div className="flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
              <div>
                <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">Replenishment</h3>
                <p className="text-xs text-[var(--color-text-muted)]">{replenLines.length} low-stock item{replenLines.length === 1 ? "" : "s"} · suggested order quantities</p>
              </div>
              <button onClick={() => setReplenOpen(false)} aria-label="Close" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="border-b border-[var(--color-border)] px-5 py-3">
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Vendor</label>
              <select value={replenVendor} onChange={(e) => setReplenVendor(e.target.value)} className={inputCls}>
                <option value="">Select a vendor…</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="sticky top-0 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                    <th className="w-8 px-4 py-2"></th>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-center">On hand</th>
                    <th className="px-4 py-2 text-center">Order qty</th>
                    <th className="px-4 py-2 text-right">Unit cost</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {replenLines.map((l) => (
                    <tr key={l.productId} className={`border-b border-[var(--color-border)] ${l.include ? "" : "opacity-40"}`}>
                      <td className="px-4 py-2">
                        <input type="checkbox" checked={l.include} onChange={(e) => updReplen(l.productId, { include: e.target.checked })} aria-label={`Include ${l.name}`} className="h-4 w-4 accent-[var(--color-action)]" />
                      </td>
                      <td className="px-4 py-2 text-[var(--color-text-primary)]">{l.name}</td>
                      <td className="px-4 py-2 text-center text-[var(--color-text-secondary)]">{(rows.find((r) => r.productId === l.productId)?.qtyOnHand) ?? 0}</td>
                      <td className="px-4 py-2 text-center">
                        <input type="number" min="1" step="1" value={l.qty} onChange={(e) => updReplen(l.productId, { qty: Number(e.target.value) })} className="h-8 w-16 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] text-center text-sm text-[var(--color-text-primary)]" />
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-0.5">
                          <span className="text-[var(--color-text-muted)]">$</span>
                          <input type="number" min="0" step="0.01" value={l.unitCost} onChange={(e) => updReplen(l.productId, { unitCost: Number(e.target.value) })} className="h-8 w-20 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-1 text-right text-sm text-[var(--color-text-primary)]" />
                        </div>
                      </td>
                      <td className="px-4 py-2 text-right font-medium text-[var(--color-text-primary)]">${(l.qty * l.unitCost).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] px-5 py-3">
              <span className="text-sm text-[var(--color-text-secondary)]">
                Est. total <span className="font-display text-lg font-bold text-[var(--color-text-primary)]">${replenTotal.toFixed(2)}</span>
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setReplenOpen(false)} disabled={replenBusy}>Cancel</Button>
                <Button size="sm" disabled={replenBusy || !replenVendor || replenLines.every((l) => !l.include)} onClick={() => void submitReplenishment()}>
                  {replenBusy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  Create draft PO
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {formOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeForm}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                {editingId ? "Edit product" : "Add product"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            <form onSubmit={submitForm} className="max-h-[70vh] space-y-4 overflow-auto p-5">
              <p className="text-xs text-[var(--color-text-muted)]">
                Products created here power both the POS and the public website.
              </p>

              <Field label="Name">
                <input
                  required
                  value={form.name}
                  onChange={(e) => updField("name", e.target.value)}
                  placeholder="Brown Cedar Mulch"
                  className={inputCls}
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <input
                    required
                    list="category-options"
                    value={form.category}
                    onChange={(e) => updField("category", e.target.value)}
                    placeholder="Pick or type…"
                    className={inputCls}
                  />
                  <datalist id="category-options">
                    {taxonomy.categories.map((c) => <option key={c} value={c} />)}
                  </datalist>
                </Field>
                <Field label="Subcategory">
                  <input
                    value={form.subcategory}
                    onChange={(e) => updField("subcategory", e.target.value)}
                    placeholder="Bark"
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Unit of measure">
                <select value={form.unit} onChange={(e) => updField("unit", e.target.value)} className={inputCls}>
                  {(taxonomy.units.includes(form.unit) ? taxonomy.units : [form.unit, ...taxonomy.units]).map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </Field>

              <Field label="Description">
                <textarea
                  value={form.description}
                  onChange={(e) => updField("description", e.target.value)}
                  placeholder="Fine-screened cedar bark, ideal for beds."
                  rows={3}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
                />
              </Field>

              <Field label="Price">
                <input
                  required
                  value={form.price}
                  onChange={(e) => updField("price", e.target.value)}
                  placeholder="$69.90 per cubic yard"
                  className={inputCls}
                />
              </Field>

              <Field label="Image">
                <div className="flex items-start gap-3">
                  {form.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={form.image}
                      alt="Product preview"
                      className="h-16 w-16 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover"
                    />
                  ) : (
                    <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)]">
                      <ImageIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    <input
                      value={form.image}
                      onChange={(e) => updField("image", e.target.value)}
                      placeholder="Paste an image URL…"
                      className={inputCls}
                    />
                    <div className="flex items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]">
                        {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Upload className="h-3.5 w-3.5" aria-hidden />}
                        {uploading ? "Uploading…" : "Upload from device"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => void onPickImage(e.target.files?.[0])}
                        />
                      </label>
                      {form.image && (
                        <button
                          type="button"
                          onClick={() => updField("image", "")}
                          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </Field>

              <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) => updField("active", e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-action)]"
                />
                Active (visible on the website)
              </label>

              {formError && (
                <p className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-warning)] bg-[var(--color-clay-500)]/15 px-3 py-2 text-sm text-[var(--color-warning)]">
                  <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                  <span className="font-mono">{formError}</span>
                </p>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="secondary" size="md" onClick={closeForm} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" size="md" disabled={saving}>
                  {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                  {editingId ? "Save changes" : "Create product"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Categories & Units manager ─────────────────────────────────────────
function TaxonomyManager({
  taxonomy,
  onClose,
  onSave,
}: {
  taxonomy: Taxonomy;
  onClose: () => void;
  onSave: (t: Taxonomy) => void;
}) {
  const [cats, setCats] = useState<string[]>(taxonomy.categories);
  const [units, setUnits] = useState<string[]>(taxonomy.units);
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [saving, setSaving] = useState(false);

  const addCat = () => {
    const v = newCat.trim();
    if (v && !cats.includes(v)) setCats((c) => [...c, v].sort());
    setNewCat("");
  };
  const addUnit = () => {
    const v = newUnit.trim();
    if (v && !units.includes(v)) setUnits((u) => [...u, v]);
    setNewUnit("");
  };

  const List = ({ items, onRemove, icon }: { items: string[]; onRemove: (v: string) => void; icon: React.ReactNode }) => (
    <ul className="mt-2 max-h-64 space-y-1 overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border)] p-1.5">
      {items.length === 0 && <li className="px-2 py-3 text-center text-xs text-[var(--color-text-muted)]">None yet</li>}
      {items.map((v) => (
        <li key={v} className="flex items-center justify-between rounded-[var(--radius-sm)] px-2 py-1.5 text-sm text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]">
          <span className="flex items-center gap-2">{icon}{v}</span>
          <button onClick={() => onRemove(v)} aria-label={`Remove ${v}`} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
            <X className="h-3.5 w-3.5" />
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-xl)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-3">
          <h3 className="font-display text-base font-bold text-[var(--color-text-primary)]">Categories &amp; Units</h3>
          <button onClick={onClose} aria-label="Close" className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-auto p-5 sm:grid-cols-2">
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              <Tag className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Categories
            </h4>
            <div className="mt-2 flex gap-1.5">
              <input value={newCat} onChange={(e) => setNewCat(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCat())} placeholder="New category" className={inputCls} />
              <Button size="sm" variant="secondary" onClick={addCat}>Add</Button>
            </div>
            <List items={cats} onRemove={(v) => setCats(cats.filter((x) => x !== v))} icon={<Tag className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden />} />
          </section>
          <section>
            <h4 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              <Ruler className="h-4 w-4" strokeWidth={1.75} aria-hidden /> Units of measure
            </h4>
            <div className="mt-2 flex gap-1.5">
              <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addUnit())} placeholder="New unit" className={inputCls} />
              <Button size="sm" variant="secondary" onClick={addUnit}>Add</Button>
            </div>
            <List items={units} onRemove={(v) => setUnits(units.filter((x) => x !== v))} icon={<Ruler className="h-3.5 w-3.5 text-[var(--color-text-muted)]" strokeWidth={1.75} aria-hidden />} />
          </section>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <p className="text-xs text-[var(--color-text-muted)]">Categories in use always stay available.</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button size="sm" disabled={saving} onClick={() => { setSaving(true); onSave({ categories: cats, units }); }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
