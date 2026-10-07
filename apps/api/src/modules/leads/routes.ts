import { Router } from "express";
import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  contactLeadSchema,
  quoteLeadSchema,
  SMS_CONSENT_DISCLOSURE,
  type LeadAttribution,
} from "@balm/shared-types";
import { normalizeEmail, toE164 as toMatchE164 } from "@balm/lib-domain";
import {
  appendLead,
  listLeads,
  markConversionsUploaded,
  type LeadAttributionFields,
} from "./store.js";
import {
  buildOfflineConversions,
  toGoogleCsv,
  CONVERSION_NAME,
  CONVERSION_TIMEZONE,
} from "./offline-conversions.js";
import { sha256Hex } from "../../lib/hash.js";
import { requirePermission } from "../../lib/auth.js";
import { config } from "../../config.js";
import { sendSms, toE164 } from "../../lib/ringcentral.js";
import { recordWebSmsConsent } from "../messaging.js";

/**
 * Consent audit block stored on every lead — the boolean as the visitor left it,
 * the number it applies to, and when the choice was captured. Written for both
 * outcomes: proving someone did NOT opt in is as important as proving they did.
 */
interface SmsConsentAudit {
  sms_consent: boolean;
  phone: string;
  recordedAt: string;
  /** Exact wording shown, when consent was given; null when it wasn't. */
  disclosure: string | null;
  source: string;
}

/**
 * Build the audit block and, when consent was given, write it to the
 * message_consents collection that gates every automated text.
 *
 * Best-effort on that write: a store failure is logged but never fails the
 * visitor's submission — dropping a lead is the worse outcome, and the audit
 * block on the lead itself still records exactly what was agreed to.
 */
async function captureSmsConsent(
  log: Request["log"],
  p: { phone: string; name?: string; sms_consent: boolean },
  source: "contact" | "quote",
): Promise<SmsConsentAudit> {
  const audit: SmsConsentAudit = {
    sms_consent: p.sms_consent,
    phone: toE164(p.phone) ?? p.phone,
    recordedAt: new Date().toISOString(),
    disclosure: p.sms_consent ? SMS_CONSENT_DISCLOSURE : null,
    source: `web:${source}`,
  };

  if (!p.sms_consent) return audit;

  try {
    const e164 = await recordWebSmsConsent({
      phone: p.phone,
      customerName: p.name ?? "",
      disclosure: SMS_CONSENT_DISCLOSURE,
      note: `Opted in via website ${source} form`,
    });
    if (!e164) {
      log.warn({ source }, "sms consent given but phone number unusable — not recorded");
    }
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : err, source },
      "failed to record web SMS consent",
    );
  }
  return audit;
}

/**
 * Best-effort SMS alert to the owner on a new website lead, so a lead is never
 * silently missed. Fire-and-forget: a failure (or missing config) never affects
 * the visitor's submission. No-op unless LEAD_NOTIFY_SMS is set; sends live only
 * when RingCentral is also configured (otherwise sendSms simulates).
 */
function notifyOwner(
  log: Request["log"],
  kind: "contact" | "quote",
  p: Record<string, unknown>,
): void {
  const to = config.LEAD_NOTIFY_SMS;
  if (!to) return;
  const name = String(p.name ?? "someone");
  const phone = String(p.phone ?? "no phone");
  const detail =
    kind === "quote"
      ? [p.material, p.quantity, p.city].filter(Boolean).join(", ")
      : String(p.message ?? "");
  const text = `New ${kind} lead — ${name} (${phone})${detail ? `: ${detail}` : ""}`.slice(0, 300);
  void sendSms(to, text).catch((err) => {
    log.error({ err: err instanceof Error ? err.message : err }, "lead SMS notify failed");
  });
}


/**
 * Flatten the posted first-touch attribution and hash the identifiers Google
 * matches on, so a delivered order can later be uploaded back against the click
 * that produced it.
 *
 * Normalization uses the SAME functions the browser used (@balm/lib-domain), or
 * the digests would never line up. Raw email/phone are hashed and discarded here
 * — they are never logged, and the plaintext stays in `payload` exactly as
 * before, nowhere new.
 */
function conversionFields(
  attribution: LeadAttribution | undefined,
  identity: { email?: string; phone?: string },
): LeadAttributionFields {
  const a = attribution ?? {};
  const fields: LeadAttributionFields = {
    gclid: a.gclid,
    gbraid: a.gbraid,
    wbraid: a.wbraid,
    msclkid: a.msclkid,
    fbclid: a.fbclid,
    utm_source: a.utm_source,
    utm_medium: a.utm_medium,
    utm_campaign: a.utm_campaign,
    utm_term: a.utm_term,
    utm_content: a.utm_content,
    landing_page: a.landing_page,
    referrer: a.referrer,
    attributed_at: a.captured_at,
    email_sha256: sha256Hex(normalizeEmail(identity.email)),
    phone_sha256: sha256Hex(toMatchE164(identity.phone)),
  };
  return fields;
}

/**
 * Public website leads — contact form + quote requests.
 *
 * Both endpoints:
 *   - Validate via zod (returns 422 with details if invalid)
 *   - Drop bot submissions (honeypot field "hp" must be empty)
 *   - Persist to .data/leads.ndjson (Phase 2 → Postgres `leads` table)
 *   - Best-effort SMS the owner (LEAD_NOTIFY_SMS) so no lead is missed
 *   - Always return a generic success message (prevents enumeration)
 *
 * Phase 2 will also:
 *   - Open a "lead" row in the admin panel
 *   - Match the phone against existing customers and link
 */
const router = Router();

router.post("/contact", rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const parsed = contactLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: {
        code: "validation_failed",
        message: "Some fields need attention.",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
        trace_id: req.id,
      },
    });
  }

  // Honeypot — pretend success but ignore.
  if (parsed.data.hp) {
    req.log.warn({ ip: req.ip }, "contact form honeypot triggered");
    return res.status(200).json({ ok: true });
  }

  const smsConsent = await captureSmsConsent(req.log, parsed.data, "contact");

  const { attribution, ...lead } = parsed.data;
  const stored = {
    id: randomUUID(),
    type: "contact" as const,
    receivedAt: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    payload: { ...lead, smsConsent },
    ...conversionFields(attribution, { email: lead.email, phone: lead.phone }),
  };

  await appendLead(stored);
  req.log.info(
    {
      leadId: stored.id,
      type: "contact",
      smsConsent: smsConsent.sms_consent,
      hasClickId: Boolean(stored.gclid ?? stored.gbraid ?? stored.wbraid),
    },
    "lead received",
  );
  notifyOwner(req.log, "contact", lead);

  return res.status(201).json({ ok: true, id: stored.id });
});

router.post("/quote", rateLimit({ windowMs: 60_000, max: 10 }), async (req, res) => {
  const parsed = quoteLeadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: {
        code: "validation_failed",
        message: "Some fields need attention.",
        details: parsed.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
        trace_id: req.id,
      },
    });
  }

  if (parsed.data.hp) {
    req.log.warn({ ip: req.ip }, "quote form honeypot triggered");
    return res.status(200).json({ ok: true });
  }

  const smsConsent = await captureSmsConsent(req.log, parsed.data, "quote");

  const { attribution, ...lead } = parsed.data;
  const stored = {
    id: randomUUID(),
    type: "quote" as const,
    receivedAt: new Date().toISOString(),
    ip: req.ip,
    userAgent: req.headers["user-agent"],
    payload: { ...lead, smsConsent },
    ...conversionFields(attribution, { email: lead.email, phone: lead.phone }),
  };

  await appendLead(stored);
  req.log.info(
    {
      leadId: stored.id,
      type: "quote",
      smsConsent: smsConsent.sms_consent,
      hasClickId: Boolean(stored.gclid ?? stored.gbraid ?? stored.wbraid),
    },
    "lead received",
  );
  notifyOwner(req.log, "quote", lead);

  return res.status(201).json({ ok: true, id: stored.id });
});

// Lead list holds prospect PII — requires customers access (contact/quote POST stay public).
router.get("/", async (req, res) => {
  if (!requirePermission(req, res, "customers")) return;
  const leads = await listLeads();
  return res.json({ data: leads.reverse(), meta: { total: leads.length } });
});

/* ── Google Ads offline conversion import ─────────────────────────────
 * Financial data (real invoiced revenue per click) — reports permission.
 *
 * Preview first, then download, then mark uploaded. Building a file never marks
 * anything: the guard flips only when a human confirms Google accepted it.
 */

router.get("/offline-conversions", async (req, res) => {
  if (!requirePermission(req, res, "reports")) return;
  const { from, to } = req.query as Record<string, string | undefined>;
  const rows = await buildOfflineConversions({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  return res.json({
    data: rows,
    meta: {
      total: rows.length,
      conversionName: CONVERSION_NAME,
      timeZone: CONVERSION_TIMEZONE,
      totalValue: rows.reduce((sum, r) => sum + r.value, 0),
    },
  });
});

router.get("/offline-conversions.csv", async (req, res) => {
  if (!requirePermission(req, res, "reports")) return;
  const { from, to } = req.query as Record<string, string | undefined>;
  const rows = await buildOfflineConversions({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const f = from ?? "all";
  const t = to ?? "now";
  res
    .set("content-type", "text/csv; charset=utf-8")
    .set("content-disposition", `attachment; filename="balm-offline-conversions-${f}_${t}.csv"`);
  return res.send(toGoogleCsv(rows));
});

/**
 * Mark leads as uploaded — call ONLY after Google Ads has accepted the file.
 * Leads already marked keep their original timestamp, so a double-click here
 * cannot cause a conversion to be counted twice.
 */
router.post("/offline-conversions/mark-uploaded", async (req, res) => {
  if (!requirePermission(req, res, "reports")) return;
  const parsed = z
    .object({ leadIds: z.array(z.string().min(1)).min(1).max(5000) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(422).json({
      error: { code: "validation_failed", message: "leadIds is required.", trace_id: req.id },
    });
  }
  const at = new Date().toISOString();
  const marked = await markConversionsUploaded(parsed.data.leadIds, at);
  req.log.info({ requested: parsed.data.leadIds.length, marked: marked.length }, "offline conversions marked uploaded");
  return res.json({ data: { marked: marked.length, skipped: parsed.data.leadIds.length - marked.length, at } });
});

export default router;
