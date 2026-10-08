import { normalizeEmail, toE164, round2 } from "@balm/lib-domain";
import { sha256Hex } from "../../lib/hash.js";
import type { Order } from "../orders.js";
import { customers, decryptCustomer } from "../customers.js";
import { leads, recordInvoicedValue, type StoredLead } from "./store.js";

/**
 * Google Ads offline conversion import — the revenue half of the loop:
 *   ad click → lead (click id stored) → order → DELIVERED → real revenue → Ads.
 *
 * Two separate halves, deliberately:
 *
 *   1. `linkOrderRevenueToLead` runs when an order ACTUALLY reaches a fulfilled
 *      status (see modules/orders.ts). It finds the lead that produced the order
 *      and stamps the real invoiced value onto it, once.
 *   2. `buildOfflineConversions` is then a plain query — leads that have revenue
 *      and have not been uploaded. No matching, no recomputation, so the file
 *      you download is exactly what step 1 recorded.
 *
 * Value is the invoiced total EXCLUDING tax. Never a quoted value; never tax,
 * which is not the business's revenue.
 *
 * Idempotency has two locks: `invoiced_value` is write-once, and
 * `conversion_uploaded_at` excludes anything already sent. Generating a CSV sets
 * neither — that would mark work as done before anyone uploaded the file.
 */

export const CONVERSION_NAME = "Qualified Delivery (offline)";
export const CONVERSION_CURRENCY = "USD" as const;
export const CONVERSION_TIMEZONE = "America/Los_Angeles";

/** Order statuses that mean the customer actually received the material. */
const FULFILLED: Order["status"][] = ["delivered", "complete"];

export function isFulfilled(status: Order["status"]): boolean {
  return FULFILLED.includes(status);
}

/** Revenue for Google: the invoiced total with tax removed. */
export function conversionValue(order: Order): number {
  return round2(order.total - order.tax);
}

/**
 * Format an instant as Google's conversion time in the yard's timezone:
 * `2026-09-11 14:32:05-07:00`. The offset is emitted explicitly so the row is
 * unambiguous however the file's TimeZone parameter is read, and DST comes from
 * the runtime's tz database rather than a hardcoded offset.
 */
export function formatConversionTime(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CONVERSION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date(iso))
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});

  // "GMT-07:00" → "-07:00"; a bare "GMT" (never expected for LA) → "+00:00".
  const offset = (parts.timeZoneName ?? "").replace("GMT", "") || "+00:00";
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

/** The click id to report, in Google's order of precedence. */
export function clickIdOf(
  lead: StoredLead,
): { clickId: string; clickIdType: "gclid" | "gbraid" | "wbraid" } | null {
  if (lead.gclid) return { clickIdType: "gclid", clickId: lead.gclid };
  if (lead.gbraid) return { clickIdType: "gbraid", clickId: lead.gbraid };
  if (lead.wbraid) return { clickIdType: "wbraid", clickId: lead.wbraid };
  return null;
}

/* ── Step 1: order becomes revenue → stamp the lead ───────────────────── */

/**
 * Attach an order's real invoiced value to the lead that produced it.
 *
 * There is no explicit lead→order foreign key in this system, so the lead is
 * found by the SHA-256 of the customer's normalized phone (falling back to
 * email) — the same digest stored on the lead at capture time. Only leads that
 * carry a Google click id are considered; anything else has nothing to upload.
 *
 * Best-effort and never throws: this runs alongside an order write, and failing
 * to record an analytics value must never fail a delivery.
 */
export async function linkOrderRevenueToLead(order: Order): Promise<string | null> {
  try {
    if (order.type === "quote" || !isFulfilled(order.status) || !order.customerId) return null;

    const value = conversionValue(order);
    if (!Number.isFinite(value) || value <= 0) return null;

    const customer = decryptCustomer(await customers.find(order.customerId));
    if (!customer) return null;

    const phoneDigest = sha256Hex(toE164(customer.phone));
    const emailDigest = sha256Hex(normalizeEmail(customer.email));
    if (!phoneDigest && !emailDigest) return null;

    // Earliest matching lead that still has a click id and no revenue yet —
    // the first touch is the one that earned the conversion.
    const contact = [
      ...(phoneDigest ? [{ phone_sha256: phoneDigest }] : []),
      ...(emailDigest ? [{ email_sha256: emailDigest }] : []),
    ];
    const candidates = (
      await leads.where(
        {
          $or: contact,
          invoiced_value: { $exists: false },
          conversion_uploaded_at: { $in: [null, ""] },
          createdAt: { $lte: order.createdAt },
        },
        { sort: { createdAt: 1, id: 1 } },
      )
    ).filter((l) => clickIdOf(l) !== null);

    const lead = candidates[0];
    if (!lead) return null;

    const recorded = await recordInvoicedValue(lead.id, {
      value,
      at: order.updatedAt || order.createdAt,
      orderId: order.id,
      orderNumber: order.number,
    });
    return recorded ? lead.id : null;
  } catch {
    // Never let analytics bookkeeping break an order write.
    return null;
  }
}

/* ── Step 2: export what has revenue and hasn't been uploaded ─────────── */

export interface OfflineConversionRow {
  leadId: string;
  clickIdType: "gclid" | "gbraid" | "wbraid";
  clickId: string;
  orderNumber: string;
  /** Local Los Angeles time with an explicit UTC offset — never UTC. */
  conversionTime: string;
  value: number;
  currency: typeof CONVERSION_CURRENCY;
}

export interface BuildOptions {
  /** Inclusive YYYY-MM-DD bounds on the invoice date. */
  from?: string;
  to?: string;
}

/**
 * Rows ready to upload: `invoiced_value IS NOT NULL AND conversion_uploaded_at
 * IS NULL`, plus a click id to attribute them to. Deterministic — same data in,
 * same rows out, ordered by conversion time then lead id.
 */
export async function buildOfflineConversions(
  opts: BuildOptions = {},
): Promise<OfflineConversionRow[]> {
  const from = opts.from ?? "0000-00-00";
  const to = `${opts.to ?? "9999-12-31"}T23:59:59.999Z`;

  // Revenue and not yet uploaded, in the database; the date window stays here
  // because it falls back from invoiced_at to createdAt per lead.
  return (await leads.where({ invoiced_value: { $exists: true }, conversion_uploaded_at: { $in: [null, ""] } }))
    .filter((l) => {
      const at = l.invoiced_at ?? l.createdAt;
      return at >= from && at <= to;
    })
    .flatMap((lead) => {
      const click = clickIdOf(lead);
      const value = lead.invoiced_value;
      if (!click || value === undefined || value <= 0) return [];
      return [
        {
          leadId: lead.id,
          ...click,
          orderNumber: lead.invoiced_order_number ?? "",
          conversionTime: formatConversionTime(lead.invoiced_at ?? lead.createdAt),
          value,
          currency: CONVERSION_CURRENCY,
        },
      ];
    })
    .sort(
      (a, b) =>
        a.conversionTime.localeCompare(b.conversionTime) || a.leadId.localeCompare(b.leadId),
    );
}

const cell = (v: unknown): string => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * Render rows in the schema Google Ads' "Conversions from clicks" importer
 * expects. The leading Parameters line declares the default timezone; each
 * timestamp also carries its own offset, so the two cannot disagree.
 */
export function toGoogleCsv(rows: OfflineConversionRow[]): string {
  const lines = [
    `Parameters:TimeZone=${CONVERSION_TIMEZONE}`,
    "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency",
    ...rows.map((r) =>
      [
        cell(r.clickId),
        cell(CONVERSION_NAME),
        cell(r.conversionTime),
        r.value.toFixed(2),
        r.currency,
      ].join(","),
    ),
  ];
  return lines.join("\n") + "\n";
}
