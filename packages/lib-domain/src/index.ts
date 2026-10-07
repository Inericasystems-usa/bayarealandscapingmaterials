/**
 * Pure domain logic — the single, authoritative home for money math.
 *
 * Rules:
 *   - Zero IO. No fetch, no fs, no DB. Pure, deterministic functions.
 *   - Works in DOLLARS (the unit used across the app), always rounded to cents.
 *   - Imported by BOTH the API (authoritative calc before money moves) and the
 *     client (instant feedback). Exhaustively unit-tested (see *.test.ts).
 */

/** Round a dollar amount to whole cents (kills float drift like 0.1+0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface LineInput {
  qty: number;
  unitPrice: number;
  /** Explicit total honoring handling fees; falls back to qty × unitPrice. */
  lineTotal?: number;
}

/** Authoritative per-line total. */
export function computeLineTotal(line: LineInput): number {
  return round2(line.lineTotal ?? line.qty * line.unitPrice);
}

/** Sum of line totals. */
export function computeSubtotal(lines: LineInput[]): number {
  return round2(lines.reduce((s, l) => s + computeLineTotal(l), 0));
}

/** Sales tax on a subtotal at a fractional rate (e.g. 0.0975). */
export function computeTax(subtotal: number, rate: number): number {
  return round2(subtotal * rate);
}

export interface OrderTotalsInput {
  lines: LineInput[];
  taxRate: number;
  deliveryFee?: number;
  discount?: number;
}

export interface OrderTotals {
  subtotal: number;
  tax: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

/** Full order math: subtotal − discount, taxed, plus delivery fee. */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const subtotal = computeSubtotal(input.lines);
  const discount = round2(input.discount ?? 0);
  const deliveryFee = round2(input.deliveryFee ?? 0);
  const taxable = Math.max(0, subtotal - discount);
  const tax = computeTax(taxable, input.taxRate);
  const total = round2(taxable + tax + deliveryFee);
  return { subtotal, tax, deliveryFee, discount, total };
}

/**
 * Cash change due: what to hand back when a customer pays `tendered` for a bill
 * of `total`. Never negative (under-payment yields 0, not a phantom refund).
 */
export function computeChange(total: number, tendered: number): number {
  return round2(Math.max(0, tendered - total));
}

/**
 * Quick "round up" cash tender buttons for a bill: the next whole dollar and the
 * next $5/$10/$20, de-duplicated, strictly above the total, capped at `count`.
 * Empty when the total is already a round amount at every step (rare).
 */
export function tenderSuggestions(total: number, count = 3): number[] {
  const candidates = [Math.ceil(total), Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, Math.ceil(total / 20) * 20];
  return [...new Set(candidates.filter((v) => v > total))].slice(0, count);
}

export interface DeliveryFeeTier {
  label: string;
  maxMiles: number;
  fee: number;
}

/**
 * Delivery fee for a distance, from the configured tiers (settings). Tiers are
 * "up to maxMiles"; the first matching tier (sorted ascending) wins. Beyond the
 * last tier returns null (custom quote required).
 */
export function resolveDeliveryFee(miles: number, tiers: DeliveryFeeTier[]): number | null {
  if (miles <= 0) return 0;
  const sorted = [...tiers].sort((a, b) => a.maxMiles - b.maxMiles);
  for (const t of sorted) if (miles <= t.maxMiles) return round2(t.fee);
  return null;
}

export type CustomerType = "retail" | "contractor" | "wholesale";

/**
 * Resolve a tier price from a base (retail) price. Contractor/wholesale get the
 * configured discount fraction off retail (0 = no discount). Pure + clamped.
 */
export function tierPrice(
  retailPrice: number,
  type: CustomerType,
  discounts: Record<CustomerType, number> = { retail: 0, contractor: 0, wholesale: 0 },
): number {
  const d = Math.min(Math.max(discounts[type] ?? 0, 0), 1);
  return round2(retailPrice * (1 - d));
}

/**
 * Full-load discount: at/above a full-load quantity, apply a per-unit discount.
 * Returns the adjusted line total. Default is a no-op (fullLoadQty = Infinity)
 * until the business defines thresholds in settings.
 */
export function fullLoadLineTotal(
  qty: number,
  unitPrice: number,
  fullLoadQty = Infinity,
  discountFraction = 0,
): number {
  const eligible = qty >= fullLoadQty;
  const effective = eligible ? unitPrice * (1 - Math.min(Math.max(discountFraction, 0), 1)) : unitPrice;
  return round2(qty * effective);
}

// ── Legacy cents helpers (kept for a future relational/cents migration) ──
export function lineSubtotalCents(qty: number, unitPriceCents: number): number {
  return Math.round(qty * unitPriceCents);
}
export function orderTotalCents(input: {
  subtotalCents: number;
  taxCents: number;
  feesCents: number;
  discountCents: number;
}): number {
  return input.subtotalCents - input.discountCents + input.taxCents + input.feesCents;
}

/* ───────────────────────── Identity normalization ───────────────────────── */

/**
 * Identity normalization for Google conversion matching.
 *
 * Google matches a lead back to an ad click by comparing normalized identifiers
 * — client-side (Enhanced Conversions, where the Google tag does the hashing)
 * and server-side (offline conversion import, where WE hash with SHA-256). Both
 * surfaces must normalize IDENTICALLY or the hashes never line up, so this is
 * the single implementation both the website and the API import.
 *
 * Nothing here hashes: the browser must send plain normalized values, and the
 * API hashes them itself (see apps/api/src/lib/hash.ts).
 *
 * NOTE: this is deliberately separate from ringcentral.ts's `toE164`, which is a
 * dialling helper (accepts international numbers, returns null). Matching is
 * US-only and returns undefined for anything it can't normalize with certainty —
 * a wrong guess produces a hash that silently matches nothing.
 */

/** Lowercased, trimmed email. Undefined when blank — never an empty string. */
export const normalizeEmail = (v?: string | null): string | undefined =>
  v ? v.trim().toLowerCase() || undefined : undefined;

/**
 * US phone → E.164 (`+15105551234`). Undefined unless the digits are
 * unambiguously a US number: 10 digits, or 11 starting with the country code.
 */
export const toE164 = (v?: string | null): string | undefined => {
  if (!v) return undefined;
  const d = v.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return undefined;
};

/**
 * Name part, normalized the way Google specifies: trimmed, lowercased, and
 * stripped of everything but letters, spaces, apostrophes and hyphens (so
 * titles, punctuation and digits can't skew the match).
 */
export const normalizeName = (v?: string | null): string | undefined =>
  v ? v.trim().toLowerCase().replace(/[^a-z\s'-]/g, "").trim() || undefined : undefined;

/**
 * Split a single free-text name field into normalized first/last parts. Our
 * forms collect one "Your name" input, but Google's user_data takes them apart.
 * First token is the given name; everything after it is the family name.
 */
export function splitName(full?: string | null): {
  firstName: string | undefined;
  lastName: string | undefined;
} {
  const parts = (full ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: undefined, lastName: undefined };
  return {
    firstName: normalizeName(parts[0]),
    lastName: parts.length > 1 ? normalizeName(parts.slice(1).join(" ")) : undefined,
  };
}
