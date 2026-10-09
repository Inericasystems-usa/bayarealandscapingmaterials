import { describe, it, expect } from "vitest";
import { BULK_MATERIALS, findBulkMaterial } from "./bulk-materials";
import { PRODUCTS, categoryOf } from "./catalog";

/**
 * These drive the calculator's material picker and the `material` slug in
 * /request-quote deep links. They must stay price-free: the site publishes no
 * prices, so a dollar figure here would put a number in front of a customer
 * AND in what we report to Google Ads.
 */
describe("BULK_MATERIALS", () => {
  it("is exactly the catalog's products sold by the cubic yard", () => {
    const byYard = PRODUCTS.filter((p) => p.soldByCubicYard);
    expect(BULK_MATERIALS.length).toBe(byYard.length);
    expect(byYard.length).toBeGreaterThan(0);
    for (const p of byYard) {
      const m = findBulkMaterial(p.slug);
      expect(m?.name).toBe(p.name);
      expect(m?.category).toBe(categoryOf(p).name);
    }
    // Flagstone, pavers, turf and tools aren't sold loose by volume — a
    // yardage estimate for them would be meaningless.
    for (const p of PRODUCTS.filter((x) => !x.soldByCubicYard)) {
      expect(findBulkMaterial(p.slug)).toBeUndefined();
    }
  });

  it("carries no price of any kind", () => {
    for (const m of BULK_MATERIALS) {
      expect(Object.keys(m).sort()).toEqual(["category", "id", "name"]);
    }
  });
});

describe("findBulkMaterial", () => {
  it("resolves a known slug", () => {
    expect(findBulkMaterial("black-bark")?.name).toBe("Black Bark");
  });
  it("returns undefined for unknown/blank ids rather than guessing", () => {
    expect(findBulkMaterial("no-such-material")).toBeUndefined();
    expect(findBulkMaterial("")).toBeUndefined();
    expect(findBulkMaterial(undefined)).toBeUndefined();
    expect(findBulkMaterial(null)).toBeUndefined();
  });
});
