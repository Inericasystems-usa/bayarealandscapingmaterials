import { Router } from "express";
import { z } from "zod";
import { Collection, newId, startsWith, type Entity } from "../lib/store.js";
import { adjustStock, inventory } from "./inventory.js";
import { getSettings } from "./settings.js";
import { customers } from "./customers.js";
import { decryptField } from "../lib/encryption.js";
import { bus } from "../lib/events.js";
import { guardWrites } from "../lib/auth.js";
import { computeLineTotal, computeOrderTotals, round2 } from "@balm/lib-domain";
import { withTransaction } from "../lib/db.js";
import { recordAudit } from "./audit.js";
import { isFulfilled, linkOrderRevenueToLead } from "./leads/offline-conversions.js";

export type OrderType = "sale" | "delivery" | "quote" | "will_call" | "ship";
export type OrderStatus =
  | "draft"
  | "waiting_pickup"
  | "complete"
  | "unscheduled"
  | "scheduled"
  | "dispatched"
  | "delivered"
  | "void";
export type PaymentMethod = "cash" | "card" | "account";

export interface OrderLine {
  productId: string;
  name: string;
  unitLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order extends Entity {
  number: string; // ORD-YYYYMMDD-XXXX
  clientId?: string; // idempotency key for offline-queued sales (dedupes replays)
  customerId: string | null;
  customerName: string;
  type: OrderType;
  status: OrderStatus;
  location: string;
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  paid: boolean;
  due: number;
  registerSessionId: string | null;
}

export const orders = new Collection<Order>("orders");

// Types that move stock when the order is placed (everything but a quote).
const MOVES_STOCK: OrderType[] = ["sale", "delivery", "will_call", "ship"];
const DEFAULT_STATUS: Record<OrderType, OrderStatus> = {
  sale: "complete",
  delivery: "unscheduled",
  quote: "draft",
  will_call: "waiting_pickup",
  ship: "unscheduled",
};

const lineSchema = z.object({
  productId: z.string(),
  name: z.string(),
  unitLabel: z.string().default(""),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  lineTotal: z.number().min(0).optional(),
});

async function nextNumber(): Promise<string> {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const todays = await orders.count({ number: startsWith(`ORD-${ymd}`) });
  return `ORD-${ymd}-${String(todays + 1).padStart(4, "0")}`;
}

const router = Router();
router.use(guardWrites("orders"));
router.get("/", async (req, res) => {
    const { type, status, customerId, limit, cursor } = req.query as Record<string, string | undefined>;
    // Opt-in keyset pagination: ?limit → indexed page (newest first); the filters
    // are all equality, so they push straight to the store's `where`.
    if (limit) {
      const where: Record<string, string> = {};
      if (type) where.type = type;
      if (status) where.status = status;
      if (customerId) where.customerId = customerId;
      const n = Math.min(Number(limit) || 50, 200);
      const page = await orders.page({ limit: n, cursor: cursor ?? null, order: "desc", where });
      return res.json({ data: page.items, nextCursor: page.nextCursor });
    }
    // Legacy: return the whole filtered set (backward compatible), newest first.
    const where: Record<string, string> = {};
    if (type) where.type = type;
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    const list = await orders.where(where, { sort: { createdAt: -1, id: -1 } });
    return res.json({ data: list });
  });

  router.get("/:id", async (req, res) => {
    const { id } = req.params as { id: string };
    const o = await orders.find(id);
    if (!o) return res.status(404).json({ error: { code: "not_found", message: "Order not found" } });
    return res.json({ data: o });
  });

  router.post("/", async (req, res) => {
    const parsed = z
      .object({
        type: z.enum(["sale", "delivery", "quote", "will_call", "ship"]),
        status: z
          .enum(["draft", "waiting_pickup", "complete", "unscheduled", "scheduled", "dispatched", "delivered", "void"])
          .optional(),
        customerId: z.string().nullable().default(null),
        customerName: z.string().default("Walk-in"),
        lines: z.array(lineSchema).min(1),
        paymentMethod: z.enum(["cash", "card", "account"]).default("cash"),
        taxRate: z.number().min(0).max(1).optional(),
        discount: z.number().min(0).default(0),
        location: z.string().default("Main"),
        registerSessionId: z.string().nullable().default(null),
        clientId: z.string().optional(), // idempotency key for offline replay
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });

    // Idempotency: an offline sale replayed after reconnect carries its clientId.
    // If we've already recorded it, return the existing order instead of duping.
    if (parsed.data.clientId) {
      const existing = await orders.findOne({ clientId: parsed.data.clientId });
      if (existing) return res.status(200).json({ data: existing });
    }

    const moves = MOVES_STOCK.includes(parsed.data.type);
    // Guard against overselling for stock-moving orders.
    if (moves) {
      for (const line of parsed.data.lines) {
        const stock = await inventory.findOne({ productId: line.productId });
        if (stock && stock.qtyOnHand < line.qty)
          return res.status(409).json({ error: { code: "insufficient_stock", message: `Only ${stock.qtyOnHand} ${stock.unit} of ${line.name} on hand` } });
      }
    }

    const lines: OrderLine[] = parsed.data.lines.map((l) => ({
      productId: l.productId,
      name: l.name,
      unitLabel: l.unitLabel,
      qty: l.qty,
      unitPrice: l.unitPrice,
      lineTotal: computeLineTotal(l),
    }));
    const cfg = await getSettings();
    const rate = parsed.data.taxRate ?? cfg.tax.rate;
    const { subtotal, discount, tax, total } = computeOrderTotals({ lines, taxRate: rate, discount: parsed.data.discount });
    const onAccount = parsed.data.paymentMethod === "account";
    const isQuote = parsed.data.type === "quote";
    const paid = !isQuote && !onAccount;
    const due = paid ? 0 : isQuote ? 0 : total;

    // Atomic: stock decrements + the order row commit together (or not at all).
    const number = await nextNumber();
    const order = await withTransaction(async () => {
      if (moves) for (const l of lines) await adjustStock(l.productId, -l.qty);
      const o = await orders.insert({
        id: newId("ord"),
        number,
        ...(parsed.data.clientId ? { clientId: parsed.data.clientId } : {}),
        customerId: parsed.data.customerId,
        customerName: parsed.data.customerName,
        type: parsed.data.type,
        status: parsed.data.status ?? DEFAULT_STATUS[parsed.data.type],
        location: parsed.data.location,
        lines,
        subtotal,
        discount,
        taxRate: rate,
        tax,
        total,
        paymentMethod: parsed.data.paymentMethod,
        paid,
        due,
        registerSessionId: parsed.data.registerSessionId,
      });
      // Account effects: on-account AR posting + loyalty points earned.
      if (!isQuote && o.customerId) {
        const c = await customers.find(o.customerId);
        if (c) {
          const account = { ...c.account };
          if (onAccount) account.openDebt = round2((account.openDebt ?? 0) + o.total);
          if (cfg.loyalty?.enabled) account.loyaltyPoints = (account.loyaltyPoints ?? 0) + Math.floor(o.subtotal * cfg.loyalty.earnPerDollar);
          await customers.update(o.customerId, { account });
        }
      }
      return o;
    });

    // Fire a purchase-receipt text (skip quotes; resolve phone from the customer).
    if (!isQuote && order.customerId) {
      const cust = await customers.find(order.customerId);
      const phone = cust?.phone ? decryptField(cust.phone) : ""; // PII is encrypted at rest
      if (phone) {
        bus.emit("order.created", {
          orderId: order.id,
          number: order.number,
          customerId: order.customerId,
          customerName: order.customerName,
          phone,
          total: order.total,
          type: order.type,
        });
      }
    }

    // Discounts are a shrinkage vector — record who granted one and how much.
    if (discount > 0) {
      await recordAudit(req.authUser, "order.discount", `Discount $${discount.toFixed(2)} on order ${order.number} (subtotal $${subtotal.toFixed(2)})`, { orderId: order.id, number: order.number, discount, subtotal });
    }

    // A counter sale is created already fulfilled and never transitions, so the
    // PATCH hook above would never see it.
    if (isFulfilled(order.status)) {
      const leadId = await linkOrderRevenueToLead(order);
      if (leadId) req.log.info({ orderId: order.id, leadId }, "lead revenue recorded for offline conversion");
    }
    return res.status(201).json({ data: order });
  });

  router.patch("/:id", async (req, res) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({
        status: z
          .enum(["draft", "waiting_pickup", "complete", "unscheduled", "scheduled", "dispatched", "delivered", "void"])
          .optional(),
        paid: z.boolean().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
    const cur = await orders.find(id);
    if (!cur) return res.status(404).json({ error: { code: "not_found", message: "Order not found" } });
    // Void is terminal. Allowing a void → complete/delivered transition would
    // re-count the sale WITHOUT re-decrementing stock or re-posting AR (the
    // reversal below only runs on the way *into* void), permanently inflating
    // inventory and loyalty. Reverse a mistaken void by re-creating the order.
    if (cur.status === "void" && parsed.data.status && parsed.data.status !== "void")
      return res.status(409).json({ error: { code: "void_is_final", message: "A voided order cannot be reopened. Create a new order instead." } });

    const patch: Partial<Order> = { ...parsed.data };
    if (parsed.data.paid) patch.due = 0;
    // Voiding restocks the order and reverses every account effect it posted —
    // AR debt AND earned loyalty points — all atomic.
    const willVoid = parsed.data.status === "void" && cur.status !== "void";
    const willRestock = willVoid && MOVES_STOCK.includes(cur.type);
    const cfg = willVoid ? await getSettings() : null;
    const updated = await withTransaction(async () => {
      if (willRestock) for (const l of cur.lines) await adjustStock(l.productId, l.qty);
      if (willVoid && cur.customerId) {
        const c = await customers.find(cur.customerId);
        if (c) {
          const account = { ...c.account };
          if (cur.paymentMethod === "account") account.openDebt = round2(Math.max(0, (account.openDebt ?? 0) - cur.total));
          // Claw back the points this order earned (mirror of the create path).
          if (cfg?.loyalty?.enabled) account.loyaltyPoints = Math.max(0, (account.loyaltyPoints ?? 0) - Math.floor(cur.subtotal * cfg.loyalty.earnPerDollar));
          await customers.update(cur.customerId, { account });
        }
      }
      return orders.update(id, patch);
    });
    if (willVoid) await recordAudit(req.authUser, "order.void", `Voided ${cur.number} · $${cur.total.toFixed(2)} (${cur.customerName})`, { orderId: id, total: cur.total });

    // THE moment a lead becomes revenue: this order just reached a fulfilled
    // status, so stamp its real invoiced total (ex-tax) onto the lead that
    // produced it, ready for the Google Ads offline import. Write-once and
    // non-throwing — it can never affect the order write above.
    if (updated && !isFulfilled(cur.status) && isFulfilled(updated.status)) {
      const leadId = await linkOrderRevenueToLead(updated);
      if (leadId) req.log.info({ orderId: id, leadId }, "lead revenue recorded for offline conversion");
    }
    return res.json({ data: updated });
  });

export default router;
