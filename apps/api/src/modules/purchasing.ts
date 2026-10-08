import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { bus } from "../lib/events.js";
import { adjustStock, inventory } from "./inventory.js";
import { vendors } from "./vendors.js";
import { guardWrites } from "../lib/auth.js";
import { withTransaction } from "../lib/db.js";

export type POStatus = "draft" | "ordered" | "received" | "cancelled";

export interface POLine {
  productId: string;
  name: string;
  qty: number;
  unitCost: number;
}

/** A purchase order placed with a vendor to refill inventory. */
export interface PurchaseOrder extends Entity {
  number: string;
  vendorId: string;
  vendorName: string;
  status: POStatus;
  lines: POLine[];
  notes: string;
  orderedAt: string | null;
  receivedAt: string | null;
}

export const purchaseOrders = new Collection<PurchaseOrder>("purchase-orders");

const lineSchema = z.object({
  productId: z.string(),
  name: z.string(),
  qty: z.number().int().min(1),
  unitCost: z.number().min(0).default(0),
});

const total = (po: PurchaseOrder) => po.lines.reduce((s, l) => s + l.qty * l.unitCost, 0);

const router = Router();
router.use(guardWrites("purchasing"));
router.get("/", async (req, res) => {
    const { status } = req.query as Record<string, string | undefined>;
    const list = await purchaseOrders.where(status ? { status } : {}, { sort: { createdAt: -1, id: -1 } });
    return res.json({ data: list.map((po) => ({ ...po, total: total(po) })) });
  });

  router.get("/:id", async (req, res) => {
    const { id } = req.params as { id: string };
    const po = await purchaseOrders.find(id);
    if (!po) return res.status(404).json({ error: { code: "not_found", message: "PO not found" } });
    return res.json({ data: { ...po, total: total(po) } });
  });

  router.post("/", async (req, res) => {
    const parsed = z
      .object({
        vendorId: z.string(),
        lines: z.array(lineSchema).min(1),
        notes: z.string().default(""),
        status: z.enum(["draft", "ordered"]).default("ordered"),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });

    const vendor = await vendors.find(parsed.data.vendorId);
    if (!vendor) return res.status(400).json({ error: { code: "invalid", message: "Unknown vendor" } });

    const count = (await purchaseOrders.count()) + 1001;
    const created = await purchaseOrders.insert({
      id: newId("po"),
      number: `PO-${count}`,
      vendorId: vendor.id,
      vendorName: vendor.name,
      status: parsed.data.status,
      lines: parsed.data.lines,
      notes: parsed.data.notes,
      orderedAt: parsed.data.status === "ordered" ? new Date().toISOString() : null,
      receivedAt: null,
    });
    return res.status(201).json({ data: { ...created, total: total(created) } });
  });

  router.patch("/:id", async (req, res) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ status: z.enum(["draft", "ordered", "cancelled"]).optional(), notes: z.string().optional() })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
    const patch: Partial<PurchaseOrder> = { ...parsed.data };
    if (parsed.data.status === "ordered") patch.orderedAt = new Date().toISOString();
    const updated = await purchaseOrders.update(id, patch);
    if (!updated) return res.status(404).json({ error: { code: "not_found", message: "PO not found" } });
    return res.json({ data: { ...updated, total: total(updated) } });
  });

  // Receive — increments inventory for every line, then flips status to received.
  router.post("/:id/receive", async (req, res) => {
    const { id } = req.params as { id: string };
    const po = await purchaseOrders.find(id);
    if (!po) return res.status(404).json({ error: { code: "not_found", message: "PO not found" } });
    if (po.status === "received")
      return res.status(409).json({ error: { code: "already_received", message: "PO already received" } });
    // A cancelled PO must never be received — that would add phantom stock for
    // goods that were never ordered or delivered.
    if (po.status === "cancelled")
      return res.status(409).json({ error: { code: "cancelled", message: "Cannot receive a cancelled PO." } });

    // Atomic: every stock increment + the PO status flip commit together.
    const updated = await withTransaction(async () => {
      for (const line of po.lines) {
        await adjustStock(line.productId, line.qty);
        // Capture last cost for COGS + inventory valuation.
        if (line.unitCost > 0) {
          const item = await inventory.findOne({ productId: line.productId });
          if (item) await inventory.update(item.id, { cost: line.unitCost });
        }
      }
      return purchaseOrders.update(id, { status: "received", receivedAt: new Date().toISOString() });
    });
    bus.emit("po.received", {
      poId: po.id,
      number: po.number,
      vendorName: po.vendorName,
      lineCount: po.lines.length,
    });
    return res.json({ data: { ...updated!, total: total(updated!) } });
  });

export default router;
