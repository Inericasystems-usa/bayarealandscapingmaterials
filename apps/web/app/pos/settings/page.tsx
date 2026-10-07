"use client";

import { useEffect, useState } from "react";
import {
  Store,
  Receipt,
  CreditCard,
  Truck,
  Save,
  Plus,
  X,
  Copy,
  ImagePlus,
  Loader2,
  Gift,
  Globe,
  RefreshCw,
  Eye,
  EyeOff,
  KeyRound,
} from "lucide-react";
import { Button } from "@balm/ui";
import { api, type Settings } from "@/lib/api-client";
import { compressImage } from "@/lib/image";

// ── Shared styles ────────────────────────────────────────────────────
const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]";
const labelCls =
  "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]";
const cardCls =
  "rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  );
}

function SectionHeader({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc?: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
        {icon}
      </span>
      <div>
        <h2 className="font-display text-base font-bold text-[var(--color-text-primary)]">
          {title}
        </h2>
        {desc ? (
          <p className="text-xs text-[var(--color-text-muted)]">{desc}</p>
        ) : null}
      </div>
    </div>
  );
}

// Read-only provisioned ID with a copy affordance.
function IdRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--color-text-secondary)]">
          {value || "—"}
        </code>
        <button
          type="button"
          onClick={copy}
          title="Copy"
          aria-label={`Copy ${label}`}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        {copied ? (
          <span className="text-xs text-[var(--color-success)]">Copied</span>
        ) : null}
      </div>
    </div>
  );
}

// Per-section save button + transient "Saved" confirmation.
function SaveBar({
  onSave,
  saving,
  saved,
  error,
}: {
  onSave: () => void;
  saving: boolean;
  saved: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-5 flex items-center gap-3 border-t border-[var(--color-border)] pt-4">
      <Button size="sm" onClick={onSave} disabled={saving}>
        <Save className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        {saving ? "Saving…" : "Save changes"}
      </Button>
      {saved ? (
        <span className="text-sm font-medium text-[var(--color-success)]">Saved</span>
      ) : null}
      {error ? (
        <span className="text-sm font-medium text-[var(--color-danger)]">{error}</span>
      ) : null}
    </div>
  );
}

// Tracks save state for an individual section.
function useSaver() {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (
    patch: Partial<Settings>,
    onResult: (s: Settings) => void,
  ) => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const next = await api.updateSettings(patch);
      onResult(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return { saving, saved, error, run };
}

// ── Page ─────────────────────────────────────────────────────────────
export default function PosSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable working copies (initialised once settings load).
  const [identity, setIdentity] = useState({
    storeName: "",
    adminEmail: "",
    street: "",
    city: "",
    county: "",
    state: "",
    postalCode: "",
  });
  const [tax, setTax] = useState({
    ratePct: "",
    jurisdiction: "",
    basis: "point_of_possession" as Settings["tax"]["basis"],
    accounting: "accrual" as Settings["tax"]["accounting"],
  });
  const [methods, setMethods] = useState<string[]>([]);
  const [newMethod, setNewMethod] = useState("");
  const [tiers, setTiers] = useState<Settings["deliveryFeeTiers"]>([]);
  const [branding, setBranding] = useState({ logoUrl: "", receiptFooter: "" });
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [loyalty, setLoyalty] = useState({ enabled: false, earnPerDollar: "1", redeemPointsPerDollar: "100" });
  const [website, setWebsite] = useState({ url: "", apiToken: "", enabled: false });
  const [showToken, setShowToken] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [lastPullAt, setLastPullAt] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | null>(null);

  const identitySaver = useSaver();
  const taxSaver = useSaver();
  const methodsSaver = useSaver();
  const tiersSaver = useSaver();
  const brandingSaver = useSaver();
  const loyaltySaver = useSaver();
  const websiteSaver = useSaver();

  // Hydrate working copies from a Settings payload.
  const hydrate = (s: Settings) => {
    setSettings(s);
    setIdentity({
      storeName: s.storeName,
      adminEmail: s.adminEmail,
      street: s.address.street,
      city: s.address.city,
      county: s.address.county,
      state: s.address.state,
      postalCode: s.address.postalCode,
    });
    setTax({
      ratePct: String(+(s.tax.rate * 100).toFixed(4)),
      jurisdiction: s.tax.jurisdiction,
      basis: s.tax.basis,
      accounting: s.tax.accounting,
    });
    setMethods(s.paymentMethods);
    setTiers(s.deliveryFeeTiers);
    setBranding({ logoUrl: s.logoUrl ?? "", receiptFooter: s.receiptFooter ?? "" });
    setLoyalty({
      enabled: s.loyalty?.enabled ?? false,
      earnPerDollar: String(s.loyalty?.earnPerDollar ?? 1),
      redeemPointsPerDollar: String(s.loyalty?.redeemPointsPerDollar ?? 100),
    });
    setWebsite({ url: s.website?.url ?? "", apiToken: s.website?.apiToken ?? "", enabled: s.website?.enabled ?? false });
    setLastSyncAt(s.website?.lastSyncAt ?? null);
    setLastPullAt(s.website?.lastPullAt ?? null);
  };

  const saveWebsite = () => websiteSaver.run({ website: { url: website.url.trim(), apiToken: website.apiToken.trim(), enabled: website.enabled, lastSyncAt, lastPullAt } }, hydrate);

  // Rotate the shared secret: mint a fresh 24-byte token and reveal it so the
  // operator can copy it to the website's matching Inerica token before saving.
  const rotateToken = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    setWebsite((w) => ({ ...w, apiToken: token }));
    setShowToken(true);
  };
  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(website.apiToken);
      setTokenCopied(true);
      setTimeout(() => setTokenCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const pullNow = async () => {
    setPulling(true);
    setPullMsg(null);
    try {
      const r = await api.pullWebsite();
      setLastPullAt(r.pulled.at);
      setPullMsg(`Pulled ${r.pulled.orders} orders · ${r.pulled.leads} leads.`);
    } catch (e) {
      setPullMsg(`Pull failed — ${(e as Error).message}`);
    } finally {
      setPulling(false);
    }
  };

  const testConnection = async () => {
    setTestResult("Testing…");
    try {
      const r = await api.testWebsite();
      setTestResult(r.ok ? "Reachable ✓" : `Failed — ${r.error ?? `HTTP ${r.status}`}`);
    } catch (e) {
      setTestResult((e as Error).message);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await api.syncWebsite();
      setLastSyncAt(r.at);
      setSyncMsg(`Pushed ${r.pushed.products} products · ${r.pushed.inventory} stock rows.`);
    } catch (e) {
      setSyncMsg(`Sync failed — ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  const saveLoyalty = () =>
    loyaltySaver.run(
      {
        loyalty: {
          enabled: loyalty.enabled,
          earnPerDollar: Number(loyalty.earnPerDollar) || 0,
          redeemPointsPerDollar: Math.max(1, Number(loyalty.redeemPointsPerDollar) || 100),
        },
      },
      hydrate,
    );

  const onPickLogo = async (file: File | undefined) => {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const dataUrl = await compressImage(file, 512, "image/png");
      const url = await api.uploadImage(dataUrl);
      setBranding((b) => ({ ...b, logoUrl: url }));
    } catch {
      /* surfaced on save */
    } finally {
      setUploadingLogo(false);
    }
  };
  const saveBranding = () => brandingSaver.run({ logoUrl: branding.logoUrl, receiptFooter: branding.receiptFooter }, hydrate);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const s = await api.getSettings();
        if (alive) hydrate(s);
      } catch (e) {
        if (alive)
          setLoadError(e instanceof Error ? e.message : "Could not load settings");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Section save handlers ──────────────────────────────────────────
  const saveIdentity = () =>
    identitySaver.run(
      {
        storeName: identity.storeName,
        adminEmail: identity.adminEmail,
        address: {
          street: identity.street,
          city: identity.city,
          county: identity.county,
          state: identity.state,
          postalCode: identity.postalCode,
        },
      },
      hydrate,
    );

  const saveTax = () => {
    const pct = parseFloat(tax.ratePct);
    taxSaver.run(
      {
        tax: {
          rate: Number.isFinite(pct) ? pct / 100 : 0,
          jurisdiction: tax.jurisdiction,
          basis: tax.basis,
          accounting: tax.accounting,
        },
      },
      hydrate,
    );
  };

  const saveMethods = () =>
    methodsSaver.run({ paymentMethods: methods }, hydrate);

  const saveTiers = () =>
    tiersSaver.run(
      {
        deliveryFeeTiers: tiers.map((t) => ({
          label: t.label,
          maxMiles: Number(t.maxMiles) || 0,
          fee: Number(t.fee) || 0,
        })),
      },
      hydrate,
    );

  // ── Payment method chips ───────────────────────────────────────────
  const addMethod = () => {
    const v = newMethod.trim().toLowerCase();
    if (v && !methods.includes(v)) setMethods((m) => [...m, v]);
    setNewMethod("");
  };
  const removeMethod = (v: string) =>
    setMethods((m) => m.filter((x) => x !== v));

  // ── Delivery tier rows ─────────────────────────────────────────────
  const addTier = () =>
    setTiers((t) => [...t, { label: "", maxMiles: 0, fee: 0 }]);
  const removeTier = (i: number) =>
    setTiers((t) => t.filter((_, idx) => idx !== i));
  const updTier = (
    i: number,
    key: keyof Settings["deliveryFeeTiers"][number],
    value: string,
  ) =>
    setTiers((t) =>
      t.map((row, idx) =>
        idx === i
          ? {
              ...row,
              [key]: key === "label" ? value : Number(value),
            }
          : row,
      ),
    );

  // ── States ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="grid h-full place-items-center p-8">
        <p className="text-sm text-[var(--color-text-muted)]">Loading settings…</p>
      </div>
    );
  }

  if (loadError || !settings) {
    return (
      <div className="grid h-full place-items-center p-8">
        <div className="max-w-sm text-center">
          <p className="mb-1 text-sm font-semibold text-[var(--color-danger)]">
            Settings unavailable
          </p>
          <p className="mb-4 text-sm text-[var(--color-text-muted)]">
            {loadError ?? "You appear to be offline. Reconnect and try again."}
          </p>
          <Button size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const currency = settings.currency || "USD";

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div className="h-full overflow-auto">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
          Store Settings
        </h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Store identity, tax, payments &amp; delivery configuration
        </p>
      </div>

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-5 p-5">
        {/* ── 1. Store Identity ─────────────────────────────────── */}
        <section className={cardCls}>
          <SectionHeader
            icon={<Store className="h-4.5 w-4.5" strokeWidth={1.75} />}
            title="Store Identity"
            desc="Business name, contact &amp; address used on receipts and orders"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Store name">
              <input
                value={identity.storeName}
                onChange={(e) =>
                  setIdentity((s) => ({ ...s, storeName: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Admin email">
              <input
                type="email"
                value={identity.adminEmail}
                onChange={(e) =>
                  setIdentity((s) => ({ ...s, adminEmail: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Street">
                <input
                  value={identity.street}
                  onChange={(e) =>
                    setIdentity((s) => ({ ...s, street: e.target.value }))
                  }
                  className={inputCls}
                />
              </Field>
            </div>
            <Field label="City">
              <input
                value={identity.city}
                onChange={(e) =>
                  setIdentity((s) => ({ ...s, city: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="County">
              <input
                value={identity.county}
                onChange={(e) =>
                  setIdentity((s) => ({ ...s, county: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="State">
              <input
                value={identity.state}
                onChange={(e) =>
                  setIdentity((s) => ({ ...s, state: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
            <Field label="Postal code">
              <input
                value={identity.postalCode}
                onChange={(e) =>
                  setIdentity((s) => ({ ...s, postalCode: e.target.value }))
                }
                className={inputCls}
              />
            </Field>
          </div>

          {/* Provisioned, read-only identifiers */}
          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <IdRow label="Slug" value={settings.slug} />
            <IdRow label="Tenant ID" value={settings.tenantId} />
            <IdRow label="Stripe customer ID" value={settings.stripeCustomerId} />
            <IdRow
              label="Register / workstation ID"
              value={settings.registerWorkstationId}
            />
          </div>

          <SaveBar
            onSave={saveIdentity}
            saving={identitySaver.saving}
            saved={identitySaver.saved}
            error={identitySaver.error}
          />
        </section>

        {/* ── Branding & Receipt ────────────────────────────────── */}
        <section className={cardCls}>
          <SectionHeader
            icon={<ImagePlus className="h-4.5 w-4.5" strokeWidth={1.75} />}
            title="Branding & Receipt"
            desc="Store logo and the footer message printed on receipts"
          />

          <Field label="Store logo">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white">
                {branding.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={branding.logoUrl} alt="Store logo" className="h-full w-full object-contain" />
                ) : (
                  <ImagePlus className="h-6 w-6 text-[var(--color-text-muted)]" strokeWidth={1.5} aria-hidden />
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-3 py-1.5 text-sm font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]">
                  {uploadingLogo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
                  {uploadingLogo ? "Uploading…" : "Choose file…"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploadingLogo} onChange={(e) => void onPickLogo(e.target.files?.[0])} />
                </label>
                {branding.logoUrl && (
                  <button type="button" onClick={() => setBranding((b) => ({ ...b, logoUrl: "" }))} className="w-fit text-xs text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                    Remove logo
                  </button>
                )}
                <p className="text-xs text-[var(--color-text-muted)]">PNG/JPG — shows on receipts &amp; the customer display.</p>
              </div>
            </div>
          </Field>

          <div className="mt-4">
            <Field label="Receipt footer">
              <textarea
                value={branding.receiptFooter}
                onChange={(e) => setBranding((b) => ({ ...b, receiptFooter: e.target.value }))}
                rows={2}
                placeholder="Thank you for your business!"
                className={`${inputCls} resize-none`}
              />
            </Field>
          </div>

          <SaveBar
            onSave={saveBranding}
            saving={brandingSaver.saving}
            saved={brandingSaver.saved}
            error={brandingSaver.error}
          />
        </section>

        {/* ── Loyalty ───────────────────────────────────────────── */}
        <section className={cardCls}>
          <SectionHeader
            icon={<Gift className="h-4.5 w-4.5" strokeWidth={1.75} />}
            title="Loyalty"
            desc="Customers earn points on purchases, redeemable for store credit"
          />

          <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
            <input
              type="checkbox"
              checked={loyalty.enabled}
              onChange={(e) => setLoyalty((l) => ({ ...l, enabled: e.target.checked }))}
              className="h-4 w-4 accent-[var(--color-action)]"
            />
            Enable the loyalty program
          </label>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Points earned per $1 spent">
              <input
                type="number"
                min="0"
                step="0.1"
                value={loyalty.earnPerDollar}
                onChange={(e) => setLoyalty((l) => ({ ...l, earnPerDollar: e.target.value }))}
                disabled={!loyalty.enabled}
                className={inputCls}
              />
            </Field>
            <Field label="Points to redeem for $1 credit">
              <input
                type="number"
                min="1"
                step="1"
                value={loyalty.redeemPointsPerDollar}
                onChange={(e) => setLoyalty((l) => ({ ...l, redeemPointsPerDollar: e.target.value }))}
                disabled={!loyalty.enabled}
                className={inputCls}
              />
            </Field>
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            e.g. {loyalty.earnPerDollar || 1} pt/$1 earned; {loyalty.redeemPointsPerDollar || 100} pts = $1.00 store credit.
          </p>

          <SaveBar
            onSave={saveLoyalty}
            saving={loyaltySaver.saving}
            saved={loyaltySaver.saved}
            error={loyaltySaver.error}
          />
        </section>

        {/* ── Website sync (Inerica POS → website) ──────────────── */}
        <section className={cardCls}>
          <SectionHeader
            icon={<Globe className="h-4.5 w-4.5" strokeWidth={1.75} />}
            title="Website Sync"
            desc="Inerica POS is the master — push catalog & stock to your website's API"
          />

          <label className="flex items-center gap-2 text-sm text-[var(--color-text-primary)]">
            <input
              type="checkbox"
              checked={website.enabled}
              onChange={(e) => setWebsite((w) => ({ ...w, enabled: e.target.checked }))}
              className="h-4 w-4 accent-[var(--color-action)]"
            />
            Enable website sync
          </label>

          <div className="mt-4 space-y-4">
            <Field label="Website API URL">
              <input
                value={website.url}
                onChange={(e) => setWebsite((w) => ({ ...w, url: e.target.value }))}
                placeholder="https://yourstore.com  (or http://localhost:4000)"
                className={inputCls}
              />
            </Field>
            <Field label="API token (shared secret)">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showToken ? "text" : "password"}
                    value={website.apiToken}
                    onChange={(e) => setWebsite((w) => ({ ...w, apiToken: e.target.value }))}
                    placeholder="A secret both the POS and website know"
                    autoComplete="off"
                    spellCheck={false}
                    className={`${inputCls} pr-9 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken((s) => !s)}
                    disabled={!website.apiToken}
                    aria-label={showToken ? "Hide token" : "Show token"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] disabled:opacity-40"
                  >
                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={!website.apiToken} onClick={() => void copyToken()}>
                  <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {tokenCopied ? "Copied" : "Copy"}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={rotateToken}>
                  <KeyRound className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {website.apiToken ? "Rotate" : "Generate"}
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-[var(--color-text-muted)]">
                Hidden by default. Rotating mints a new secret — copy it into your website&apos;s Inerica token, then Save.
              </p>
            </Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => void testConnection()}>
              <Globe className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              Test connection
            </Button>
            <Button type="button" size="sm" disabled={syncing || !website.url} onClick={() => void syncNow()}>
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              {syncing ? "Syncing…" : "Push catalog"}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={pulling || !website.url} onClick={() => void pullNow()}>
              {pulling ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
              {pulling ? "Pulling…" : "Pull orders/leads"}
            </Button>
            {testResult && <span className="text-sm text-[var(--color-text-secondary)]">{testResult}</span>}
            {syncMsg && <span className="text-sm text-[var(--color-moss-700)]">{syncMsg}</span>}
            {pullMsg && <span className="text-sm text-[var(--color-moss-700)]">{pullMsg}</span>}
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {lastSyncAt ? `Pushed ${new Date(lastSyncAt).toLocaleString()}` : "Not pushed yet"}
            {" · "}
            {lastPullAt ? `Pulled ${new Date(lastPullAt).toLocaleString()}` : "Not pulled yet"}
          </p>

          <SaveBar
            onSave={saveWebsite}
            saving={websiteSaver.saving}
            saved={websiteSaver.saved}
            error={websiteSaver.error}
          />
        </section>

        {/* ── 2. Tax ────────────────────────────────────────────── */}
        <section className={cardCls}>
          <SectionHeader
            icon={<Receipt className="h-4.5 w-4.5" strokeWidth={1.75} />}
            title="Tax"
            desc="Sales-tax rate, jurisdiction & basis applied at checkout"
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tax rate (%)">
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  value={tax.ratePct}
                  onChange={(e) =>
                    setTax((t) => ({ ...t, ratePct: e.target.value }))
                  }
                  className={`${inputCls} pr-7`}
                  placeholder="9.75"
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--color-text-muted)]">
                  %
                </span>
              </div>
              <span className="mt-1 block text-[11px] text-[var(--color-text-muted)]">
                e.g. 9.75 = a rate of{" "}
                {(() => {
                  const p = parseFloat(tax.ratePct);
                  return Number.isFinite(p) ? (p / 100).toFixed(4) : "0.0000";
                })()}
              </span>
            </Field>
            <Field label="Jurisdiction">
              <input
                value={tax.jurisdiction}
                onChange={(e) =>
                  setTax((t) => ({ ...t, jurisdiction: e.target.value }))
                }
                className={inputCls}
                placeholder="Contra Costa County, CA"
              />
            </Field>
            <Field label="Basis">
              <select
                value={tax.basis}
                onChange={(e) =>
                  setTax((t) => ({
                    ...t,
                    basis: e.target.value as Settings["tax"]["basis"],
                  }))
                }
                className={inputCls}
              >
                <option value="point_of_possession">Point of possession</option>
                <option value="origin">Origin</option>
              </select>
            </Field>
            <Field label="Accounting">
              <select
                value={tax.accounting}
                onChange={(e) =>
                  setTax((t) => ({
                    ...t,
                    accounting: e.target
                      .value as Settings["tax"]["accounting"],
                  }))
                }
                className={inputCls}
              >
                <option value="accrual">Accrual</option>
                <option value="cash">Cash</option>
              </select>
            </Field>
          </div>

          <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
            <strong className="text-[var(--color-text-primary)]">
              Point of possession
            </strong>{" "}
            taxes at the point the customer takes possession — the{" "}
            <em>delivery address</em> for deliveries, the{" "}
            <em>store address</em> for in-store sales.{" "}
            <strong className="text-[var(--color-text-primary)]">Origin</strong>{" "}
            always taxes at the store address.
          </p>

          <SaveBar
            onSave={saveTax}
            saving={taxSaver.saving}
            saved={taxSaver.saved}
            error={taxSaver.error}
          />
        </section>

        {/* ── 3. Payments ───────────────────────────────────────── */}
        <section className={cardCls}>
          <SectionHeader
            icon={<CreditCard className="h-4.5 w-4.5" strokeWidth={1.75} />}
            title="Payments"
            desc="Tender types accepted at the register"
          />

          <span className={labelCls}>Accepted methods</span>
          <div className="flex flex-wrap items-center gap-2">
            {methods.length === 0 ? (
              <span className="text-sm text-[var(--color-text-muted)]">
                No methods configured.
              </span>
            ) : (
              methods.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-surface)] py-1 pl-3 pr-1.5 text-sm capitalize text-[var(--color-text-primary)]"
                >
                  {m}
                  <button
                    type="button"
                    onClick={() => removeMethod(m)}
                    aria-label={`Remove ${m}`}
                    className="grid h-5 w-5 place-items-center rounded-full text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-danger)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))
            )}
          </div>

          <div className="mt-3 flex max-w-xs items-center gap-2">
            <input
              value={newMethod}
              onChange={(e) => setNewMethod(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addMethod();
                }
              }}
              placeholder="cash / card / account"
              className={inputCls}
            />
            <Button size="sm" variant="secondary" onClick={addMethod}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          <SaveBar
            onSave={saveMethods}
            saving={methodsSaver.saving}
            saved={methodsSaver.saved}
            error={methodsSaver.error}
          />
        </section>

        {/* ── 4. Delivery Fees ──────────────────────────────────── */}
        <section className={cardCls}>
          <SectionHeader
            icon={<Truck className="h-4.5 w-4.5" strokeWidth={1.75} />}
            title="Delivery Fees"
            desc="Distance-based fee tiers (incl. EPA surcharge tiers)"
          />

          <div className="grid grid-cols-[1fr_120px_120px_36px] items-center gap-2 px-1">
            <span className={`${labelCls} mb-0`}>Label</span>
            <span className={`${labelCls} mb-0`}>Max miles</span>
            <span className={`${labelCls} mb-0`}>Fee ({currency})</span>
            <span />
          </div>

          <div className="mt-2 space-y-2">
            {tiers.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No tiers yet. Add one below.
              </p>
            ) : (
              tiers.map((t, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_120px_120px_36px] items-center gap-2"
                >
                  <input
                    value={t.label}
                    onChange={(e) => updTier(i, "label", e.target.value)}
                    placeholder="Zone A (0–10 mi)"
                    className={inputCls}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={t.maxMiles}
                    onChange={(e) => updTier(i, "maxMiles", e.target.value)}
                    className={inputCls}
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={t.fee}
                    onChange={(e) => updTier(i, "fee", e.target.value)}
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={() => removeTier(i)}
                    aria-label="Remove tier"
                    className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            onClick={addTier}
            className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-brand)] hover:underline"
          >
            <Plus className="h-4 w-4" />
            Add tier
          </button>

          <SaveBar
            onSave={saveTiers}
            saving={tiersSaver.saving}
            saved={tiersSaver.saved}
            error={tiersSaver.error}
          />
        </section>
      </div>
    </div>
  );
}
