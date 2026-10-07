import { describe, it, expect } from "vitest";
import { summarize, aggregateList, finalize } from "./reports.js";
import type { Order } from "./orders.js";

// Parity lock: the SQL path produces RawAgg sums, then finalize() derives the
// summary. This proves finalize(aggregateList(...)) is byte-identical to the
// original summarize(), so the Postgres rollup only has to match the raw sums
// (verified separately against a real database).

const costs: Record<string, number> = { p1: 4, p2: 2.5, p3: 0 };
const costOf = (id: string): number => costs[id] ?? 0;

const mk = (o: Partial<Order>): Order => ({
  id: "o",
  number: "ORD-1",
  customerId: null,
  customerName: "x",
  type: "sale",
  status: "complete",
  location: "Main",
  lines: [],
  subtotal: 0,
  discount: 0,
  taxRate: 0.0975,
  tax: 0,
  total: 0,
  paymentMethod: "cash",
  paid: true,
  due: 0,
  registerSessionId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...o,
});

const line = (productId: string, name: string, qty: number, lineTotal: number): Order["lines"][number] => ({
  productId,
  name,
  unitLabel: "Each",
  qty,
  unitPrice: 0,
  lineTotal,
});

describe("reports aggregation parity", () => {
  it("finalize(aggregateList(...)) equals summarize(...)", () => {
    const list: Order[] = [
      mk({ subtotal: 100, tax: 9.75, total: 109.75, paymentMethod: "cash", lines: [line("p1", "A", 3, 120)] }),
      mk({ subtotal: 50, tax: 4.88, total: 54.88, paymentMethod: "card", lines: [line("p2", "B", 2.5, 50)] }),
      mk({ subtotal: 20, tax: 1.95, total: 21.95, paymentMethod: "cash", lines: [line("p1", "A", 1, 20)] }),
      mk({ subtotal: 33.33, tax: 3.25, total: 36.58, paymentMethod: "account", lines: [line("p3", "C", 4, 36.58)] }),
    ];
    expect(finalize(aggregateList(list, costOf))).toEqual(summarize(list, costOf));
  });

  it("matches on an empty period", () => {
    expect(finalize(aggregateList([], costOf))).toEqual(summarize([], costOf));
  });

  it("computes the expected COGS + gross profit", () => {
    // 3×$4 (p1) + 2.5×$2.5 (p2) = 12 + 6.25 = 18.25 COGS.
    const list: Order[] = [
      mk({ subtotal: 200, tax: 0, total: 200, lines: [line("p1", "A", 3, 0), line("p2", "B", 2.5, 0)] }),
    ];
    const agg = finalize(aggregateList(list, costOf));
    expect(agg.cogs).toBe(18.25);
    expect(agg.grossProfit).toBe(181.75);
  });
});
