import { Router } from "express";
import { z } from "zod";
import { Collection, type Entity } from "../lib/store.js";
import { guardWrites } from "../lib/auth.js";
import { products } from "./catalog.js";

/**
 * Product taxonomy — the editable master lists of categories and units of
 * measure used by the inventory/product forms and bulk edit. Stored as a single
 * document; categories are merged with whatever is actually in use so nothing is
 * ever missing from the picker.
 */
interface Taxonomy extends Entity {
  categories: string[];
  units: string[];
}
const store = new Collection<Taxonomy>("taxonomy");
const ID = "default";
const DEFAULT_UNITS = ["Each", "Cubic Yard", "Bag", "Pallet", "Ton", "Bundle", "Piece", "Box", "Roll", "Linear Foot"];

const clean = (arr: string[]) => [...new Set(arr.map((s) => s.trim()).filter(Boolean))];

async function readTaxonomy(): Promise<Taxonomy> {
  let t = await store.find(ID);
  if (!t) {
    const cats = clean((await products.all()).map((p) => p.category));
    t = await store.insert({ id: ID, categories: cats.sort(), units: DEFAULT_UNITS });
  }
  // Always surface categories that are actually in use, even if not saved yet.
  const used = clean((await products.all()).map((p) => p.category));
  const categories = clean([...t.categories, ...used]).sort();
  return { ...t, categories };
}

const router = Router();
router.use(guardWrites("inventory")); // reads for any staff; edits need inventory access

router.get("/", async (_req, res) => res.json({ data: await readTaxonomy() }));

router.put("/", async (req, res) => {
  const parsed = z
    .object({ categories: z.array(z.string()).optional(), units: z.array(z.string()).optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const cur = await readTaxonomy();
  const updated = await store.update(ID, {
    categories: parsed.data.categories ? clean(parsed.data.categories).sort() : cur.categories,
    units: parsed.data.units ? clean(parsed.data.units) : cur.units,
  });
  return res.json({ data: updated });
});

export default router;
