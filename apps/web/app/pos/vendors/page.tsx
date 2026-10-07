"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Factory,
  Plus,
  Pencil,
  Trash2,
  Mail,
  Phone,
  MapPin,
  X,
  Search,
} from "lucide-react";
import { Button } from "@balm/ui";
import { api, type Vendor } from "@/lib/api-client";

const OFFLINE_NOTE =
  "Can't reach the API — start it with `pnpm dev` in apps/api.";

type FormState = {
  name: string;
  category: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  terms: string;
  notes: string;
  active: boolean;
};

const EMPTY: FormState = {
  name: "",
  category: "",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  terms: "Net 30",
  notes: "",
  active: true,
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listVendors();
      setVendors(data);
    } catch {
      setError(OFFLINE_NOTE);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter((v) =>
      [v.name, v.category, v.contactName, v.email, v.phone, v.address, v.terms]
        .filter(Boolean)
        .some((field) => field.toLowerCase().includes(q)),
    );
  }, [vendors, query]);

  function openAdd() {
    setEditing(null);
    setForm(EMPTY);
    setFormError(null);
    setPanelOpen(true);
  }

  function openEdit(v: Vendor) {
    setEditing(v);
    setForm({
      name: v.name ?? "",
      category: v.category ?? "",
      contactName: v.contactName ?? "",
      email: v.email ?? "",
      phone: v.phone ?? "",
      address: v.address ?? "",
      terms: v.terms || "Net 30",
      notes: v.notes ?? "",
      active: v.active ?? true,
    });
    setFormError(null);
    setPanelOpen(true);
  }

  function closePanel() {
    setPanelOpen(false);
    setEditing(null);
    setFormError(null);
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
      if (editing) {
        await api.updateVendor(editing.id, form);
      } else {
        await api.createVendor(form);
      }
      closePanel();
      await load();
    } catch {
      setFormError(OFFLINE_NOTE);
    } finally {
      setSaving(false);
    }
  }

  async function remove(v: Vendor) {
    if (!window.confirm(`Delete vendor "${v.name}"? This can't be undone.`)) return;
    try {
      await api.deleteVendor(v.id);
      await load();
    } catch {
      setError(OFFLINE_NOTE);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* ── Header bar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
            <Factory className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
              Vendors
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {loading
                ? "Loading…"
                : `${vendors.length} vendor${vendors.length === 1 ? "" : "s"}${
                    query.trim() ? ` · ${filtered.length} shown` : ""
                  }`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
              strokeWidth={1.75}
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vendors…"
              aria-label="Search vendors"
              className="h-9 w-56 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] pl-8 pr-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]"
            />
          </div>
          <Button size="sm" onClick={openAdd}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Add Vendor
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

        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] py-16 text-center">
            <Factory
              className="h-8 w-8 text-[var(--color-text-muted)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-3 text-sm font-medium text-[var(--color-text-secondary)]">
              {query.trim()
                ? "No vendors match your search."
                : error
                  ? "No vendors to show."
                  : "No vendors yet."}
            </p>
            {!query.trim() && !error && (
              <button
                onClick={openAdd}
                className="mt-3 text-sm font-medium text-[var(--color-text-brand)] hover:underline"
              >
                Add your first vendor
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((v) => (
              <article
                key={v.id}
                className="flex flex-col rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-medium text-[var(--color-text-primary)]">
                      {v.name}
                    </h3>
                    {v.contactName && (
                      <p className="truncate text-xs text-[var(--color-text-muted)]">
                        {v.contactName}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => openEdit(v)}
                      aria-label={`Edit ${v.name}`}
                      className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                    >
                      <Pencil className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                    <button
                      onClick={() => remove(v)}
                      aria-label={`Delete ${v.name}`}
                      className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-1.5">
                  {v.category && (
                    <span className="rounded-full bg-[var(--color-moss-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-moss-700)]">
                      {v.category}
                    </span>
                  )}
                  {v.terms && (
                    <span className="rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]">
                      {v.terms}
                    </span>
                  )}
                  {!v.active && (
                    <span className="rounded-full bg-[var(--color-bg-surface)] px-2 py-0.5 text-xs font-medium text-[var(--color-warning)]">
                      Inactive
                    </span>
                  )}
                </div>

                <ul className="mt-3 space-y-1.5 text-xs text-[var(--color-text-secondary)]">
                  {v.email && (
                    <li className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      <span className="truncate">{v.email}</span>
                    </li>
                  )}
                  {v.phone && (
                    <li className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      {v.phone}
                    </li>
                  )}
                  {v.address && (
                    <li className="flex items-start gap-1.5">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                      {v.address}
                    </li>
                  )}
                </ul>
              </article>
            ))}
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
                {editing ? "Edit Vendor" : "Add Vendor"}
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
                    placeholder="Bay Aggregates Co."
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Category">
                    <input
                      value={form.category}
                      onChange={(e) => upd("category", e.target.value)}
                      placeholder="Aggregates"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Terms">
                    <input
                      value={form.terms}
                      onChange={(e) => upd("terms", e.target.value)}
                      placeholder="Net 30"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Contact name">
                  <input
                    value={form.contactName}
                    onChange={(e) => upd("contactName", e.target.value)}
                    placeholder="Jane Doe"
                    className={inputCls}
                  />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Email">
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => upd("email", e.target.value)}
                      placeholder="sales@vendor.com"
                      className={inputCls}
                    />
                  </Field>
                  <Field label="Phone">
                    <input
                      value={form.phone}
                      onChange={(e) => upd("phone", e.target.value)}
                      placeholder="(510) 555-0100"
                      className={inputCls}
                    />
                  </Field>
                </div>

                <Field label="Address">
                  <input
                    value={form.address}
                    onChange={(e) => upd("address", e.target.value)}
                    placeholder="123 Yard Rd, Richmond, CA"
                    className={inputCls}
                  />
                </Field>

                <Field label="Notes">
                  <textarea
                    value={form.notes}
                    onChange={(e) => upd("notes", e.target.value)}
                    rows={3}
                    placeholder="Delivery preferences, account #, etc."
                    className={`${inputCls} h-auto resize-y py-2`}
                  />
                </Field>

                <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => upd("active", e.target.checked)}
                    className="h-4 w-4 accent-[var(--color-action)]"
                  />
                  Active vendor
                </label>

                {formError && (
                  <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm text-[var(--color-danger)]">
                    {formError}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-4">
                <Button type="button" variant="secondary" size="sm" onClick={closePanel}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? "Saving…" : editing ? "Save changes" : "Create vendor"}
                </Button>
              </div>
            </form>
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
