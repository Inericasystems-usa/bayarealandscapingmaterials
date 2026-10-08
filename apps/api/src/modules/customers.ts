import { Router } from "express";
import { z } from "zod";
import { Collection, newId, paginateInMemory, type Entity } from "../lib/store.js";
import { guardAll } from "../lib/auth.js";
import { round2 } from "@balm/lib-domain";
import { orders } from "./orders.js";
import { getSettings } from "./settings.js";
import { withTransaction } from "../lib/db.js";
import { recordAudit } from "./audit.js";
import { encryptField, decryptField } from "../lib/encryption.js";

export type CustomerType = "retail" | "contractor" | "wholesale";

export interface Customer extends Entity {
  number: string; // CUST-XXXX
  name: string;
  phone: string;
  email: string;
  type: CustomerType;
  account: { pastDue: number; openDebt: number; creditLimit: number; storeCredit: number; loyaltyPoints: number };
  billingAddress: string;
  deliveryAddress: string;
  portalAccess: boolean;
  notes: string;
}

export const customers = new Collection<Customer>("customers");

// Contact + location PII is encrypted at rest (name stays plaintext — it's a
// display key used across orders/reports/statements). Encrypt on write, decrypt
// on read. Randomized ciphertext is NOT searchable, so list search decrypts into
// memory first (see GET /).
export const PII_FIELDS = ["phone", "email", "billingAddress", "deliveryAddress"] as const;
function mapPii<T extends Partial<Customer>>(obj: T, fn: (v: string) => string): T {
  const out = { ...obj };
  for (const f of PII_FIELDS) {
    const v = out[f];
    if (typeof v === "string") out[f] = fn(v);
  }
  return out;
}
export const encryptCustomer = <T extends Partial<Customer>>(c: T): T => mapPii(c, encryptField);
/** Decrypt a customer's PII fields for a caller. Safe on null. */
export function decryptCustomer<T extends Partial<Customer>>(c: T | null): T | null {
  return c ? mapPii(c, decryptField) : c;
}

/** A recorded A/R payment, with how it was applied across open invoices. */
export interface ArPayment extends Entity {
  customerId: string;
  amount: number;
  note: string;
  applied: { orderId: string; number: string; amount: number }[];
  credited: number; // unapplied remainder added to store credit
}
export const arPayments = new Collection<ArPayment>("ar_payments");

const upsertSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(""),
  email: z.string().email().or(z.literal("")).default(""),
  type: z.enum(["retail", "contractor", "wholesale"]).default("retail"),
  account: z
    .object({ pastDue: z.number(), openDebt: z.number(), creditLimit: z.number(), storeCredit: z.number(), loyaltyPoints: z.number() })
    .partial()
    .optional(),
  billingAddress: z.string().default(""),
  deliveryAddress: z.string().default(""),
  portalAccess: z.boolean().default(false),
  notes: z.string().default(""),
});

const emptyAccount = { pastDue: 0, openDebt: 0, creditLimit: 0, storeCredit: 0, loyaltyPoints: 0 };

const router = Router();
router.use(guardAll("customers")); // customer records hold PII + account balances

router.get("/", async (req, res) => {
  const { q, type, limit, cursor } = req.query as Record<string, string | undefined>;
  // `type` is plain text, so it filters in the database. The search stays in
  // memory: phone and e-mail are encrypted at rest with a random IV, so only the
  // decrypted values can be matched.
  let list = (await customers.where(type ? { type } : {})).map((c) => decryptCustomer(c) as Customer);
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.phone.includes(needle) ||
        c.email.toLowerCase().includes(needle) ||
        c.number.toLowerCase().includes(needle),
    );
  }
  // Opt-in pagination (?limit). Search must decrypt-then-filter first, so this
  // bounds the response; the cursor keeps "Load more" stable.
  if (limit) {
    const n = Math.min(Number(limit) || 50, 200);
    const page = paginateInMemory(list, { limit: n, cursor: cursor ?? null, order: "desc" });
    return res.json({ data: page.items, nextCursor: page.nextCursor });
  }
  return res.json({ data: list });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const c = await customers.find(id);
  if (!c) return res.status(404).json({ error: { code: "not_found", message: "Customer not found" } });
  return res.json({ data: decryptCustomer(c) });
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const seq = (await customers.count()) + 1;
  const created = await customers.insert(
    encryptCustomer({
      id: newId("cust"),
      number: `CUST-${String(seq).padStart(4, "0")}`,
      name: parsed.data.name,
      phone: parsed.data.phone,
      email: parsed.data.email,
      type: parsed.data.type,
      account: { ...emptyAccount, ...(parsed.data.account ?? {}) },
      billingAddress: parsed.data.billingAddress,
      deliveryAddress: parsed.data.deliveryAddress,
      portalAccess: parsed.data.portalAccess,
      notes: parsed.data.notes,
    }),
  );
  return res.status(201).json({ data: decryptCustomer(created) });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const cur = await customers.find(id);
  if (!cur) return res.status(404).json({ error: { code: "not_found", message: "Customer not found" } });
  const { account, ...restData } = parsed.data;
  const patch: Partial<Customer> = { ...restData };
  if (account) patch.account = { ...cur.account, ...account };
  const updated = await customers.update(id, encryptCustomer(patch));
  return res.json({ data: decryptCustomer(updated) });
});

// Record a payment against the account (AR). Applies to open invoices oldest
// first (FIFO), marks each paid as it clears, and books any remainder as store
// credit. The whole application commits atomically.
router.post("/:id/payment", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ amount: z.number().positive(), note: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const c = await customers.find(id);
  if (!c) return res.status(404).json({ error: { code: "not_found", message: "Customer not found" } });

  const open = await orders.where(
    { customerId: id, paymentMethod: "account", status: { $ne: "void" }, due: { $gt: 0 } },
    { sort: { createdAt: 1, id: 1 } },
  );

  const result = await withTransaction(async () => {
    let remaining = parsed.data.amount;
    const applied: ArPayment["applied"] = [];
    for (const o of open) {
      if (remaining <= 0.001) break;
      const pay = Math.min(remaining, o.due);
      const due = round2(o.due - pay);
      await orders.update(o.id, { due, paid: due === 0 });
      remaining = round2(remaining - pay);
      applied.push({ orderId: o.id, number: o.number, amount: round2(pay) });
    }
    const appliedTotal = round2(parsed.data.amount - remaining);
    const openDebt = round2(Math.max(0, c.account.openDebt - appliedTotal));
    const storeCredit = round2(c.account.storeCredit + remaining); // unapplied → store credit
    const pastDue = round2(Math.min(c.account.pastDue, openDebt));
    const customer = await customers.update(id, { account: { ...c.account, openDebt, storeCredit, pastDue } });
    const payment = await arPayments.insert({
      id: newId("arpay"),
      customerId: id,
      amount: round2(parsed.data.amount),
      note: parsed.data.note ?? "",
      applied,
      credited: round2(remaining),
    });
    return { customer, payment };
  });
  await recordAudit(req.authUser, "ar.payment", `AR payment $${parsed.data.amount.toFixed(2)} · ${c.name}`, { customerId: id, amount: parsed.data.amount });
  return res.json({ data: result.customer, payment: result.payment });
});

// Redeem loyalty points → store credit (at the configured redemption rate).
router.post("/:id/redeem-points", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ points: z.number().positive() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const c = await customers.find(id);
  if (!c) return res.status(404).json({ error: { code: "not_found", message: "Customer not found" } });
  const balance = c.account.loyaltyPoints ?? 0;
  const points = Math.min(Math.floor(parsed.data.points), balance);
  if (points <= 0) return res.status(400).json({ error: { code: "invalid", message: "Not enough points to redeem" } });
  const ppd = (await getSettings()).loyalty?.redeemPointsPerDollar || 100;
  const credit = round2(points / ppd);
  const account = {
    ...c.account,
    loyaltyPoints: balance - points,
    storeCredit: round2((c.account.storeCredit ?? 0) + credit),
  };
  const updated = await customers.update(id, { account });
  await recordAudit(req.authUser, "loyalty.redeem", `Redeemed ${points} pts → $${credit.toFixed(2)} · ${c.name}`, { customerId: id, points, credit });
  return res.json({ data: updated, redeemed: { points, credit } });
});

// Customer statement: open + settled invoices and the payment history.
router.get("/:id/statement", async (req, res) => {
  const { id } = req.params as { id: string };
  const c = await customers.find(id);
  if (!c) return res.status(404).json({ error: { code: "not_found", message: "Customer not found" } });
  const invoices = (
    await orders.where({ customerId: id, paymentMethod: "account", status: { $ne: "void" } }, { sort: { createdAt: -1, id: -1 } })
  ).map((o) => ({ id: o.id, number: o.number, date: o.createdAt, total: o.total, due: o.due, paid: o.paid }));
  const payments = await arPayments.where({ customerId: id }, { sort: { createdAt: -1, id: -1 } });
  return res.json({
    data: {
      customer: { id: c.id, name: c.name, number: c.number, account: c.account },
      balance: c.account.openDebt,
      invoices,
      payments,
    },
  });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await customers.remove(id);
  if (!ok) return res.status(404).json({ error: { code: "not_found", message: "Customer not found" } });
  return res.json({ data: { id, deleted: true } });
});

export default router;
