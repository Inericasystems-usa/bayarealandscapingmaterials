import { describe, expect, it } from "vitest";
import { PRODUCTS } from "./index";
import { bulkCost, estimate, measuredArea, planFor, type EstimateInput } from "./estimate";

const base: EstimateInput = { shape: "rectangle", length: 0, width: 0, area: 0, depth: 3, includeExtra: false, count: 1 };
const planOf = (slug: string) => {
  const p = PRODUCTS.find((x) => x.slug === slug)!;
  return planFor({
    name: p.name,
    categorySlug: p.categorySlug,
    unit: p.unit,
    isService: p.isService,
    variationUnits: p.variations.map((v) => v.unit),
  });
};

describe("planFor", () => {
  it("gives every non-service product a calculator", () => {
    for (const p of PRODUCTS) {
      const plan = planFor({
        name: p.name,
        categorySlug: p.categorySlug,
        unit: p.unit,
        isService: p.isService,
        variationUnits: p.variations.map((v) => v.unit),
      });
      if (p.isService || p.unit === "Ton" || p.unit === "Service") expect(plan, p.slug).toBeNull();
      else expect(plan, p.slug).not.toBeNull();
    }
  });

  it("defaults bark to 3 in, sold in quarter yards", () => {
    const plan = planOf("black-bark");
    expect(plan).toMatchObject({ kind: "volume", step: 0.25 });
    expect(plan && "depths" in plan ? plan.depths[0] : 0).toBe(3);
  });

  it("uses CPSC playground depth for playground bark", () => {
    const plan = planOf("playground-bark-cedar");
    expect(plan && "depths" in plan ? plan.depths[0] : 0).toBe(9);
  });

  it("reads roll size from a landscape fabric name", () => {
    const fabric = PRODUCTS.find((p) => p.categorySlug === "landscape-fabric" && /100/.test(p.name))!;
    const plan = planFor({ ...fabric, variationUnits: [] });
    expect(plan?.kind).toBe("rolls");
  });
});

describe("estimate", () => {
  it("rectangle and circle areas", () => {
    expect(measuredArea({ shape: "rectangle", length: 10, width: 20, area: 0 })).toBe(200);
    expect(measuredArea({ shape: "circle", length: 10, width: 0, area: 0 })).toBeCloseTo(78.54, 2);
    expect(measuredArea({ shape: "area", length: 0, width: 0, area: -5 })).toBe(0);
  });

  it("324 sq ft at 3 in is exactly 3 yd³", () => {
    const plan = planOf("black-bark")!;
    const r = estimate(plan, { ...base, length: 18, width: 18, depth: 3 }, { unit: "Cubic Yard", unitPlural: "cubic yards", price: 50 })!;
    expect(r.quantity).toBe(3);
    expect(r.cost).toBe(150);
  });

  it("rounds up to the yard's smallest step and adds settling when asked", () => {
    const plan = planOf("black-bark")!;
    const r = estimate(plan, { ...base, length: 10, width: 10, depth: 3, includeExtra: true }, null)!;
    // 100 sq ft × 0.25 ft = 25 cu ft = 0.926 yd³ × 1.10 = 1.019 → 1.25
    expect(r.quantity).toBe(1.25);
    expect(r.cost).toBeNull();
  });

  it("sub-yard orders carry the $7 handling fee, 1 yd and up do not", () => {
    expect(bulkCost(0.5, 72)).toBe(43);
    expect(bulkCost(1, 72)).toBe(72);
    expect(bulkCost(2.25, 40)).toBe(90);
  });

  it("returns nothing for empty or junk input", () => {
    const plan = planOf("black-bark")!;
    expect(estimate(plan, { ...base, length: Number.NaN, width: 10 }, null)).toBeNull();
    expect(estimate({ kind: "count" }, { ...base, count: 0 }, null)).toBeNull();
  });

  it("turf adds 10% and rounds to whole square feet", () => {
    const r = estimate({ kind: "area", extraPct: 10, extraReason: "" }, { ...base, shape: "area", area: 101, includeExtra: true }, null)!;
    expect(r.quantity).toBe(112);
  });
});
