import { describe, it, expect } from "vitest";
import { BULK_MATERIALS, findBulkMaterial } from "./bulk-materials";
import { products, CONTACT_FOR_PRICING } from "./products";

/**
 * These drive the calculator's material picker and the `material` slug in
 * /request-quote deep links. They must stay price-free: the site publishes no
 * prices, so a dollar figure leaking back in here would put an invented number
 * in front of a customer AND in what we report to Google Ads.
 */
describe("BULK_MATERIALS", () => {
  it("derives materials from the real catalog", () => {
    expect(BULK_MATERIALS.length).toBeGreaterThan(0);
    for (const m of BULK_MATERIALS) {
      expect(products.some((p) => p.id === m.id)).toBe(true);
    }
  });

  it("carries no price of any kind", () => {
    for (const m of BULK_MATERIALS) {
      expect(Object.keys(m).sort()).toEqual(["category", "id", "name"]);
    }
  });

  it("INCLUDES exactly the products sold by the cubic yard", () => {
    const included = new Set(BULK_MATERIALS.map((m) => m.id));
    const byYard = products.filter((p) => p.soldByCubicYard === true);
    const notByYard = products.filter((p) => p.soldByCubicYard !== true);

    for (const p of byYard) expect(included.has(p.id)).toBe(true);
    // Flagstone, pavers, lumber, turf and tools aren't sold loose by volume —
    // a yardage estimate for them would be meaningless.
    for (const p of notByYard) expect(included.has(p.id)).toBe(false);
    expect(byYard.length).toBeGreaterThan(0);
    expect(notByYard.length).toBeGreaterThan(0);
  });
});

/**
 * Nothing on the site quotes a price. If the catalog ever grows one back, that
 * is a deliberate decision — this test makes it impossible to do by accident.
 *
 * Note this only covers the bundled fallback catalog. /products renders the
 * CONTACT_FOR_PRICING constant directly rather than an item's `price`, so the
 * live API catalog (which the POS edits, and which does hold real prices)
 * cannot publish a figure either.
 */
describe("the catalog", () => {
  it("publishes no prices", () => {
    expect(CONTACT_FOR_PRICING).toBe("Contact for pricing");
    for (const p of products) {
      expect(p.price).toBe(CONTACT_FOR_PRICING);
    }
  });
});

describe("findBulkMaterial", () => {
  it("resolves a known id", () => {
    expect(findBulkMaterial("pea-gravel")?.name).toBe('Pea Gravel 3/8"');
  });
  it("returns undefined for unknown/blank ids rather than guessing", () => {
    expect(findBulkMaterial("no-such-material")).toBeUndefined();
    expect(findBulkMaterial("")).toBeUndefined();
    expect(findBulkMaterial(undefined)).toBeUndefined();
    expect(findBulkMaterial(null)).toBeUndefined();
  });
});
