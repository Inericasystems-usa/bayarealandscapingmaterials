/**
 * Per-product quantity and cost estimates for the calculator on every product
 * page. Pure arithmetic and published rules of thumb, no catalog data, so the
 * client calculator can import it.
 *
 * planFor() (server) picks the calculator for a product from its unit, name
 * and category; the client component only runs estimate() on that plan.
 *
 * Every figure is an estimate and is labelled so on the page. Densities and
 * coverage rates are typical industry values for loose landscape material;
 * a real load varies with moisture and grading.
 */

// ── Plans (serialisable: passed from the server page to the client) ──────

export interface VolumePlan {
  kind: "volume";
  /** Inches; the first is the default. */
  depths: number[];
  /** Extra ordered on top of the measured volume, percent (settling, compaction, spill). */
  extraPct: number;
  extraReason: string;
  /** Approximate tons per cubic yard, for the weight and truck note. */
  tonsPerYard: number;
  /** Smallest step the yard sells: 0.25 with quarter yards, 0.5 with halves, else 1. */
  step: number;
  depthHint: string;
}

export interface WeightPlan {
  kind: "weight";
  extraReason: string;
  /** Inches of cover; the first is the default. */
  depths: number[];
  /** Pounds per cubic foot of loose stone. */
  lbPerCubicFoot: number;
  extraPct: number;
  depthHint: string;
}

export interface FlagstonePlan {
  kind: "flagstone";
  /** Pounds of stone per square foot laid (thickness and joints included). */
  lbPerSquareFoot: number;
  extraPct: number;
  extraReason: string;
}

export interface AreaPlan {
  kind: "area";
  extraPct: number;
  extraReason: string;
}

export interface RollPlan {
  kind: "rolls";
  rollWidthFt: number;
  rollLengthFt: number;
  /** Overlap lost at seams, percent. */
  overlapPct: number;
}

export interface BagPlan {
  kind: "bags";
  /** Cubic feet of finished concrete per bag. */
  yieldCubicFeet: number;
  /** Slab thicknesses in inches; the first is the default. */
  thicknesses: number[];
}

export interface CountPlan {
  kind: "count";
  /** What one unit covers, when there is a published figure ("50 sq ft of joints"). */
  note?: string;
}

export type CalculatorPlan = VolumePlan | WeightPlan | FlagstonePlan | AreaPlan | RollPlan | BagPlan | CountPlan;

/** Unit price for the base unit, when prices are shown. */
export interface PriceInfo {
  unit: string;
  unitPlural: string;
  price: number;
}

// ── Choosing a plan ──────────────────────────────────────────────────────

interface PlanInput {
  name: string;
  categorySlug: string;
  unit: string;
  isService: boolean;
  variationUnits: string[];
}

const TONS_PER_YARD: Record<string, number> = {
  "bark-mulch": 0.3,
  soil: 1.1,
  sand: 1.35,
  "decorative-rock": 1.35,
  "construction-aggregates": 1.4,
};

export function planFor(p: PlanInput): CalculatorPlan | null {
  if (p.isService || p.unit === "Service" || p.unit === "Ton") return null;
  const name = p.name.toLowerCase();

  if (p.unit === "Cubic Yard") {
    const step = p.variationUnits.includes("Quarter Cubic Yard")
      ? 0.25
      : p.variationUnits.includes("Half Cubic Yard")
        ? 0.5
        : 1;
    const tonsPerYard = TONS_PER_YARD[p.categorySlug] ?? 1.3;
    if (/playground/.test(name)) {
      return {
        kind: "volume",
        depths: [9, 12],
        extraPct: 10,
        extraReason: "for settling",
        tonsPerYard,
        step,
        depthHint: "Under play equipment, wood mulch is laid at least 9 inches deep (US CPSC guidance).",
      };
    }
    switch (p.categorySlug) {
      case "bark-mulch":
        return {
          kind: "volume",
          depths: [3, 2, 4],
          extraPct: 10,
          extraReason: "for settling",
          tonsPerYard,
          step,
          depthHint: "Beds are usually mulched 2 to 3 inches deep; 3 inches keeps weeds down best.",
        };
      case "soil":
        return {
          kind: "volume",
          depths: [4, 6, 8],
          extraPct: 15,
          extraReason: "for settling as it is watered in",
          tonsPerYard,
          step,
          depthHint: "Top-dress lawns 1–2 in; new beds and raised beds take 6–12 in.",
        };
      case "sand":
        return {
          kind: "volume",
          depths: /paver|bedding/.test(name) ? [1, 2] : [2, 4],
          extraPct: 10,
          extraReason: "for compaction",
          tonsPerYard,
          step,
          depthHint: /paver|bedding/.test(name)
            ? "Paver bedding sand is screeded about 1 inch deep over compacted base."
            : "Use the depth of the finished layer.",
        };
      case "construction-aggregates":
        return {
          kind: "volume",
          depths: /drain/.test(name) ? [4, 6, 12] : [4, 6],
          extraPct: /drain/.test(name) ? 5 : 20,
          extraReason: /drain/.test(name) ? "for spill" : "for compaction",
          tonsPerYard,
          step,
          depthHint: /drain/.test(name)
            ? "Drainage trenches and French drains are usually 6–12 in of rock around the pipe."
            : "Walkways take about 4 in of compacted base; driveways 6 in or more.",
        };
      default: {
        const dg = /decomposed granite|\bdg\b/.test(name);
        return {
          kind: "volume",
          depths: dg ? [3, 2, 4] : [2, 3],
          extraPct: dg ? 15 : 5,
          extraReason: dg ? "for compaction" : "for spill",
          tonsPerYard,
          step,
          depthHint: dg
            ? "Decomposed granite paths are laid about 3 inches deep and compacted."
            : "Decorative rock is usually spread 2–3 inches deep; larger stone sits deeper.",
        };
      }
    }
  }

  if (p.unit === "Pound") {
    if (p.categorySlug === "flagstone-slate") return { kind: "flagstone", lbPerSquareFoot: 18, extraPct: 10, extraReason: "for cuts and fitting" };
    if (p.categorySlug === "boulders") return { kind: "count" };
    return {
      kind: "weight",
      depths: [2, 3],
      lbPerCubicFoot: 100,
      extraPct: 5,
      extraReason: "for gaps and spill",
      depthHint: "Pebbles and cobbles are laid about one stone deep, roughly 2–3 inches.",
    };
  }

  if (p.unit === "Square Foot") {
    return p.categorySlug === "artificial-turf"
      ? { kind: "area", extraPct: 10, extraReason: "for seams and trimming" }
      : { kind: "area", extraPct: 7, extraReason: "for cuts and breakage" };
  }

  const roll = name.match(/(\d+(?:\.\d+)?)\s*'?\s*x\s*(\d+(?:\.\d+)?)\s*'?/);
  if (p.categorySlug === "landscape-fabric" && roll) {
    const [w, l] = [Number(roll[1]), Number(roll[2])];
    if (w > 0 && l > 0 && w <= 15 && l >= 20) return { kind: "rolls", rollWidthFt: w, rollLengthFt: l, overlapPct: 10 };
  }

  if (/concrete mix/.test(name)) {
    const lb = Number(name.match(/(\d+)\s*lb/)?.[1] ?? 80);
    // Manufacturer yields for bagged concrete: 80 lb ≈ 0.60 cu ft, 60 lb ≈ 0.45, 40 lb ≈ 0.30.
    return { kind: "bags", yieldCubicFeet: Math.round((lb / 80) * 0.6 * 100) / 100, thicknesses: [4, 3, 6] };
  }

  return { kind: "count" };
}

// ── Running an estimate ──────────────────────────────────────────────────

export type Shape = "rectangle" | "circle" | "area";

export interface EstimateInput {
  shape: Shape;
  /** Feet. Rectangle: length and width. Circle: length is the diameter. */
  length: number;
  width: number;
  /** Square feet, for shape "area". */
  area: number;
  /** Inches (depth or slab thickness). */
  depth: number;
  includeExtra: boolean;
  /** For count plans. */
  count: number;
}

export interface EstimateResult {
  /** Square feet measured. */
  areaSqFt: number;
  /** What to order, in the product's base unit. */
  quantity: number;
  unitLabel: string;
  /** Plain-language lines shown under the result. */
  details: string[];
  /** Material cost before tax and delivery, when a price is known. */
  cost: number | null;
}

export function measuredArea(i: Pick<EstimateInput, "shape" | "length" | "width" | "area">): number {
  const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
  if (i.shape === "area") return pos(i.area);
  if (i.shape === "circle") return Math.PI * (pos(i.length) / 2) ** 2;
  return pos(i.length) * pos(i.width);
}

const ceilTo = (n: number, step: number) => Math.ceil(n / step - 1e-9) * step;
const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** Sub-yard bulk orders carry the yard's flat $7 handling fee (lib/uom.ts). */
export const SUB_YARD_HANDLING_FEE = 7;

export function bulkCost(yards: number, pricePerYard: number): number {
  if (yards <= 0) return 0;
  const base = yards * pricePerYard;
  return Math.round((yards < 1 ? base + SUB_YARD_HANDLING_FEE : base) * 100) / 100;
}

export function estimate(plan: CalculatorPlan, input: EstimateInput, price: PriceInfo | null): EstimateResult | null {
  const area = measuredArea(input);
  const extra = (pct: number) => (input.includeExtra ? 1 + pct / 100 : 1);

  switch (plan.kind) {
    case "volume": {
      if (area <= 0 || input.depth <= 0) return null;
      const cubicFeet = area * (input.depth / 12);
      const yards = (cubicFeet / 27) * extra(plan.extraPct);
      const order = Math.max(plan.step, ceilTo(yards, plan.step));
      const tons = round1(order * plan.tonsPerYard);
      return {
        areaSqFt: area,
        quantity: order,
        unitLabel: order === 1 ? "cubic yard" : "cubic yards",
        details: [
          `${fmt(Math.round(area))} sq ft × ${input.depth} in = ${fmt(round1(cubicFeet))} cu ft (${fmt(Math.round((cubicFeet / 27) * 100) / 100)} yd³)`,
          ...(input.includeExtra ? [`+${plan.extraPct}% ${plan.extraReason}`] : []),
          `About ${fmt(tons)} ${tons === 1 ? "ton" : "tons"}${order < 1 ? " — pickup only (1 yd³ delivery minimum)" : ""}`,
        ],
        cost: price ? bulkCost(order, price.price) : null,
      };
    }
    case "weight": {
      if (area <= 0 || input.depth <= 0) return null;
      const lb = area * (input.depth / 12) * plan.lbPerCubicFoot * extra(plan.extraPct);
      const order = ceilTo(lb, 50);
      return {
        areaSqFt: area,
        quantity: order,
        unitLabel: "pounds",
        details: [
          `${fmt(Math.round(area))} sq ft at ${input.depth} in deep`,
          `About ${fmt(round1(order / 2000))} tons of stone`,
          ...(input.includeExtra ? [`+${plan.extraPct}% for gaps and spill`] : []),
        ],
        cost: price ? Math.round(order * price.price * 100) / 100 : null,
      };
    }
    case "flagstone": {
      if (area <= 0) return null;
      const lb = area * plan.lbPerSquareFoot * extra(plan.extraPct);
      const order = ceilTo(lb, 50);
      return {
        areaSqFt: area,
        quantity: order,
        unitLabel: "pounds",
        details: [
          `${fmt(Math.round(area))} sq ft of patio or path`,
          `About ${plan.lbPerSquareFoot} lb per sq ft (one ton covers ~${Math.round(2000 / plan.lbPerSquareFoot)} sq ft)`,
          ...(input.includeExtra ? [`+${plan.extraPct}% for cuts and fitting`] : []),
        ],
        cost: price ? Math.round(order * price.price * 100) / 100 : null,
      };
    }
    case "area": {
      if (area <= 0) return null;
      const order = Math.ceil(area * extra(plan.extraPct) - 1e-9);
      return {
        areaSqFt: area,
        quantity: order,
        unitLabel: "square feet",
        details: [
          `${fmt(Math.round(area))} sq ft measured`,
          ...(input.includeExtra ? [`+${plan.extraPct}% ${plan.extraReason}`] : []),
        ],
        cost: price ? Math.round(order * price.price * 100) / 100 : null,
      };
    }
    case "rolls": {
      if (area <= 0) return null;
      const perRoll = plan.rollWidthFt * plan.rollLengthFt * (1 - plan.overlapPct / 100);
      const order = Math.ceil(area / perRoll - 1e-9);
      return {
        areaSqFt: area,
        quantity: order,
        unitLabel: order === 1 ? "roll" : "rolls",
        details: [
          `Each ${plan.rollWidthFt} × ${plan.rollLengthFt} ft roll covers ~${fmt(Math.round(perRoll))} sq ft with ${plan.overlapPct}% seam overlap`,
          `${fmt(Math.round(area))} sq ft to cover`,
        ],
        cost: price ? Math.round(order * price.price * 100) / 100 : null,
      };
    }
    case "bags": {
      if (area <= 0 || input.depth <= 0) return null;
      const cubicFeet = area * (input.depth / 12) * extra(5);
      const order = Math.ceil(cubicFeet / plan.yieldCubicFeet - 1e-9);
      return {
        areaSqFt: area,
        quantity: order,
        unitLabel: order === 1 ? "bag" : "bags",
        details: [
          `${fmt(round1(cubicFeet))} cu ft of concrete at ${input.depth} in thick`,
          `Each bag makes about ${plan.yieldCubicFeet} cu ft`,
          ...(input.includeExtra ? ["+5% for spill and uneven ground"] : []),
        ],
        cost: price ? Math.round(order * price.price * 100) / 100 : null,
      };
    }
    case "count": {
      const n = Math.floor(input.count);
      if (!Number.isFinite(n) || n <= 0) return null;
      return {
        areaSqFt: 0,
        quantity: n,
        unitLabel: price ? (n === 1 ? price.unit.toLowerCase() : price.unitPlural) : "",
        details: plan.note ? [plan.note] : [],
        cost: price ? Math.round(n * price.price * 100) / 100 : null,
      };
    }
  }
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}
