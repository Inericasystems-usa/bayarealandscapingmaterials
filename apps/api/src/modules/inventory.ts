import { Router } from "express";
import { z } from "zod";
import { Collection, type Entity } from "../lib/store.js";
import { bus } from "../lib/events.js";
import { products } from "./catalog.js";
import { guardWrites } from "../lib/auth.js";
import { afterCommit } from "../lib/db.js";

/** One stock row per product. qtyOnHand is the source of truth for "in stock". */
export interface InventoryItem extends Entity {
  productId: string;
  sku: string;
  name: string;
  unit: string;
  qtyOnHand: number;
  reorderPoint: number;
  reorderQty: number;
  location: string;
  cost?: number; // unit cost (last cost from PO receiving) — drives COGS + valuation
}

export const inventory = new Collection<InventoryItem>("inventory");

function isLow(item: InventoryItem): boolean {
  return item.qtyOnHand <= item.reorderPoint;
}

/**
 * Mutate stock by a delta and publish domain events. Used by manual adjustments
 * and by purchase-order receiving. Crossing the reorder point emits inventory.low.
 */
export async function adjustStock(productId: string, delta: number): Promise<InventoryItem | null> {
  const item = await inventory.findBy((i) => i.productId === productId);
  if (!item) return null;
  const before = item.qtyOnHand;
  // Round to 2dp so fractional cubic-yard sales don't accrue float noise.
  const qtyOnHand = Math.max(0, Math.round((before + delta) * 100) / 100);
  const updated = await inventory.update(item.id, { qtyOnHand });
  if (!updated) return null;

  // Emit after any surrounding transaction commits, so notification writes don't
  // run on a transaction client that's about to be released.
  afterCommit(() =>
    bus.emit("inventory.changed", {
      productId,
      qtyOnHand,
      reorderPoint: updated.reorderPoint,
    }),
  );
  // Only alert on the transition into low stock (not on every decrement while low).
  if (isLow(updated) && before > updated.reorderPoint) {
    afterCommit(() =>
      bus.emit("inventory.low", {
        productId,
        sku: updated.sku,
        name: updated.name,
        qtyOnHand,
        reorderPoint: updated.reorderPoint,
      }),
    );
  }
  return updated;
}

const router = Router();
router.use(guardWrites("inventory"));
// List — ?lowStock=true for items at/under reorder point.
router.get("/", async (req, res) => {
  const { lowStock } = req.query as Record<string, string | undefined>;
  let list = await inventory.all();
  if (lowStock === "true") list = list.filter(isLow);
  return res.json({ data: list.map((i) => ({ ...i, low: isLow(i) })) });
});

router.get("/:productId", async (req, res) => {
  const { productId } = req.params as { productId: string };
  const item = await inventory.findBy((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: { code: "not_found", message: "No stock row" } });
  return res.json({ data: { ...item, low: isLow(item) } });
});

// Set absolute fields (reorder point / qty / etc.)
router.patch("/:productId", async (req, res) => {
  const { productId } = req.params as { productId: string };
  const parsed = z
    .object({
      sku: z.string().optional(), // barcode/SKU — set via CSV import or manual edit
      qtyOnHand: z.number().min(0).optional(),
      reorderPoint: z.number().min(0).optional(),
      reorderQty: z.number().min(0).optional(),
      location: z.string().optional(),
      cost: z.number().min(0).optional(),
      unit: z.string().min(1).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const item = await inventory.findBy((i) => i.productId === productId);
  if (!item) return res.status(404).json({ error: { code: "not_found", message: "No stock row" } });
  const updated = await inventory.update(item.id, parsed.data);
  if (updated) bus.emit("inventory.changed", { productId, qtyOnHand: updated.qtyOnHand, reorderPoint: updated.reorderPoint });
  return res.json({ data: updated });
});

// Relative adjustment (receive / sell / shrink) — emits events.
router.post("/:productId/adjust", async (req, res) => {
  const { productId } = req.params as { productId: string };
  const parsed = z.object({ delta: z.number(), reason: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const updated = await adjustStock(productId, parsed.data.delta);
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "No stock row" } });
  return res.json({ data: { ...updated, low: updated.qtyOnHand <= updated.reorderPoint } });
});

// Ensure a stock row exists for a product (called after creating a product).
router.post("/ensure/:productId", async (req, res) => {
  const { productId } = req.params as { productId: string };
  const existing = await inventory.findBy((i) => i.productId === productId);
  if (existing) return res.json({ data: existing });
  const product = await products.find(productId);
  if (!product) return res.status(404).json({ error: { code: "not_found", message: "Product not found" } });
  const created = await inventory.insert({
    productId,
    sku: product.id.toUpperCase().slice(0, 12),
    name: product.name,
    unit: "Cubic Yard",
    qtyOnHand: 0,
    reorderPoint: 5,
    reorderQty: 20,
    location: "Yard A",
  });
  bus.emit("inventory.changed", { productId, qtyOnHand: created.qtyOnHand, reorderPoint: created.reorderPoint });
  return res.status(201).json({ data: created });
});

export default router;
