"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MessageSquare,
  Send,
  Bot,
  Ban,
  Inbox as InboxIcon,
  Sparkles,
  Plus,
  Trash2,
  Radio,
  ShieldCheck,
  ClipboardCheck,
  Copy,
  Check,
  CheckCheck,
  AlertCircle,
  CalendarClock,
  X,
} from "lucide-react";
import { Button } from "@balm/ui";
import {
  api,
  type MessagingStatus,
  type MessageThread,
  type SmsMessage,
  type MessageTemplate,
  type OptOut,
  type Consent,
  type ConsentChannel,
  type ScheduledBroadcast,
  type TriggerKey,
} from "@/lib/api-client";
import { toast } from "@/lib/toast";

const OFFLINE_NOTE = "Can't reach the API — start it with `pnpm dev` in apps/api.";

type Tab = "inbox" | "automation" | "scheduled" | "consent" | "optouts";

const TABS: { value: Tab; label: string; icon: typeof InboxIcon }[] = [
  { value: "inbox", label: "Inbox", icon: InboxIcon },
  { value: "automation", label: "Automation", icon: Bot },
  { value: "scheduled", label: "Scheduled", icon: CalendarClock },
  { value: "consent", label: "Consent", icon: ShieldCheck },
  { value: "optouts", label: "Opt-outs", icon: Ban },
];

// Placeholder hints shown under each template editor.
const PLACEHOLDERS: Record<TriggerKey, string> = {
  "delivery.dispatched": "{{customer}} {{code}} {{eta}}",
  "delivery.delivered": "{{customer}} {{code}}",
  "order.created": "{{customer}} {{number}} {{total}}",
  "lead.followup": "{{customer}}",
};

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

// Friendly outbound delivery state from RingCentral's raw messageStatus.
function deliveryState(status: string): { label: string; kind: "delivered" | "failed" | "pending" } {
  if (/fail/i.test(status)) return { label: "Failed", kind: "failed" };
  if (/deliver/i.test(status)) return { label: "Delivered", kind: "delivered" };
  if (status === "Queued") return { label: "Queued", kind: "pending" };
  return { label: status || "Sent", kind: "pending" };
}

export default function MessagesPage() {
  const [tab, setTab] = useState<Tab>("inbox");
  const [status, setStatus] = useState<MessagingStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .messagingStatus()
      .then(setStatus)
      .catch(() => setError(OFFLINE_NOTE));
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
            <MessageSquare className="h-5 w-5" strokeWidth={1.75} aria-hidden />
          </span>
          <div>
            <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">Messages</h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              Customer texting & automated alerts via RingCentral
            </p>
          </div>
        </div>
        {status && (
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
            style={
              status.mode === "live"
                ? { color: "var(--color-success)", backgroundColor: "color-mix(in srgb, var(--color-success) 16%, transparent)" }
                : { color: "var(--color-warning)", backgroundColor: "color-mix(in srgb, var(--color-warning) 16%, transparent)" }
            }
            title={status.from ? `Sending from ${status.from}` : "No RingCentral number configured"}
          >
            <Radio className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            {status.mode === "live" ? `Live · ${status.from ?? ""}` : "Simulated"}
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-[var(--color-action)] text-[var(--color-text-primary)]"
                  : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="m-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3 text-sm text-[var(--color-text-secondary)]">
          {error}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "inbox" && <Inbox onError={() => setError(OFFLINE_NOTE)} simulated={status?.mode !== "live"} />}
        {tab === "automation" && <Automation onError={() => setError(OFFLINE_NOTE)} />}
        {tab === "scheduled" && <ScheduledTab onError={() => setError(OFFLINE_NOTE)} />}
        {tab === "consent" && <ConsentTab onError={() => setError(OFFLINE_NOTE)} />}
        {tab === "optouts" && <OptOuts onError={() => setError(OFFLINE_NOTE)} />}
      </div>
    </div>
  );
}

// ── Inbox ─────────────────────────────────────────────────────────────
function Inbox({ onError, simulated }: { onError: () => void; simulated: boolean }) {
  const [threads, setThreads] = useState<MessageThread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [thread, setThread] = useState<SmsMessage[]>([]);
  const [optedOut, setOptedOut] = useState(false);
  const [consented, setConsented] = useState(false);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [manualTo, setManualTo] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    try {
      setThreads(await api.listThreads());
    } catch {
      onError();
    }
  }, [onError]);

  const loadThread = useCallback(async (phone: string) => {
    try {
      const t = await api.getThread(phone);
      setThread(t.messages);
      setOptedOut(t.optedOut);
      setConsented(t.consented);
    } catch {
      onError();
    }
  }, [onError]);

  useEffect(() => {
    void loadThreads();
    const id = setInterval(() => void loadThreads(), 8000);
    return () => clearInterval(id);
  }, [loadThreads]);

  useEffect(() => {
    if (active) void loadThread(active);
  }, [active, loadThread]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread]);

  async function send() {
    const to = active ?? manualTo.trim();
    if (!to || !draft.trim()) return;
    setSending(true);
    try {
      await api.sendSms(to, draft.trim());
      setDraft("");
      if (!active) setActive(to);
      await loadThread(to);
      await loadThreads();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* Thread list */}
      <div className="flex w-72 shrink-0 flex-col border-r border-[var(--color-border)]">
        <div className="border-b border-[var(--color-border)] p-2">
          <div className="flex gap-1.5">
            <input
              value={manualTo}
              onChange={(e) => setManualTo(e.target.value)}
              placeholder="New text: (510) 555-0123"
              className={inputCls}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => manualTo.trim() && setActive(manualTo.trim())}
              aria-label="Start conversation"
            >
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {threads.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-text-muted)]">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <button
                key={t.phone}
                onClick={() => setActive(t.phone)}
                className={`flex w-full flex-col gap-0.5 border-b border-[var(--color-border)] px-3 py-2.5 text-left transition-colors ${
                  active === t.phone ? "bg-[var(--color-moss-100)]" : "hover:bg-[var(--color-bg-surface)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-[var(--color-text-primary)]">
                    {t.customerName || t.phone}
                  </span>
                  {t.unread > 0 && (
                    <span className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--color-action)] px-1 text-[10px] font-bold text-white">
                      {t.unread}
                    </span>
                  )}
                </div>
                <span className="truncate text-xs text-[var(--color-text-muted)]">{t.lastBody}</span>
                <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                  {time(t.lastAt)}
                  {t.optedOut && <span className="font-semibold text-[var(--color-danger)]">· opted out</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Conversation */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!active ? (
          <div className="grid flex-1 place-items-center text-center">
            <div>
              <InboxIcon className="mx-auto h-8 w-8 text-[var(--color-text-muted)]" strokeWidth={1.5} aria-hidden />
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">Select a conversation or start a new text.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-2.5">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">{active}</span>
              {optedOut ? (
                <span className="text-xs font-semibold text-[var(--color-danger)]">Opted out — auto-texts suppressed</span>
              ) : consented ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-success)]">
                  <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden /> Consent on file
                </span>
              ) : (
                <span className="text-xs font-semibold text-[var(--color-warning)]">No consent — auto-texts won&apos;t send (manual reply OK)</span>
              )}
            </div>
            <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-auto p-4">
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-[var(--radius-lg)] px-3 py-2 text-sm ${
                      m.direction === "out"
                        ? "bg-[var(--color-action)] text-white"
                        : "bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.body}</p>
                    <p className={`mt-1 flex flex-wrap items-center gap-x-1 text-[10px] ${m.direction === "out" ? "text-white/70" : "text-[var(--color-text-muted)]"}`}>
                      <span>{time(m.createdAt)}</span>
                      {m.trigger && <span>· auto ({m.trigger.split(".")[1]})</span>}
                      {m.simulated && <span>· sim</span>}
                      {m.direction === "out" &&
                        (() => {
                          const s = deliveryState(m.status);
                          return (
                            <span
                              className="flex items-center gap-0.5"
                              style={s.kind === "failed" ? { color: "var(--color-warning)", fontWeight: 600 } : undefined}
                              title={m.error ?? m.status}
                            >
                              ·{" "}
                              {s.kind === "delivered" ? (
                                <CheckCheck className="h-3 w-3" strokeWidth={2} aria-hidden />
                              ) : s.kind === "failed" ? (
                                <AlertCircle className="h-3 w-3" strokeWidth={2} aria-hidden />
                              ) : (
                                <Check className="h-3 w-3" strokeWidth={2} aria-hidden />
                              )}
                              {s.label}
                            </span>
                          );
                        })()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[var(--color-border)] p-3">
              {simulated && (
                <p className="mb-2 text-[11px] text-[var(--color-text-muted)]">
                  Simulated mode — message is logged but not actually sent. Add RC_* env vars to go live.
                </p>
              )}
              <div className="flex gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                  rows={2}
                  placeholder={optedOut ? "This number opted out" : "Type a message…"}
                  disabled={optedOut}
                  className={`${inputCls} h-auto resize-none py-2`}
                />
                <Button size="sm" onClick={() => void send()} disabled={sending || optedOut || !draft.trim()}>
                  <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  {sending ? "…" : "Send"}
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Automation (templates) ────────────────────────────────────────────
function Automation({ onError }: { onError: () => void }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { body: string; delayMinutes: number }>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await api.listTemplates();
      setTemplates(list);
      setDrafts(Object.fromEntries(list.map((t) => [t.key, { body: t.body, delayMinutes: t.delayMinutes }])));
    } catch {
      onError();
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(t: MessageTemplate) {
    try {
      await api.updateTemplate(t.key, { enabled: !t.enabled });
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function save(t: MessageTemplate) {
    const d = drafts[t.key];
    if (!d) return;
    setSavingKey(t.key);
    try {
      await api.updateTemplate(t.key, { body: d.body, delayMinutes: d.delayMinutes });
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-4 flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
        <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Auto-texts fire on system events. Toggle a trigger off to pause it. Auto-texts only send to numbers with
        consent on file (see the Consent tab); opted-out numbers are always skipped.
      </p>
      <div className="space-y-3">
        {templates.map((t) => {
          const d = drafts[t.key] ?? { body: t.body, delayMinutes: t.delayMinutes };
          const dirty = d.body !== t.body || d.delayMinutes !== t.delayMinutes;
          return (
            <div key={t.key} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{t.label}</h3>
                  <p className="font-mono text-[11px] text-[var(--color-text-muted)]">{t.key}</p>
                </div>
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs font-medium text-[var(--color-text-secondary)]">
                  <input type="checkbox" checked={t.enabled} onChange={() => void toggle(t)} className="h-4 w-4 accent-[var(--color-action)]" />
                  {t.enabled ? "On" : "Off"}
                </label>
              </div>
              <textarea
                value={d.body}
                onChange={(e) => setDrafts((p) => ({ ...p, [t.key]: { ...d, body: e.target.value } }))}
                rows={2}
                className={`${inputCls} h-auto resize-y py-2`}
              />
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Variables: <span className="font-mono">{PLACEHOLDERS[t.key]}</span>
              </p>
              <div className="mt-2 flex items-center justify-between gap-3">
                {t.key === "lead.followup" ? (
                  <label className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    Send after
                    <input
                      type="number"
                      min={0}
                      value={d.delayMinutes}
                      onChange={(e) => setDrafts((p) => ({ ...p, [t.key]: { ...d, delayMinutes: Number(e.target.value) || 0 } }))}
                      className="h-8 w-20 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2 text-sm text-[var(--color-text-primary)]"
                    />
                    minutes of no contact
                  </label>
                ) : (
                  <span />
                )}
                <Button size="sm" variant="secondary" onClick={() => void save(t)} disabled={!dirty || savingKey === t.key}>
                  {savingKey === t.key ? "Saving…" : "Save"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Opt-outs ──────────────────────────────────────────────────────────
function OptOuts({ onError }: { onError: () => void }) {
  const [list, setList] = useState<OptOut[]>([]);
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    try {
      setList(await api.listOptOuts());
    } catch {
      onError();
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    if (!phone.trim()) return;
    try {
      await api.addOptOut(phone.trim());
      setPhone("");
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  async function remove(p: string) {
    if (!window.confirm(`Remove ${p} from the opt-out list? They'll receive automated texts again.`)) return;
    try {
      await api.removeOptOut(p);
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const count = useMemo(() => list.length, [list]);

  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-3 text-sm text-[var(--color-text-muted)]">
        {count} number{count === 1 ? "" : "s"} opted out. These are suppressed from all automated and manual texts.
        Customers are added automatically when they reply <span className="font-mono">STOP</span>.
      </p>
      <div className="mb-4 flex max-w-md gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(510) 555-0123" className={inputCls} />
        <Button size="sm" variant="secondary" onClick={() => void add()}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Add
        </Button>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No opt-outs.</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5">Since</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {list.map((o) => (
                <tr key={o.id}>
                  <td className="px-4 py-3 font-mono text-[var(--color-text-primary)]">{o.phone}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{o.reason}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{time(o.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void remove(o.phone)}
                      aria-label={`Remove ${o.phone}`}
                      title="Remove from opt-out list"
                      className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Scheduled broadcasts ──────────────────────────────────────────────
function ScheduledTab({ onError }: { onError: () => void }) {
  const [list, setList] = useState<ScheduledBroadcast[]>([]);

  const load = useCallback(async () => {
    try {
      setList(await api.listScheduledBroadcasts());
    } catch {
      onError();
    }
  }, [onError]);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  async function cancel(id: string) {
    if (!window.confirm("Cancel this scheduled broadcast? It won't be sent.")) return;
    try {
      await api.cancelScheduledBroadcast(id);
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  const statusStyle = (s: ScheduledBroadcast["status"]) =>
    s === "sent"
      ? { color: "var(--color-success)", bg: "color-mix(in srgb, var(--color-success) 16%, transparent)" }
      : s === "cancelled"
        ? { color: "var(--color-text-muted)", bg: "var(--color-bg-surface)" }
        : { color: "var(--color-warning)", bg: "color-mix(in srgb, var(--color-warning) 16%, transparent)" };

  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-3 flex items-center gap-1.5 text-sm text-[var(--color-text-muted)]">
        <CalendarClock className="h-4 w-4" strokeWidth={1.75} aria-hidden />
        Broadcasts scheduled from the Customers screen. They run automatically at the set time, consent-gated like any
        broadcast.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No scheduled broadcasts.</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5">Message</th>
                <th className="px-4 py-2.5 text-right">Recipients</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">By</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {list.map((b) => {
                const st = statusStyle(b.status);
                return (
                  <tr key={b.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--color-text-secondary)]">
                      {new Date(b.scheduledFor).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <span className="block truncate text-[var(--color-text-primary)]">{b.body}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[var(--color-text-secondary)]">
                      {b.result ? `${b.result.sent}/${b.recipients.length}` : b.recipients.length}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize"
                        style={{ color: st.color, backgroundColor: st.bg }}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{b.createdByName || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {b.status === "pending" && (
                        <button
                          onClick={() => void cancel(b.id)}
                          aria-label="Cancel scheduled broadcast"
                          title="Cancel"
                          className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
                        >
                          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Consent (A2P 10DLC / TCPA opt-in capture) ─────────────────────────
const CHANNELS: { value: ConsentChannel; label: string }[] = [
  { value: "verbal", label: "Verbal (at counter / phone)" },
  { value: "web", label: "Website form" },
  { value: "import", label: "Imported / existing" },
];

function ConsentTab({ onError }: { onError: () => void }) {
  const [disclosure, setDisclosure] = useState("");
  const [list, setList] = useState<Consent[]>([]);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<ConsentChannel>("verbal");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([api.consentDisclosure(), api.listConsents()]);
      setDisclosure(d);
      setList(l);
    } catch {
      onError();
    }
  }, [onError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function record() {
    if (!phone.trim() || !confirmed) return;
    setSaving(true);
    try {
      await api.recordConsent({ phone: phone.trim(), customerName: name.trim(), channel, note: note.trim() });
      setPhone("");
      setName("");
      setNote("");
      setConfirmed(false);
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function revoke(p: string) {
    if (!window.confirm(`Revoke consent for ${p}? They'll be opted out of all texts.`)) return;
    try {
      await api.revokeConsent(p);
      await load();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  }

  function copyScript() {
    void navigator.clipboard?.writeText(disclosure).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div className="h-full overflow-auto p-4">
      {/* The script staff must read */}
      <div className="mb-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-primary)]">
            <ClipboardCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            Read this to the customer, word-for-word
          </h3>
          <button
            onClick={copyScript}
            className="inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-xs font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
          >
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          &ldquo;{disclosure}&rdquo;
        </p>
      </div>

      {/* Capture form */}
      <div className="mb-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Record consent</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Phone *</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(510) 555-0123" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Customer name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">How collected</span>
            <select value={channel} onChange={(e) => setChannel(e.target.value as ConsentChannel)} className={inputCls}>
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">Note</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className={inputCls} />
          </label>
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--color-action)]" />
          I read the disclosure above to the customer and they agreed to receive texts.
        </label>
        <div className="mt-3 flex justify-end">
          <Button size="sm" onClick={() => void record()} disabled={saving || !phone.trim() || !confirmed}>
            <ShieldCheck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {saving ? "Saving…" : "Record consent"}
          </Button>
        </div>
      </div>

      {/* Audit table */}
      <h3 className="mb-2 text-sm font-semibold text-[var(--color-text-primary)]">Consent records ({list.length})</h3>
      {list.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No consent recorded yet.</p>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-2.5">Phone</th>
                <th className="px-4 py-2.5">Customer</th>
                <th className="px-4 py-2.5">Channel</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Collected by</th>
                <th className="px-4 py-2.5">When</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-mono text-[var(--color-text-primary)]">{c.phone}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{c.customerName || "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)] capitalize">{c.channel}</td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                      style={
                        c.status === "opted_in"
                          ? { color: "var(--color-success)", backgroundColor: "color-mix(in srgb, var(--color-success) 16%, transparent)" }
                          : { color: "var(--color-danger)", backgroundColor: "color-mix(in srgb, var(--color-danger) 16%, transparent)" }
                      }
                    >
                      {c.status === "opted_in" ? "Opted in" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text-secondary)]">{c.collectedByName || "—"}</td>
                  <td className="px-4 py-3 text-[var(--color-text-muted)]">{time(c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {c.status === "opted_in" && (
                      <button
                        onClick={() => void revoke(c.phone)}
                        aria-label={`Revoke consent for ${c.phone}`}
                        title="Revoke consent"
                        className="grid h-7 w-7 place-items-center rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const inputCls =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-2.5 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)]";
