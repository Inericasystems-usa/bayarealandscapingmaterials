import { describe, it, expect } from "vitest";
import {
  round2,
  computeLineTotal,
  computeSubtotal,
  computeTax,
  computeOrderTotals,
  resolveDeliveryFee,
  tierPrice,
  fullLoadLineTotal,
  computeChange,
  tenderSuggestions,
  lineSubtotalCents,
  orderTotalCents,
  type CustomerType,
} from "./index.js";

describe("round2", () => {
  it("kills float drift", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(10.975)).toBe(10.98);
    expect(round2(1.005)).toBe(1.01);
  });
  it("handles whole + negative", () => {
    expect(round2(5)).toBe(5);
    expect(round2(-2.346)).toBe(-2.35);
    expect(round2(0)).toBe(0);
  });
});

describe("computeLineTotal", () => {
  it("multiplies qty × unitPrice", () => {
    expect(computeLineTotal({ qty: 3, unitPrice: 12.5 })).toBe(37.5);
    expect(computeLineTotal({ qty: 2.5, unitPrice: 4 })).toBe(10);
  });
  it("honors an explicit lineTotal (handling fees)", () => {
    expect(computeLineTotal({ qty: 1, unitPrice: 10, lineTotal: 13.37 })).toBe(13.37);
    expect(computeLineTotal({ qty: 5, unitPrice: 10, lineTotal: 0 })).toBe(0);
  });
});

describe("computeSubtotal", () => {
  it("sums + rounds line totals", () => {
    expect(computeSubtotal([{ qty: 1, unitPrice: 10.1 }, { qty: 1, unitPrice: 20.2 }])).toBe(30.3);
    expect(computeSubtotal([])).toBe(0);
  });
});

describe("computeTax", () => {
  it("applies a fractional rate, rounded to cents", () => {
    expect(computeTax(100, 0.0975)).toBe(9.75);
    expect(computeTax(10, 0.0975)).toBe(0.98);
    expect(computeTax(0, 0.0975)).toBe(0);
  });
});

describe("computeOrderTotals", () => {
  it("computes subtotal, tax, total (the POS money path)", () => {
    const t = computeOrderTotals({ lines: [{ qty: 1, unitPrice: 10 }], taxRate: 0.0975 });
    expect(t).toEqual({ subtotal: 10, tax: 0.98, deliveryFee: 0, discount: 0, total: 10.98 });
  });
  it("discount reduces the taxable base; delivery is added after tax", () => {
    const t = computeOrderTotals({
      lines: [{ qty: 2, unitPrice: 50 }],
      taxRate: 0.1,
      discount: 20,
      deliveryFee: 15,
    });
    // taxable = 100 - 20 = 80; tax = 8; total = 80 + 8 + 15 = 103
    expect(t.subtotal).toBe(100);
    expect(t.tax).toBe(8);
    expect(t.deliveryFee).toBe(15);
    expect(t.total).toBe(103);
  });
  it("never taxes below zero", () => {
    const t = computeOrderTotals({ lines: [{ qty: 1, unitPrice: 10 }], taxRate: 0.1, discount: 50 });
    expect(t.tax).toBe(0);
    expect(t.total).toBe(0);
  });
});

describe("computeChange", () => {
  it("returns cash back, rounded to cents", () => {
    expect(computeChange(10.98, 20)).toBe(9.02);
    expect(computeChange(10.98, 10.98)).toBe(0);
    expect(computeChange(7.5, 100)).toBe(92.5);
  });
  it("never goes negative on under-payment", () => {
    expect(computeChange(50, 20)).toBe(0);
    expect(computeChange(50, 0)).toBe(0);
  });
  it("kills float drift (e.g. 20 - 19.99)", () => {
    expect(computeChange(19.99, 20)).toBe(0.01);
  });
});

describe("tenderSuggestions", () => {
  it("suggests the next $1/$5/$10/$20 above the total", () => {
    expect(tenderSuggestions(23.4)).toEqual([24, 25, 30]);
  });
  it("de-duplicates and stays strictly above the total", () => {
    // 42.1 → ceil 43, next5 45, next10 50, next20 60 → first 3
    expect(tenderSuggestions(42.1)).toEqual([43, 45, 50]);
  });
  it("is empty for a round total (every step equals the total, none above)", () => {
    // 20 → ceil 20, next5 20, next10 20, next20 20; none strictly > 20
    expect(tenderSuggestions(20)).toEqual([]);
  });
  it("honors the count cap", () => {
    expect(tenderSuggestions(23.4, 2)).toEqual([24, 25]);
  });
});

describe("resolveDeliveryFee", () => {
  const tiers = [
    { label: "near", maxMiles: 25, fee: 65 },
    { label: "far", maxMiles: 52, fee: 95 },
  ];
  it("returns the first matching tier fee", () => {
    expect(resolveDeliveryFee(10, tiers)).toBe(65);
    expect(resolveDeliveryFee(25, tiers)).toBe(65);
    expect(resolveDeliveryFee(40, tiers)).toBe(95);
  });
  it("0 miles = free; beyond the last tier = null (custom quote)", () => {
    expect(resolveDeliveryFee(0, tiers)).toBe(0);
    expect(resolveDeliveryFee(100, tiers)).toBeNull();
  });
  it("is order-independent (sorts tiers)", () => {
    expect(resolveDeliveryFee(30, [tiers[1]!, tiers[0]!])).toBe(95);
  });
});

describe("tierPrice", () => {
  it("applies the tier discount fraction", () => {
    const d = { retail: 0, contractor: 0.1, wholesale: 0.2 };
    expect(tierPrice(100, "retail", d)).toBe(100);
    expect(tierPrice(100, "contractor", d)).toBe(90);
    expect(tierPrice(100, "wholesale", d)).toBe(80);
  });
  it("clamps discounts to [0,1]", () => {
    expect(tierPrice(100, "contractor", { retail: 0, contractor: 2, wholesale: 0 })).toBe(0);
    expect(tierPrice(100, "contractor", { retail: 0, contractor: -1, wholesale: 0 })).toBe(100);
  });
  it("falls back to no discount when a tier is missing from the map (defensive)", () => {
    // A malformed discounts map must yield full price, not NaN.
    const partial = { retail: 0, contractor: 0.1 } as Record<CustomerType, number>;
    expect(tierPrice(100, "wholesale", partial)).toBe(100);
  });
});

describe("fullLoadLineTotal", () => {
  it("no discount below the full-load threshold", () => {
    expect(fullLoadLineTotal(5, 10, 10, 0.1)).toBe(50);
  });
  it("applies the per-unit discount at/above the threshold", () => {
    expect(fullLoadLineTotal(10, 10, 10, 0.1)).toBe(90);
    expect(fullLoadLineTotal(12, 10, 10, 0.1)).toBe(108);
  });
  it("defaults to a no-op", () => {
    expect(fullLoadLineTotal(100, 7)).toBe(700);
  });
});

describe("legacy cents helpers", () => {
  it("lineSubtotalCents multiplies + rounds to whole cents", () => {
    expect(lineSubtotalCents(3, 1250)).toBe(3750);
    expect(lineSubtotalCents(2.5, 999)).toBe(2498); // 2497.5 → 2498
  });
  it("orderTotalCents = subtotal − discount + tax + fees", () => {
    expect(orderTotalCents({ subtotalCents: 10000, taxCents: 975, feesCents: 1500, discountCents: 2000 })).toBe(10475);
    expect(orderTotalCents({ subtotalCents: 500, taxCents: 0, feesCents: 0, discountCents: 0 })).toBe(500);
  });
});
