import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { bus } from "../lib/events.js";
import { config, isDev } from "../config.js";
import { safeEqual } from "../lib/crypto.js";
import { redactPan } from "../lib/pan-guard.js";
import { jobs } from "../lib/jobs.js";
import { getAuthUser } from "./users.js";
import { listLeads } from "./leads/store.js";
import {
  sendSms,
  toE164,
  ringCentralMode,
  isRingCentralConfigured,
  fetchOutboundStatuses,
} from "../lib/ringcentral.js";

/**
 * Messaging module — customer SMS via RingCentral (ADR-0004).
 *
 * Three responsibilities:
 *   1. A two-way SMS inbox the manager works from (threads, manual send).
 *   2. Trigger-based auto-texting: domain events (delivery dispatched/delivered,
 *      order placed, stale lead) fire templated texts. RingCentral has no idea
 *      what a "delivery" is — these triggers live here, reacting to our own bus.
 *   3. TCPA compliance: inbound STOP/HELP keywords and an opt-out suppression
 *      list that every auto-send respects.
 */

export type MessageDirection = "out" | "in";
export type TriggerKey =
  | "delivery.dispatched"
  | "delivery.delivered"
  | "order.created"
  | "lead.followup";

export interface Message extends Entity {
  direction: MessageDirection;
  threadKey: string; // normalized E.164 of the customer — groups a conversation
  to: string;
  from: string;
  customerId: string | null;
  customerName: string;
  body: string;
  status: string; // Queued / Sent / Delivered / DeliveryFailed / Received / Failed
  providerId: string | null; // RingCentral message id — correlates status updates
  trigger: TriggerKey | null; // null = manual/inbound
  simulated: boolean;
  read: boolean;
  error: string | null;
}

// Terminal outbound statuses — once here, no more updates expected.
const FINAL_STATUSES = ["Delivered", "DeliveryFailed", "SendingFailed", "Failed"];
const isFailedStatus = (s: string) => /fail/i.test(s);

export interface MessageTemplate extends Entity {
  key: TriggerKey;
  label: string;
  body: string;
  enabled: boolean;
  delayMinutes: number; // only meaningful for lead.followup
}

export interface OptOut extends Entity {
  phone: string; // E.164
  reason: string;
}

export type ConsentChannel = "verbal" | "web" | "sms" | "import";
export interface Consent extends Entity {
  phone: string; // E.164
  customerId: string | null;
  customerName: string;
  channel: ConsentChannel;
  disclosure: string; // exact wording presented/read at opt-in (audit trail)
  status: "opted_in" | "revoked";
  collectedByUserId: string | null;
  collectedByName: string;
  note: string;
  revokedAt: string | null;
}

export const messages = new Collection<Message>("messages");
export const templates = new Collection<MessageTemplate>("message_templates");
export const optOuts = new Collection<OptOut>("message_optouts");
export const consents = new Collection<Consent>("message_consents");

/**
 * Canonical opt-in disclosure. This is the exact wording staff must present
 * (read verbally at the counter, or show on a form) before texting a customer.
 * It is stored on every consent record so we can prove what the customer agreed
 * to — required for A2P 10DLC / TCPA. Edit here to change it everywhere.
 */
export const CONSENT_DISCLOSURE =
  "Do you agree to receive marketing and delivery-notification text messages from " +
  "Bay Area Landscaping Materials LLC? Reply STOP to opt out; reply HELP for support. " +
  "Message & data rates may apply; messaging frequency may vary. See our Privacy Policy " +
  "at www.bayarealandscapingmaterials.com/privacy-policy and Terms of Service at " +
  "www.bayarealandscapingmaterials.com/terms-of-service.";

/** Has this number given (and not revoked) SMS consent? */
async function isConsented(e164: string): Promise<boolean> {
  const c = await consents.findBy((x) => x.phone === e164 && x.status === "opted_in");
  return Boolean(c);
}

/**
 * Record consent captured by the optional checkbox on a public web form
 * (channel "web"), so the auto-send gate in this module honours it like any
 * counter-collected opt-in. Idempotent per number: a repeat submission
 * refreshes the record instead of stacking duplicates.
 *
 * Deliberately one-way in both directions:
 *   - An UNCHECKED box is the absence of consent, not a withdrawal of it, so it
 *     must never revoke a standing opt-in — otherwise a customer who opted in
 *     at the counter would be silently opted out by later submitting a quote
 *     form. Revocation happens via STOP or DELETE /consents/:phone.
 *   - A CHECKED box never clears an existing opt-out (see below).
 *
 * Returns the E.164 number stored, or null if the number was unusable. Callers
 * must not fail the visitor's submission on either outcome.
 */
export async function recordWebSmsConsent(input: {
  phone: string;
  customerName?: string;
  disclosure: string;
  note?: string;
}): Promise<string | null> {
  const e164 = toE164(input.phone);
  if (!e164) return null;

  // Unlike the staff-authenticated POST /consents, this path does NOT clear an
  // existing opt-out. The lead endpoints are public and unauthenticated, so
  // anyone can submit any phone number; treating an unverified checkbox as a
  // reversal of an explicit STOP would let a stranger resurrect a number that
  // opted out. Record the consent for the audit trail and leave the opt-out
  // standing — the auto-send gate checks both, so the number stays suppressed
  // until the owner texts START or a manager clears it.
  const suppressed = Boolean(await optOuts.findBy((o) => o.phone === e164));
  const note = suppressed
    ? `${input.note ?? ""} — NOTE: number has a standing opt-out (STOP); still suppressed.`.trim()
    : (input.note ?? "");

  const fields = {
    phone: e164,
    customerId: null,
    customerName: input.customerName ?? "",
    channel: "web" as const,
    disclosure: input.disclosure,
    status: "opted_in" as const,
    collectedByUserId: null,
    collectedByName: "Website form",
    note,
    revokedAt: null,
  };

  const existing = await consents.findBy((c) => c.phone === e164);
  if (existing) await consents.update(existing.id, fields);
  else await consents.insert({ id: newId("cns"), ...fields });
  return e164;
}

export interface BroadcastRecipientRec {
  phone: string;
  customerId: string | null;
  customerName: string;
}
export interface BroadcastResultRec {
  total: number;
  sent: number;
  noConsent: number;
  optedOut: number;
  invalid: number;
  failed: number;
}
export interface ScheduledBroadcast extends Entity {
  body: string;
  recipients: BroadcastRecipientRec[];
  scheduledFor: string; // ISO
  status: "pending" | "sent" | "cancelled";
  createdByUserId: string | null;
  createdByName: string;
  result: BroadcastResultRec | null;
  sentAt: string | null;
}
export const scheduledBroadcasts = new Collection<ScheduledBroadcast>("scheduled_broadcasts");

/**
 * Execute a broadcast: consent-gated, opt-out-suppressed, de-duped, with STOP
 * language ensured. Shared by the immediate /broadcast route and the scheduled
 * runner so both behave identically.
 */
export async function executeBroadcast(
  rawBody: string,
  recipients: BroadcastRecipientRec[],
  log?: (m: string) => void,
): Promise<BroadcastResultRec> {
  let text = rawBody.trim();
  if (!/\bstop\b/i.test(text)) text += " Reply STOP to opt out.";
  const result: BroadcastResultRec = { total: recipients.length, sent: 0, noConsent: 0, optedOut: 0, invalid: 0, failed: 0 };
  const seen = new Set<string>();
  for (const r of recipients) {
    const e164 = toE164(r.phone);
    if (!e164) {
      result.invalid++;
      continue;
    }
    if (seen.has(e164)) continue;
    seen.add(e164);
    if (await isOptedOut(e164)) {
      result.optedOut++;
      continue;
    }
    if (!(await isConsented(e164))) {
      result.noConsent++;
      continue;
    }
    try {
      const sent = await sendSms(e164, text);
      await messages.insert({
        id: newId("msg"),
        direction: "out",
        threadKey: e164,
        to: e164,
        from: FROM_LABEL(),
        customerId: r.customerId,
        customerName: r.customerName,
        body: text,
        status: sent.status,
        providerId: sent.id,
        trigger: null,
        simulated: sent.simulated,
        read: true,
        error: null,
      });
      result.sent++;
    } catch (err) {
      result.failed++;
      log?.(`messaging: broadcast send failed → ${e164}: ${(err as Error).message}`);
    }
  }
  return result;
}

/** Run any scheduled broadcasts whose time has arrived. */
export async function runDueScheduledBroadcasts(log?: (m: string) => void): Promise<void> {
  const now = Date.now();
  const due = await scheduledBroadcasts.filter(
    (b) => b.status === "pending" && new Date(b.scheduledFor).getTime() <= now,
  );
  for (const b of due) {
    log?.(`messaging: executing scheduled broadcast ${b.id} → ${b.recipients.length} recipient(s)`);
    const result = await executeBroadcast(b.body, b.recipients, log);
    await scheduledBroadcasts.update(b.id, { status: "sent", result, sentAt: new Date().toISOString() });
  }
}

const FROM_LABEL = () => config.RC_SMS_FROM ?? "simulated";

const DEFAULT_TEMPLATES: Omit<MessageTemplate, keyof Entity>[] = [
  {
    key: "delivery.dispatched",
    label: "Driver left the yard (en route)",
    body: "Hi {{customer}}, your delivery {{code}} from Bay Area Landscaping Materials just left our yard — ETA {{eta}}. Reply STOP to opt out.",
    enabled: true,
    delayMinutes: 0,
  },
  {
    key: "delivery.delivered",
    label: "Delivered confirmation",
    body: "Your order {{code}} has been delivered. Thanks for choosing Bay Area Landscaping Materials! We'd love a review. Reply STOP to opt out.",
    enabled: true,
    delayMinutes: 0,
  },
  {
    key: "order.created",
    label: "Purchase / order receipt",
    body: "Thanks {{customer}}! We received your order {{number}} totaling {{total}}. Questions? Just reply to this text. Reply STOP to opt out.",
    enabled: true,
    delayMinutes: 0,
  },
  {
    key: "lead.followup",
    label: "Visited / quoted but no contact — follow-up",
    body: "Hi {{customer}}, thanks for reaching out to Bay Area Landscaping Materials. Can we help with a quote or any questions about materials or delivery? Reply STOP to opt out.",
    enabled: true,
    delayMinutes: 120,
  },
];

/** Seed default templates once. */
export async function ensureTemplates(): Promise<void> {
  for (const t of DEFAULT_TEMPLATES) {
    const existing = await templates.findBy((x) => x.key === t.key);
    if (!existing) await templates.insert({ id: newId("tpl"), ...t });
  }
}

function render(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? "");
}

async function isOptedOut(e164: string): Promise<boolean> {
  return Boolean(await optOuts.findBy((o) => o.phone === e164));
}

interface FireContext {
  customerId?: string | null;
  customerName?: string;
}

/**
 * Core auto-text path: look up the (enabled) template for a trigger, respect
 * opt-outs, render, send, and log. Never throws — a messaging failure must not
 * break the delivery/order flow that triggered it.
 */
async function fireTrigger(
  key: TriggerKey,
  rawPhone: string,
  vars: Record<string, string>,
  ctx: FireContext = {},
  log?: (msg: string) => void,
): Promise<void> {
  try {
    const tpl = await templates.findBy((t) => t.key === key);
    if (!tpl || !tpl.enabled) return;

    const e164 = toE164(rawPhone);
    if (!e164) {
      log?.(`messaging: skipped ${key} — no usable phone (${rawPhone || "empty"})`);
      return;
    }
    if (await isOptedOut(e164)) {
      log?.(`messaging: skipped ${key} — ${e164} has opted out`);
      return;
    }
    // Automated texts require recorded consent (A2P 10DLC / TCPA). Manual 1:1
    // replies from the inbox are not gated here — only auto-triggers.
    if (!(await isConsented(e164))) {
      log?.(`messaging: skipped ${key} — no SMS consent on file for ${e164}`);
      return;
    }

    const text = render(tpl.body, vars);
    const result = await sendSms(e164, text);
    await messages.insert({
      id: newId("msg"),
      direction: "out",
      threadKey: e164,
      to: e164,
      from: FROM_LABEL(),
      customerId: ctx.customerId ?? null,
      customerName: ctx.customerName ?? vars.customer ?? "",
      body: text,
      status: result.status,
      providerId: result.id,
      trigger: key,
      simulated: result.simulated,
      read: true,
      error: null,
    });
    log?.(`messaging: ${result.simulated ? "[sim] " : ""}sent ${key} → ${e164}`);
  } catch (err) {
    log?.(`messaging: FAILED ${key} → ${rawPhone}: ${(err as Error).message}`);
    // Persist the failure so it shows in the thread, but swallow the error.
    const e164 = toE164(rawPhone);
    if (e164) {
      await messages
        .insert({
          id: newId("msg"),
          direction: "out",
          threadKey: e164,
          to: e164,
          from: FROM_LABEL(),
          customerId: ctx.customerId ?? null,
          customerName: ctx.customerName ?? vars.customer ?? "",
          body: render((await templates.findBy((t) => t.key === key))?.body ?? "", vars),
          status: "Failed",
          providerId: null,
          trigger: key,
          simulated: ringCentralMode() === "simulated",
          read: true,
          error: (err as Error).message,
        })
        .catch(() => undefined);
    }
  }
}

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Wire domain events → auto-texts. Mirrors registerNotificationSubscribers(). */
export function registerMessagingSubscribers(log?: (msg: string) => void): void {
  void ensureTemplates();

  bus.on("delivery.dispatched", (e) => {
    void fireTrigger(
      "delivery.dispatched",
      e.phone,
      { customer: e.customer, code: e.code, eta: e.eta || "shortly" },
      { customerName: e.customer },
      log,
    );
  });

  bus.on("delivery.delivered", (e) => {
    void fireTrigger(
      "delivery.delivered",
      e.phone,
      { customer: e.customer, code: e.code },
      { customerName: e.customer },
      log,
    );
  });

  bus.on("order.created", (e) => {
    void fireTrigger(
      "order.created",
      e.phone,
      { customer: e.customerName, number: e.number, total: money(e.total) },
      { customerId: e.customerId, customerName: e.customerName },
      log,
    );
  });
}

/**
 * Periodic sweep for "visited/quoted but never contacted" leads. A lead older
 * than the template's delay that has no outbound message to its phone yet gets
 * one follow-up text. Idempotent: we check the message log before sending.
 */
export async function runLeadFollowupSweep(log?: (msg: string) => void): Promise<void> {
  const tpl = await templates.findBy((t) => t.key === "lead.followup");
  if (!tpl || !tpl.enabled) return;
  const cutoff = Date.now() - tpl.delayMinutes * 60_000;

  const leads = await listLeads();
  for (const lead of leads) {
    const phoneRaw = String((lead.payload as Record<string, unknown>).phone ?? "");
    const e164 = toE164(phoneRaw);
    if (!e164) continue;
    if (new Date(lead.receivedAt).getTime() > cutoff) continue; // too fresh

    // Already messaged this number? (any direction) → skip; they're "contacted".
    const prior = await messages.findBy((m) => m.threadKey === e164);
    if (prior) continue;
    if (await isOptedOut(e164)) continue;

    const name = String((lead.payload as Record<string, unknown>).name ?? "there");
    await fireTrigger("lead.followup", e164, { customer: name }, { customerName: name }, log);
  }
}

/** Apply an outbound delivery-status update to the matching message (by RC id). */
async function applyOutboundStatus(providerId: string, status: string, log?: (m: string) => void): Promise<void> {
  const m = await messages.findBy((x) => x.providerId === providerId);
  if (!m || m.status === status) return;
  await messages.update(m.id, { status, error: isFailedStatus(status) ? status : m.error });
  log?.(`messaging: delivery status ${providerId} → ${status}`);
}

/**
 * Reconcile outbound delivery status. Live mode polls RingCentral's
 * message-store (the reliable path when webhooks aren't reachable); simulated
 * mode advances Sent/Queued → Delivered after a short delay so the lifecycle is
 * visible without a real carrier.
 */
export async function reconcileOutboundStatuses(log?: (msg: string) => void): Promise<void> {
  if (isRingCentralConfigured()) {
    try {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const byId = new Map((await fetchOutboundStatuses(since)).map((s) => [s.id, s.messageStatus]));
      if (byId.size === 0) return;
      const pending = await messages.filter(
        (m) => m.direction === "out" && m.providerId !== null && !FINAL_STATUSES.includes(m.status),
      );
      for (const m of pending) {
        const st = byId.get(m.providerId as string);
        if (st) await applyOutboundStatus(m.providerId as string, st, log);
      }
    } catch (err) {
      log?.(`messaging: status reconcile failed: ${(err as Error).message}`);
    }
  } else {
    // Simulated: advance pending sims to Delivered after ~8s.
    const cutoff = Date.now() - 8000;
    const pending = await messages.filter(
      (m) =>
        m.direction === "out" &&
        m.simulated &&
        (m.status === "Sent" || m.status === "Queued") &&
        new Date(m.createdAt).getTime() < cutoff,
    );
    for (const m of pending) await messages.update(m.id, { status: "Delivered" });
  }
}

/**
 * Start the lead follow-up sweep (5 min), the delivery-status reconcile and the
 * scheduled broadcasts (20 s). The runner keeps each to one instance, so a
 * second API process never texts a lead or sends a broadcast twice.
 */
export function startMessagingJobs(log?: (msg: string) => void): void {
  jobs.start({ name: "lead-followup", everyMs: 5 * 60_000, run: () => runLeadFollowupSweep(log) });
  jobs.start({ name: "message-status", everyMs: 20_000, run: () => reconcileOutboundStatuses(log) });
  jobs.start({ name: "scheduled-broadcasts", everyMs: 20_000, run: () => runDueScheduledBroadcasts(log) });
}

// ── Auth guards ───────────────────────────────────────────────────────
async function requireAuth(req: Request, res: Response) {
  const me = await getAuthUser(req);
  if (!me) {
    res.status(401).json({ error: { code: "unauthorized", message: "Not signed in." } });
    return null;
  }
  return me;
}
async function requireManager(req: Request, res: Response) {
  const me = await requireAuth(req, res);
  if (!me) return null;
  if (me.role !== "admin" && me.role !== "manager") {
    res.status(403).json({ error: { code: "forbidden", message: "Managers only." } });
    return null;
  }
  return me;
}

// ── Inbound keyword handling (TCPA) ───────────────────────────────────
async function handleInbound(fromRaw: string, text: string, log?: (msg: string) => void): Promise<void> {
  const e164 = toE164(fromRaw);
  if (!e164) return;
  const word = text.trim().toUpperCase();
  const STOP = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
  const START = ["START", "UNSTOP", "YES"];
  const HELP = ["HELP", "INFO"];

  // Store the inbound message in the thread, minus any card number a customer
  // texted (it can't be refused, so it is never kept).
  await messages.insert({
    id: newId("msg"),
    direction: "in",
    threadKey: e164,
    to: FROM_LABEL(),
    from: e164,
    customerId: null,
    customerName: "",
    body: redactPan(text),
    status: "Received",
    providerId: null,
    trigger: null,
    simulated: ringCentralMode() === "simulated",
    read: false,
    error: null,
  });

  if (STOP.includes(word)) {
    const existing = await optOuts.findBy((o) => o.phone === e164);
    if (!existing) await optOuts.insert({ id: newId("opt"), phone: e164, reason: "inbound STOP" });
    // Revoke any standing consent so auto-texts stop immediately.
    const consent = await consents.findBy((c) => c.phone === e164 && c.status === "opted_in");
    if (consent) await consents.update(consent.id, { status: "revoked", revokedAt: new Date().toISOString() });
    await sendAutoReply(e164, "You're unsubscribed and won't receive automated texts. Reply START to opt back in.", log);
  } else if (START.includes(word)) {
    const existing = await optOuts.findBy((o) => o.phone === e164);
    if (existing) await optOuts.remove(existing.id);
    // Replying START is an affirmative opt-in — record/re-instate consent via SMS.
    const consent = await consents.findBy((c) => c.phone === e164);
    if (consent) await consents.update(consent.id, { status: "opted_in", channel: "sms", revokedAt: null });
    else
      await consents.insert({
        id: newId("cns"),
        phone: e164,
        customerId: null,
        customerName: "",
        channel: "sms",
        disclosure: "Customer texted START to opt in.",
        status: "opted_in",
        collectedByUserId: null,
        collectedByName: "Inbound SMS (START)",
        note: "",
        revokedAt: null,
      });
    await sendAutoReply(e164, "You're opted back in to Bay Area Landscaping Materials texts.", log);
  } else if (HELP.includes(word)) {
    await sendAutoReply(e164, "Bay Area Landscaping Materials. Call (510) 555-0100. Reply STOP to opt out.", log);
  }
}

/** Auto-reply bypasses opt-out only for the STOP/START/HELP confirmations themselves. */
async function sendAutoReply(e164: string, text: string, log?: (msg: string) => void): Promise<void> {
  try {
    const result = await sendSms(e164, text);
    await messages.insert({
      id: newId("msg"),
      direction: "out",
      threadKey: e164,
      to: e164,
      from: FROM_LABEL(),
      customerId: null,
      customerName: "",
      body: text,
      status: result.status,
      providerId: result.id,
      trigger: null,
      simulated: result.simulated,
      read: true,
      error: null,
    });
  } catch (err) {
    log?.(`messaging: auto-reply failed → ${e164}: ${(err as Error).message}`);
  }
}

// ── Routes ────────────────────────────────────────────────────────────
const router = Router();

// Status — mode + the sending number (auth required).
router.get("/status", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  return res.json({
    data: {
      mode: ringCentralMode(),
      configured: isRingCentralConfigured(),
      from: config.RC_SMS_FROM ?? null,
    },
  });
});

// Threads — one row per conversation, newest first.
router.get("/threads", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const all = await messages.all();
  const byThread = new Map<string, Message[]>();
  for (const m of all) {
    const arr = byThread.get(m.threadKey) ?? [];
    arr.push(m);
    byThread.set(m.threadKey, arr);
  }
  const opted = new Set((await optOuts.all()).map((o) => o.phone));
  const threads = [...byThread.entries()].map(([phone, msgs]) => {
    msgs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const last = msgs[msgs.length - 1]!;
    const name = msgs.find((m) => m.customerName)?.customerName ?? "";
    const unread = msgs.filter((m) => m.direction === "in" && !m.read).length;
    return {
      phone,
      customerName: name,
      lastBody: last.body,
      lastAt: last.createdAt,
      count: msgs.length,
      unread,
      optedOut: opted.has(phone),
    };
  });
  threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  return res.json({ data: threads });
});

// One thread — full conversation; marks inbound as read.
router.get("/threads/:phone", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const { phone } = req.params as { phone: string };
  const e164 = toE164(phone) ?? phone;
  const msgs = (await messages.filter((m) => m.threadKey === e164)).sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  for (const m of msgs) if (m.direction === "in" && !m.read) await messages.update(m.id, { read: true });
  const optedOut = Boolean(await optOuts.findBy((o) => o.phone === e164));
  const consented = await isConsented(e164);
  return res.json({ data: { phone: e164, optedOut, consented, messages: msgs } });
});

// Manual send.
router.post("/send", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const parsed = z
    .object({ to: z.string().min(7), body: z.string().min(1).max(1000), customerId: z.string().nullable().optional(), customerName: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const e164 = toE164(parsed.data.to);
  if (!e164) return res.status(400).json({ error: { code: "invalid", message: "Unusable phone number." } });
  if (await isOptedOut(e164))
    return res.status(409).json({ error: { code: "opted_out", message: "This number has opted out of texts." } });

  try {
    const result = await sendSms(e164, parsed.data.body);
    const msg = await messages.insert({
      id: newId("msg"),
      direction: "out",
      threadKey: e164,
      to: e164,
      from: FROM_LABEL(),
      customerId: parsed.data.customerId ?? null,
      customerName: parsed.data.customerName ?? "",
      body: parsed.data.body,
      status: result.status,
      providerId: result.id,
      trigger: null,
      simulated: result.simulated,
      read: true,
      error: null,
    });
    return res.status(201).json({ data: msg });
  } catch (err) {
    return res.status(502).json({ error: { code: "send_failed", message: (err as Error).message } });
  }
});

// Broadcast — one-off message to many recipients (promo/announcement).
// Manager-only. Skips opted-out and non-consented numbers (marketing requires
// consent), de-dupes, and ensures STOP language is present.
router.post("/broadcast", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const parsed = z
    .object({
      body: z.string().min(1).max(1000),
      recipients: z
        .array(
          z.object({
            phone: z.string().min(7),
            customerId: z.string().nullable().optional(),
            customerName: z.string().optional(),
          }),
        )
        .min(1)
        .max(1000),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const recipients = parsed.data.recipients.map((r) => ({
    phone: r.phone,
    customerId: r.customerId ?? null,
    customerName: r.customerName ?? "",
  }));
  const result = await executeBroadcast(parsed.data.body, recipients, (m) => req.log.warn(m));
  return res.json({ data: result });
});

// Schedule a broadcast for a future time (manager-only).
router.post("/broadcasts/schedule", async (req, res) => {
  const me = await requireManager(req, res);
  if (!me) return;
  const parsed = z
    .object({
      body: z.string().min(1).max(1000),
      scheduledFor: z.string().datetime(),
      recipients: z
        .array(
          z.object({
            phone: z.string().min(7),
            customerId: z.string().nullable().optional(),
            customerName: z.string().optional(),
          }),
        )
        .min(1)
        .max(1000),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  if (new Date(parsed.data.scheduledFor).getTime() <= Date.now())
    return res.status(400).json({ error: { code: "invalid", message: "scheduledFor must be in the future." } });
  const created = await scheduledBroadcasts.insert({
    id: newId("sbc"),
    body: parsed.data.body,
    recipients: parsed.data.recipients.map((r) => ({
      phone: r.phone,
      customerId: r.customerId ?? null,
      customerName: r.customerName ?? "",
    })),
    scheduledFor: parsed.data.scheduledFor,
    status: "pending",
    createdByUserId: me.id,
    createdByName: me.name,
    result: null,
    sentAt: null,
  });
  return res.status(201).json({ data: created });
});

router.get("/broadcasts/scheduled", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const list = (await scheduledBroadcasts.all()).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  return res.json({ data: list });
});

router.delete("/broadcasts/scheduled/:id", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const { id } = req.params as { id: string };
  const b = await scheduledBroadcasts.find(id);
  if (!b) return res.status(404).json({ error: { code: "not_found", message: "Scheduled broadcast not found" } });
  if (b.status !== "pending")
    return res.status(409).json({ error: { code: "invalid", message: "Only pending broadcasts can be cancelled." } });
  const updated = await scheduledBroadcasts.update(id, { status: "cancelled" });
  return res.json({ data: updated });
});

// Templates (automation rules).
router.get("/templates", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  await ensureTemplates();
  const list = (await templates.all()).sort((a, b) => a.key.localeCompare(b.key));
  return res.json({ data: list });
});

router.patch("/templates/:key", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const { key } = req.params as { key: string };
  const parsed = z
    .object({ body: z.string().min(1).max(1000).optional(), enabled: z.boolean().optional(), delayMinutes: z.number().int().min(0).max(10080).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const tpl = await templates.findBy((t) => t.key === key);
  if (!tpl) return res.status(404).json({ error: { code: "not_found", message: "Template not found" } });
  const updated = await templates.update(tpl.id, parsed.data);
  return res.json({ data: updated });
});

// Opt-out list.
router.get("/optouts", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  return res.json({ data: (await optOuts.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

router.post("/optouts", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const parsed = z.object({ phone: z.string().min(7), reason: z.string().default("manual") }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const e164 = toE164(parsed.data.phone);
  if (!e164) return res.status(400).json({ error: { code: "invalid", message: "Unusable phone number." } });
  const existing = await optOuts.findBy((o) => o.phone === e164);
  if (existing) return res.json({ data: existing });
  const created = await optOuts.insert({ id: newId("opt"), phone: e164, reason: parsed.data.reason });
  return res.status(201).json({ data: created });
});

router.delete("/optouts/:phone", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const { phone } = req.params as { phone: string };
  const e164 = toE164(phone) ?? phone;
  const existing = await optOuts.findBy((o) => o.phone === e164);
  if (!existing) return res.status(404).json({ error: { code: "not_found", message: "Not opted out" } });
  await optOuts.remove(existing.id);
  return res.json({ data: { phone: e164, deleted: true } });
});

// ── Consent (A2P 10DLC / TCPA opt-in records) ──────────────────────
// The canonical disclosure staff must present before texting a customer.
router.get("/consent/disclosure", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  return res.json({ data: { text: CONSENT_DISCLOSURE } });
});

router.get("/consents", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  return res.json({ data: (await consents.all()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
});

router.get("/consents/:phone", async (req, res) => {
  if (!(await requireAuth(req, res))) return;
  const { phone } = req.params as { phone: string };
  const e164 = toE164(phone) ?? phone;
  const c = await consents.findBy((x) => x.phone === e164);
  return res.json({ data: c ?? null });
});

// Record consent. Any authenticated staffer can capture it (cashiers do this
// at the counter); the collector is stamped from the session for the audit
// trail. Recording consent clears any prior opt-out for that number.
router.post("/consents", async (req, res) => {
  const me = await requireAuth(req, res);
  if (!me) return;
  const parsed = z
    .object({
      phone: z.string().min(7),
      customerId: z.string().nullable().optional(),
      customerName: z.string().optional(),
      channel: z.enum(["verbal", "web", "sms", "import"]).default("verbal"),
      note: z.string().optional(),
      disclosure: z.string().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const e164 = toE164(parsed.data.phone);
  if (!e164) return res.status(400).json({ error: { code: "invalid", message: "Unusable phone number." } });

  // Recording fresh consent overrides a previous opt-out.
  const opt = await optOuts.findBy((o) => o.phone === e164);
  if (opt) await optOuts.remove(opt.id);

  const fields = {
    phone: e164,
    customerId: parsed.data.customerId ?? null,
    customerName: parsed.data.customerName ?? "",
    channel: parsed.data.channel,
    disclosure: parsed.data.disclosure || CONSENT_DISCLOSURE,
    status: "opted_in" as const,
    collectedByUserId: me.id,
    collectedByName: me.name,
    note: parsed.data.note ?? "",
    revokedAt: null,
  };
  const existing = await consents.findBy((c) => c.phone === e164);
  const saved = existing
    ? await consents.update(existing.id, fields)
    : await consents.insert({ id: newId("cns"), ...fields });
  return res.status(201).json({ data: saved });
});

// Revoke consent (manager). Also adds an opt-out so nothing else goes out.
router.delete("/consents/:phone", async (req, res) => {
  if (!(await requireManager(req, res))) return;
  const { phone } = req.params as { phone: string };
  const e164 = toE164(phone) ?? phone;
  const c = await consents.findBy((x) => x.phone === e164);
  if (!c) return res.status(404).json({ error: { code: "not_found", message: "No consent on file" } });
  await consents.update(c.id, { status: "revoked", revokedAt: new Date().toISOString() });
  const opt = await optOuts.findBy((o) => o.phone === e164);
  if (!opt) await optOuts.insert({ id: newId("opt"), phone: e164, reason: "consent revoked" });
  return res.json({ data: { phone: e164, revoked: true } });
});

/**
 * Whether a webhook call carries our verification token. RingCentral sends the
 * verificationToken we subscribed with (lib/ringcentral.ts) in a
 * Verification-Token header, never in the URL. With no token configured only
 * development accepts calls; anywhere else they are refused.
 */
export function webhookAuthorized(got: unknown, expected: string | undefined, allowUnsigned: boolean): boolean {
  if (!expected) return allowUnsigned;
  return typeof got === "string" && safeEqual(got, expected);
}

// Inbound webhook (RingCentral → us). No bearer auth (external caller);
// verified by the RC validation-token handshake + the verification token.
router.post("/webhook", async (req, res) => {
  // RC subscription handshake: echo the Validation-Token header back.
  const validation = req.headers["validation-token"];
  if (typeof validation === "string") {
    res.set("Validation-Token", validation);
    return res.status(200).end();
  }
  if (!webhookAuthorized(req.headers["verification-token"], config.RC_WEBHOOK_TOKEN, isDev))
    return res.status(401).json({ error: { code: "unauthorized", message: "Bad webhook token" } });
  const body = req.body as
    | { body?: { id?: number | string; direction?: string; from?: { phoneNumber?: string }; subject?: string; type?: string; messageStatus?: string } }
    | undefined;
  const evt = body?.body;
  if (evt && evt.type === "SMS") {
    if (evt.direction === "Inbound" && evt.from?.phoneNumber) {
      await handleInbound(evt.from.phoneNumber, evt.subject ?? "", (m) => req.log.info(m));
    } else if (evt.direction === "Outbound" && evt.id != null) {
      // Delivery receipt for one of our sent texts.
      await applyOutboundStatus(String(evt.id), evt.messageStatus ?? "Sent", (m) => req.log.info(m));
    }
  }
  return res.status(200).json({ ok: true });
});

export default router;
