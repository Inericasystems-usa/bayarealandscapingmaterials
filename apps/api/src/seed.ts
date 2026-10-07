import { products as catalog, type Product } from "./modules/catalog.js";
import { inventory, type InventoryItem } from "./modules/inventory.js";
import { vendors, type Vendor } from "./modules/vendors.js";
import { trucks, drivers, type Truck, type Driver } from "./modules/fleet.js";
import { deliveries, type Delivery } from "./modules/deliveries.js";
import { users, type User } from "./modules/users.js";
import { customers, encryptCustomer, type Customer } from "./modules/customers.js";
import { orders, type Order } from "./modules/orders.js";
import { getSettings } from "./modules/settings.js";
import { products as seedProducts } from "./data/seed-products.js";
import { hashPassword } from "./lib/crypto.js";
import { bus } from "./lib/events.js";

const SEED_VENDORS: Omit<Vendor, keyof { id: string; createdAt: string; updatedAt: string }>[] = [
  { name: "Cemex Aggregates", contactName: "Dana Ruiz", email: "dana@cemex.example", phone: "(510) 555-7000", address: "1200 Wharf St, Richmond, CA", terms: "Net 30", category: "Aggregates", notes: "Base rock, drain rock, sand.", active: true },
  { name: "Valley Bark & Mulch Co.", contactName: "Tom Healy", email: "orders@valleybark.example", phone: "(707) 555-2210", address: "88 Mill Rd, Napa, CA", terms: "Net 15", category: "Bark & Mulch", notes: "Cedar, fir bark, gorilla hair.", active: true },
  { name: "Sierra Stone Supply", contactName: "Priya Anand", email: "sales@sierrastone.example", phone: "(916) 555-4480", address: "440 Quarry Way, Sacramento, CA", terms: "Net 30", category: "Stone & Flagstone", notes: "Flagstone, boulders, pebbles.", active: true },
];

function unitOf(price: string): string {
  const p = price.toLowerCase();
  if (p.includes("cubic yard")) return "Cubic Yard";
  if (p.includes("sq.ft") || p.includes("sq ft")) return "Sq Ft";
  if (p.includes("bag")) return "Bag";
  if (p.includes("gallon")) return "Gallon";
  if (p.includes("quart")) return "Quart";
  return "Each";
}

/** Idempotent: seeds the catalog + a stock row per product on first boot. */
export async function seedData(log: (msg: string) => void): Promise<void> {
  const now = new Date().toISOString();

  const catalogItems: Product[] = seedProducts.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: p.subcategory,
    description: p.description,
    price: p.price,
    image: p.image,
    ...(p.bulk ? { bulk: p.bulk } : {}),
    ...(p.bag ? { bag: p.bag } : {}),
    ...(p.wholesale ? { wholesale: p.wholesale } : {}),
    active: true,
    createdAt: now,
    updatedAt: now,
  }));
  if (await catalog.seedIfEmpty(catalogItems)) log(`seeded ${catalogItems.length} products`);

  const invItems: InventoryItem[] = seedProducts.map((p, i) => {
    // Deterministic spread, with a handful intentionally low/out for the demo.
    const low = i % 8 === 0;
    const qtyOnHand = low ? (i % 16 === 0 ? 0 : 4) : 15 + ((i * 17) % 80);
    return {
      id: `inv_${p.id}`,
      productId: p.id,
      sku: p.id.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12),
      name: p.name,
      unit: unitOf(p.price),
      qtyOnHand,
      reorderPoint: 8,
      reorderQty: 25,
      location: i % 2 === 0 ? "Yard A" : "Yard B",
      createdAt: now,
      updatedAt: now,
    };
  });
  if (await inventory.seedIfEmpty(invItems)) {
    log(`seeded ${invItems.length} inventory rows`);
    // Raise low-stock alerts for items that start at/under their reorder point.
    const low = invItems.filter((i) => i.qtyOnHand <= i.reorderPoint);
    for (const i of low) {
      bus.emit("inventory.low", {
        productId: i.productId,
        sku: i.sku,
        name: i.name,
        qtyOnHand: i.qtyOnHand,
        reorderPoint: i.reorderPoint,
      });
    }
    if (low.length) log(`raised ${low.length} low-stock alerts`);
  }

  // Demo/sample business data (vendors, fleet, deliveries, sample customers &
  // orders) is landscaping-flavored. A clean store install (e.g. the R&S tire
  // build) sets SEED_DEMO=false so only the real catalog + inventory + staff seed.
  const seedDemo = process.env.SEED_DEMO !== "false";

  const now2 = new Date().toISOString();
  const vendorRows: Vendor[] = SEED_VENDORS.map((v, i) => ({
    ...v,
    id: `vend_seed${i + 1}`,
    createdAt: now2,
    updatedAt: now2,
  }));
  if (seedDemo && (await vendors.seedIfEmpty(vendorRows))) log(`seeded ${vendorRows.length} vendors`);

  // ── Fleet: drivers + trucks ──────────────────────────────────────
  const driverSeed: Omit<Driver, "id" | "createdAt" | "updatedAt">[] = [
    { name: "Luis Mendoza", phone: "(510) 555-0111", license: "CA-C1-884213", status: "active", notes: "" },
    { name: "Dwayne Carter", phone: "(510) 555-0123", license: "CA-C1-771902", status: "active", notes: "" },
    { name: "Priya Shah", phone: "(510) 555-0145", license: "CA-C1-665540", status: "off", notes: "Weekends only." },
  ];
  const driverRows: Driver[] = driverSeed.map((d, i) => ({ ...d, id: `drv_seed${i + 1}`, createdAt: now2, updatedAt: now2 }));
  const seededDrivers = seedDemo && (await drivers.seedIfEmpty(driverRows));
  if (seededDrivers) log(`seeded ${driverRows.length} drivers`);

  const truckSeed: Omit<Truck, "id" | "createdAt" | "updatedAt" | "lastSeen">[] = [
    { number: "Truck 12", type: "Tri-axle Dump", capacityCyd: 16, plate: "8XKL422", status: "on_route", driverId: "drv_seed1", driverName: "Luis Mendoza", lat: 37.935, lng: -122.348, notes: "" },
    { number: "Truck 7", type: "Dump Truck", capacityCyd: 10, plate: "7TRN119", status: "available", driverId: "drv_seed2", driverName: "Dwayne Carter", lat: 37.94, lng: -122.36, notes: "" },
    { number: "Truck 3", type: "Flatbed", capacityCyd: 8, plate: "5FLT903", status: "maintenance", driverId: null, driverName: null, lat: 37.94, lng: -122.361, notes: "Brake service." },
    { number: "Truck 21", type: "Dump Truck", capacityCyd: 10, plate: "9DMP044", status: "available", driverId: null, driverName: null, lat: 37.946, lng: -122.355, notes: "" },
  ];
  const truckRows: Truck[] = truckSeed.map((t, i) => ({ ...t, id: `truck_seed${i + 1}`, lastSeen: now2, createdAt: now2, updatedAt: now2 }));
  if (seedDemo && (await trucks.seedIfEmpty(truckRows))) log(`seeded ${truckRows.length} trucks`);

  // ── Deliveries (the dispatch board) ──────────────────────────────
  const deliverySeed: Omit<Delivery, "id" | "createdAt" | "updatedAt" | "pod">[] = [
    { code: "D-1042", customer: "Sequoia Landscapes", address: "1820 Solano Ave, Berkeley", window: "Today · 9–11 AM", items: "6 yd Brown Mulch · 2 yd DG", phone: "(510) 555-0142", status: "scheduled", stage: "assigned", stageHistory: [], truckId: "truck_seed2", truckNumber: "Truck 7", driverId: "drv_seed1", driverName: "Luis Mendoza" },
    { code: "D-1043", customer: "M. Ramirez (Walk-in)", address: "44 Marina Bay Pkwy, Richmond", window: "Today · 11–1 PM", items: "3 yd Pea Gravel", phone: "(510) 555-0188", status: "scheduled", stage: "assigned", stageHistory: [], truckId: "truck_seed2", truckNumber: "Truck 7", driverId: "drv_seed1", driverName: "Luis Mendoza" },
    { code: "D-1039", customer: "Bayview GC", address: "300 Cutting Blvd, Richmond", window: "Today · 8–10 AM", items: "10 yd Class II Base Rock", phone: "(510) 555-0111", status: "loading", stage: "loading", stageHistory: [], truckId: "truck_seed2", truckNumber: "Truck 7", driverId: "drv_seed2", driverName: "Dwayne Carter" },
    { code: "D-1037", customer: "Greenline Co.", address: "77 Tunnel Rd, Oakland", window: "Today · 8–9 AM", items: "4 yd Felton Sand · 5 yd DG", phone: "(510) 555-0123", status: "enroute", stage: "to_customer", stageHistory: [], truckId: "truck_seed1", truckNumber: "Truck 12", driverId: "drv_seed1", driverName: "Luis Mendoza" },
    { code: "D-1031", customer: "Hillside Homes", address: "12 Arlington Ave, El Cerrito", window: "Today · 7–8 AM", items: "8 yd Arbor Mulch", phone: "(510) 555-0190", status: "delivered", stage: "completed", stageHistory: [], truckId: null, truckNumber: null, driverId: null, driverName: null },
  ];
  const deliveryRows: Delivery[] = deliverySeed.map((d, i) => ({ ...d, id: `dlv_seed${i + 1}`, pod: null, createdAt: now2, updatedAt: now2 }));
  if (seedDemo && (await deliveries.seedIfEmpty(deliveryRows))) log(`seeded ${deliveryRows.length} deliveries`);

  // ── Employee accounts (admin creates the rest in the UI) ─────────
  // The admin password comes from ADMIN_PASSWORD when set. In production
  // (SEED_DEMO=false) we REFUSE to seed a default-credential admin: if
  // ADMIN_PASSWORD is unset we skip the admin seed and warn, so a fresh
  // production DB never ships with a known password. The demo cashier/
  // manager/trainee/driver logins only seed in demo mode.
  const adminEmail = process.env.ADMIN_EMAIL || "admin@balm.local";
  const adminPassword = process.env.ADMIN_PASSWORD || (seedDemo ? "admin1234" : "");
  const demoStaff = [
    { name: "Sam Cashier", email: "cashier@balm.local", role: "cashier" as User["role"], phone: "", pin: "1111", password: "cashier12" },
    { name: "Robby Kumar", email: "manager@balm.local", role: "manager" as User["role"], phone: "", pin: "3333", password: "manager12" },
    { name: "Tina Trainee", email: "trainee@balm.local", role: "trainee" as User["role"], phone: "", pin: "4444", password: "trainee12" },
    { name: "Luis Mendoza", email: "driver@balm.local", role: "driver" as User["role"], phone: "(510) 555-0111", pin: "2222", password: "driver12" },
  ];
  const userSeed: { name: string; email: string; role: User["role"]; phone: string; pin: string; password: string }[] = [];
  if (adminPassword) {
    userSeed.push({ name: "Owner / Admin", email: adminEmail, role: "admin", phone: "(510) 860-4461", pin: process.env.ADMIN_PIN || "1234", password: adminPassword });
  } else {
    log("WARNING: ADMIN_PASSWORD not set and SEED_DEMO=false — skipping admin seed; create an admin manually or set ADMIN_PASSWORD before first boot.");
  }
  if (seedDemo) userSeed.push(...demoStaff);
  const userRows: User[] = userSeed.map((u, i) => ({
    id: `usr_seed${i + 1}`,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    pinHash: hashPassword(u.pin),
    passwordHash: hashPassword(u.password),
    active: true,
    permissions: null,
    createdAt: now2,
    updatedAt: now2,
  }));
  if (userRows.length && (await users.seedIfEmpty(userRows))) log(`seeded ${userRows.length} user(s)${seedDemo ? " (demo logins)" : ""}`);

  // ── Store settings (tax 9.75%, tenant identity, EPA delivery fees) ──
  await getSettings();

  // ── Customers (CRM) ──────────────────────────────────────────────
  const acct = (creditLimit = 0, openDebt = 0, pastDue = 0) => ({ pastDue, openDebt, creditLimit, storeCredit: 0, loyaltyPoints: 0 });
  const customerSeed: Omit<Customer, "createdAt" | "updatedAt">[] = [
    { id: "cust_seed1", number: "CUST-0001", name: "Fritz Schwalger", phone: "707-334-7318", email: "billing@bayarealandscapingmaterials.com", type: "contractor", account: acct(5000, 444.49, 444.49), billingAddress: "", deliveryAddress: "", portalAccess: true, notes: "" },
    { id: "cust_seed2", number: "CUST-0002", name: "Joel Suarez", phone: "510-621-4066", email: "", type: "retail", account: acct(), billingAddress: "", deliveryAddress: "", portalAccess: false, notes: "" },
    { id: "cust_seed3", number: "CUST-0003", name: "Jay Easton", phone: "415-845-6149", email: "", type: "retail", account: acct(), billingAddress: "", deliveryAddress: "", portalAccess: false, notes: "" },
  ];
  const customerRows: Customer[] = customerSeed.map((c) => encryptCustomer({ ...c, createdAt: now2, updatedAt: now2 }));
  if (seedDemo && (await customers.seedIfEmpty(customerRows))) log(`seeded ${customerRows.length} customers`);

  // ── Sample orders (Flint schema: type/status/ORD- number/Account+Due) ──
  const RATE = 0.0975;
  const mkOrder = (
    n: string,
    iso: string,
    type: Order["type"],
    status: Order["status"],
    pay: Order["paymentMethod"],
    subtotal: number,
    product: { id: string; name: string },
    customer: { id: string | null; name: string },
  ): Order => {
    const tax = Math.round(subtotal * RATE * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;
    const isQuote = type === "quote";
    const paid = !isQuote && pay !== "account";
    return {
      id: `ord_${n}`,
      number: n,
      customerId: customer.id,
      customerName: customer.name,
      type,
      status,
      location: "Main",
      lines: [{ productId: product.id, name: product.name, unitLabel: "1 cu yd", qty: 1, unitPrice: subtotal, lineTotal: subtotal }],
      subtotal,
      discount: 0,
      taxRate: RATE,
      tax,
      total,
      paymentMethod: pay,
      paid,
      due: paid ? 0 : isQuote ? 0 : total,
      registerSessionId: null,
      createdAt: iso,
      updatedAt: iso,
    };
  };
  const walkIn = { id: null, name: "Walk-in" };
  const orderRows: Order[] = [
    mkOrder("ORD-20260617-0002", "2026-06-17T15:20:00.000Z", "delivery", "unscheduled", "card", 195.88, { id: "pea-gravel", name: "Pea Gravel 3/8\"" }, walkIn),
    mkOrder("ORD-20260617-0001", "2026-06-17T10:05:00.000Z", "sale", "complete", "cash", 92.0, { id: "concrete-sand", name: "Concrete Sand" }, walkIn),
    mkOrder("ORD-20260616-0001", "2026-06-16T13:40:00.000Z", "quote", "draft", "cash", 72.0, { id: "brown-mulch", name: "Brown Mulch" }, { id: "cust_seed3", name: "Jay Easton" }),
    mkOrder("ORD-20260608-0001", "2026-06-08T09:15:00.000Z", "delivery", "scheduled", "card", 233.0, { id: "base-rock-virgin", name: "Class II Base Rock" }, { id: "cust_seed2", name: "Joel Suarez" }),
    mkOrder("ORD-20260601-0001", "2026-06-01T11:30:00.000Z", "delivery", "scheduled", "account", 405.0, { id: "california-gold-3-8", name: "California Gold 3/8\"" }, { id: "cust_seed1", name: "Fritz Schwalger" }),
  ];
  if (seedDemo && (await orders.seedIfEmpty(orderRows))) log(`seeded ${orderRows.length} orders`);
}
