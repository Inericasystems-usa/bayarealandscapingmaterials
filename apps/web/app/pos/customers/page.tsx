"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Contact,
  UserPlus,
  Pencil,
  Trash2,
  Phone,
  Mail,
  CreditCard,
  Building2,
  X,
  Search,
  ShieldCheck,
  ShieldAlert,
  Check,
  Send,
  Megaphone,
  Clock,
  CalendarClock,
  FileText,
  Gift,
  Loader2,
} from "lucide-react";
import { Button } from "@balm/ui";
import { api, type Customer, type CustomerType, type Consent, type BroadcastResult, type CustomerStatement } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { customerStatementPdf } from "@/lib/pdf";
import { useAuth } from "../auth";
import { QueryParamSync } from "../QueryParamSync";

const OFFLINE_NOTE =
  "Can't reach the API — start it with `pnpm dev` in apps/api.";

const TYPE_FILTERS: { value: "all" | CustomerType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "retail", label: "Retail" },
  { value: "contractor", label: "Contractor" },
  { value: "wholesale", label: "Wholesale" },
];

type ConsentFilter = "all" | "consented" | "none";
const CONSENT_FILTERS: { value: ConsentFilter; label: string }[] = [
  { value: "all", label: "All texts" },
  { value: "consented", label: "Consented" },
  { value: "none", label: "No consent" },
];

const TYPE_OPTIONS: { value: CustomerType; label: string }[] = [
  { value: "retail", label: "Retail" },
  { value: "contractor", label: "Contractor" },
  { value: "wholesale", label: "Wholesale" },
];

// Type → token-driven badge colors (text + 16% tinted background via color-mix)
const TYPE_BADGE: Record<CustomerType, { label: string; color: string }> = {
  retail: { label: "Retail", color: "var(--color-info)" },
  contractor: { label: "Contractor", color: "var(--color-success)" },
  wholesale: { label: "Wholesale", color: "var(--color-warning)" },
};

const money = (n: number) =>
  `$${(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

/** Normalize a US phone to E.164 — mirrors the API's toE164 so we can match consent records. */
function toE164Web(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus && digits.length >= 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

type FormState = {
  name: string;
  phone: string;
  email: string;
  type: CustomerType;
  creditLimit: string;
  billingAddress: string;
  deliveryAddress: string;
  portalAccess: boolean;
  notes: string;
};

const EMPTY: FormState = {
  name: "",
  phone: "",
  email: "",
  type: "retail",
  creditLimit: "0",
  billingAddress: "",
  deliveryAddress: "",
  portalAccess: false,
  notes: "",
};

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | CustomerType>("all");
  const [consentFilter, setConsentFilter] = useState<ConsentFilter>("all");
  // Set of E.164 numbers with active SMS consent — drives the list indicator.
  const [consentSet, setConsentSet] = useState<Set<string>>(new Set());

  // Bulk broadcast (promo/announcement) — selection + compose modal.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastBody, setBroadcastBody] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState<BroadcastResult | null>(null);
  const [broadcastSchedule, setBroadcastSchedule] = useState(false);
  const [broadcastWhen, setBroadcastWhen] = useState("");
  const [broadcastScheduledOk, setBroadcastScheduledOk] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // SMS consent (A2P 10DLC) for the customer being edited.
  const { user } = useAuth();
  const isManager = user?.role === "admin" || user?.role === "manager";
  const [disclosure, setDisclosure] = useState("");
  const [consent, setConsent] = useState<Consent | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [showConsentConfirm, setShowConsentConfirm] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);

  useEffect(() => {
    api.consentDisclosure().then(setDisclosure).catch(() => {});
  }, []);

  async function loadConsent(phone: string) {
    if (!phone.trim()) {
      setConsent(null);
      return;
    }
    setConsentLoading(true);
    try {
      setConsent(await api.getConsent(phone.trim()));
    } catch {
      setConsent(null);
    } finally {
      setConsentLoading(false);
    }
  }

  async function recordConsent() {
    if (!form.phone.trim() || !consentConfirmed) return;
    setConsentSaving(true);
    try {
      await api.recordConsent({
        phone: form.phone.trim(),
        customerId: editing?.id ?? null,
        customerName: form.name.trim(),
        channel: "verbal",
      });
      setShowConsentConfirm(false);
      setConsentConfirmed(false);
      await loadConsent(form.phone);
      void loadConsents();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setConsentSaving(false);
    }
  }

  async function revokeConsent() {
    if (!form.phone.trim()) return;
    if (!window.confirm("Revoke SMS consent? The customer will be opted out of all texts.")) return;
    try {
      await api.revokeConsent(form.phone.trim());
      await loadConsent(form.phone);
      void loadConsents();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const PAGE = 50;
  const pageParams = () => ({
    ...(query.trim() ? { q: query.trim() } : {}),
    ...(typeFilter !== "all" ? { type: typeFilter } : {}),
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const page = await api.pageCustomers({ ...pageParams(), limit: PAGE });
      setCustomers(page.data);
      setCursor(page.nextCursor);
      setSelected(new Set()); // selection is per current result set
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await api.pageCustomers({ ...pageParams(), limit: PAGE, cursor });
      setCustomers((prev) => [...prev, ...page.data]);
      setCursor(page.nextCursor);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadConsents() {
    try {
      const cs = await api.listConsents();
      setConsentSet(new Set(cs.filter((c) => c.status === "opted_in").map((c) => c.phone)));
    } catch {
      /* non-fatal — list just won't show consent badges */
    }
  }

  async function loadStatement(id: string) {
    try {
      setStatement(await api.customerStatement(id));
    } catch {
      setStatement(null);
    }
  }

  async function recordPayment() {
    if (!editing) return;
    const input = window.prompt(`Record a payment for ${editing.name}.\nBalance due: ${money(editing.account?.openDebt ?? 0)}`);
    if (input === null) return;
    const amount = Number(input);
    if (!(amount > 0)) return toast("Enter a positive amount.", "error");
    try {
      const res = await api.recordCustomerPayment(editing.id, amount);
      setEditing(res.data);
      const n = res.payment.applied.length;
      const credited = res.payment.credited;
      toast(
        n
          ? `Payment applied to ${n} invoice${n > 1 ? "s" : ""}${credited > 0 ? ` · ${money(credited)} to store credit` : ""}.`
          : "Payment recorded as store credit.",
        "success",
      );
      await load();
      await loadStatement(editing.id);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function redeemLoyalty() {
    if (!editing) return;
    const bal = editing.account?.loyaltyPoints ?? 0;
    if (bal <= 0) return toast("No points to redeem.", "error");
    const input = window.prompt(`Redeem loyalty points for ${editing.name}.\nBalance: ${bal} pts`, String(bal));
    if (input === null) return;
    const points = Number(input);
    if (!(points > 0)) return toast("Enter a positive number of points.", "error");
    try {
      const res = await api.redeemPoints(editing.id, points);
      setEditing(res.data);
      toast(`Redeemed ${res.redeemed.points} pts → ${money(res.redeemed.credit)} store credit.`, "success");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  // Load the A/R statement whenever a different customer is opened in the panel.
  useEffect(() => {
    if (editing?.id) void loadStatement(editing.id);
    else setStatement(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id]);

  // Server-side filter by type/q; debounce the search box lightly.
  useEffect(() => {
    const t = setTimeout(() => {
      void load();
      void loadConsents();
    }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, typeFilter]);

  const counts = useMemo(() => {
    const c: Record<CustomerType, number> = {
      retail: 0,
      contractor: 0,
      wholesale: 0,
    };
    for (const cust of customers) c[cust.type] += 1;
    return c;
  }, [customers]);

  // Consent filter is applied client-side over the server-filtered (q/type) list.
  const isConsented = (c: Customer) => (c.phone ? consentSet.has(toE164Web(c.phone) ?? "") : false);
  const visible = useMemo(() => {
    if (consentFilter === "all") return customers;
    return customers.filter((c) => (consentFilter === "consented" ? isConsented(c) : !isConsented(c)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, consentFilter, consentSet]);

  // Selected customers that can actually receive a broadcast (consented).
  const selectedReachable = customers.filter((c) => selected.has(c.id) && isConsented(c));

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const allOn = visible.length > 0 && visible.every((c) => selected.has(c.id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const c of visible) {
        if (allOn) next.delete(c.id);
        else next.add(c.id);
      }
      return next;
    });
  }

  function openBroadcast() {
    setBroadcastBody("");
    setBroadcastResult(null);
    setBroadcastSchedule(false);
    setBroadcastWhen("");
    setBroadcastScheduledOk(false);
    setBroadcastOpen(true);
  }

  async function sendBroadcast() {
    const recipients = customers
      .filter((c) => selected.has(c.id) && c.phone.trim())
      .map((c) => ({ phone: c.phone, customerId: c.id, customerName: c.name }));
    if (!broadcastBody.trim() || recipients.length === 0) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    try {
      if (broadcastSchedule) {
        if (!broadcastWhen) {
          toast("Pick a date and time to schedule.", "error");
          return;
        }
        const iso = new Date(broadcastWhen).toISOString();
        if (new Date(iso).getTime() <= Date.now()) {
          toast("Pick a time in the future.", "error");
          return;
        }
        await api.scheduleBroadcast(broadcastBody.trim(), iso, recipients);
        setBroadcastScheduledOk(true);
      } else {
        setBroadcastResult(await api.broadcast(broadcastBody.trim(), recipients));
      }
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBroadcastSending(false);
    }
  }

  function resetConsentUi() {
    setConsent(null);
    setShowConsentConfirm(false);
    setConsentConfirmed(false);
  }

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    resetConsentUi();
    setPanelOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      type: c.type,
      creditLimit: String(c.account?.creditLimit ?? 0),
      billingAddress: c.billingAddress ?? "",
      deliveryAddress: c.deliveryAddress ?? "",
      portalAccess: c.portalAccess ?? false,
      notes: c.notes ?? "",
    });
    setFormError(null);
    resetConsentUi();
    void loadConsent(c.phone ?? "");
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditing(null);
    setFormError(null);
    resetConsentUi();
  }

  const upd = (k: keyof FormState, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body: Partial<Customer> = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        type: form.type,
        billingAddress: form.billingAddress.trim(),
        deliveryAddress: form.deliveryAddress.trim(),
        portalAccess: form.portalAccess,
        notes: form.notes.trim(),
        account: {
          ...(editing?.account ?? {
            pastDue: 0,
            openDebt: 0,
            storeCredit: 0,
          }),
          creditLimit: Number(form.creditLimit) || 0,
        },
      };
      if (editing) {
        await api.updateCustomer(editing.id, body);
      } else {
        await api.createCustomer(body);
      }
      closePanel();
      await load();
    } catch {
      setFormError(OFFLINE_NOTE);
    } finally {
      setSaving(false);
    }
  }

  async function remove(c: Customer) {
    if (!window.confirm(`Delete customer "${c.name}"? This can't be undone.`))
      return;
    try {
      await api.deleteCustomer(c.id);
      await load();
    } catch {
      setError(OFFLINE_NOTE);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Suspense fallback={null}>
        <QueryParamSync name="q" onValue={setQuery} />
      </Suspense>
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
            <Contact className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
              Customers
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {loading
                ? "Loading…"
                : consentFilter !== "all"
                  ? `${visible.length} ${consentFilter === "consented" ? "with SMS consent" : "without SMS consent"}`
                  : `${customers.length} customer${customers.length === 1 ? "" : "s"} · ${counts.retail} retail · ${counts.contractor} contractor · ${counts.wholesale} wholesale`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Type filter */}
          <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTypeFilter(f.value)}
                className={`h-9 px-3 text-sm font-medium transition-colors ${
                  typeFilter === f.value
                    ? "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* SMS consent filter */}
          <div className="inline-flex overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
            {CONSENT_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setConsentFilter(f.value)}
                title="Filter by SMS texting consent"
                className={`h-9 px-3 text-sm font-medium transition-colors ${
                  consentFilter === f.value
                    ? "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search customers…"
              aria-label="Search customers"
              className="h-9 w-56 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-8 pr-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]"
            />
          </div>

          <Button size="sm" onClick={openAdd}>
            <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Add Customer
          </Button>
        </div>
      </div>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {error && (
          <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
            {error}
          </div>
        )}

        {selected.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5">
            <p className="text-sm text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text-primary)]">{selected.size}</span> selected ·{" "}
              <span style={{ color: "var(--color-success)" }}>{selectedReachable.length}</span> can receive texts
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
              {isManager ? (
                <Button size="sm" onClick={openBroadcast} disabled={selectedReachable.length === 0}>
                  <Megaphone className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  Send text ({selectedReachable.length})
                </Button>
              ) : (
                <span className="text-xs text-[var(--color-text-muted)]">Broadcast is manager-only</span>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
              />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-16 text-center">
            <Contact
              className="h-8 w-8 text-[var(--color-text-muted)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-3 text-sm font-medium text-[var(--color-text-secondary)]">
              {query.trim() || typeFilter !== "all" || consentFilter !== "all"
                ? "No customers match your filters."
                : error
                  ? "No customers to show."
                  : "No customers yet."}
            </p>
            {!query.trim() && typeFilter === "all" && consentFilter === "all" && !error && (
              <button
                onClick={openAdd}
                className="mt-3 text-sm font-medium text-[var(--color-text-brand)] hover:underline"
              >
                Add your first customer
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Select all"
                      checked={visible.length > 0 && visible.every((c) => selected.has(c.id))}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 accent-[var(--color-action)]"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-semibold">Customer</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Contact</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Open Debt / Due
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Credit Limit
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Store Credit
                  </th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {visible.map((c) => {
                  const badge = TYPE_BADGE[c.type];
                  const due = c.account?.openDebt ?? 0;
                  const pastDue = c.account?.pastDue ?? 0;
                  const textsOk = consentSet.has(toE164Web(c.phone) ?? "");
                  return (
                    <tr key={c.id} className="align-middle">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${c.name}`}
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                          className="h-4 w-4 accent-[var(--color-action)]"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--color-text-primary)]">
                          {c.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                          <span className="font-mono">{c.number}</span>
                          {c.portalAccess && (
                            <span className="rounded-full bg-[var(--color-moss-100)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-moss-700)]">
                              Portal
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                          style={{
                            color: badge.color,
                            backgroundColor: `color-mix(in srgb, ${badge.color} 16%, transparent)`,
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                        <div className="space-y-0.5">
                          {c.phone && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Phone
                                className="h-3 w-3 shrink-0"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                              {c.phone}
                            </div>
                          )}
                          {c.email && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Mail
                                className="h-3 w-3 shrink-0"
                                strokeWidth={1.75}
                                aria-hidden
                              />
                              <span className="truncate">{c.email}</span>
                            </div>
                          )}
                          {c.phone &&
                            (textsOk ? (
                              <div
                                className="flex items-center gap-1 text-xs font-medium"
                                style={{ color: "var(--color-success)" }}
                                title="SMS consent on file — can receive automated texts"
                              >
                                <ShieldCheck className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden />
                                Texts: consented
                              </div>
                            ) : (
                              <div
                                className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"
                                title="No SMS consent — automated texts will not send"
                              >
                                <ShieldAlert className="h-3 w-3 shrink-0" strokeWidth={1.75} aria-hidden />
                                Texts: none
                              </div>
                            ))}
                          {!c.phone && !c.email && (
                            <span className="text-[var(--color-text-muted)]">
                              —
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        <span
                          style={
                            due > 0
                              ? { color: "var(--color-danger)" }
                              : { color: "var(--color-text-secondary)" }
                          }
                        >
                          {money(due)}
                        </span>
                        {pastDue > 0 && (
                          <div
                            className="text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: "var(--color-danger)" }}
                          >
                            {money(pastDue)} past due
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text-secondary)]">
                        {money(c.account?.creditLimit ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--color-text-secondary)]">
                        {money(c.account?.storeCredit ?? 0)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            aria-label={`Edit ${c.name}`}
                            title="Edit"
                            className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                          >
                            <Pencil
                              className="h-4 w-4"
                              strokeWidth={1.75}
                              aria-hidden
                            />
                          </button>
                          <button
                            onClick={() => remove(c)}
                            aria-label={`Delete ${c.name}`}
                            title="Delete"
                            className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2
                              className="h-4 w-4"
                              strokeWidth={1.75}
                              aria-hidden
                            />
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
        {cursor && !loading && (
          <div className="mt-4 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.75} aria-hidden /> : null}
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Edit / Add side panel ──────────────────────────────── */}
      {panelOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            aria-label="Close panel"
            onClick={closePanel}
            className="absolute inset-0 bg-black/50"
          />
          <div className="relative flex h-full w-full max-w-md flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
                {editing ? "Edit Customer" : "Add Customer"}
              </h2>
              <button
                onClick={closePanel}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-4 overflow-auto p-5">
                <Field label="Name" required>
                  <input
                    required
                    value={form.name}
                    onChange={(e) => upd("name", e.target.value)}
                    placeholder="Acme Landscaping LLC"
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Phone">
                    <input
                      value={form.phone}
                      onChange={(e) => upd("phone", e.target.value)}
                      placeholder="(510) 555-0100"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Type">
                    <select
                      value={form.type}
                      onChange={(e) => upd("type", e.target.value)}
                      className={inputCls}
                    >
                      {TYPE_OPTIONS.map((t) => (
                        <option key={t.value} value={t.value}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <Field label="Email">
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => upd("email", e.target.value)}
                    placeholder="ap@acme.com"
                    className={inputCls}
                  />
                </Field>

                <Field label="Credit limit">
                  <div className="relative">
                    <CreditCard
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.creditLimit}
                      onChange={(e) => upd("creditLimit", e.target.value)}
                      placeholder="0.00"
                      className={`${inputCls} pl-8`}
                    />
                  </div>
                </Field>

                <Field label="Billing address">
                  <div className="relative">
                    <Building2
                      className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-text-muted)]"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <textarea
                      value={form.billingAddress}
                      onChange={(e) => upd("billingAddress", e.target.value)}
                      rows={2}
                      placeholder="123 Market St, Richmond, CA"
                      className={`${inputCls} h-auto resize-y py-2 pl-8`}
                    />
                  </div>
                </Field>

                <Field label="Delivery address">
                  <div className="relative">
                    <Building2
                      className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--color-text-muted)]"
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <textarea
                      value={form.deliveryAddress}
                      onChange={(e) => upd("deliveryAddress", e.target.value)}
                      rows={2}
                      placeholder="Same as billing, or job site address"
                      className={`${inputCls} h-auto resize-y py-2 pl-8`}
                    />
                  </div>
                </Field>

                <Field label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={(e) => upd("notes", e.target.value)}
                    rows={3}
                    placeholder="Terms, account contacts, delivery preferences…"
                    className={`${inputCls} h-auto resize-y py-2`}
                  />
                </Field>

                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={form.portalAccess}
                    onChange={(e) => upd("portalAccess", e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-action)]"
                  />
                  Customer portal access
                </label>

                {/* SMS texting consent (A2P 10DLC / TCPA) */}
                {form.phone.trim() && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                      SMS texting consent
                    </p>

                    {consentLoading ? (
                      <p className="text-sm text-[var(--color-text-muted)]">Checking…</p>
                    ) : consent?.status === "opted_in" ? (
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm" style={{ color: "var(--color-success)" }}>
                          Opted in · {consent.channel}
                          {consent.collectedByName ? ` · by ${consent.collectedByName}` : ""}
                        </p>
                        {isManager && (
                          <button
                            type="button"
                            onClick={() => void revokeConsent()}
                            className="text-xs font-medium text-[var(--color-danger)] hover:underline"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
                          <ShieldAlert className="h-4 w-4 text-[var(--color-warning)]" strokeWidth={1.75} aria-hidden />
                          {consent?.status === "revoked" ? "Consent revoked" : "No consent on file"}
                        </p>
                        {!showConsentConfirm && (
                          <Button type="button" size="sm" variant="secondary" onClick={() => setShowConsentConfirm(true)}>
                            <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                            Record consent
                          </Button>
                        )}
                      </div>
                    )}

                    {showConsentConfirm && (
                      <div className="mt-3 space-y-2">
                        <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-2 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                          Read aloud: &ldquo;{disclosure}&rdquo;
                        </p>
                        <label className="flex items-start gap-2 text-xs text-[var(--color-text-secondary)]">
                          <input
                            type="checkbox"
                            checked={consentConfirmed}
                            onChange={(e) => setConsentConfirmed(e.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-[var(--color-action)]"
                          />
                          I read this to the customer and they agreed to receive texts.
                        </label>
                        <div className="flex justify-end gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setShowConsentConfirm(false);
                              setConsentConfirmed(false);
                            }}
                          >
                            Cancel
                          </Button>
                          <Button type="button" size="sm" disabled={!consentConfirmed || consentSaving} onClick={() => void recordConsent()}>
                            <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                            {consentSaving ? "Saving…" : "Confirm consent"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Account balances accrue from orders — read-only on edit. */}
                {editing && (
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                      Account (accrues from orders)
                    </p>
                    <dl className="grid grid-cols-3 gap-2 text-sm">
                      <div>
                        <dt className="text-xs text-[var(--color-text-muted)]">
                          Open debt
                        </dt>
                        <dd
                          className="font-mono"
                          style={
                            (editing.account?.openDebt ?? 0) > 0
                              ? { color: "var(--color-danger)" }
                              : { color: "var(--color-text-secondary)" }
                          }
                        >
                          {money(editing.account?.openDebt ?? 0)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[var(--color-text-muted)]">
                          Past due
                        </dt>
                        <dd
                          className="font-mono"
                          style={
                            (editing.account?.pastDue ?? 0) > 0
                              ? { color: "var(--color-danger)" }
                              : { color: "var(--color-text-secondary)" }
                          }
                        >
                          {money(editing.account?.pastDue ?? 0)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-[var(--color-text-muted)]">
                          Store credit
                        </dt>
                        <dd className="font-mono text-[var(--color-text-secondary)]">
                          {money(editing.account?.storeCredit ?? 0)}
                        </dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex items-center justify-between rounded-[var(--radius-md)] bg-[var(--color-moss-100)]/50 px-3 py-2">
                      <span className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)]">
                        <Gift className="h-4 w-4 text-[var(--color-text-brand)]" strokeWidth={1.75} aria-hidden />
                        <span className="font-semibold text-[var(--color-text-primary)]">{editing.account?.loyaltyPoints ?? 0}</span>
                        loyalty pts
                      </span>
                      <button
                        type="button"
                        onClick={() => void redeemLoyalty()}
                        disabled={(editing.account?.loyaltyPoints ?? 0) <= 0}
                        className="text-xs font-medium text-[var(--color-text-brand)] hover:underline disabled:opacity-40"
                      >
                        Redeem
                      </button>
                    </div>

                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => void recordPayment()}
                    >
                      <CreditCard className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      Record payment
                    </Button>

                    {/* A/R statement — open invoices + recent payments */}
                    {statement && (statement.invoices.length > 0 || statement.payments.length > 0) && (
                      <div className="mt-3 border-t border-[var(--color-border)] pt-3">
                        {statement.invoices.filter((i) => i.due > 0).length > 0 && (
                          <>
                            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                              Open invoices
                            </p>
                            <ul className="space-y-1 text-sm">
                              {statement.invoices
                                .filter((i) => i.due > 0)
                                .map((i) => (
                                  <li key={i.id} className="flex items-center justify-between gap-2">
                                    <span className="font-mono text-xs text-[var(--color-text-secondary)]">
                                      {i.number}
                                      <span className="ml-2 text-[var(--color-text-muted)]">
                                        {new Date(i.date).toLocaleDateString()}
                                      </span>
                                    </span>
                                    <span className="font-mono font-medium text-[var(--color-text-primary)]">
                                      {money(i.due)}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          </>
                        )}
                        {statement.payments.length > 0 && (
                          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                            Last payment {money(statement.payments[0]!.amount)} on{" "}
                            {new Date(statement.payments[0]!.createdAt).toLocaleDateString()}
                            {statement.payments.length > 1 ? ` · ${statement.payments.length} total` : ""}
                          </p>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-2 w-full"
                          onClick={() => statement && void customerStatementPdf(statement)}
                        >
                          <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                          Statement PDF
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {formError && (
                  <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
                    {formError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={closePanel}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving
                    ? "Saving…"
                    : editing
                      ? "Save changes"
                      : "Create customer"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Broadcast compose modal ─────────────────────────────── */}
      {broadcastOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4">
          <button aria-label="Close" onClick={() => setBroadcastOpen(false)} className="absolute inset-0 bg-black/50" />
          <div className="relative w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
              <h2 className="flex items-center gap-2 font-display text-lg font-bold text-[var(--color-text-primary)]">
                <Megaphone className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                Send broadcast text
              </h2>
              <button
                onClick={() => setBroadcastOpen(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
              >
                <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </button>
            </div>

            <div className="space-y-3 p-5">
              {broadcastResult ? (
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--color-success)" }}>
                    <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
                    Sent {broadcastResult.sent} of {broadcastResult.total}
                  </p>
                  <ul className="space-y-1 text-[var(--color-text-secondary)]">
                    {broadcastResult.noConsent > 0 && <li>{broadcastResult.noConsent} skipped — no consent on file</li>}
                    {broadcastResult.optedOut > 0 && <li>{broadcastResult.optedOut} skipped — opted out</li>}
                    {broadcastResult.invalid > 0 && <li>{broadcastResult.invalid} skipped — invalid number</li>}
                    {broadcastResult.failed > 0 && (
                      <li style={{ color: "var(--color-danger)" }}>{broadcastResult.failed} failed to send</li>
                    )}
                  </ul>
                </div>
              ) : broadcastScheduledOk ? (
                <div className="space-y-2 text-sm">
                  <p className="flex items-center gap-2 font-semibold" style={{ color: "var(--color-success)" }}>
                    <CalendarClock className="h-4 w-4" strokeWidth={2} aria-hidden />
                    Broadcast scheduled
                  </p>
                  <p className="text-[var(--color-text-secondary)]">
                    {selectedReachable.length} recipient{selectedReachable.length === 1 ? "" : "s"} ·{" "}
                    {broadcastWhen ? new Date(broadcastWhen).toLocaleString() : ""}. Manage or cancel it under{" "}
                    <span className="font-medium">Messages → Scheduled</span>.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Sending to{" "}
                    <span className="font-semibold text-[var(--color-text-primary)]">{selectedReachable.length}</span>{" "}
                    consented recipient{selectedReachable.length === 1 ? "" : "s"}. Opted-out and non-consented
                    selections are skipped automatically.
                  </p>
                  <textarea
                    value={broadcastBody}
                    onChange={(e) => setBroadcastBody(e.target.value)}
                    rows={4}
                    maxLength={1000}
                    placeholder="e.g. Spring sale: 15% off mulch & bark this weekend at Bay Area Landscaping Materials!"
                    className={`${inputCls} h-auto resize-y py-2`}
                  />
                  <p className="flex justify-between text-xs text-[var(--color-text-muted)]">
                    <span>&ldquo;Reply STOP to opt out.&rdquo; is added automatically if missing.</span>
                    <span>{broadcastBody.length}/1000</span>
                  </p>
                  <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                    <input
                      type="checkbox"
                      checked={broadcastSchedule}
                      onChange={(e) => setBroadcastSchedule(e.target.checked)}
                      className="h-4 w-4 accent-[var(--color-action)]"
                    />
                    <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    Schedule for later
                  </label>
                  {broadcastSchedule && (
                    <input
                      type="datetime-local"
                      value={broadcastWhen}
                      onChange={(e) => setBroadcastWhen(e.target.value)}
                      className={inputCls}
                    />
                  )}
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
              {broadcastResult || broadcastScheduledOk ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setBroadcastOpen(false);
                    setSelected(new Set());
                  }}
                >
                  Done
                </Button>
              ) : (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setBroadcastOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    disabled={
                      broadcastSending ||
                      !broadcastBody.trim() ||
                      selectedReachable.length === 0 ||
                      (broadcastSchedule && !broadcastWhen)
                    }
                    onClick={() => void sendBroadcast()}
                  >
                    {broadcastSchedule ? (
                      <CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    ) : (
                      <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    )}
                    {broadcastSending
                      ? broadcastSchedule
                        ? "Scheduling…"
                        : "Sending…"
                      : broadcastSchedule
                        ? "Schedule"
                        : `Send to ${selectedReachable.length}`}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
        {required && <span className="text-[var(--color-danger)]"> *</span>}
      </span>
      {children}
    </label>
  );
}
