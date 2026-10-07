import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { guardWrites } from "../lib/auth.js";

/** A supplier the yard buys stock from. */
export interface Vendor extends Entity {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  terms: string;
  category: string;
  notes: string;
  active: boolean;
}

export const vendors = new Collection<Vendor>("vendors");

const upsertSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().default(""),
  email: z.string().email().or(z.literal("")).default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  terms: z.string().default("Net 30"),
  category: z.string().default("General"),
  notes: z.string().default(""),
  active: z.boolean().default(true),
});

const router = Router();
router.use(guardWrites("vendors"));
router.get("/", async (req, res) => {
  const { q } = req.query as Record<string, string | undefined>;
  let list = await vendors.all();
  if (q) {
    const needle = q.toLowerCase();
    list = list.filter(
      (v) => v.name.toLowerCase().includes(needle) || v.category.toLowerCase().includes(needle),
    );
  }
  return res.json({ data: list });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const vendor = await vendors.find(id);
  if (!vendor) return res.status(404).json({ error: { code: "not_found", message: "Vendor not found" } });
  return res.json({ data: vendor });
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const created = await vendors.insert({ id: newId("vend"), ...parsed.data });
  return res.status(201).json({ data: created });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const updated = await vendors.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Vendor not found" } });
  return res.json({ data: updated });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await vendors.remove(id);
  if (!ok) return res.status(404).json({ error: { code: "not_found", message: "Vendor not found" } });
  return res.json({ data: { id, deleted: true } });
});

export default router;
