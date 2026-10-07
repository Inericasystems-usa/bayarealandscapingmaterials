"use client";

import { useState } from "react";
import { Mail, Plus, Server, Lock, CheckCircle2, Inbox, X } from "lucide-react";
import { Button } from "@balm/ui";

interface MailAccount {
  id: string;
  label: string;
  address: string;
  protocol: "IMAP" | "POP3";
  inHost: string;
  inPort: number;
  smtpHost: string;
  smtpPort: number;
  ssl: boolean;
  status: "connected" | "pending";
}

const SEED: MailAccount[] = [
  {
    id: "a1",
    label: "Sales",
    address: "sales@bayarealandscapingmaterials.com",
    protocol: "IMAP",
    inHost: "imap.bayarealandscapingmaterials.com",
    inPort: 993,
    smtpHost: "smtp.bayarealandscapingmaterials.com",
    smtpPort: 465,
    ssl: true,
    status: "connected",
  },
  {
    id: "a2",
    label: "Dispatch",
    address: "dispatch@bayarealandscapingmaterials.com",
    protocol: "IMAP",
    inHost: "imap.bayarealandscapingmaterials.com",
    inPort: 993,
    smtpHost: "smtp.bayarealandscapingmaterials.com",
    smtpPort: 465,
    ssl: true,
    status: "connected",
  },
];

const TICKETS = [
  { from: "Sequoia Landscapes", subj: "Re: 6 yd mulch delivery Thursday", acct: "Sales", time: "9:12 AM", unread: true },
  { from: "m.ramirez@gmail.com", subj: "Quote request — pea gravel driveway", acct: "Sales", time: "8:40 AM", unread: true },
  { from: "Bayview GC", subj: "Invoice #4471 — net 30 confirm", acct: "Dispatch", time: "Yest.", unread: false },
  { from: "City of Richmond", subj: "Permit docs for base rock order", acct: "Dispatch", time: "Yest.", unread: false },
];

const EMPTY = {
  label: "",
  address: "",
  protocol: "IMAP" as "IMAP" | "POP3",
  inHost: "",
  inPort: "993",
  smtpHost: "",
  smtpPort: "465",
  username: "",
  password: "",
  ssl: true,
};

export default function HelpdeskPage() {
  const [accounts, setAccounts] = useState<MailAccount[]>(SEED);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const upd = (k: keyof typeof form, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setAccounts((prev) => [
      ...prev,
      {
        id: `a${prev.length + 1}`,
        label: form.label || form.address,
        address: form.address,
        protocol: form.protocol,
        inHost: form.inHost,
        inPort: Number(form.inPort),
        smtpHost: form.smtpHost,
        smtpPort: Number(form.smtpPort),
        ssl: form.ssl,
        status: "pending",
      },
    ]);
    setForm(EMPTY);
    setShowForm(false);
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[420px_1fr]">
      {/* ── Accounts panel ──────────────────────────────────────── */}
      <div className="flex min-h-0 flex-col border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">
              Helpdesk
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {accounts.length} mailbox{accounts.length === 1 ? "" : "es"} connected
            </p>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? "Cancel" : "Add"}
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {showForm ? (
            <form onSubmit={submit} className="space-y-4">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Connect any mailbox over <strong>IMAP/POP3</strong> for receiving and{" "}
                <strong>SMTP</strong> for sending.
              </p>

              <Field label="Display name">
                <input
                  required
                  value={form.label}
                  onChange={(e) => upd("label", e.target.value)}
                  placeholder="Sales"
                  className={inputCls}
                />
              </Field>
              <Field label="Email address">
                <input
                  required
                  type="email"
                  value={form.address}
                  onChange={(e) => upd("address", e.target.value)}
                  placeholder="sales@bayarealandscapingmaterials.com"
                  className={inputCls}
                />
              </Field>

              <div>
                <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Incoming protocol
                </span>
                <div className="flex gap-2">
                  {(["IMAP", "POP3"] as const).map((proto) => (
                    <button
                      key={proto}
                      type="button"
                      onClick={() => {
                        upd("protocol", proto);
                        upd("inPort", proto === "IMAP" ? "993" : "995");
                      }}
                      className={`flex-1 rounded-[var(--radius-md)] border px-3 py-2 text-sm font-medium ${
                        form.protocol === proto
                          ? "border-[var(--color-action)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)]"
                      }`}
                    >
                      {proto}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_88px] gap-2">
                <Field label="Incoming host">
                  <input
                    required
                    value={form.inHost}
                    onChange={(e) => upd("inHost", e.target.value)}
                    placeholder="imap.example.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Port">
                  <input
                    required
                    value={form.inPort}
                    onChange={(e) => upd("inPort", e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-[1fr_88px] gap-2">
                <Field label="SMTP host">
                  <input
                    required
                    value={form.smtpHost}
                    onChange={(e) => upd("smtpHost", e.target.value)}
                    placeholder="smtp.example.com"
                    className={inputCls}
                  />
                </Field>
                <Field label="Port">
                  <input
                    required
                    value={form.smtpPort}
                    onChange={(e) => upd("smtpPort", e.target.value)}
                    className={inputCls}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Username">
                  <input
                    value={form.username}
                    onChange={(e) => upd("username", e.target.value)}
                    placeholder="sales@…"
                    className={inputCls}
                  />
                </Field>
                <Field label="Password">
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => upd("password", e.target.value)}
                    placeholder="••••••••"
                    className={inputCls}
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
                <input
                  type="checkbox"
                  checked={form.ssl}
                  onChange={(e) => upd("ssl", e.target.checked)}
                  className="h-4 w-4 accent-[var(--color-action)]"
                />
                Use SSL/TLS encryption
              </label>

              <Button type="submit" className="w-full">
                <Server className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                Connect mailbox
              </Button>
            </form>
          ) : (
            <ul className="space-y-2.5">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border)] p-3.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                      <Mail className="h-4.5 w-4.5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                        {a.label}
                      </p>
                      <p className="truncate text-xs text-[var(--color-text-muted)]">{a.address}</p>
                    </div>
                    {a.status === "connected" ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-success)]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Live
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-[var(--color-warning)]">
                        Verifying…
                      </span>
                    )}
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-text-muted)]">
                    <span className="inline-flex items-center gap-1">
                      <Server className="h-3 w-3" /> {a.protocol} · {a.inHost}:{a.inPort}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Mail className="h-3 w-3" /> SMTP · {a.smtpHost}:{a.smtpPort}
                    </span>
                    {a.ssl && (
                      <span className="inline-flex items-center gap-1">
                        <Lock className="h-3 w-3" /> SSL/TLS
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Unified inbox / tickets ─────────────────────────────── */}
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
          <Inbox className="h-5 w-5 text-[var(--color-text-secondary)]" strokeWidth={1.75} aria-hidden />
          <h2 className="font-display text-lg font-bold text-[var(--color-text-primary)]">
            Unified Inbox
          </h2>
          <span className="ml-2 rounded-full bg-[var(--color-action)] px-2 py-0.5 text-xs font-semibold text-[var(--color-action-fg)]">
            {TICKETS.filter((t) => t.unread).length} new
          </span>
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-[var(--color-border)] overflow-auto">
          {TICKETS.map((t, i) => (
            <li
              key={i}
              className="flex cursor-pointer items-center gap-3 px-5 py-3.5 hover:bg-[var(--color-bg-surface)]"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  t.unread ? "bg-[var(--color-action)]" : "bg-transparent"
                }`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={`truncate text-sm ${
                      t.unread
                        ? "font-semibold text-[var(--color-text-primary)]"
                        : "text-[var(--color-text-secondary)]"
                    }`}
                  >
                    {t.from}
                  </p>
                  <span className="shrink-0 rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--color-text-muted)]">
                    {t.acct}
                  </span>
                </div>
                <p className="truncate text-sm text-[var(--color-text-muted)]">{t.subj}</p>
              </div>
              <span className="shrink-0 text-xs text-[var(--color-text-muted)]">{t.time}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]";

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
