import type { RequestHandler } from "express";

/**
 * Card numbers (PANs) never enter BALM's systems: card payments go through the
 * terminal, which keeps the card data. Nothing else may store, log or forward
 * one (PCI DSS 3.2.1, 3.3.1, 3.5.1), so requests whose fields hold a card
 * number are rejected, and text we must keep (an inbound SMS) is redacted.
 *
 * A card number here is 13-19 digits, optionally grouped with single spaces or
 * dashes, that passes the Luhn check (the same rule as the website's
 * lib/pan-guard.ts). Phone numbers, dates, ZIP codes and order numbers fail one
 * or the other and pass through unchanged.
 */

const CANDIDATE = /\b(?:\d[ -]?){12,18}\d\b/g;
// A bare run of digits, even glued to letters ("ref_4111..."), for fields that
// should never hold one.
const DIGIT_RUN = /(?<!\d)\d{13,19}(?!\d)/g;

export const PAN_PLACEHOLDER = "[card number removed]";

function luhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

function isPan(candidate: string): boolean {
  const digits = candidate.replace(/[ -]/g, "");
  return digits.length >= 13 && digits.length <= 19 && luhn(digits);
}

/** True when the text holds something that looks like a card number. */
export function containsPan(text: string): boolean {
  for (const m of text.matchAll(CANDIDATE)) if (isPan(m[0])) return true;
  return false;
}

/** Like containsPan, but also finds a card number glued to letters or underscores. */
export function containsPanAnywhere(text: string): boolean {
  if (containsPan(text)) return true;
  for (const m of text.matchAll(DIGIT_RUN)) if (luhn(m[0])) return true;
  return false;
}

/** The text with every card number replaced by PAN_PLACEHOLDER. */
export function redactPan(text: string): string {
  return text.replace(CANDIDATE, (m) => (isPan(m) ? PAN_PLACEHOLDER : m));
}

/** A copy of `value` with card numbers removed from every string inside it. */
export function redactPanDeep<T>(value: T, depth = 0): T {
  if (typeof value === "string") return redactPan(value) as T;
  if (depth > 20 || !value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactPanDeep(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = redactPanDeep(v, depth + 1);
  return out as T;
}

// Fields that hold identifiers, credentials, phone numbers, links or ad-click
// parameters. Long digit runs are normal there (UUIDs, barcodes, IMEIs, click
// IDs) and are not card numbers.
const SKIP_KEY =
  /^(?:ids?|sku|barcode|upc|gtin|ean|imei|cursor|password|pin|signature|phone|to|from|url|href|image|photos|attribution|gclid|gbraid|wbraid|msclkid|fbclid|landing_page|referrer|utm_\w+|\w*token|\w*secret)$/i;
const SKIP_SUFFIX = /(?:Id|Ids|_id|_ids|Phone|Url)$/;
const isLink = (s: string) => /^(?:data:|https?:\/\/)/i.test(s);

/** Paths ("notes", "lines.0.name") of the string fields in `value` that hold a card number. */
export function findPanFields(value: unknown, root = ""): string[] {
  const found: string[] = [];
  // Iterative walk: a deeply nested body can't exhaust the stack.
  const stack: [unknown, string][] = [[value, root]];
  while (stack.length) {
    const [v, path] = stack.pop()!;
    if (typeof v === "string") {
      if (!isLink(v) && containsPan(v)) found.push(path);
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => stack.push([item, path ? `${path}.${i}` : String(i)]));
    } else if (v && typeof v === "object") {
      for (const [k, item] of Object.entries(v)) {
        if (!SKIP_KEY.test(k) && !SKIP_SUFFIX.test(k)) stack.push([item, path ? `${path}.${k}` : k]);
      }
    }
  }
  return found.sort();
}

// Machine-to-machine routes. RingCentral's inbound SMS is redacted on arrival
// instead (a texted card number must not bounce the webhook); the telematics
// push and the catalog sync carry device and product data, not typed text.
const UNGUARDED = ["/api/v1/messaging/webhook", "/api/v1/fleet/telematics"];
const UNGUARDED_PREFIX = ["/api/v1/sync/"];

/**
 * Reject a request whose body or query holds a card number, with the 422
 * field-detail shape the website's forms already display. Mount it after the
 * body parser (globally, and on routes that parse their own large bodies).
 */
export const rejectCardNumbers: RequestHandler = (req, res, next) => {
  const p = req.originalUrl.split("?")[0] ?? "";
  if (UNGUARDED.includes(p) || UNGUARDED_PREFIX.some((x) => p.startsWith(x))) return next();
  const fields = [...findPanFields(req.body), ...findPanFields(req.query, "query")];
  if (!fields.length) return next();
  req.log?.warn({ fields }, "card number rejected");
  res.status(422).json({
    error: {
      code: "card_number",
      message: "Remove the card number. Card numbers are never sent or stored here.",
      details: fields.map((path) => ({ path, message: "Remove the card number from this field." })),
      trace_id: req.id,
    },
  });
};
