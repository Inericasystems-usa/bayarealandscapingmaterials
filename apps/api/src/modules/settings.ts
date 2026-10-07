import { Router } from "express";
import { z } from "zod";
import { Collection, type Entity } from "../lib/store.js";
import { requireRole } from "../lib/auth.js";
import { encryptField, decryptField } from "../lib/encryption.js";
import { recordAudit } from "./audit.js";

/**
 * Single store-configuration document (tenant identity + tax + payments +
 * delivery fees). Everything that used to be a magic constant lives here so
 * the register, orders, and reports read one source of truth.
 */
export interface Settings extends Entity {
  storeName: string;
  slug: string;
  adminEmail: string;
  tenantId: string;
  stripeCustomerId: string;
  registerWorkstationId: string;
  address: { street: string; city: string; county: string; state: string; postalCode: string };
  tax: { rate: number; jurisdiction: string; basis: "point_of_possession" | "origin"; accounting: "accrual" | "cash" };
  paymentMethods: string[];
  deliveryFeeTiers: { label: string; maxMiles: number; fee: number }[];
  currency: string;
  logoUrl: string; // shown on receipts + customer display
  receiptFooter: string; // free-text footer printed at the bottom of receipts
  loyalty: { enabled: boolean; earnPerDollar: number; redeemPointsPerDollar: number };
  // Inerica POS is the master; it pushes catalog/inventory to the client's
  // website API. `url` is the site's API base, `apiToken` the shared secret.
  website: { url: string; apiToken: string; enabled: boolean; lastSyncAt: string | null; lastPullAt: string | null };
  onboardingComplete: boolean; // false on a fresh install → shows the setup wizard
}

export const settings = new Collection<Settings>("settings");
const STORE_ID = "store";

export const DEFAULT_SETTINGS: Settings = {
  id: STORE_ID,
  storeName: "Bay Area Landscaping Materials",
  slug: "bay-area-landscaping-materials",
  adminEmail: "Helpdesk@bayarealandscapingmaterials.com",
  tenantId: "8c164b86-8f9f-490a-9d42-5dce1e0bc4ca",
  stripeCustomerId: "cus_UgBNNVyzRXG3gX",
  registerWorkstationId: "ed5f861f-cb92-469e-a569-ec3b956db38f",
  address: { street: "400 W Gertrude Ave", city: "Richmond", county: "Contra Costa County", state: "CA", postalCode: "94801" },
  tax: { rate: 0.0975, jurisdiction: "Contra Costa County · Richmond, CA", basis: "point_of_possession", accounting: "accrual" },
  paymentMethods: ["cash", "card", "account"],
  deliveryFeeTiers: [
    { label: "EPA Surcharge 1 (0–25 mi)", maxMiles: 25, fee: 65 },
    { label: "EPA Surcharge 2 (26–52 mi)", maxMiles: 52, fee: 95 },
  ],
  currency: "USD",
  logoUrl: "",
  receiptFooter: "Thank you for your business!",
  loyalty: { enabled: false, earnPerDollar: 1, redeemPointsPerDollar: 100 },
  website: { url: "", apiToken: "", enabled: false, lastSyncAt: null, lastPullAt: null },
  onboardingComplete: false,
  createdAt: "",
  updatedAt: "",
};

// The website sync token is a secret; encrypt it at rest and decrypt on read so
// callers (sender, receiver, UI) always see plaintext while storage stays sealed.
function decryptSettings(s: Settings): Settings {
  if (!s.website?.apiToken) return s;
  return { ...s, website: { ...s.website, apiToken: decryptField(s.website.apiToken) } };
}

/** Read the live settings doc (seeded on first access), sensitive fields decrypted. */
export async function getSettings(): Promise<Settings> {
  const existing = await settings.find(STORE_ID);
  if (existing) return decryptSettings(existing);
  const now = new Date().toISOString();
  await settings.seedIfEmpty([{ ...DEFAULT_SETTINGS, createdAt: now, updatedAt: now }]);
  return decryptSettings((await settings.find(STORE_ID)) ?? DEFAULT_SETTINGS);
}

/**
 * Update the store settings doc, encrypting sensitive fields at rest. Every
 * write path (settings PATCH, sync watermarks) goes through here so the token is
 * never persisted in the clear. Returns the updated doc, decrypted.
 */
export async function updateSettings(patch: Partial<Settings>): Promise<Settings | null> {
  const toStore =
    patch.website?.apiToken !== undefined
      ? { ...patch, website: { ...patch.website, apiToken: encryptField(patch.website.apiToken) } }
      : patch;
  const updated = await settings.update(STORE_ID, toStore);
  return updated ? decryptSettings(updated) : null;
}

export async function taxRate(): Promise<number> {
  return (await getSettings()).tax.rate;
}

// The HTTP GET is consumed by the browser (any authenticated role — the POS
// needs tax/store info), so the website sync token must NEVER go over it. Mask
// it: the admin UI only needs to know whether one is configured, not its value.
// Internal callers (sync sender/receiver) use getSettings() directly, unmasked.
function redactSettings(s: Settings): Settings & { website: Settings["website"] & { configured: boolean } } {
  const configured = Boolean(s.website?.apiToken);
  return {
    ...s,
    website: { ...s.website, apiToken: configured ? "••••••••" : "", configured },
  };
}

const router = Router();

router.get("/", async (_req, res) => res.json({ data: redactSettings(await getSettings()) }));

router.patch("/", async (req, res) => {
  if (!requireRole(req, res, "admin", "manager")) return; // tax/store identity = managers only
  await getSettings(); // ensure seeded
  const parsed = z
    .object({
      storeName: z.string().optional(),
      adminEmail: z.string().optional(),
      address: z.object({ street: z.string(), city: z.string(), county: z.string(), state: z.string(), postalCode: z.string() }).partial().optional(),
      tax: z.object({ rate: z.number().min(0).max(1), jurisdiction: z.string(), basis: z.enum(["point_of_possession", "origin"]), accounting: z.enum(["accrual", "cash"]) }).partial().optional(),
      paymentMethods: z.array(z.string()).optional(),
      deliveryFeeTiers: z.array(z.object({ label: z.string(), maxMiles: z.number(), fee: z.number() })).optional(),
      logoUrl: z.string().optional(),
      receiptFooter: z.string().optional(),
      loyalty: z.object({ enabled: z.boolean(), earnPerDollar: z.number().min(0), redeemPointsPerDollar: z.number().min(1) }).partial().optional(),
      website: z.object({ url: z.string(), apiToken: z.string(), enabled: z.boolean(), lastSyncAt: z.string().nullable(), lastPullAt: z.string().nullable() }).partial().optional(),
      onboardingComplete: z.boolean().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const cur = await getSettings();
  // The GET masks the sync token, so the UI may echo the mask back — never
  // overwrite the real token with the placeholder. Only accept a genuine new token.
  const incomingWebsite = parsed.data.website ? { ...parsed.data.website } : undefined;
  if (incomingWebsite && (incomingWebsite.apiToken === undefined || /^[•*]+$/.test(incomingWebsite.apiToken ?? "")))
    delete incomingWebsite.apiToken;
  const patch = {
    ...parsed.data,
    address: parsed.data.address ? { ...cur.address, ...parsed.data.address } : undefined,
    tax: parsed.data.tax ? { ...cur.tax, ...parsed.data.tax } : undefined,
    loyalty: parsed.data.loyalty ? { ...(cur.loyalty ?? DEFAULT_SETTINGS.loyalty), ...parsed.data.loyalty } : undefined,
    website: incomingWebsite ? { ...(cur.website ?? DEFAULT_SETTINGS.website), ...incomingWebsite } : undefined,
  };
  const updated = await updateSettings(patch as Partial<Settings>);
  await recordAudit(req.authUser, "settings.update", `Updated store settings (${Object.keys(parsed.data).join(", ")})`, { keys: Object.keys(parsed.data) });
  return res.json({ data: updated ? redactSettings(updated) : null });
});

export default router;
