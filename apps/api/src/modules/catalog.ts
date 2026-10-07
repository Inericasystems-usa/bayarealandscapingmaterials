import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { guardWrites } from "../lib/auth.js";
import { bus } from "../lib/events.js";
import { recordAudit } from "./audit.js";
import { getAuthUser } from "./users.js";

/** A sellable product. The website renders these; the POS edits them. */
export interface Product extends Entity {
  name: string;
  category: string;
  subcategory: string;
  description: string;
  price: string;
  image: string;
  bulk?: string;
  bag?: string;
  wholesale?: string; // wholesale/dealer price; the register auto-applies it to wholesale customers
  active: boolean;
}

export const products = new Collection<Product>("catalog");

const upsertSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().default(""),
  description: z.string().default(""),
  price: z.string().default("Contact for pricing"),
  image: z.string().default(""),
  bulk: z.string().optional(),
  bag: z.string().optional(),
  wholesale: z.string().optional(),
  active: z.boolean().default(true),
});

const router = Router();
router.use(guardWrites("inventory")); // product GET is public (storefront); edits need inventory access

// Anonymous storefront visitors must not see the dealer/wholesale price or any
// unpublished product. Authenticated operators (POS/admin) see everything.
const stripWholesale = (p: Product): Product => {
  const { wholesale: _w, ...rest } = p;
  return rest as Product;
};

// List — supports ?category= and ?q= and ?active=
router.get("/", async (req, res) => {
  const { category, q, active } = req.query as Record<string, string | undefined>;
  const isOperator = Boolean(await getAuthUser(req));
  let list = await products.all();
  // Public callers always get active-only, regardless of ?active=all.
  if (active !== "all" || !isOperator) list = list.filter((p) => p.active);
  if (category) list = list.filter((p) => p.category === category);
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(needle) ||
        p.description.toLowerCase().includes(needle) ||
        p.category.toLowerCase().includes(needle),
    );
  }
  return res.json({ data: isOperator ? list : list.map(stripWholesale) });
});

router.get("/categories", async (_req, res) => {
  const list = await products.all();
  return res.json({ data: [...new Set(list.map((p) => p.category))] });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const product = await products.find(id);
  if (!product) return res.status(404).json({ error: { code: "not_found", message: "Product not found" } });
  const isOperator = Boolean(await getAuthUser(req));
  // Public callers can't see an unpublished product or its wholesale price.
  if (!isOperator) {
    if (!product.active) return res.status(404).json({ error: { code: "not_found", message: "Product not found" } });
    return res.json({ data: stripWholesale(product) });
  }
  return res.json({ data: product });
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const created = await products.insert({ id: newId("prod"), ...parsed.data });
  bus.emit("product.changed", { id: created.id });
  return res.status(201).json({ data: created });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const updated = await products.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Product not found" } });
  bus.emit("product.changed", { id });
  return res.json({ data: updated });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const existing = await products.find(id);
  const ok = await products.remove(id);
  if (!ok) return res.status(404).json({ error: { code: "not_found", message: "Product not found" } });
  bus.emit("product.deleted", { id });
  await recordAudit(req.authUser, "product.delete", `Deleted product ${existing?.name ?? id}`, { productId: id });
  return res.json({ data: { id, deleted: true } });
});

export default router;
