/**
 * Typed client for the BALM API (single source of truth shared by the public
 * site and the POS). Both apps talk to the same service, so a product edited in
 * the POS is the product the website renders.
 */

// API origin. An explicit NEXT_PUBLIC_API_URL always wins. Otherwise, in the
// browser, call the API on the SAME host that served the page (so it works from
// localhost AND from another device on the LAN at http://<host>:4000 with no
// per-IP config); on the server (SSR) fall back to localhost.
import { setReachable } from "./offline";

const BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" ? `${window.location.protocol}//${window.location.hostname}:4000` : "http://localhost:4000");
const V1 = `${BASE}/api/v1`;

// ── Session ──────────────────────────────────────────────────────────
// The session lives in an HttpOnly cookie set by the API, so an XSS can't read
// it from JS. We keep an in-memory token copy only for the current page session
// (never localStorage); on refresh the cookie re-authenticates via me().
let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

// Read the JS-readable double-submit CSRF cookie to echo on mutations.
function csrfToken(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)balm_csrf=([^;]+)/);
  return m?.[1] ? decodeURIComponent(m[1]) : "";
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const mutating = !!init?.method && init.method !== "GET";
  let res: Response;
  try {
    res = await fetch(`${V1}${path}`, {
      ...init,
      credentials: "include", // send/receive the HttpOnly session cookie
      headers: {
        // Only set a JSON content-type when there's actually a body — Fastify
        // rejects an empty body sent with application/json (400). This keeps
        // bodyless POST/DELETE calls (deletes, logout, mark-read, cancel) valid.
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        // CSRF double-submit — required for cookie-authenticated mutations.
        ...(mutating ? { "x-csrf-token": csrfToken() } : {}),
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (e) {
    setReachable(false); // couldn't reach the server (LAN blip / API down)
    throw e;
  }
  setReachable(true); // the server responded (even a 4xx/5xx means it's reachable)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/**
 * Stream a file endpoint and hand it to the browser as a download (cookie +
 * bearer both sent). Used by the CSV exports, which return text/csv rather than
 * JSON and so can't go through req().
 */
async function download(path: string, filename: string): Promise<void> {
  const res = await fetch(`${V1}${path}`, {
    credentials: "include",
    headers: authToken ? { authorization: `Bearer ${authToken}` } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Export failed (${res.status})`);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ── Types ────────────────────────────────────────────────────────────

/** One delivered order matched back to the ad click that produced its lead. */
export interface OfflineConversionRow {
  leadId: string;
  clickIdType: "gclid" | "gbraid" | "wbraid";
  clickId: string;
  orderNumber: string;
  /** Los Angeles local time with an explicit UTC offset. */
  conversionTime: string;
  /** Invoiced total excluding tax. */
  value: number;
  currency: string;
}

export interface OfflineConversionsMeta {
  total: number;
  conversionName: string;
  timeZone: string;
  totalValue: number;
}

export interface ApiProduct {
  id: string;
  name: string;
  category: string;
  subcategory: string;
  description: string;
  price: string;
  image: string;
  bulk?: string;
  bag?: string;
  wholesale?: string; // wholesale/dealer price; auto-applied to wholesale customers
  active: boolean;
}

export interface InventoryRow {
  id: string;
  productId: string;
  sku: string;
  name: string;
  unit: string;
  qtyOnHand: number;
  reorderPoint: number;
  reorderQty: number;
  location: string;
  low: boolean;
  cost?: number;
}

export interface Taxonomy {
  categories: string[];
  units: string[];
}

export interface Vendor {
  id: string;
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

export interface POLine {
  productId: string;
  name: string;
  qty: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  status: "draft" | "ordered" | "received" | "cancelled";
  lines: POLine[];
  notes: string;
  orderedAt: string | null;
  receivedAt: string | null;
  total: number;
  createdAt: string;
}

export interface SaleLineInput {
  productId: string;
  name: string;
  unitLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal?: number; // explicit total (honors handling fees); else qty*unitPrice
}

export interface Sale {
  id: string;
  number: string;
  lines: (SaleLineInput & { lineTotal: number })[];
  subtotal: number;
  taxRate: number;
  tax: number;
  total: number;
  customer: string;
  paymentMethod: string;
  createdAt: string;
}

export interface ReportPeriod {
  count: number;
  subtotal: number;
  tax: number;
  total: number;
  avgSale: number;
  cogs: number;
  grossProfit: number;
  margin: number;
  byPayment?: Record<string, { count: number; total: number }>;
}
export interface ReportSummary {
  date: string;
  range: { from: string | null; to: string | null } | null;
  z: ReportPeriod;
  sales: Sale[];
  topSellers: { productId: string; name: string; qty: number; revenue: number }[];
  allTime: ReportPeriod;
}
export interface InventoryValuation {
  totalValue: number;
  totalUnits: number;
  untracked: number;
  items: { productId: string; name: string; unit: string; qtyOnHand: number; cost: number; value: number }[];
}
export interface ArAgingRow {
  customerId: string | null;
  customerName: string;
  current: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
}
export interface ArAging {
  totals: Omit<ArAgingRow, "customerId" | "customerName">;
  customers: ArAgingRow[];
}
export interface ArInvoice {
  id: string;
  number: string;
  date: string;
  total: number;
  due: number;
  paid: boolean;
}
export interface ArPaymentRecord {
  id: string;
  createdAt: string;
  amount: number;
  note: string;
  credited: number;
  applied: { orderId: string; number: string; amount: number }[];
}
export interface CustomerStatement {
  customer: { id: string; name: string; number: string; account: Customer["account"] };
  balance: number;
  invoices: ArInvoice[];
  payments: ArPaymentRecord[];
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  license: string;
  status: "active" | "off";
  notes: string;
}

export interface Truck {
  id: string;
  number: string;
  type: string;
  capacityCyd: number;
  plate: string;
  status: "available" | "on_route" | "maintenance";
  driverId: string | null;
  driverName: string | null;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  deviceId?: string | null;
  lastSeen: string | null;
  notes: string;
}

export interface Payment {
  id: string;
  amount: number;
  method: string;
  provider: string;
  status: "succeeded" | "failed";
  reference: string;
  saleId: string | null;
  authCode?: string;
  cardBrand?: string;
  last4?: string;
  entryMode?: string;
  createdAt: string;
}

export interface TerminalPaymentDetails {
  reference?: string;
  provider?: string;
  status?: "succeeded" | "failed";
  authCode?: string;
  cardBrand?: string;
  last4?: string;
  entryMode?: string;
  // The bridge's signature over the result (apps/bridge/signing.js), relayed unchanged.
  signature?: TerminalSignature;
}

export interface TerminalSignature {
  deviceId: string;
  ts: number;
  sig: string;
  currency: string;
}

export type DeliveryStatus = "scheduled" | "loading" | "enroute" | "delivered" | "cancelled";
export type DeliveryStage =
  | "assigned" | "loading" | "loaded" | "to_customer" | "arrived" | "unloading" | "unloaded" | "returning" | "completed";

export interface Pod {
  receivedBy: string;
  signature: string | null;
  photos: string[];
  notes: string;
  lat: number | null;
  lng: number | null;
  capturedAt: string;
}
export interface PodInput {
  receivedBy?: string;
  signature?: string | null;
  photos?: string[];
  notes?: string;
  lat?: number | null;
  lng?: number | null;
  markDelivered?: boolean;
}
export interface Delivery {
  id: string;
  code: string;
  customer: string;
  address: string;
  window: string;
  items: string;
  phone: string;
  status: DeliveryStatus;
  stage: DeliveryStage;
  stageHistory: { stage: DeliveryStage; at: string }[];
  truckId: string | null;
  truckNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  pod: Pod | null;
}

export interface Settings {
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
  logoUrl?: string;
  receiptFooter?: string;
  loyalty?: { enabled: boolean; earnPerDollar: number; redeemPointsPerDollar: number };
  website?: { url: string; apiToken: string; enabled: boolean; lastSyncAt: string | null; lastPullAt: string | null };
  onboardingComplete?: boolean;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string | null;
  userName: string;
  role: string;
  action: string;
  summary: string;
  meta?: Record<string, unknown>;
}

export type CustomerType = "retail" | "contractor" | "wholesale";
export interface Customer {
  id: string;
  number: string;
  name: string;
  phone: string;
  email: string;
  type: CustomerType;
  account: { pastDue: number; openDebt: number; creditLimit: number; storeCredit: number; loyaltyPoints?: number };
  billingAddress: string;
  deliveryAddress: string;
  portalAccess: boolean;
  notes: string;
}

export type OrderType = "sale" | "delivery" | "quote" | "will_call" | "ship";
export type OrderStatus =
  | "draft" | "waiting_pickup" | "complete" | "unscheduled" | "scheduled" | "dispatched" | "delivered" | "void";
export type PaymentMethod = "cash" | "card" | "account";

export interface OrderLine {
  productId: string;
  name: string;
  unitLabel: string;
  qty: number;
  unitPrice: number;
  lineTotal: number;
}

export interface Order {
  id: string;
  number: string;
  customerId: string | null;
  customerName: string;
  type: OrderType;
  status: OrderStatus;
  location: string;
  lines: OrderLine[];
  subtotal: number;
  discount?: number;
  taxRate: number;
  tax: number;
  total: number;
  paymentMethod: PaymentMethod;
  paid: boolean;
  due: number;
  registerSessionId: string | null;
  createdAt: string;
}

export interface TerminalStatus {
  configured: boolean;
  mode: "live" | "simulated";
  publishableKey: string | null;
  location: string | null;
}

export interface RegisterSession {
  id: string;
  number: string;
  workstationId: string;
  userId: string;
  userName: string;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  cashSales: number;
  cardSales: number;
  accountSales: number;
  orderCount: number;
  expectedCash: number;
  countedCash: number;
  variance: number;
  note: string;
}

export type Role = "admin" | "manager" | "cashier" | "trainee" | "driver";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string;
  active: boolean;
  permissions: string[] | null;
  /** Two-step sign-in (authenticator app) is set up for this account. */
  mfaEnabled?: boolean;
}

/** What a correct password gets: a session, or (admins, managers) a second step first. */
export type LoginResult =
  | { token: string; user: AuthUser; mfa?: undefined }
  | { mfa: "verify" | "enrol"; challenge: string; expiresAt: string };

export interface MfaEnrolment {
  otpauthUri: string;
  /** The same secret as the QR code, for typing into the app by hand. */
  secret: string;
  issuer: string;
  account: string;
}

export interface BreakEntry {
  type: "paid" | "unpaid";
  start: string;
  end: string | null;
}

export interface Shift {
  id: string;
  userId: string;
  userName: string;
  clockIn: string;
  clockOut: string | null;
  breaks: BreakEntry[];
  status: "open" | "closed";
  spanMinutes: number;
  paidBreakMinutes: number;
  unpaidBreakMinutes: number;
  paidMinutes: number;
}

export interface AppNotification {
  id: string;
  type: "low_stock" | "po_received";
  title: string;
  body: string;
  refId: string | null;
  read: boolean;
  createdAt: string;
}

// ── Messaging (RingCentral SMS) ───────────────────────────────────────
export type TriggerKey = "delivery.dispatched" | "delivery.delivered" | "order.created" | "lead.followup";

export interface MessagingStatus {
  mode: "live" | "simulated";
  configured: boolean;
  from: string | null;
}

export interface MessageThread {
  phone: string;
  customerName: string;
  lastBody: string;
  lastAt: string;
  count: number;
  unread: number;
  optedOut: boolean;
}

export interface SmsMessage {
  id: string;
  direction: "out" | "in";
  threadKey: string;
  to: string;
  from: string;
  customerId: string | null;
  customerName: string;
  body: string;
  status: string;
  providerId: string | null;
  trigger: TriggerKey | null;
  simulated: boolean;
  read: boolean;
  error: string | null;
  createdAt: string;
}

export interface MessageTemplate {
  id: string;
  key: TriggerKey;
  label: string;
  body: string;
  enabled: boolean;
  delayMinutes: number;
}

export interface OptOut {
  id: string;
  phone: string;
  reason: string;
  createdAt: string;
}

export interface BroadcastResult {
  total: number;
  sent: number;
  noConsent: number;
  optedOut: number;
  invalid: number;
  failed: number;
}

export interface BroadcastRecipient {
  phone: string;
  customerId?: string | null;
  customerName?: string;
}

export interface ScheduledBroadcast {
  id: string;
  body: string;
  recipients: { phone: string; customerId: string | null; customerName: string }[];
  scheduledFor: string;
  status: "pending" | "sent" | "cancelled";
  createdByUserId: string | null;
  createdByName: string;
  result: BroadcastResult | null;
  sentAt: string | null;
  createdAt: string;
}

export type ConsentChannel = "verbal" | "web" | "sms" | "import";
export interface Consent {
  id: string;
  phone: string;
  customerId: string | null;
  customerName: string;
  channel: ConsentChannel;
  disclosure: string;
  status: "opted_in" | "revoked";
  collectedByUserId: string | null;
  collectedByName: string;
  note: string;
  revokedAt: string | null;
  createdAt: string;
}

// ── Catalog ──────────────────────────────────────────────────────────
export const api = {
  // Products
  listProducts: (q?: { category?: string; q?: string; active?: string }) => {
    const sp = new URLSearchParams(q as Record<string, string>).toString();
    return req<{ data: ApiProduct[] }>(`/products${sp ? `?${sp}` : ""}`).then((r) => r.data);
  },
  createProduct: (body: Partial<ApiProduct>) =>
    req<{ data: ApiProduct }>("/products", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  updateProduct: (id: string, body: Partial<ApiProduct>) =>
    req<{ data: ApiProduct }>(`/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  deleteProduct: (id: string) => req(`/products/${id}`, { method: "DELETE" }),

  // Inventory
  listInventory: (lowOnly = false) =>
    req<{ data: InventoryRow[] }>(`/inventory${lowOnly ? "?lowStock=true" : ""}`).then((r) => r.data),
  adjustStock: (productId: string, delta: number, reason?: string) =>
    req<{ data: InventoryRow }>(`/inventory/${productId}/adjust`, {
      method: "POST",
      body: JSON.stringify({ delta, reason }),
    }).then((r) => r.data),
  updateInventory: (productId: string, body: Partial<InventoryRow>) =>
    req<{ data: InventoryRow }>(`/inventory/${productId}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  // Create the stock row for a product if it doesn't have one yet (idempotent).
  ensureInventory: (productId: string) =>
    req<{ data: InventoryRow }>(`/inventory/ensure/${productId}`, { method: "POST" }).then((r) => r.data),
  // Product taxonomy (categories + units of measure)
  getTaxonomy: () => req<{ data: Taxonomy }>("/taxonomy").then((r) => r.data),
  updateTaxonomy: (body: Partial<Taxonomy>) =>
    req<{ data: Taxonomy }>("/taxonomy", { method: "PUT", body: JSON.stringify(body) }).then((r) => r.data),
  // Upload an image (base64 data URL) → returns a servable relative URL.
  uploadImage: (dataUrl: string) =>
    req<{ data: { url: string } }>("/uploads", { method: "POST", body: JSON.stringify({ data: dataUrl }) }).then((r) => r.data.url),

  // Vendors
  listVendors: () => req<{ data: Vendor[] }>("/vendors").then((r) => r.data),
  createVendor: (body: Partial<Vendor>) =>
    req<{ data: Vendor }>("/vendors", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  updateVendor: (id: string, body: Partial<Vendor>) =>
    req<{ data: Vendor }>(`/vendors/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  deleteVendor: (id: string) => req(`/vendors/${id}`, { method: "DELETE" }),

  // Purchasing
  listPurchaseOrders: () => req<{ data: PurchaseOrder[] }>("/purchase-orders").then((r) => r.data),
  createPurchaseOrder: (body: { vendorId: string; lines: POLine[]; notes?: string; status?: "draft" | "ordered" }) =>
    req<{ data: PurchaseOrder }>("/purchase-orders", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  receivePurchaseOrder: (id: string) =>
    req<{ data: PurchaseOrder }>(`/purchase-orders/${id}/receive`, { method: "POST" }).then((r) => r.data),

  // Sales (closes the loop — decrements inventory)
  createSale: (body: {
    lines: SaleLineInput[];
    taxRate?: number;
    customer?: string;
    paymentMethod?: string;
  }) => req<{ data: Sale }>("/sales", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  listSales: () => req<{ data: Sale[] }>("/sales").then((r) => r.data),

  // Reports
  reportSummary: (params?: { date?: string; from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (params?.from || params?.to) {
      if (params.from) qs.set("from", params.from);
      if (params.to) qs.set("to", params.to);
    } else if (params?.date) {
      qs.set("date", params.date);
    }
    const q = qs.toString();
    return req<{ data: ReportSummary }>(`/reports/summary${q ? `?${q}` : ""}`).then((r) => r.data);
  },
  inventoryValuation: () => req<{ data: InventoryValuation }>("/reports/inventory-valuation").then((r) => r.data),
  arAging: () => req<{ data: ArAging }>("/reports/ar-aging").then((r) => r.data),
  // ── Google Ads offline conversions ────────────────────────────────
  // Delivered/invoiced orders matched back to the ad click that produced the
  // lead. Preview → download → mark uploaded; generating a file never marks
  // anything, so a conversion can't be counted twice.
  offlineConversions: (p?: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (p?.from) qs.set("from", p.from);
    if (p?.to) qs.set("to", p.to);
    const q = qs.toString();
    return req<{ data: OfflineConversionRow[]; meta: OfflineConversionsMeta }>(
      `/leads/offline-conversions${q ? `?${q}` : ""}`,
    );
  },
  exportOfflineConversionsCsv: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return download(
      `/leads/offline-conversions.csv?${qs.toString()}`,
      `balm-offline-conversions-${from ?? "all"}_${to ?? "now"}.csv`,
    );
  },
  markOfflineConversionsUploaded: (leadIds: string[]) =>
    req<{ data: { marked: number; skipped: number; at: string } }>(
      "/leads/offline-conversions/mark-uploaded",
      { method: "POST", body: JSON.stringify({ leadIds }) },
    ).then((r) => r.data),

  // Streams a CSV; triggers a browser download (cookie + bearer both sent).
  exportSalesCsv: (from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    return download(
      `/reports/export?${qs.toString()}`,
      `balm-sales-${from ?? "all"}_${to ?? "now"}.csv`,
    );
  },

  // Fleet
  listTrucks: () => req<{ data: Truck[] }>("/fleet/trucks").then((r) => r.data),
  createTruck: (body: Partial<Truck>) =>
    req<{ data: Truck }>("/fleet/trucks", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  updateTruck: (id: string, body: Partial<Truck>) =>
    req<{ data: Truck }>(`/fleet/trucks/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  deleteTruck: (id: string) => req(`/fleet/trucks/${id}`, { method: "DELETE" }),
  assignDriver: (truckId: string, driverId: string | null) =>
    req<{ data: Truck }>(`/fleet/trucks/${truckId}/assign`, { method: "PATCH", body: JSON.stringify({ driverId }) }).then((r) => r.data),
  updateTruckLocation: (truckId: string, lat: number, lng: number) =>
    req<{ data: Truck }>(`/fleet/trucks/${truckId}/location`, { method: "PATCH", body: JSON.stringify({ lat, lng }) }).then((r) => r.data),
  listDrivers: () => req<{ data: Driver[] }>("/fleet/drivers").then((r) => r.data),
  createDriver: (body: Partial<Driver>) =>
    req<{ data: Driver }>("/fleet/drivers", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  updateDriver: (id: string, body: Partial<Driver>) =>
    req<{ data: Driver }>(`/fleet/drivers/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  deleteDriver: (id: string) => req(`/fleet/drivers/${id}`, { method: "DELETE" }),

  // Deliveries (dispatch board, linked to fleet)
  listDeliveries: (q?: { driverId?: string; status?: string }) => {
    const sp = new URLSearchParams(q as Record<string, string>).toString();
    return req<{ data: Delivery[] }>(`/deliveries${sp ? `?${sp}` : ""}`).then((r) => r.data);
  },
  advanceDeliveryStage: (id: string, stage: DeliveryStage) =>
    req<{ data: Delivery }>(`/deliveries/${id}/stage`, { method: "PATCH", body: JSON.stringify({ stage }) }).then((r) => r.data),
  createDelivery: (body: Partial<Delivery>) =>
    req<{ data: Delivery }>("/deliveries", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  deleteDelivery: (id: string) => req(`/deliveries/${id}`, { method: "DELETE" }),
  assignDelivery: (id: string, body: { truckId?: string | null; driverId?: string | null }) =>
    req<{ data: Delivery }>(`/deliveries/${id}/assign`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  setDeliveryStatus: (id: string, status: DeliveryStatus) =>
    req<{ data: Delivery }>(`/deliveries/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }).then((r) => r.data),
  capturePod: (id: string, pod: PodInput) =>
    req<{ data: Delivery }>(`/deliveries/${id}/pod`, { method: "POST", body: JSON.stringify(pod) }).then((r) => r.data),

  // Payments. With no `details` the mock provider approves; pass `details` to
  // record a payment already authorized on the physical terminal (Ingenico/Elavon).
  capturePayment: (
    amount: number,
    method: "terminal" | "card" | "cash" | "account",
    saleId: string | null = null,
    details?: TerminalPaymentDetails,
  ) =>
    req<{ data: Payment }>("/payments", {
      method: "POST",
      body: JSON.stringify({ amount, method, saleId, ...(details ?? {}) }),
    }).then((r) => r.data),

  // Stripe Terminal (real flow; simulated until STRIPE_SECRET_KEY is set)
  terminalStatus: () => req<{ data: TerminalStatus }>("/terminal/status").then((r) => r.data),
  connectionToken: () => req<{ data: { secret: string; simulated: boolean } }>("/terminal/connection-token", { method: "POST" }).then((r) => r.data),
  createPaymentIntent: (amount: number, orderId: string | null = null) =>
    req<{ data: { id: string; clientSecret: string | null; status: string; amount: number; simulated: boolean } }>(
      "/terminal/payment-intents",
      { method: "POST", body: JSON.stringify({ amount, orderId }) },
    ).then((r) => r.data),
  capturePaymentIntent: (id: string, amount: number, orderId: string | null = null) =>
    req<{ data: { id: string; status: string; simulated: boolean } }>(`/terminal/payment-intents/${id}/capture`, {
      method: "POST",
      body: JSON.stringify({ amount, orderId }),
    }).then((r) => r.data),

  // Register (cash-drawer) sessions
  terminalRegisterActive: () => req<{ data: RegisterSession | null }>("/register/active").then((r) => r.data),
  openRegister: (userId: string, openingFloat: number) =>
    req<{ data: RegisterSession }>("/register/open", { method: "POST", body: JSON.stringify({ userId, openingFloat }) }).then((r) => r.data),
  getRegister: (id: string) => req<{ data: RegisterSession }>(`/register/${id}`).then((r) => r.data),
  closeRegister: (id: string, countedCash: number, note = "") =>
    req<{ data: RegisterSession }>(`/register/${id}/close`, { method: "POST", body: JSON.stringify({ countedCash, note }) }).then((r) => r.data),
  listRegister: () => req<{ data: RegisterSession[] }>("/register").then((r) => r.data),

  // Audit log (admin/manager)
  listAudit: (params?: { action?: string; q?: string; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.action) qs.set("action", params.action);
    if (params?.q) qs.set("q", params.q);
    if (params?.limit) qs.set("limit", String(params.limit));
    const s = qs.toString();
    return req<{ data: AuditEntry[] }>(`/audit${s ? `?${s}` : ""}`).then((r) => r.data);
  },

  // Settings (store identity, tax, payments, delivery fees)
  getSettings: () => req<{ data: Settings }>("/settings").then((r) => r.data),
  updateSettings: (body: Partial<Settings>) =>
    req<{ data: Settings }>("/settings", { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  // Website sync (Inerica POS → client website)
  testWebsite: () =>
    req<{ data: { ok: boolean; status?: number; error?: string } }>("/integration/website/test", { method: "POST" }).then((r) => r.data),
  syncWebsite: () =>
    req<{ data: { pushed: { products: number; inventory: number }; at: string } }>("/integration/website/sync", { method: "POST" }).then((r) => r.data),
  pullWebsite: () =>
    req<{ data: { pulled: { orders: number; leads: number; at: string } } }>("/integration/website/pull", { method: "POST" }).then((r) => r.data),

  // Customers (CRM)
  listCustomers: (q?: { q?: string; type?: string }) => {
    const sp = new URLSearchParams(q as Record<string, string>).toString();
    return req<{ data: Customer[] }>(`/customers${sp ? `?${sp}` : ""}`).then((r) => r.data);
  },
  // Paginated variant: pass a limit (+ optional cursor) to page through with
  // "Load more". Returns the page plus the next cursor (null when exhausted).
  pageCustomers: (params: { q?: string; type?: string; limit: number; cursor?: string | null }) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    if (params.type) sp.set("type", params.type);
    sp.set("limit", String(params.limit));
    if (params.cursor) sp.set("cursor", params.cursor);
    return req<{ data: Customer[]; nextCursor: string | null }>(`/customers?${sp.toString()}`);
  },
  createCustomer: (body: Partial<Customer>) =>
    req<{ data: Customer }>("/customers", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  updateCustomer: (id: string, body: Partial<Customer>) =>
    req<{ data: Customer }>(`/customers/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  redeemPoints: (id: string, points: number) =>
    req<{ data: Customer; redeemed: { points: number; credit: number } }>(`/customers/${id}/redeem-points`, {
      method: "POST",
      body: JSON.stringify({ points }),
    }),
  recordCustomerPayment: (id: string, amount: number, note = "") =>
    req<{ data: Customer; payment: ArPaymentRecord }>(`/customers/${id}/payment`, {
      method: "POST",
      body: JSON.stringify({ amount, note }),
    }),
  customerStatement: (id: string) =>
    req<{ data: CustomerStatement }>(`/customers/${id}/statement`).then((r) => r.data),
  deleteCustomer: (id: string) => req(`/customers/${id}`, { method: "DELETE" }),

  // Orders (Flint schema)
  listOrders: (q?: { type?: string; status?: string; customerId?: string }) => {
    const sp = new URLSearchParams(q as Record<string, string>).toString();
    return req<{ data: Order[] }>(`/orders${sp ? `?${sp}` : ""}`).then((r) => r.data);
  },
  // Paginated variant for the orders list ("Load more"). Indexed keyset paging.
  pageOrders: (params: { type?: string; status?: string; customerId?: string; limit: number; cursor?: string | null }) => {
    const sp = new URLSearchParams();
    if (params.type) sp.set("type", params.type);
    if (params.status) sp.set("status", params.status);
    if (params.customerId) sp.set("customerId", params.customerId);
    sp.set("limit", String(params.limit));
    if (params.cursor) sp.set("cursor", params.cursor);
    return req<{ data: Order[]; nextCursor: string | null }>(`/orders?${sp.toString()}`);
  },
  getOrder: (id: string) => req<{ data: Order }>(`/orders/${id}`).then((r) => r.data),
  createOrder: (body: {
    type: OrderType;
    status?: OrderStatus;
    customerId?: string | null;
    customerName?: string;
    lines: { productId: string; name: string; unitLabel: string; qty: number; unitPrice: number; lineTotal?: number }[];
    paymentMethod: PaymentMethod;
    taxRate?: number;
    discount?: number;
    registerSessionId?: string | null;
    clientId?: string; // idempotency key for offline replay
  }) => req<{ data: Order }>("/orders", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  updateOrder: (id: string, body: { status?: OrderStatus; paid?: boolean }) =>
    req<{ data: Order }>(`/orders/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),

  // Auth + users (SaaS multi-employee)
  login: (email: string, password: string) =>
    req<{ data: LoginResult }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }).then((r) => r.data),
  // Second step: the challenge from login() is good only for these, for five minutes.
  mfaEnrol: (challenge: string) =>
    req<{ data: MfaEnrolment }>("/auth/mfa/enrol", { method: "POST", body: JSON.stringify({ challenge }) }).then((r) => r.data),
  mfaConfirmEnrolment: (challenge: string, code: string) =>
    req<{ data: { token: string; user: AuthUser; recoveryCodes: string[] } }>("/auth/mfa/enrol/confirm", {
      method: "POST",
      body: JSON.stringify({ challenge, code }),
    }).then((r) => r.data),
  mfaVerify: (challenge: string, code: string) =>
    req<{ data: { token: string; user: AuthUser; recoveryCodesLeft: number } }>("/auth/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ challenge, code }),
    }).then((r) => r.data),
  /** Admins: clear another account's authenticator (lost phone); they enrol again at next sign-in. */
  resetUserMfa: (id: string) => req<{ data: AuthUser }>(`/users/${id}/mfa/reset`, { method: "POST" }).then((r) => r.data),
  /** Turn off your own two-step sign-in; needs a current code from the authenticator. */
  removeMyMfa: (code: string) =>
    req<{ data: AuthUser }>("/users/me/mfa/remove", { method: "POST", body: JSON.stringify({ code }) }).then((r) => r.data),
  me: () => req<{ data: AuthUser }>("/auth/me").then((r) => r.data),
  logout: () => req("/auth/logout", { method: "POST" }),
  listUsers: () => req<{ data: AuthUser[] }>("/users").then((r) => r.data),
  createUser: (body: Partial<AuthUser> & { password?: string; pin?: string }) =>
    req<{ data: AuthUser }>("/users", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  updateUser: (id: string, body: Partial<AuthUser> & { password?: string; pin?: string }) =>
    req<{ data: AuthUser }>(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  deactivateUser: (id: string) => req(`/users/${id}`, { method: "DELETE" }),

  // Timeclock
  clockIn: (userId?: string) =>
    req<{ data: Shift }>("/timeclock/clock-in", { method: "POST", body: JSON.stringify({ userId }) }).then((r) => r.data),
  activeShift: (userId: string) =>
    req<{ data: Shift | null }>(`/timeclock/active?userId=${userId}`).then((r) => r.data),
  startBreak: (shiftId: string, type: "paid" | "unpaid") =>
    req<{ data: Shift }>(`/timeclock/${shiftId}/break/start`, { method: "POST", body: JSON.stringify({ type }) }).then((r) => r.data),
  endBreak: (shiftId: string) =>
    req<{ data: Shift }>(`/timeclock/${shiftId}/break/end`, { method: "POST" }).then((r) => r.data),
  clockOut: (shiftId: string) =>
    req<{ data: Shift }>(`/timeclock/${shiftId}/clock-out`, { method: "POST" }).then((r) => r.data),
  listShifts: (q?: { userId?: string; date?: string }) => {
    const sp = new URLSearchParams(q as Record<string, string>).toString();
    return req<{ data: Shift[] }>(`/timeclock${sp ? `?${sp}` : ""}`).then((r) => r.data);
  },

  // AI seam (Phase 2 — inerica)
  aiStatus: () =>
    req<{ data: { phase: number; managedBy: string; humanInLoop: boolean; enabled: boolean; capabilities: { key: string; title: string; desc: string }[] } }>("/ai/status").then((r) => r.data),

  // Notifications
  listNotifications: (unreadOnly = false) =>
    req<{ data: AppNotification[]; unreadCount: number }>(`/notifications${unreadOnly ? "?unread=true" : ""}`),
  markNotificationRead: (id: string) => req(`/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () => req("/notifications/read-all", { method: "POST" }),

  // Messaging (RingCentral SMS — simulated until RC_* env vars are set)
  messagingStatus: () => req<{ data: MessagingStatus }>("/messaging/status").then((r) => r.data),
  listThreads: () => req<{ data: MessageThread[] }>("/messaging/threads").then((r) => r.data),
  getThread: (phone: string) =>
    req<{ data: { phone: string; optedOut: boolean; consented: boolean; messages: SmsMessage[] } }>(
      `/messaging/threads/${encodeURIComponent(phone)}`,
    ).then((r) => r.data),
  sendSms: (to: string, body: string, customerId: string | null = null, customerName = "") =>
    req<{ data: SmsMessage }>("/messaging/send", {
      method: "POST",
      body: JSON.stringify({ to, body, customerId, customerName }),
    }).then((r) => r.data),
  broadcast: (body: string, recipients: BroadcastRecipient[]) =>
    req<{ data: BroadcastResult }>("/messaging/broadcast", {
      method: "POST",
      body: JSON.stringify({ body, recipients }),
    }).then((r) => r.data),
  scheduleBroadcast: (body: string, scheduledFor: string, recipients: BroadcastRecipient[]) =>
    req<{ data: ScheduledBroadcast }>("/messaging/broadcasts/schedule", {
      method: "POST",
      body: JSON.stringify({ body, scheduledFor, recipients }),
    }).then((r) => r.data),
  listScheduledBroadcasts: () =>
    req<{ data: ScheduledBroadcast[] }>("/messaging/broadcasts/scheduled").then((r) => r.data),
  cancelScheduledBroadcast: (id: string) =>
    req(`/messaging/broadcasts/scheduled/${id}`, { method: "DELETE" }),
  listTemplates: () => req<{ data: MessageTemplate[] }>("/messaging/templates").then((r) => r.data),
  updateTemplate: (key: string, body: { body?: string; enabled?: boolean; delayMinutes?: number }) =>
    req<{ data: MessageTemplate }>(`/messaging/templates/${key}`, { method: "PATCH", body: JSON.stringify(body) }).then((r) => r.data),
  listOptOuts: () => req<{ data: OptOut[] }>("/messaging/optouts").then((r) => r.data),
  addOptOut: (phone: string, reason = "manual") =>
    req<{ data: OptOut }>("/messaging/optouts", { method: "POST", body: JSON.stringify({ phone, reason }) }).then((r) => r.data),
  removeOptOut: (phone: string) =>
    req(`/messaging/optouts/${encodeURIComponent(phone)}`, { method: "DELETE" }),

  // Consent (A2P 10DLC / TCPA opt-in records)
  consentDisclosure: () => req<{ data: { text: string } }>("/messaging/consent/disclosure").then((r) => r.data.text),
  listConsents: () => req<{ data: Consent[] }>("/messaging/consents").then((r) => r.data),
  getConsent: (phone: string) =>
    req<{ data: Consent | null }>(`/messaging/consents/${encodeURIComponent(phone)}`).then((r) => r.data),
  recordConsent: (body: { phone: string; customerId?: string | null; customerName?: string; channel?: ConsentChannel; note?: string }) =>
    req<{ data: Consent }>("/messaging/consents", { method: "POST", body: JSON.stringify(body) }).then((r) => r.data),
  revokeConsent: (phone: string) =>
    req(`/messaging/consents/${encodeURIComponent(phone)}`, { method: "DELETE" }),
};
