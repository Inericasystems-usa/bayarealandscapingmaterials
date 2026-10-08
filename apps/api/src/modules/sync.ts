import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { guardAll } from "../lib/auth.js";
import { safeEqual } from "../lib/crypto.js";
import { jobs } from "../lib/jobs.js";
import { getSettings, updateSettings } from "./settings.js";
import { products, type Product } from "./catalog.js";
import { inventory, type InventoryItem } from "./inventory.js";
import { orders, type Order } from "./orders.js";
import { leads, type StoredLead } from "./leads/store.js";
import { bus } from "../lib/events.js";

/**
 * Website sync. Inerica POS is the MASTER of the catalog + stock; it pushes to
 * the client's website API. Two halves:
 *   - integrationRoutes (POS side, /api/v1/integration): "Test connection" and
 *     "Sync now" — pushes local products + inventory to the configured website.
 *   - syncReceiverRoutes (website side, /api/v1/sync): the reference contract a
 *     website exposes to RECEIVE a push (upsert). Any site — WooCommerce/Shopify/
 *     custom — implements this endpoint (or an adapter). Token-gated + public.
 */

// ── POS → website connector ───────────────────────────────────────────
const router = Router();
router.use(guardAll("settings")); // integration config is manager/admin territory

router.post("/website/test", async (_req, res) => {
  const { website } = await getSettings();
  if (!website?.url) return res.json({ data: { ok: false, error: "No website URL configured." } });
  try {
    const resp = await fetch(`${website.url.replace(/\/$/, "")}/health`, { method: "GET" });
    return res.json({ data: { ok: resp.ok, status: resp.status } });
  } catch (e) {
    return res.json({ data: { ok: false, error: (e as Error).message } });
  }
});

router.post("/website/sync", async (_req, res) => {
  const cfg = await getSettings();
  const website = cfg.website;
  if (!website?.url) return res.status(400).json({ error: { code: "not_configured", message: "Set the website URL first." } });
  const prods = await products.all();
  const inv = await inventory.all();
  try {
    const resp = await fetch(`${website.url.replace(/\/$/, "")}/api/v1/sync/catalog`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-inerica-token": website.apiToken },
      body: JSON.stringify({ products: prods, inventory: inv }),
    });
    if (!resp.ok) return res.status(502).json({ error: { code: "sync_failed", message: `Website responded ${resp.status}` } });
    const at = new Date().toISOString();
    await updateSettings({ website: { ...website, lastSyncAt: at } });
    return res.json({ data: { pushed: { products: prods.length, inventory: inv.length }, at } });
  } catch (e) {
    return res.status(502).json({ error: { code: "unreachable", message: (e as Error).message } });
  }
});

// Pull website orders + leads INTO the POS (to fulfill them).
router.post("/website/pull", async (_req, res) => {
  try {
    return res.json({ data: { pulled: await pullFromWebsite() } });
  } catch (e) {
    return res.status(502).json({ error: { code: "pull_failed", message: (e as Error).message } });
  }
});

export default router;

// ── Auto-sync on change: debounced delta push ────────────────────────
const dirtyProducts = new Set<string>();
const dirtyInventory = new Set<string>();
const deletedProducts = new Set<string>();
let flushTimer: NodeJS.Timeout | null = null;

async function flushDelta(log: (m: string) => void): Promise<void> {
  flushTimer = null;
  const { website } = await getSettings();
  const clear = () => { dirtyProducts.clear(); dirtyInventory.clear(); deletedProducts.clear(); };
  if (!website?.enabled || !website.url) return clear();

  const productIds = [...dirtyProducts];
  const invIds = [...dirtyInventory];
  const deletedProductIds = [...deletedProducts];
  clear();

  const prods = (await Promise.all(productIds.map((id) => products.find(id)))).filter((p): p is Product => p !== null);
  const inv = (await Promise.all(invIds.map((pid) => inventory.findBy((x) => x.productId === pid)))).filter((i): i is InventoryItem => i !== null);
  if (!prods.length && !inv.length && !deletedProductIds.length) return;

  try {
    const resp = await fetch(`${website.url.replace(/\/$/, "")}/api/v1/sync/catalog`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-inerica-token": website.apiToken },
      body: JSON.stringify({ products: prods, inventory: inv, deletedProductIds }),
    });
    if (resp.ok) {
      await updateSettings({ website: { ...website, lastSyncAt: new Date().toISOString() } });
      log(`auto-synced ${prods.length} products / ${inv.length} stock / ${deletedProductIds.length} deletes → website`);
    } else {
      log(`auto-sync failed: website responded ${resp.status}`);
    }
  } catch (e) {
    log(`auto-sync failed: ${(e as Error).message}`);
  }
}

function scheduleFlush(log: (m: string) => void): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => void flushDelta(log), 2500); // batch rapid edits
  flushTimer.unref?.();
}

/** Subscribe to catalog/stock changes and push deltas to the website. */
export function registerWebsiteSync(log: (m: string) => void): void {
  bus.on("product.changed", ({ id }) => { dirtyProducts.add(id); scheduleFlush(log); });
  bus.on("product.deleted", ({ id }) => { deletedProducts.add(id); dirtyProducts.delete(id); scheduleFlush(log); });
  bus.on("inventory.changed", ({ productId }) => { dirtyInventory.add(productId); scheduleFlush(log); });
}

// ── Pull-back: website orders + leads → POS ───────────────────────────
async function pullFromWebsite(): Promise<{ orders: number; leads: number; at: string }> {
  const { website } = await getSettings();
  if (!website?.url) throw new Error("No website URL configured");
  // Capture the watermark BEFORE fetching so anything created mid-pull is caught next time.
  const at = new Date().toISOString();
  const base = website.url.replace(/\/$/, "");
  const headers = { "x-inerica-token": website.apiToken };
  const since = encodeURIComponent(website.lastPullAt ?? "");
  const [ordersRes, leadsRes] = await Promise.all([
    fetch(`${base}/api/v1/sync/orders?since=${since}`, { headers }),
    fetch(`${base}/api/v1/sync/leads?since=${since}`, { headers }),
  ]);
  if (!ordersRes.ok || !leadsRes.ok) throw new Error(`website responded ${ordersRes.status}/${leadsRes.status}`);
  const pulledOrders = ((await ordersRes.json()) as { data?: Order[] }).data ?? [];
  const pulledLeads = ((await leadsRes.json()) as { data?: StoredLead[] }).data ?? [];

  for (const o of pulledOrders) {
    if (!o?.id) continue;
    if (await orders.find(o.id)) await orders.update(o.id, o);
    else { await orders.insert(o); await orders.update(o.id, { createdAt: o.createdAt }); } // preserve original date
  }
  for (const l of pulledLeads) {
    if (!l?.id) continue;
    if (await leads.find(l.id)) await leads.update(l.id, l);
    else { await leads.insert(l); await leads.update(l.id, { createdAt: l.createdAt }); }
  }
  await updateSettings({ website: { ...website, lastPullAt: at } });
  return { orders: pulledOrders.length, leads: pulledLeads.length, at };
}

/** Background poller — pulls new website orders + leads on an interval. */
export function startWebsitePull(log: (m: string) => void): void {
  jobs.start({
    name: "website-pull",
    everyMs: 30_000,
    run: async () => {
      const { website } = await getSettings();
      if (!website?.enabled || !website.url) return;
      const r = await pullFromWebsite(); // a failure is logged and retried by the runner
      if (r.orders || r.leads) log(`pulled ${r.orders} orders / ${r.leads} leads ← website`);
    },
  });
  log("website pull polling every 30s");
}

// ── Website receiver (reference contract) ─────────────────────────────
const catalogSchema = z.object({
  products: z.array(z.record(z.unknown())).default([]),
  inventory: z.array(z.record(z.unknown())).default([]),
  deletedProductIds: z.array(z.string()).default([]),
});

async function badToken(req: Request): Promise<boolean> {
  const expected = (await getSettings()).website?.apiToken;
  const got = req.headers["x-inerica-token"];
  return !expected || typeof got !== "string" || !safeEqual(got, expected);
}

export const syncReceiverRoutes = Router();

syncReceiverRoutes.post("/catalog", async (req, res) => {
  if (await badToken(req)) return res.status(401).json({ error: { code: "unauthorized", message: "Bad sync token" } });

  const parsed = catalogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });

  let productsUpserted = 0;
  for (const raw of parsed.data.products) {
    const p = raw as unknown as Product;
    if (!p.id) continue;
    if (await products.find(p.id)) await products.update(p.id, p);
    else await products.insert(p);
    productsUpserted++;
  }
  let inventoryUpserted = 0;
  for (const raw of parsed.data.inventory) {
    const it = raw as unknown as InventoryItem;
    if (!it.productId) continue;
    const existing = await inventory.findBy((x) => x.productId === it.productId);
    if (existing) await inventory.update(existing.id, it);
    else await inventory.insert(it);
    inventoryUpserted++;
  }
  let deleted = 0;
  for (const id of parsed.data.deletedProductIds) {
    const inv = await inventory.findBy((x) => x.productId === id);
    if (inv) await inventory.remove(inv.id);
    if (await products.find(id)) {
      await products.remove(id);
      deleted++;
    }
  }
  return res.json({ data: { productsUpserted, inventoryUpserted, deleted } });
});

// Pull-back sources: the POS GETs orders + leads created since ?since.
syncReceiverRoutes.get("/orders", async (req, res) => {
  if (await badToken(req)) return res.status(401).json({ error: { code: "unauthorized", message: "Bad sync token" } });
  const since = (req.query as { since?: string }).since ?? "";
  return res.json({ data: (await orders.all()).filter((o) => o.createdAt > since) });
});

syncReceiverRoutes.get("/leads", async (req, res) => {
  if (await badToken(req)) return res.status(401).json({ error: { code: "unauthorized", message: "Bad sync token" } });
  const since = (req.query as { since?: string }).since ?? "";
  return res.json({ data: (await leads.all()).filter((l) => l.createdAt > since) });
});
