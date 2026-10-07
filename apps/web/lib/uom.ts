/**
 * Unit-of-measure options for selling stock at the register.
 *
 * Open / unbagged bulk material is tracked in cubic yards but bought in many
 * shapes — by the quarter/half yard scoop, the yard, or a custom amount.
 *
 * Pricing rule for bulk material (per the yard's pricing):
 *   - sub-yard scoops carry a flat $7 handling fee:
 *       ¼ yard = yardPrice/4 + 7      ½ yard = yardPrice/2 + 7
 *   - whole yards are straight multiples (1 yd = yardPrice, 5 yd = 5·yardPrice)
 *   - custom amounts < 1 yd get the +$7 fee; ≥ 1 yd do not.
 *
 * Each option maps to a base-unit quantity (`baseQty`, cubic yards) so a sale
 * can decrement inventory correctly, plus the computed line `price`.
 */

export interface UomOption {
  label: string;
  baseQty: number; // quantity in the inventory base unit
  unitPrice: number; // per-yard (base unit) price
  price: number; // total charged for this option (incl. handling fee if sub-yard)
  custom?: boolean;
}

const HANDLING_FEE = 7; // flat fee on sub-yard bulk scoops

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pull the first numeric value out of a price string like "$69.90 per cubic yard". */
export function priceNumber(s: string | undefined): number {
  if (!s) return 0;
  const m = s.replace(/,/g, "").match(/([\d]+(?:\.[\d]+)?)/);
  return m && m[1] ? parseFloat(m[1]) : 0;
}

export function isBulkUnit(unit: string): boolean {
  return /cubic yard|cu\.?\s*yd|yard|ton/i.test(unit);
}

/** Bulk price: yardPrice·qty, plus a flat handling fee for sub-yard scoops. */
export function bulkPrice(unitPrice: number, qty: number): number {
  const base = unitPrice * qty;
  return round2(qty > 0 && qty < 1 ? base + HANDLING_FEE : base);
}

const CY_PRESETS: { label: string; qty: number }[] = [
  { label: "¼ yard", qty: 0.25 },
  { label: "½ yard", qty: 0.5 },
  { label: "1 cu yd", qty: 1 },
  { label: "5 cu yd", qty: 5 },
];

/**
 * Build the UoM options for a product given its inventory unit and price string.
 * Bulk → quarter/half/1/5-yard presets with the fee rule. Bagged/each → packs.
 */
export function uomOptions(unit: string, priceStr: string): UomOption[] {
  const unitPrice = priceNumber(priceStr);
  if (isBulkUnit(unit)) {
    return CY_PRESETS.map((p) => ({
      label: p.label,
      baseQty: p.qty,
      unitPrice,
      price: bulkPrice(unitPrice, p.qty),
    }));
  }
  // Bagged / each — packs of 1, 5, 10, 25 (no handling fee).
  const packs = [1, 5, 10, 25];
  const noun = /bag/i.test(unit) ? "bag" : unit.toLowerCase();
  return packs.map((q) => ({
    label: q === 1 ? `1 ${noun}` : `${q} ${noun}s`,
    baseQty: q,
    unitPrice,
    price: round2(q * unitPrice),
  }));
}

export function customOption(unit: string, priceStr: string, qty: number): UomOption {
  const unitPrice = priceNumber(priceStr);
  const bulk = isBulkUnit(unit);
  const noun = bulk ? "cu yd" : /bag/i.test(unit) ? "bag" : unit.toLowerCase();
  return {
    label: `${qty} ${noun}${qty === 1 ? "" : "s"} (custom)`,
    baseQty: qty,
    unitPrice,
    price: bulk ? bulkPrice(unitPrice, qty) : round2(qty * unitPrice),
    custom: true,
  };
}
