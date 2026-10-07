import { Router } from "express";
import { orders, type Order } from "./orders.js";
import { inventory } from "./inventory.js";
import { customers } from "./customers.js";
import { guardAll } from "../lib/auth.js";
import { getModel } from "../models/base.js";

/**
 * Read-only reporting over the orders ledger + inventory:
 *   - Z-report for a day OR a date range, with COGS / gross profit / margin
 *   - Payment-method breakdown + top sellers
 *   - Inventory valuation (qty × last cost)
 *   - A/R aging (open on-account balances bucketed by age)
 *   - CSV export of sales
 * Quotes and voids are excluded from revenue. The all-time/period summaries are
 * aggregated inside MongoDB (pipelines) so we never load the whole ledger.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayOf = (iso: string) => iso.slice(0, 10);
const isRevenue = (o: Order) => o.type !== "quote" && o.status !== "void";

// Reference in-memory summary. The Mongo pipeline path below must produce the
// same shape; a unit test pins finalize(aggregateList) to this.
export function summarize(list: Order[], costOf: (productId: string) => number) {
  const count = list.length;
  const subtotal = round2(list.reduce((s, x) => s + x.subtotal, 0));
  const tax = round2(list.reduce((s, x) => s + x.tax, 0));
  const total = round2(list.reduce((s, x) => s + x.total, 0));
  const byPayment: Record<string, { count: number; total: number }> = {};
  for (const s of list) {
    const m = s.paymentMethod || "card";
    byPayment[m] ??= { count: 0, total: 0 };
    byPayment[m].count += 1;
    byPayment[m].total = round2(byPayment[m].total + s.total);
  }
  const cogs = round2(list.reduce((s, o) => s + o.lines.reduce((ls, l) => ls + l.qty * costOf(l.productId), 0), 0));
  const grossProfit = round2(subtotal - cogs);
  const margin = subtotal ? round2(grossProfit / subtotal) : 0;
  return { count, subtotal, tax, total, avgSale: count ? round2(total / count) : 0, byPayment, cogs, grossProfit, margin };
}

// ── Sales aggregation: MongoDB pipelines, JS twins kept as reference ─────
// The all-time summary can't be bounded, so we aggregate in the DB instead of
// loading every order. `RawAgg` holds the un-rounded sums; `finalize` applies the
// exact same rounding/derivation as summarize() so results match. `aggregateList`
// is the parity reference the unit test pins the pipeline output against.
export interface RawAgg {
  count: number;
  subtotal: number;
  tax: number;
  total: number;
  cogs: number;
  byPayment: Record<string, { count: number; total: number }>;
}

/** Sum a list into a RawAgg (the parity reference for the pipeline path). */
export function aggregateList(list: Order[], costOf: (productId: string) => number): RawAgg {
  const byPayment: Record<string, { count: number; total: number }> = {};
  let subtotal = 0;
  let tax = 0;
  let total = 0;
  let cogs = 0;
  for (const o of list) {
    subtotal += o.subtotal;
    tax += o.tax;
    total += o.total;
    const m = o.paymentMethod || "card";
    (byPayment[m] ??= { count: 0, total: 0 }).count += 1;
    byPayment[m]!.total += o.total;
    for (const l of o.lines) cogs += l.qty * costOf(l.productId);
  }
  return { count: list.length, subtotal, tax, total, cogs, byPayment };
}

/** Derive the summary shape from raw sums — same rounding as summarize(). */
export function finalize(a: RawAgg): ReturnType<typeof summarize> {
  const subtotal = round2(a.subtotal);
  const tax = round2(a.tax);
  const total = round2(a.total);
  const cogs = round2(a.cogs);
  const grossProfit = round2(subtotal - cogs);
  const byPayment: Record<string, { count: number; total: number }> = {};
  for (const [m, v] of Object.entries(a.byPayment)) byPayment[m] = { count: v.count, total: round2(v.total) };
  return {
    count: a.count,
    subtotal,
    tax,
    total,
    avgSale: a.count ? round2(total / a.count) : 0,
    byPayment,
    cogs,
    grossProfit,
    margin: subtotal ? round2(grossProfit / subtotal) : 0,
  };
}

type DateRange = { from: string; to: string };

// Revenue predicate as a Mongo match (quotes + voids excluded), plus optional range.
function revenueMatch(range?: DateRange): Record<string, unknown> {
  const match: Record<string, unknown> = { type: { $ne: "quote" }, status: { $ne: "void" } };
  if (range) match.createdAt = { $gte: range.from, $lte: range.to };
  return match;
}

// paymentMethod default: empty/missing → "card" (matches summarize()).
const PAYMENT_METHOD_EXPR = { $cond: [{ $in: ["$paymentMethod", [null, ""]] }, "card", "$paymentMethod"] };

/** All-time or date-ranged raw sums — aggregated inside MongoDB. */
async function rawAggregateMongo(range?: DateRange): Promise<RawAgg> {
  const O = getModel("orders");
  const match = revenueMatch(range);
  const [sums, bp, cogs] = await Promise.all([
    O.aggregate<{ count: number; subtotal: number; tax: number; total: number }>([
      { $match: match },
      { $group: { _id: null, count: { $sum: 1 }, subtotal: { $sum: "$subtotal" }, tax: { $sum: "$tax" }, total: { $sum: "$total" } } },
    ]),
    O.aggregate<{ _id: string; count: number; total: number }>([
      { $match: match },
      { $group: { _id: PAYMENT_METHOD_EXPR, count: { $sum: 1 }, total: { $sum: "$total" } } },
    ]),
    // COGS = Σ over every revenue order's lines of qty × the product's unit cost.
    O.aggregate<{ cogs: number }>([
      { $match: match },
      { $unwind: "$lines" },
      { $lookup: { from: "inventory", localField: "lines.productId", foreignField: "productId", as: "inv" } },
      {
        $group: {
          _id: null,
          cogs: { $sum: { $multiply: ["$lines.qty", { $ifNull: [{ $arrayElemAt: ["$inv.cost", 0] }, 0] }] } },
        },
      },
    ]),
  ]);
  const byPayment: Record<string, { count: number; total: number }> = {};
  for (const r of bp) byPayment[r._id] = { count: r.count, total: Number(r.total) };
  const s = sums[0];
  return {
    count: s?.count ?? 0,
    subtotal: Number(s?.subtotal ?? 0),
    tax: Number(s?.tax ?? 0),
    total: Number(s?.total ?? 0),
    cogs: Number(cogs[0]?.cogs ?? 0),
    byPayment,
  };
}

/** All-time or date-ranged sales summary — pipeline-aggregated in MongoDB. */
async function salesSummary(range?: DateRange): Promise<ReturnType<typeof summarize>> {
  return finalize(await rawAggregateMongo(range));
}

async function topSellersAgg(range?: DateRange, limit = 8): Promise<ReturnType<typeof topSellers>> {
  const O = getModel("orders");
  const rows = await O.aggregate<{ _id: string; name: string; qty: number; revenue: number }>([
    { $match: revenueMatch(range) },
    { $unwind: "$lines" },
    {
      $group: {
        _id: "$lines.productId",
        name: { $last: "$lines.name" },
        qty: { $sum: "$lines.qty" },
        revenue: { $sum: "$lines.lineTotal" },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
  return rows.map((x) => ({ productId: x._id, name: x.name, qty: round2(Number(x.qty)), revenue: round2(Number(x.revenue)) }));
}

// JS twin — reference implementation kept for parity/testing (mirrors topSellersAgg).
export function topSellers(list: Order[], limit = 8) {
  const agg = new Map<string, { productId: string; name: string; qty: number; revenue: number }>();
  for (const sale of list) {
    for (const line of sale.lines) {
      const cur = agg.get(line.productId) ?? { productId: line.productId, name: line.name, qty: 0, revenue: 0 };
      cur.qty = round2(cur.qty + line.qty);
      cur.revenue = round2(cur.revenue + line.lineTotal);
      cur.name = line.name;
      agg.set(line.productId, cur);
    }
  }
  return [...agg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, limit);
}

const csv = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const router = Router();
router.use(guardAll("reports")); // financials — reports permission required

// Z-report for a single day (?date=) or a range (?from=&to=).
router.get("/summary", async (req, res) => {
  const { date, from, to } = req.query as { date?: string; from?: string; to?: string };
  // Build an inclusive createdAt range (upper bound covers the whole final day).
  let range: DateRange;
  let label: string;
  if (from || to) {
    const f = from ?? "0000-00-00";
    const t = to ?? "9999-12-31";
    range = { from: f, to: `${t}T23:59:59.999Z` };
    label = `${from ?? "start"} → ${to ?? "now"}`;
  } else {
    const day = date ?? new Date().toISOString().slice(0, 10);
    range = { from: day, to: `${day}T23:59:59.999Z` };
    label = day;
  }

  // z + all-time are pipeline-aggregated (no full-ledger scan).
  const [z, allTime] = await Promise.all([salesSummary(range), salesSummary()]);
  // The period's sales list (newest first, capped) — bounded by the date range.
  const sales = (await orders.query({ range: { field: "createdAt", from: range.from, to: range.to }, order: "desc" }))
    .filter(isRevenue)
    .slice(0, 50);
  // Top sellers for the period, or all-time when the period is empty.
  const topList = z.count ? await topSellersAgg(range) : await topSellersAgg();

  return res.json({
    data: {
      date: label,
      range: from || to ? { from: from ?? null, to: to ?? null } : null,
      z,
      sales,
      topSellers: topList,
      allTime,
    },
  });
});

// Inventory valuation — qty on hand × last unit cost.
router.get("/inventory-valuation", async (_req, res) => {
  const inv = await inventory.all();
  const items = inv
    .map((i) => ({
      productId: i.productId,
      name: i.name,
      unit: i.unit,
      qtyOnHand: i.qtyOnHand,
      cost: i.cost ?? 0,
      value: round2(i.qtyOnHand * (i.cost ?? 0)),
    }))
    .sort((a, b) => b.value - a.value);
  return res.json({
    data: {
      totalValue: round2(items.reduce((s, x) => s + x.value, 0)),
      totalUnits: round2(items.reduce((s, x) => s + x.qtyOnHand, 0)),
      untracked: items.filter((x) => x.cost === 0).length, // products without a captured cost
      items,
    },
  });
});

// A/R aging — open on-account balances bucketed by invoice age.
router.get("/ar-aging", async (_req, res) => {
  // Only account orders are candidates — fetch just those (indexed), then narrow
  // to open ones in memory. Avoids scanning the whole ledger.
  const open = (await orders.query({ where: { paymentMethod: "account" } })).filter((o) => o.status !== "void" && o.due > 0);
  const nameById = new Map((await customers.all()).map((c) => [c.id, c.name]));
  const now = Date.now();
  type Bucket = "current" | "d31_60" | "d61_90" | "d90plus";
  const bucketOf = (iso: string): Bucket => {
    const days = (now - new Date(iso).getTime()) / 86_400_000;
    return days <= 30 ? "current" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90plus";
  };
  const zero = () => ({ current: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 });
  const totals = zero();
  const byCustomer = new Map<string, ReturnType<typeof zero> & { customerId: string | null; customerName: string }>();
  for (const o of open) {
    const key = o.customerId ?? "walk-in";
    const name = (o.customerId && nameById.get(o.customerId)) || o.customerName;
    const row = byCustomer.get(key) ?? { ...zero(), customerId: o.customerId, customerName: name };
    const b = bucketOf(o.createdAt);
    row[b] = round2(row[b] + o.due);
    row.total = round2(row.total + o.due);
    totals[b] = round2(totals[b] + o.due);
    totals.total = round2(totals.total + o.due);
    byCustomer.set(key, row);
  }
  return res.json({ data: { totals, customers: [...byCustomer.values()].sort((a, b) => b.total - a.total) } });
});

// CSV export of sales in a date range.
router.get("/export", async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };
  const f = from ?? "0000-00-00";
  const t = to ?? "9999-12-31";
  // Fetch only the date range (indexed on createdAt); the upper bound covers the
  // whole final day. The exact day filter below is a parity safety net.
  const list = (await orders.query({ range: { field: "createdAt", from: f, to: `${t}T23:59:59.999Z` }, order: "asc" }))
    .filter(isRevenue)
    .filter((o) => dayOf(o.createdAt) >= f && dayOf(o.createdAt) <= t);
  const header = "Number,Date,Customer,Type,Status,Payment,Subtotal,Tax,Total";
  const rows = list.map((o) =>
    [o.number, dayOf(o.createdAt), csv(o.customerName), o.type, o.status, o.paymentMethod, o.subtotal, o.tax, o.total].join(","),
  );
  res
    .set("content-type", "text/csv; charset=utf-8")
    .set("content-disposition", `attachment; filename="balm-sales-${f}_${t}.csv"`);
  return res.send([header, ...rows].join("\n") + "\n");
});

export default router;
