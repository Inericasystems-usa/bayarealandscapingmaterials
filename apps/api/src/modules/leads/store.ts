import { Collection, type Entity } from "../../lib/store.js";

/**
 * Website leads (contact + quote). Backed by the shared store, so they persist
 * to MongoDB like every other collection.
 */

/**
 * First-touch attribution + Google conversion-matching fields.
 *
 * Top-level (not inside `payload`) so the offline-conversion export can index
 * and query them. Every field is optional: leads predating this, and leads from
 * visitors with no click id, simply carry none of it.
 */
export interface LeadAttributionFields {
  gclid?: string;
  gbraid?: string;
  wbraid?: string;
  msclkid?: string;
  fbclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  landing_page?: string;
  referrer?: string;
  /** When the visitor's first touch was captured (client clock, ISO). */
  attributed_at?: string;
  /** SHA-256 of the normalized email — lowercase hex, 64 chars. */
  email_sha256?: string;
  /** SHA-256 of the E.164 phone — lowercase hex, 64 chars. */
  phone_sha256?: string;
  /**
   * The REAL invoiced total, excluding tax, of the order this lead produced.
   * Written when that order actually reaches a fulfilled status — never the
   * quoted value. Absent means the lead has not turned into revenue yet, and
   * the offline export skips it.
   */
  invoiced_value?: number;
  /** When the order was invoiced/delivered — the conversion's timestamp. */
  invoiced_at?: string;
  /** Which order produced it, so a number in Ads can be traced back. */
  invoiced_order_id?: string;
  /** Order number, for the admin list. */
  invoiced_order_number?: string;
  /**
   * Set once the lead's conversion has actually been uploaded to Google Ads.
   * The idempotency guard: a lead carrying this is never exported again.
   */
  conversion_uploaded_at?: string;
}

export interface StoredLead extends Entity, LeadAttributionFields {
  type: "contact" | "quote";
  receivedAt: string;
  ip?: string;
  userAgent?: string;
  payload: Record<string, unknown>;
}

export const leads = new Collection<StoredLead>("leads");

export interface LeadInput extends LeadAttributionFields {
  id: string;
  type: "contact" | "quote";
  receivedAt: string;
  ip?: string;
  userAgent?: string;
  payload: Record<string, unknown>;
}

/** Drop undefined keys so absent attribution stays absent, not stored as null. */
function defined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export async function appendLead(lead: LeadInput): Promise<void> {
  const { id, type, receivedAt, ip, userAgent, payload, ...attribution } = lead;
  await leads.insert({
    id,
    type,
    receivedAt,
    ...(ip ? { ip } : {}),
    ...(userAgent ? { userAgent } : {}),
    payload,
    ...defined(attribution),
  });
}

/** Every lead, oldest first; `receivedBefore` keeps those received up to then. */
export async function listLeads(opts: { receivedBefore?: string } = {}): Promise<StoredLead[]> {
  return leads.where(opts.receivedBefore ? { receivedAt: { $lte: opts.receivedBefore } } : {});
}

/**
 * Record the real invoiced revenue a lead produced.
 *
 * Write-once: the FIRST fulfilled order wins, so re-running the hook (an order
 * edited, re-delivered, or patched twice) can never inflate a conversion or
 * overwrite the value that was already uploaded. Returns true only when the
 * lead was actually updated.
 */
export async function recordInvoicedValue(
  leadId: string,
  p: { value: number; at: string; orderId: string; orderNumber: string },
): Promise<boolean> {
  const lead = await leads.find(leadId);
  if (!lead || lead.invoiced_value !== undefined || lead.conversion_uploaded_at) return false;
  await leads.update(leadId, {
    invoiced_value: p.value,
    invoiced_at: p.at,
    invoiced_order_id: p.orderId,
    invoiced_order_number: p.orderNumber,
  });
  return true;
}

/**
 * Mark leads as uploaded to Google Ads. Idempotent by design: a lead that
 * already carries `conversion_uploaded_at` keeps its original timestamp, so a
 * repeated call can never cause a second upload to look permissible.
 */
export async function markConversionsUploaded(ids: string[], at: string): Promise<string[]> {
  const marked: string[] = [];
  for (const id of ids) {
    const lead = await leads.find(id);
    if (!lead || lead.conversion_uploaded_at) continue;
    await leads.update(id, { conversion_uploaded_at: at });
    marked.push(id);
  }
  return marked;
}
