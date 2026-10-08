import mongoose, { Schema } from "mongoose";
import { defineModel } from "./base.js";

/**
 * Typed Mongoose schema + model per collection — one declaration each. Scalar
 * fields are typed explicitly; genuinely dynamic sub-objects / arrays-of-objects
 * (an order's `lines`, a customer's `account`, a delivery's `pod`, the settings
 * `website`/`tax` blocks, …) use `Mixed` so they round-trip losslessly while the
 * top-level shape stays declared and indexed.
 *
 * Importing this module registers every model with Mongoose. `lib/db.ts` imports
 * it during `initDb()` (before any query runs) and syncs indexes.
 */

const M = Schema.Types.Mixed;

// ── Catalog & inventory ───────────────────────────────────────────────
defineModel(
  "catalog",
  {
    name: String, category: String, subcategory: String, description: String,
    price: String, image: String, bulk: String, bag: String, wholesale: String,
    active: Boolean,
  },
  [{ category: 1 }, { active: 1 }],
);

defineModel(
  "inventory",
  {
    productId: String, sku: String, name: String, unit: String,
    qtyOnHand: Number, reorderPoint: Number, reorderQty: Number, location: String, cost: Number,
  },
  [{ productId: 1 }],
);

defineModel("taxonomy", { categories: [String], units: [String] });

// ── Customers & A/R ───────────────────────────────────────────────────
defineModel(
  "customers",
  {
    number: String, name: String, phone: String, email: String, type: String,
    account: M, billingAddress: String, deliveryAddress: String, portalAccess: Boolean, notes: String,
  },
  [{ number: 1 }, { type: 1 }],
);

defineModel(
  "ar_payments",
  { customerId: String, amount: Number, note: String, applied: [M], credited: Number },
  [{ customerId: 1 }],
);

// ── Orders, sales, payments ───────────────────────────────────────────
defineModel(
  "orders",
  {
    number: String, clientId: String, customerId: String, customerName: String,
    type: String, status: String, location: String, lines: [M],
    subtotal: Number, discount: Number, taxRate: Number, tax: Number, total: Number,
    paymentMethod: String, paid: Boolean, due: Number, registerSessionId: String,
  },
  [{ status: 1 }, { customerId: 1 }, { type: 1 }, { clientId: 1 }, { paymentMethod: 1 }],
);

defineModel("sales", {
  number: String, lines: [M], subtotal: Number, taxRate: Number, tax: Number,
  total: Number, customer: String, paymentMethod: String,
});

defineModel(
  "payments",
  {
    amount: Number, method: String, provider: String, status: String, reference: String,
    saleId: String, authCode: String, cardBrand: String, last4: String, entryMode: String,
  },
  [{ saleId: 1 }, { status: 1 }],
);

// ── Purchasing & vendors ──────────────────────────────────────────────
defineModel(
  "purchase-orders",
  {
    number: String, vendorId: String, vendorName: String, status: String,
    lines: [M], notes: String, orderedAt: String, receivedAt: String,
  },
  [{ status: 1 }, { vendorId: 1 }],
);

defineModel(
  "vendors",
  {
    name: String, contactName: String, email: String, phone: String,
    address: String, terms: String, category: String, notes: String, active: Boolean,
  },
  [{ category: 1 }, { active: 1 }],
);

// ── Fleet & deliveries ────────────────────────────────────────────────
defineModel(
  "trucks",
  {
    number: String, type: String, capacityCyd: Number, plate: String, status: String,
    driverId: String, driverName: String, lat: Number, lng: Number, speed: Number,
    heading: Number, deviceId: String, lastSeen: String, notes: String,
  },
  [{ status: 1 }],
);

defineModel("drivers", { name: String, phone: String, license: String, status: String, notes: String }, [{ status: 1 }]);

defineModel(
  "deliveries",
  {
    code: String, customer: String, address: String, window: String, items: String, phone: String,
    status: String, stage: String, stageHistory: [M], truckId: String, truckNumber: String,
    driverId: String, driverName: String, pod: M,
  },
  [{ status: 1 }, { driverId: 1 }, { truckId: 1 }],
);

// ── Users, sessions, register, timeclock ──────────────────────────────
defineModel(
  "users",
  {
    name: String, email: String, role: String, phone: String,
    pinHash: String, passwordHash: String, active: Boolean, permissions: M,
  },
  [{ email: 1 }],
);

// Sessions keep only a hash of the token (modules/users.ts).
defineModel(
  "sessions",
  { tokenHash: String, userId: String, expiresAt: String, lastSeenAt: String },
  [{ tokenHash: 1 }, { userId: 1 }],
);

// Sign-in attempts per account (keyed by a hash of the address) and any lockout.
defineModel("login_failures", { count: Number, base: Number, lockedUntil: String });

defineModel(
  "register-sessions",
  {
    number: String, workstationId: String, userId: String, userName: String, status: String,
    openedAt: String, closedAt: String, openingFloat: Number, cashSales: Number, cardSales: Number,
    accountSales: Number, orderCount: Number, expectedCash: Number, countedCash: Number,
    variance: Number, note: String,
  },
  [{ status: 1 }, { userId: 1 }],
);

defineModel(
  "shifts",
  {
    userId: String, userName: String, clockIn: String, clockOut: String, breaks: [M],
    status: String, spanMinutes: Number, paidBreakMinutes: Number, unpaidBreakMinutes: Number, paidMinutes: Number,
  },
  [{ userId: 1 }, { status: 1 }],
);

// ── Messaging ─────────────────────────────────────────────────────────
defineModel(
  "messages",
  {
    direction: String, threadKey: String, to: String, from: String, customerId: String,
    customerName: String, body: String, status: String, providerId: String, trigger: String,
    simulated: Boolean, read: Boolean, error: String,
  },
  [{ threadKey: 1 }, { providerId: 1 }, { status: 1 }],
);

defineModel("message_templates", { key: String, label: String, body: String, enabled: Boolean, delayMinutes: Number }, [{ key: 1 }]);

defineModel("message_optouts", { phone: String, reason: String }, [{ phone: 1 }]);

defineModel(
  "message_consents",
  {
    phone: String, customerId: String, customerName: String, channel: String, disclosure: String,
    status: String, collectedByUserId: String, collectedByName: String, note: String, revokedAt: String,
  },
  [{ phone: 1 }],
);

defineModel(
  "scheduled_broadcasts",
  {
    body: String, recipients: [M], scheduledFor: String, status: String,
    createdByUserId: String, createdByName: String, result: M, sentAt: String,
  },
  [{ status: 1 }, { scheduledFor: 1 }],
);

// ── Misc: notifications, leads, audit, settings, uploads ──────────────
defineModel("notifications", { type: String, title: String, body: String, refId: String, read: Boolean }, [{ read: 1 }, { type: 1 }]);

// Attribution + conversion-matching fields are declared TOP-LEVEL (not inside
// `payload`) so they can be indexed and queried by the offline-conversion export.
// All nullable/absent on existing rows — this is purely additive, no migration.
defineModel(
  "leads",
  {
    type: String, receivedAt: String, ip: String, userAgent: String, payload: M,
    // First touch, as the website kept it (localStorage, only with advertising consent).
    gclid: String, gbraid: String, wbraid: String, msclkid: String, fbclid: String,
    utm_source: String, utm_medium: String, utm_campaign: String,
    utm_term: String, utm_content: String,
    landing_page: String, referrer: String, attributed_at: String,
    // SHA-256 of the NORMALIZED email/phone — for Google conversion matching.
    // Lowercase hex, 64 chars. The raw values live only in `payload`.
    email_sha256: String, phone_sha256: String,
    // Real invoiced revenue (excluding tax) this lead produced, written when
    // its order actually reached a fulfilled status. Absent = no revenue yet.
    invoiced_value: Number, invoiced_at: String,
    invoiced_order_id: String, invoiced_order_number: String,
    // Idempotency guard for the Google Ads offline conversion upload: set once,
    // never re-sent. Null/absent = not yet uploaded.
    conversion_uploaded_at: String,
  },
  [
    { type: 1 },
    { gclid: 1 },
    { phone_sha256: 1 },
    // The offline export's exact query: has revenue, not yet uploaded.
    { invoiced_value: 1, conversion_uploaded_at: 1 },
  ],
);

defineModel(
  "audit",
  { at: String, userId: String, userName: String, role: String, action: String, summary: String, meta: M },
  [{ at: 1 }, { action: 1 }],
);

defineModel("settings", {
  storeName: String, slug: String, adminEmail: String, tenantId: String, stripeCustomerId: String,
  registerWorkstationId: String, address: M, tax: M, paymentMethods: [String], deliveryFeeTiers: [M],
  currency: String, logoUrl: String, receiptFooter: String, loyalty: M, website: M, onboardingComplete: Boolean,
});

defineModel("uploads", { contentType: String, base64: String });

/** Build all declared indexes. Called once from initDb() after connecting. */
export async function syncAllIndexes(): Promise<void> {
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes().catch(() => undefined)));
}
