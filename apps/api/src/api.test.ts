import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Express } from "express";

// In-memory MongoDB (standalone — matches prod's no-transaction fallback); force
// off any live integrations. Encryption on to exercise at-rest crypto.
process.env.TELEMATICS_INGEST_TOKEN = "test-tele-token";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key"; // exercise at-rest encryption
delete process.env.RC_CLIENT_ID;
delete process.env.RC_JWT;
delete process.env.STRIPE_SECRET_KEY;

let app: Express;
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URL = mongod.getUri();
  const { initDb } = await import("./lib/db.js");
  await initDb();
  const { buildServer } = await import("./server.js");
  app = buildServer();
  const { seedData } = await import("./seed.js");
  await seedData(() => {});
}, 120_000); // generous: first run may download the mongodb-memory-server binary

afterAll(async () => {
  const { closeDb } = await import("./lib/db.js");
  await closeDb();
  await mongod?.stop();
});

// Thin wrapper preserving the old Fastify `.inject()` response shape, so the test
// bodies below are unchanged: { statusCode, headers, body (text), json() }.
type InjectOpts = { method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT"; url: string; headers?: Record<string, string>; payload?: unknown };
async function inject(opts: InjectOpts) {
  const method = (opts.method ?? "GET").toLowerCase() as "get" | "post" | "patch" | "delete" | "put";
  let r = request(app)[method](opts.url);
  for (const [k, v] of Object.entries(opts.headers ?? {})) r = r.set(k, v);
  if (opts.payload !== undefined) r = r.send(opts.payload as object);
  const res = await r;
  return {
    statusCode: res.status,
    headers: res.headers as Record<string, string | string[]>,
    body: res.text,
    json: () => res.body,
  };
}

async function login(email: string, password: string): Promise<string | null> {
  const res = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email, password } });
  return res.statusCode === 200 ? (res.json() as { data: { token: string } }).data.token : null;
}
function authed(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token: string | null, payload?: unknown) {
  return inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : {}, payload });
}

describe("public endpoints", () => {
  it("health + ready are open", async () => {
    expect((await inject({ url: "/health" })).statusCode).toBe(200);
    expect((await inject({ url: "/ready" })).statusCode).toBe(200);
  });
  it("catalog GET is public (storefront)", async () => {
    const res = await inject({ url: "/api/v1/products" });
    expect(res.statusCode).toBe(200);
  });
  it("lead forms are reachable without auth", async () => {
    const res = await inject({ method: "POST", url: "/api/v1/leads/contact", payload: { name: "x" } });
    expect(res.statusCode).not.toBe(401);
  });
});

describe("authentication (default-deny)", () => {
  it("blocks anonymous access to business routes", async () => {
    expect((await inject({ url: "/api/v1/customers" })).statusCode).toBe(401);
    expect((await inject({ url: "/api/v1/orders" })).statusCode).toBe(401);
    expect((await inject({ method: "POST", url: "/api/v1/customers", payload: { name: "hack" } })).statusCode).toBe(401);
    expect((await inject({ url: "/api/v1/reports/summary" })).statusCode).toBe(401);
  });
  it("login sets an HttpOnly session cookie + a CSRF cookie and returns a token", async () => {
    const res = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "admin@balm.local", password: "admin1234" } });
    expect(res.statusCode).toBe(200);
    const cookies = [res.headers["set-cookie"]].flat().join(" ; ");
    expect(cookies).toMatch(/balm_session=.*HttpOnly/i); // session is HttpOnly
    expect(cookies).toMatch(/balm_csrf=/i); // csrf is JS-readable (not HttpOnly)
  });
  it("enforces CSRF on cookie-authenticated mutations", async () => {
    const login = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "admin@balm.local", password: "admin1234" } });
    const setCookies = ([login.headers["set-cookie"]].flat().filter(Boolean) as string[]).map((c) => c.split(";")[0]);
    const cookie = setCookies.join("; ");
    const csrf = /balm_csrf=([^;]+)/.exec(cookie)?.[1] ?? "";
    // Cookie auth + no CSRF header → blocked.
    const blocked = await inject({ method: "POST", url: "/api/v1/customers", headers: { cookie }, payload: { name: "csrf-test" } });
    expect(blocked.statusCode).toBe(403);
    // Cookie auth + matching CSRF header → allowed.
    const ok = await inject({ method: "POST", url: "/api/v1/customers", headers: { cookie, "x-csrf-token": csrf }, payload: { name: "csrf-ok" } });
    expect(ok.statusCode).toBe(201);
    const id = (ok.json() as { data: { id: string } }).data.id;
    await inject({ method: "DELETE", url: `/api/v1/customers/${id}`, headers: { cookie, "x-csrf-token": csrf } });
  });

  it("accepts PIN login and rejects bad creds", async () => {
    expect(await login("admin@balm.local", "1234")).toBeTruthy(); // PIN
    expect(await login("admin@balm.local", "nope")).toBeNull();
  });
});

describe("authorization (RBAC)", () => {
  it("cashier can do POS work but not admin-only areas", async () => {
    const t = await login("cashier@balm.local", "cashier12");
    expect((await authed("GET", "/api/v1/customers", t)).statusCode).toBe(200);
    expect((await authed("GET", "/api/v1/reports/summary", t)).statusCode).toBe(200);
    expect((await authed("POST", "/api/v1/payments", t, { amount: 1 })).statusCode).toBe(201);
    expect((await authed("POST", "/api/v1/vendors", t, { name: "x" })).statusCode).toBe(403); // vendors
    expect((await authed("GET", "/api/v1/users", t)).statusCode).toBe(403); // PIN list
    expect((await authed("PATCH", "/api/v1/settings", t, { storeName: "x" })).statusCode).toBe(403);
  });
  it("trainee has no reports/dispatch", async () => {
    const t = await login("trainee@balm.local", "trainee12");
    expect((await authed("GET", "/api/v1/customers", t)).statusCode).toBe(200);
    expect((await authed("GET", "/api/v1/reports/summary", t)).statusCode).toBe(403);
  });
  it("driver is limited to dispatch", async () => {
    const t = await login("driver@balm.local", "driver12");
    expect((await authed("GET", "/api/v1/customers", t)).statusCode).toBe(403);
    expect((await authed("POST", "/api/v1/fleet/trucks", t, {})).statusCode).not.toBe(403); // has dispatch
  });
  it("admin/manager have everything", async () => {
    const t = await login("manager@balm.local", "manager12");
    expect((await authed("GET", "/api/v1/users", t)).statusCode).toBe(200);
    expect((await authed("PATCH", "/api/v1/settings", t, { storeName: "Bay Area Landscaping Materials" })).statusCode).toBe(200);
  });
});

describe("encryption at rest", () => {
  it("stores the sync token encrypted at rest but masks it on the settings API read", async () => {
    const t = await login("manager@balm.local", "manager12");
    const secret = "super-secret-sync-token-abc123";
    const patch = { website: { url: "http://localhost:4000", apiToken: secret, enabled: false, lastSyncAt: null, lastPullAt: null } };
    expect((await authed("PATCH", "/api/v1/settings", t, patch)).statusCode).toBe(200);
    // Read path over HTTP MASKS the secret — the browser (any authed role) must
    // never receive the sync token, only whether one is configured.
    const got = (await authed("GET", "/api/v1/settings", t)).json().data as { website: { apiToken: string; configured: boolean } };
    expect(got.website.apiToken).toBe("••••••••");
    expect(got.website.apiToken).not.toBe(secret);
    expect(got.website.configured).toBe(true);
    // Stored doc is ciphertext (encrypt at rest).
    const { settings, getSettings } = await import("./modules/settings.js");
    const raw = await settings.find("store");
    expect(raw?.website.apiToken.startsWith("enc:v1:")).toBe(true);
    expect(raw?.website.apiToken).not.toBe(secret);
    // Internal callers (sync sender/receiver) still read the real token in the
    // clear via getSettings() — decrypt-on-read is intact, only the HTTP surface masks.
    const internal = await getSettings();
    expect(internal.website.apiToken).toBe(secret);
  });

  it("encrypts customer PII at rest but reads + searches it in the clear", async () => {
    const t = await login("manager@balm.local", "manager12");
    const create = await authed("POST", "/api/v1/customers", t, {
      name: "Enc Test",
      phone: "555-987-6543",
      email: "enc.test@example.com",
      billingAddress: "1 Secret St",
    });
    expect(create.statusCode).toBe(201);
    const id = (create.json().data as { id: string }).id;
    // Read path returns plaintext.
    const got = (await authed("GET", `/api/v1/customers/${id}`, t)).json().data as { phone: string; email: string; billingAddress: string };
    expect(got.phone).toBe("555-987-6543");
    expect(got.email).toBe("enc.test@example.com");
    expect(got.billingAddress).toBe("1 Secret St");
    // Search still works (decrypt-then-filter).
    const search = (await authed("GET", "/api/v1/customers?q=987-6543", t)).json().data as { id: string }[];
    expect(search.some((c) => c.id === id)).toBe(true);
    // Stored doc is ciphertext for PII; name stays plaintext.
    const { customers } = await import("./modules/customers.js");
    const rawc = await customers.find(id);
    expect(rawc?.phone.startsWith("enc:v1:")).toBe(true);
    expect(rawc?.email.startsWith("enc:v1:")).toBe(true);
    expect(rawc?.name).toBe("Enc Test");
  });
});

describe("order idempotency (offline replay)", () => {
  it("dedupes a replayed order by clientId", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const inv = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string; qtyOnHand: number }[] };
    const pid = inv.data.find((r) => r.qtyOnHand > 2)!.productId;
    const payload = {
      type: "sale",
      clientId: "offline-abc-123",
      lines: [{ productId: pid, name: "x", unitLabel: "Each", qty: 1, unitPrice: 10 }],
      paymentMethod: "cash",
      taxRate: 0.0975,
    };
    const first = await authed("POST", "/api/v1/orders", t, payload);
    expect(first.statusCode).toBe(201);
    const firstId = (first.json() as { data: { id: string } }).data.id;
    // Replaying the same clientId returns the existing order (200), not a new one.
    const second = await authed("POST", "/api/v1/orders", t, payload);
    expect(second.statusCode).toBe(200);
    expect((second.json() as { data: { id: string } }).data.id).toBe(firstId);
    const all = (await authed("GET", "/api/v1/orders", t)).json() as { data: { clientId?: string }[] };
    expect(all.data.filter((o) => o.clientId === "offline-abc-123").length).toBe(1);
  });
});

describe("inventory SKU", () => {
  it("persists a SKU set via PATCH (barcode/scanner + CSV import)", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const inv = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string }[] };
    const pid = inv.data[0]!.productId;
    const upd = (await authed("PATCH", `/api/v1/inventory/${pid}`, t, { sku: "BARCODE-XYZ-1" })).json() as { data: { sku: string } };
    expect(upd.data.sku).toBe("BARCODE-XYZ-1");
    const after = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string; sku: string }[] };
    expect(after.data.find((r) => r.productId === pid)?.sku).toBe("BARCODE-XYZ-1");
  });
});

describe("keyset pagination (store)", () => {
  it("pages through a collection with no overlap or gaps", async () => {
    const { Collection } = await import("./lib/store.js");
    const c = new Collection<{ id: string; createdAt: string; updatedAt: string; n: number }>("pagetest");
    for (let i = 0; i < 5; i++) await c.insert({ n: i } as never);
    const seen: number[] = [];
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const page: { items: { n: number }[]; nextCursor: string | null } = await c.page({ limit: 2, cursor, order: "asc" });
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((x) => x.n));
      cursor = page.nextCursor;
      if (!cursor) break;
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(seen).size).toBe(5); // no duplicates across pages
  });

  it("filters with where + likePrefix", async () => {
    const { Collection } = await import("./lib/store.js");
    const c = new Collection<{ id: string; createdAt: string; updatedAt: string; status: string; action: string }>("pagetest2");
    await c.insert({ status: "open", action: "order.void" } as never);
    await c.insert({ status: "closed", action: "order.discount" } as never);
    await c.insert({ status: "open", action: "user.create" } as never);
    expect((await c.page({ limit: 10, where: { status: "open" } })).items.length).toBe(2);
    expect((await c.page({ limit: 10, likePrefix: { field: "action", value: "order." } })).items.length).toBe(2);
  });
});

describe("audit trail (extended)", () => {
  it("records user create/deactivate and order discounts", async () => {
    const mgr = await login("manager@balm.local", "manager12");
    const created = await authed("POST", "/api/v1/users", mgr, { name: "Audit Temp", email: "audit.temp@balm.local", role: "cashier", pin: "4321" });
    expect(created.statusCode).toBe(201);
    const uid = (created.json().data as { id: string }).id;
    const admin = await login("admin@balm.local", "admin1234");
    expect((await authed("DELETE", `/api/v1/users/${uid}`, admin)).statusCode).toBe(200);

    const products = (await authed("GET", "/api/v1/products", mgr)).json() as { data: { id: string }[] };
    const ord = await authed("POST", "/api/v1/orders", mgr, {
      type: "quote",
      lines: [{ productId: products.data[0]!.id, name: "x", unitLabel: "Each", qty: 1, unitPrice: 100 }],
      paymentMethod: "cash",
      taxRate: 0.0975,
      discount: 15,
    });
    expect(ord.statusCode).toBe(201);

    const actions = ((await authed("GET", "/api/v1/audit", mgr)).json().data as { action: string }[]).map((a) => a.action);
    expect(actions).toContain("user.create");
    expect(actions).toContain("user.deactivate");
    expect(actions).toContain("order.discount");
  });
});

describe("settings partial update (no clobber)", () => {
  it("a partial PATCH preserves unspecified nested fields", async () => {
    const t = await login("manager@balm.local", "manager12");
    const before = (await authed("GET", "/api/v1/settings", t)).json().data as { address: { street: string }; tax: { rate: number } };
    expect(before.address.street).toBeTruthy();
    // Patch only a top-level scalar. Regression: the JSON store used to spread
    // the handler's `address: undefined` / `tax: undefined` over the existing
    // doc, wiping nested settings. They must survive untouched.
    const res = await authed("PATCH", "/api/v1/settings", t, { onboardingComplete: true });
    expect(res.statusCode).toBe(200);
    const after = (await authed("GET", "/api/v1/settings", t)).json().data as { address?: { street?: string }; tax?: { rate?: number }; onboardingComplete: boolean };
    expect(after.address?.street).toBe(before.address.street);
    expect(after.tax?.rate).toBe(before.tax.rate);
    expect(after.onboardingComplete).toBe(true);
  });
});

describe("money path + CRUD", () => {
  it("computes order totals with tax (the authoritative calc)", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const products = (await authed("GET", "/api/v1/products", t)).json() as { data: { id: string }[] };
    const pid = products.data[0]!.id;
    const res = await authed("POST", "/api/v1/orders", t, {
      type: "quote", // quote = no stock move, no payment — pure math check
      lines: [{ productId: pid, name: "x", unitLabel: "Each", qty: 1, unitPrice: 10 }],
      paymentMethod: "cash",
      taxRate: 0.0975,
    });
    expect(res.statusCode).toBe(201);
    const order = (res.json() as { data: { subtotal: number; tax: number; total: number } }).data;
    expect(order.subtotal).toBe(10);
    expect(order.tax).toBe(0.98);
    expect(order.total).toBe(10.98);
  });
  it("customer CRUD round-trips", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const created = (await authed("POST", "/api/v1/customers", t, { name: "Test Co", phone: "(628) 000-0000" })).json() as { data: { id: string } };
    const id = created.data.id;
    expect((await authed("GET", `/api/v1/customers/${id}`, t)).statusCode).toBe(200);
    const upd = (await authed("PATCH", `/api/v1/customers/${id}`, t, { notes: "vip" })).json() as { data: { notes: string } };
    expect(upd.data.notes).toBe("vip");
    expect((await authed("DELETE", `/api/v1/customers/${id}`, t)).statusCode).toBe(200);
    expect((await authed("GET", `/api/v1/customers/${id}`, t)).statusCode).toBe(404);
  });
});

describe("accounts receivable", () => {
  it("posts an order to the balance, applies payments to invoices, and statements it", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const inv = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string; qtyOnHand: number }[] };
    const pid = inv.data.find((r) => r.qtyOnHand > 1)!.productId; // in-stock so the order doesn't 409
    const cust = (await authed("POST", "/api/v1/customers", t, { name: "AR Co", type: "contractor", account: { creditLimit: 5000 } })).json() as { data: { id: string; account: { openDebt: number } } };
    const cid = cust.data.id;
    expect(cust.data.account.openDebt).toBe(0);

    // On-account order ($100 + tax) posts to open debt and opens an invoice.
    const order = (await authed("POST", "/api/v1/orders", t, {
      type: "sale",
      customerId: cid,
      lines: [{ productId: pid, name: "x", unitLabel: "Each", qty: 1, unitPrice: 100 }],
      paymentMethod: "account",
      taxRate: 0.0975,
    })).json() as { data: { id: string; total: number; due: number } };
    const oid = order.data.id;
    const total = order.data.total; // 109.75
    expect(order.data.due).toBe(total);
    let after = (await authed("GET", `/api/v1/customers/${cid}`, t)).json() as { data: { account: { openDebt: number; storeCredit: number } } };
    expect(after.data.account.openDebt).toBe(total);

    // Partial payment reduces the balance AND the invoice's due.
    await authed("POST", `/api/v1/customers/${cid}/payment`, t, { amount: 50 });
    after = (await authed("GET", `/api/v1/customers/${cid}`, t)).json() as { data: { account: { openDebt: number; storeCredit: number } } };
    expect(after.data.account.openDebt).toBe(Number((total - 50).toFixed(2)));
    let inv1 = (await authed("GET", `/api/v1/orders/${oid}`, t)).json() as { data: { due: number; paid: boolean } };
    expect(inv1.data.due).toBe(Number((total - 50).toFixed(2)));
    expect(inv1.data.paid).toBe(false);

    // Overpayment clears the invoice (paid=true, due=0) and books store credit.
    await authed("POST", `/api/v1/customers/${cid}/payment`, t, { amount: 200 });
    after = (await authed("GET", `/api/v1/customers/${cid}`, t)).json() as { data: { account: { openDebt: number; storeCredit: number } } };
    expect(after.data.account.openDebt).toBe(0);
    expect(after.data.account.storeCredit).toBeGreaterThan(0);
    inv1 = (await authed("GET", `/api/v1/orders/${oid}`, t)).json() as { data: { due: number; paid: boolean } };
    expect(inv1.data.due).toBe(0);
    expect(inv1.data.paid).toBe(true);

    // Statement lists the (now settled) invoice and both payments.
    const stmt = (await authed("GET", `/api/v1/customers/${cid}/statement`, t)).json() as {
      data: { balance: number; invoices: { id: string; due: number }[]; payments: unknown[] };
    };
    expect(stmt.data.balance).toBe(0);
    expect(stmt.data.invoices.find((i) => i.id === oid)?.due).toBe(0);
    expect(stmt.data.payments.length).toBe(2);
  });
});

describe("reporting", () => {
  it("valuation + aging endpoints respond with the right shape", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const val = await authed("GET", "/api/v1/reports/inventory-valuation", t);
    expect(val.statusCode).toBe(200);
    const vd = val.json() as { data: { totalValue: number; items: unknown[] } };
    expect(typeof vd.data.totalValue).toBe("number");
    expect(Array.isArray(vd.data.items)).toBe(true);

    // Open a fresh, unpaid account invoice so aging is deterministic.
    const inv = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string; qtyOnHand: number }[] };
    const pid = inv.data.find((r) => r.qtyOnHand > 2)!.productId;
    const cust = (await authed("POST", "/api/v1/customers", t, { name: "Aging Co", account: { creditLimit: 9999 } })).json() as { data: { id: string } };
    const ord = (await authed("POST", "/api/v1/orders", t, {
      type: "sale",
      customerId: cust.data.id,
      lines: [{ productId: pid, name: "x", unitLabel: "Each", qty: 1, unitPrice: 75 }],
      paymentMethod: "account",
      taxRate: 0.0975,
    })).json() as { data: { total: number } };

    const ag = await authed("GET", "/api/v1/reports/ar-aging", t);
    expect(ag.statusCode).toBe(200);
    const agd = ag.json() as { data: { totals: { total: number; current: number }; customers: { customerName: string; total: number }[] } };
    // New invoice is < 30 days old → lands in "current" and is reflected in totals.
    expect(agd.data.totals.total).toBeGreaterThanOrEqual(ord.data.total);
    expect(agd.data.customers.find((c) => c.customerName === "Aging Co")?.total).toBe(ord.data.total);
  });

  it("captures cost on a product and computes COGS / gross profit", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const inv = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string; qtyOnHand: number }[] };
    const row = inv.data.find((r) => r.qtyOnHand > 2)!;
    // Set a unit cost, then sell 2 @ $10 cash.
    expect((await authed("PATCH", `/api/v1/inventory/${row.productId}`, t, { cost: 4 })).statusCode).toBe(200);
    await authed("POST", "/api/v1/orders", t, {
      type: "sale",
      lines: [{ productId: row.productId, name: "x", unitLabel: "Each", qty: 2, unitPrice: 10 }],
      paymentMethod: "cash",
      taxRate: 0.0975,
    });
    const sum = (await authed("GET", "/api/v1/reports/summary", t)).json() as { data: { z: { cogs: number; subtotal: number; grossProfit: number; margin: number } } };
    expect(sum.data.z.cogs).toBeGreaterThanOrEqual(8); // 2 × $4
    expect(sum.data.z.grossProfit).toBeLessThan(sum.data.z.subtotal);
    expect(sum.data.z.margin).toBeLessThanOrEqual(1);
  });

  it("CSV export streams text/csv with a header row", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const res = await authed("GET", "/api/v1/reports/export", t);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.body.split("\n")[0]).toBe("Number,Date,Customer,Type,Status,Payment,Subtotal,Tax,Total");
  });

  it("export honors the date-range filter (indexed query)", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const inv = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string; qtyOnHand: number }[] };
    const pid = inv.data.find((r) => r.qtyOnHand > 2)!.productId;
    await authed("POST", "/api/v1/orders", t, {
      type: "sale",
      lines: [{ productId: pid, name: "ExportRow", unitLabel: "Each", qty: 1, unitPrice: 55 }],
      paymentMethod: "cash",
      taxRate: 0.0975,
    });
    const today = new Date().toISOString().slice(0, 10);
    // Today's range includes the sale (header + at least one row).
    const inRange = (await authed("GET", `/api/v1/reports/export?from=${today}&to=${today}`, t)).body as string;
    expect(inRange.trim().split("\n").length).toBeGreaterThan(1);
    // A past window excludes everything (header only).
    const past = (await authed("GET", "/api/v1/reports/export?from=2000-01-01&to=2000-01-02", t)).body as string;
    expect(past.trim().split("\n").length).toBe(1);
  });
});

describe("proof of delivery", () => {
  it("captures POD (signature + photo) and marks the delivery delivered", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const created = (await authed("POST", "/api/v1/deliveries", t, { customer: "POD Co", address: "1 Main St", items: "3 yd mulch" })).json() as { data: { id: string; pod: unknown } };
    const did = created.data.id;
    expect(created.data.pod).toBeNull();

    const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const res = await authed("POST", `/api/v1/deliveries/${did}/pod`, t, {
      receivedBy: "J. Doe",
      signature: png,
      photos: [png],
      notes: "Left at side gate",
      lat: 37.93,
      lng: -122.35,
      markDelivered: true,
    });
    expect(res.statusCode).toBe(200);
    const d = res.json() as { data: { status: string; stage: string; pod: { receivedBy: string; signature: string; photos: string[]; capturedAt: string } } };
    expect(d.data.status).toBe("delivered");
    expect(d.data.stage).toBe("completed");
    expect(d.data.pod.receivedBy).toBe("J. Doe");
    expect(d.data.pod.signature).toBe(png);
    expect(d.data.pod.photos.length).toBe(1);
    expect(typeof d.data.pod.capturedAt).toBe("string");

    // Persisted.
    const got = (await authed("GET", `/api/v1/deliveries/${did}`, t)).json() as { data: { pod: { receivedBy: string } } };
    expect(got.data.pod.receivedBy).toBe("J. Doe");
  });
});

describe("telematics ingest", () => {
  it("rejects without the token and writes positions with it (matched by deviceId)", async () => {
    const t = await login("admin@balm.local", "admin1234");
    const truck = (await authed("POST", "/api/v1/fleet/trucks", t, { number: "T-99", deviceId: "DEV-99", lat: 37.9, lng: -122.3 })).json() as { data: { id: string } };
    const tid = truck.data.id;

    // No / wrong token → 401 (even though the route is session-public).
    const bad = await inject({ method: "POST", url: "/api/v1/fleet/telematics", payload: { reports: [{ deviceId: "DEV-99", lat: 38, lng: -122 }] } });
    expect(bad.statusCode).toBe(401);

    // Correct token → updates the truck matched by deviceId.
    const ok = await inject({
      method: "POST",
      url: "/api/v1/fleet/telematics",
      headers: { "x-telematics-token": "test-tele-token" },
      payload: { reports: [{ deviceId: "DEV-99", lat: 38.1, lng: -122.1, speed: 25, heading: 90 }] },
    });
    expect(ok.statusCode).toBe(200);
    expect((ok.json() as { data: { updated: number } }).data.updated).toBe(1);

    const got = ((await authed("GET", "/api/v1/fleet/trucks", t)).json() as { data: { id: string; lat: number; speed?: number }[] }).data.find((x) => x.id === tid)!;
    expect(got.lat).toBe(38.1);
    expect(got.speed).toBe(25);
  });
});

describe("brute-force lockout", () => {
  it("locks an account after repeated failures", async () => {
    for (let i = 0; i < 5; i++) await login("locktest@balm.local", "wrong");
    const res = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "locktest@balm.local", password: "wrong" } });
    expect(res.statusCode).toBe(429);
  });
});
