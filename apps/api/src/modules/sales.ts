import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { adjustStock, inventory } from "./inventory.js";
import { guardWrites } from "../lib/auth.js";
import { computeLineTotal, computeOrderTotals } from "@balm/lib-domain";
import { withTransaction } from "../lib/db.js";

/**
 * A completed sale. Recording a sale is the seam that "closes the loop":
 * each line decrements inventory by its base-unit quantity (e.g. a "½ truck"
 * line of bulk gravel removes 5 cubic yards on hand). adjustStock emits
 * inventory.low when a sale pushes an item under its reorder point, so the
 * register and the notification bell stay in sync automatically.
 */
export interface SaleLine {
  productId: string;
  name: string;
  unitLabel: string; // e.g. "10 cu yd · full truck", "Bag"
  qty: number; // quantity in the inventory base unit (cubic yards, bags, each)
  unitPrice: number; // price per base unit
  lineTotal: number;
}

export interface Sale extends Entity {
  number: string;
  lines: SaleLine[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  customer: string;
  paymentMethod: string;
}

export const sales = new Collection<Sale>("sales");

const lineSchema = z.object({
  productId: z.string(),
  name: z.string(),
  unitLabel: z.string(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0),
  // Explicit total from the register (honors sub-yard handling fees). When
  // omitted we fall back to qty * unitPrice.
  lineTotal: z.number().min(0).optional(),
});

const router = Router();
router.use(guardWrites("register"));
router.get("/", async (_req, res) => {
    const list = await sales.all();
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json({ data: list });
  });

  router.get("/:id", async (req, res) => {
    const { id } = req.params as { id: string };
    const sale = await sales.find(id);
    if (!sale) return res.status(404).json({ error: { code: "not_found", message: "Sale not found" } });
    return res.json({ data: sale });
  });

  router.post("/", async (req, res) => {
    const parsed = z
      .object({
        lines: z.array(lineSchema).min(1),
        taxRate: z.number().min(0).default(0.0925),
        customer: z.string().default("Walk-in"),
        paymentMethod: z.string().default("card"),
      })
      .safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });

    // Guard against overselling: every line must have enough on hand.
    for (const line of parsed.data.lines) {
      const stock = await inventory.findBy((i) => i.productId === line.productId);
      if (!stock) return res.status(400).json({ error: { code: "no_stock_row", message: `No inventory for ${line.name}` } });
      if (stock.qtyOnHand < line.qty) {
        return res.status(409).json({
          error: { code: "insufficient_stock", message: `Only ${stock.qtyOnHand} ${stock.unit} of ${line.name} on hand` },
        });
      }
    }

    const lines: SaleLine[] = parsed.data.lines.map((l) => {
      const { lineTotal: _lt, ...rest } = l;
      return { ...rest, lineTotal: computeLineTotal(l) };
    });
    const { subtotal, tax, total } = computeOrderTotals({ lines, taxRate: parsed.data.taxRate });

    const count = (await sales.count()) + 1001;
    // Atomic: stock decrements + the sale row commit together.
    const sale = await withTransaction(async () => {
      for (const line of lines) await adjustStock(line.productId, -line.qty);
      return sales.insert({
        id: newId("sale"),
        number: `S-${count}`,
        lines,
        subtotal,
        taxRate: parsed.data.taxRate,
        tax,
        total,
        customer: parsed.data.customer,
        paymentMethod: parsed.data.paymentMethod,
      });
    });
    return res.status(201).json({ data: sale });
  });

export default router;
