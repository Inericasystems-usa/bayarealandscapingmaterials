"use client";

import { useEffect, useState } from "react";
import { Store, Globe, Upload, Check, ArrowRight, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { Button } from "@balm/ui";
import { api } from "@/lib/api-client";
import { parseCsv, pick } from "@/lib/csv";

const STEPS = ["Store", "Website", "Inventory", "Done"];

const input =
  "h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none";

/** First-run setup: store → website connection → Flint CSV import → done. */
export function OnboardingWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [store, setStore] = useState({ storeName: "", street: "", city: "", county: "", state: "", postalCode: "" });
  const [website, setWebsite] = useState({ url: "", apiToken: "", enabled: false });
  const [testResult, setTestResult] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    api.getSettings().then((s) => {
      setStore({
        storeName: s.storeName ?? "",
        street: s.address?.street ?? "",
        city: s.address?.city ?? "",
        county: s.address?.county ?? "",
        state: s.address?.state ?? "",
        postalCode: s.address?.postalCode ?? "",
      });
      setWebsite({ url: s.website?.url ?? "", apiToken: s.website?.apiToken ?? "", enabled: s.website?.enabled ?? false });
    }).catch(() => {});
  }, []);

  const saveStore = async () => {
    if (!store.storeName.trim()) return setError("Enter your store name.");
    setBusy(true);
    setError(null);
    try {
      await api.updateSettings({
        storeName: store.storeName.trim(),
        address: { street: store.street, city: store.city, county: store.county, state: store.state, postalCode: store.postalCode },
      });
      setStep(1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setTestResult("Testing…");
    try {
      await api.updateSettings({ website: { url: website.url.trim(), apiToken: website.apiToken.trim(), enabled: website.enabled, lastSyncAt: null, lastPullAt: null } });
      const r = await api.testWebsite();
      setTestResult(r.ok ? "Reachable ✓" : `Failed — ${r.error ?? `HTTP ${r.status}`}`);
    } catch (e) {
      setTestResult((e as Error).message);
    }
  };

  const saveWebsite = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.updateSettings({ website: { url: website.url.trim(), apiToken: website.apiToken.trim(), enabled: website.enabled, lastSyncAt: null, lastPullAt: null } });
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importCsv = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setError(null);
    try {
      const records = parseCsv(await file.text());
      let created = 0;
      let skipped = 0;
      for (const rec of records) {
        const name = pick(rec, ["name", "product name", "product", "item", "item name", "title"]);
        if (!name) { skipped++; continue; }
        const product = await api.createProduct({
          name,
          category: pick(rec, ["category", "department", "dept", "type"]),
          subcategory: pick(rec, ["subcategory", "sub category", "sub-category"]),
          description: pick(rec, ["description", "desc", "notes"]),
          price: pick(rec, ["price", "unit price", "retail", "retail price", "sell price"]),
          image: "",
          active: true,
        });
        await api.ensureInventory(product.id);
        const patch: Record<string, string | number> = {};
        const sku = pick(rec, ["sku", "barcode", "code", "item code", "item number", "upc"]);
        if (sku) patch.sku = sku;
        const unit = pick(rec, ["unit", "uom", "unit of measure"]);
        if (unit) patch.unit = unit;
        const qty = Number(pick(rec, ["qty", "quantity", "on hand", "onhand", "stock", "qtyonhand", "quantity on hand"]));
        if (Number.isFinite(qty) && pick(rec, ["qty", "quantity", "on hand", "onhand", "stock", "qtyonhand", "quantity on hand"])) patch.qtyOnHand = qty;
        const reorder = Number(pick(rec, ["reorder", "reorder point", "reorderpoint", "min", "min qty"]));
        if (Number.isFinite(reorder) && pick(rec, ["reorder", "reorder point", "reorderpoint", "min", "min qty"])) patch.reorderPoint = reorder;
        const cost = Number(pick(rec, ["cost", "unit cost", "wholesale"]));
        if (Number.isFinite(cost) && pick(rec, ["cost", "unit cost", "wholesale"])) patch.cost = cost;
        if (Object.keys(patch).length) await api.updateInventory(product.id, patch as never);
        created++;
      }
      setImportResult(`Imported ${created} product${created === 1 ? "" : "s"}${skipped ? ` · skipped ${skipped}` : ""}.`);
    } catch {
      setError("Couldn't read that CSV — make sure it has a 'name' (or 'product name') column.");
    } finally {
      setImporting(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await api.updateSettings({ onboardingComplete: true });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div data-theme="dark" className="grid min-h-[100dvh] place-items-center bg-[var(--color-moss-950)] p-4">
      <div className="w-full max-w-lg">
        <div className="mb-5 text-center">
          <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-[var(--radius-xl)] bg-[var(--color-moss-700)] text-white">
            <Sparkles className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <h1 className="font-display text-2xl font-bold text-white">Welcome to Inerica POS</h1>
          <p className="mt-1 text-sm text-[var(--color-moss-200)]">Let&apos;s get your store set up.</p>
        </div>

        {/* Step indicator */}
        <div className="mb-4 flex items-center justify-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <span
                className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
                  i < step ? "bg-[var(--color-moss-500)] text-white" : i === step ? "bg-white text-[var(--color-moss-900)]" : "bg-[var(--color-moss-800)] text-[var(--color-moss-300)]"
                }`}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              {i < STEPS.length - 1 && <span className="h-px w-6 bg-[var(--color-moss-700)]" />}
            </div>
          ))}
        </div>

        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-[var(--shadow-xl)]">
          {step === 0 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
                <Store className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} /> Store details
              </h2>
              <input value={store.storeName} onChange={(e) => setStore((s) => ({ ...s, storeName: e.target.value }))} placeholder="Store name *" className={input} autoFocus />
              <input value={store.street} onChange={(e) => setStore((s) => ({ ...s, street: e.target.value }))} placeholder="Street address" className={input} />
              <div className="grid grid-cols-3 gap-2">
                <input value={store.city} onChange={(e) => setStore((s) => ({ ...s, city: e.target.value }))} placeholder="City" className={input} />
                <input value={store.state} onChange={(e) => setStore((s) => ({ ...s, state: e.target.value }))} placeholder="State" className={input} />
                <input value={store.postalCode} onChange={(e) => setStore((s) => ({ ...s, postalCode: e.target.value }))} placeholder="ZIP" className={input} />
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={() => void saveStore()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
                <Globe className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} /> Connect your website
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">Inerica POS pushes your catalog &amp; stock to your website. Enter its API URL and a shared token. You can skip and set this later in Settings.</p>
              <input value={website.url} onChange={(e) => setWebsite((w) => ({ ...w, url: e.target.value }))} placeholder="https://yourstore.com" className={input} />
              <input value={website.apiToken} onChange={(e) => setWebsite((w) => ({ ...w, apiToken: e.target.value }))} placeholder="API token (shared secret)" className={input} />
              <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
                <input type="checkbox" checked={website.enabled} onChange={(e) => setWebsite((w) => ({ ...w, enabled: e.target.checked }))} className="h-4 w-4 accent-[var(--color-action)]" />
                Enable sync
              </label>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => void testConnection()} disabled={!website.url}>Test connection</Button>
                {testResult && <span className="text-sm text-[var(--color-text-secondary)]">{testResult}</span>}
              </div>
              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={() => setStep(0)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button onClick={() => void saveWebsite()} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
                <Upload className="h-5 w-5 text-[var(--color-text-brand)]" strokeWidth={1.75} /> Import inventory
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)]">Bulk-load your products from a <strong>Flint POS</strong> (or any) CSV export. We match common columns — name, SKU, category, price, quantity. You can also skip and add products later.</p>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-strong)] px-4 py-6 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing ? "Importing…" : "Choose a CSV file…"}
                <input type="file" accept=".csv,text/csv" className="hidden" disabled={importing} onChange={(e) => void importCsv(e.target.files?.[0])} />
              </label>
              {importResult && <p className="text-sm text-[var(--color-moss-700)]">{importResult}</p>}
              <div className="flex justify-between pt-2">
                <Button variant="secondary" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /> Back</Button>
                <Button onClick={() => setStep(3)}>{importResult ? "Continue" : "Skip"} <ArrowRight className="h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4 text-center">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                <Check className="h-7 w-7" strokeWidth={2} />
              </span>
              <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">You&apos;re all set</h2>
              <p className="text-sm text-[var(--color-text-secondary)]">{store.storeName} is ready to go. You can change any of this later in Settings.</p>
              <Button className="w-full" onClick={() => void finish()} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enter Inerica POS
              </Button>
            </div>
          )}

          {error && <p className="mt-3 text-center text-sm text-[var(--color-danger)]">{error}</p>}
        </div>
      </div>
    </div>
  );
}
