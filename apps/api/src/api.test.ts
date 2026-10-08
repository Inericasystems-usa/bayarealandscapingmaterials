import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import express, { type Express } from "express";
import { pinoHttp } from "pino-http";
import WebSocket from "ws";
import type { AddressInfo } from "node:net";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// In-memory MongoDB (standalone — matches prod's no-transaction fallback); force
// off any live integrations. Encryption on to exercise at-rest crypto.
// NODE_ENV=test keeps every production control on (only "development" relaxes them).
process.env.NODE_ENV = "test";
process.env.TELEMATICS_INGEST_TOKEN = "test-tele-token";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key"; // exercise at-rest encryption
process.env.RC_WEBHOOK_TOKEN = "test-rc-verification-token";
// The seed has no built-in logins: the suite's admin and demo staff come from here.
const ADMIN = "admin@balm.local";
const ADMIN_PW = "test-admin-pass-2468";
const DEMO_PW = "test-demo-pass-1357";
process.env.SEED_DEMO = "true";
process.env.ADMIN_PASSWORD = ADMIN_PW;
process.env.ADMIN_PIN = "8642";
process.env.DEMO_PASSWORD = DEMO_PW;
delete process.env.ALLOW_PIN_LOGIN;
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
type InjectOpts = { method?: "GET" | "POST" | "PATCH" | "DELETE" | "PUT" | "OPTIONS"; url: string; headers?: Record<string, string>; payload?: unknown };
async function inject(opts: InjectOpts) {
  const method = (opts.method ?? "GET").toLowerCase() as "get" | "post" | "patch" | "delete" | "put" | "options";
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
    const res = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: ADMIN, password: ADMIN_PW } });
    expect(res.statusCode).toBe(200);
    const cookies = [res.headers["set-cookie"]].flat().join(" ; ");
    expect(cookies).toMatch(/balm_session=.*HttpOnly/i); // session is HttpOnly
    expect(cookies).toMatch(/balm_csrf=/i); // csrf is JS-readable (not HttpOnly)
  });
  it("enforces CSRF on cookie-authenticated mutations", async () => {
    const login = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: ADMIN, password: ADMIN_PW } });
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

  it("accepts the password and rejects bad creds", async () => {
    expect(await login(ADMIN, ADMIN_PW)).toBeTruthy();
    expect(await login(ADMIN, "nope")).toBeNull();
  });

  it("treats a malformed session cookie as no session (401, never a 500)", async () => {
    // cookie-parser turns "j:"-prefixed values into JSON objects.
    for (const cookie of ['balm_session=j:{"a":1}', "balm_session=j:123"]) {
      expect((await inject({ url: "/api/v1/customers", headers: { cookie } })).statusCode).toBe(401);
      expect((await inject({ url: "/api/v1/auth/me", headers: { cookie } })).statusCode).toBe(401);
      expect((await inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie } })).statusCode).toBe(200);
    }
  });
});

describe("authorization (RBAC)", () => {
  it("cashier can do POS work but not admin-only areas", async () => {
    const t = await login("cashier@balm.local", DEMO_PW);
    expect((await authed("GET", "/api/v1/customers", t)).statusCode).toBe(200);
    expect((await authed("GET", "/api/v1/reports/summary", t)).statusCode).toBe(200);
    expect((await authed("POST", "/api/v1/payments", t, { amount: 1, method: "cash" })).statusCode).toBe(201);
    expect((await authed("POST", "/api/v1/vendors", t, { name: "x" })).statusCode).toBe(403); // vendors
    expect((await authed("GET", "/api/v1/users", t)).statusCode).toBe(403); // PIN list
    expect((await authed("PATCH", "/api/v1/settings", t, { storeName: "x" })).statusCode).toBe(403);
  });
  it("trainee has no reports/dispatch", async () => {
    const t = await login("trainee@balm.local", DEMO_PW);
    expect((await authed("GET", "/api/v1/customers", t)).statusCode).toBe(200);
    expect((await authed("GET", "/api/v1/reports/summary", t)).statusCode).toBe(403);
  });
  it("driver is limited to dispatch", async () => {
    const t = await login("driver@balm.local", DEMO_PW);
    expect((await authed("GET", "/api/v1/customers", t)).statusCode).toBe(403);
    expect((await authed("POST", "/api/v1/fleet/trucks", t, {})).statusCode).not.toBe(403); // has dispatch
  });
  it("admin/manager have everything", async () => {
    const t = await login("manager@balm.local", DEMO_PW);
    expect((await authed("GET", "/api/v1/users", t)).statusCode).toBe(200);
    expect((await authed("PATCH", "/api/v1/settings", t, { storeName: "Bay Area Landscaping Materials" })).statusCode).toBe(200);
  });
});

describe("encryption at rest", () => {
  it("stores the sync token encrypted at rest but masks it on the settings API read", async () => {
    const t = await login("manager@balm.local", DEMO_PW);
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
    const t = await login("manager@balm.local", DEMO_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const mgr = await login("manager@balm.local", DEMO_PW);
    const created = await authed("POST", "/api/v1/users", mgr, { name: "Audit Temp", email: "audit.temp@balm.local", role: "cashier", pin: "4321" });
    expect(created.statusCode).toBe(201);
    const uid = (created.json().data as { id: string }).id;
    const admin = await login(ADMIN, ADMIN_PW);
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
    const t = await login("manager@balm.local", DEMO_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
    const res = await authed("GET", "/api/v1/reports/export", t);
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/csv/);
    expect(res.body.split("\n")[0]).toBe("Number,Date,Customer,Type,Status,Payment,Subtotal,Tax,Total");
  });

  it("export honors the date-range filter (indexed query)", async () => {
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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
    const t = await login(ADMIN, ADMIN_PW);
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

  it("locks a real account for 30 minutes, even against the right password, in the database", async () => {
    const admin = await login(ADMIN, ADMIN_PW);
    const made = await authed("POST", "/api/v1/users", admin, { name: "Lock Me", email: "lock.me@balm.local", role: "cashier", pin: "1470", password: "lock-me-pass-2026" });
    expect(made.statusCode).toBe(201);
    for (let i = 0; i < 5; i++) expect(await login("lock.me@balm.local", "wrong-pass-0000")).toBeNull();
    const res = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "lock.me@balm.local", password: "lock-me-pass-2026" } });
    expect(res.statusCode).toBe(429);
    // Stored (a restart doesn't clear it) under a hash of the address, not the address.
    const { Collection } = await import("./lib/store.js");
    const { hashToken } = await import("./lib/crypto.js");
    const rows = new Collection<{ id: string; createdAt: string; updatedAt: string; lockedUntil: string | null }>("login_failures");
    const row = await rows.find(hashToken("lock.me@balm.local"));
    expect(Date.parse(row?.lockedUntil ?? "") - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(JSON.stringify(await rows.all())).not.toContain("lock.me@");
  });

  it("checks only 5 of a burst of parallel guesses, then locks until the 30 minutes are over", async () => {
    const admin = await login(ADMIN, ADMIN_PW);
    const made = await authed("POST", "/api/v1/users", admin, { name: "Burst Test", email: "burst@balm.local", role: "cashier", pin: "3691", password: "burst-pass-2026" });
    expect(made.statusCode).toBe(201);
    const guess = () => inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: "burst@balm.local", password: "wrong-pass-0000" } });
    const burst = await Promise.all(Array.from({ length: 30 }, guess));
    expect(burst.filter((r) => r.statusCode === 401)).toHaveLength(5); // checked
    expect(burst.filter((r) => r.statusCode === 429)).toHaveLength(25); // refused unchecked
    expect(await login("burst@balm.local", "burst-pass-2026")).toBeNull();
    // Once the lock has run out, a new window of 5 opens and the password works.
    const { Collection } = await import("./lib/store.js");
    const { hashToken } = await import("./lib/crypto.js");
    const rows = new Collection<{ id: string; createdAt: string; updatedAt: string; lockedUntil: string | null }>("login_failures");
    await rows.update(hashToken("burst@balm.local"), { lockedUntil: new Date(Date.now() - 1000).toISOString() });
    expect(await login("burst@balm.local", "burst-pass-2026")).toBeTruthy();
  });
});

// ── PCI DSS controls ────────────────────────────────────────────────

const here = path.dirname(fileURLToPath(import.meta.url));
const tsxUrl = pathToFileURL(createRequire(import.meta.url).resolve("tsx")).href;

describe("CORS allow-list", () => {
  it("answers the site's two origins, with credentials", async () => {
    for (const origin of ["https://bayarealandscapingmaterials.com", "https://www.bayarealandscapingmaterials.com"]) {
      const res = await inject({ url: "/api/v1", headers: { origin } });
      expect(res.headers["access-control-allow-origin"]).toBe(origin);
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    }
  });

  it("gives every other origin no CORS headers at all", async () => {
    const others = ["http://10.20.30.40:8080", "http://127.0.0.1", "http://localhost:3000", "https://evil.example", "null", "https://bayarealandscapingmaterials.com.evil.example"];
    for (const origin of others) {
      const res = await inject({ url: "/api/v1", headers: { origin } });
      expect(res.headers["access-control-allow-origin"]).toBeUndefined();
      expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
      const pre = await inject({ method: "OPTIONS", url: "/api/v1/customers", headers: { origin, "access-control-request-method": "POST" } });
      expect(pre.headers["access-control-allow-origin"]).toBeUndefined();
    }
    expect((await inject({ url: "/api/v1" })).headers["access-control-allow-credentials"]).toBeUndefined();
  });
});

describe("session cookies", () => {
  it("are Secure, HttpOnly and SameSite=Lax outside development", async () => {
    const res = await inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: ADMIN, password: ADMIN_PW } });
    const cookies = [res.headers["set-cookie"]].flat() as string[];
    const session = cookies.find((c) => c.startsWith("balm_session=")) ?? "";
    const csrf = cookies.find((c) => c.startsWith("balm_csrf=")) ?? "";
    expect(session).toMatch(/;\s*Secure/i);
    expect(session).toMatch(/;\s*HttpOnly/i);
    expect(session).toMatch(/;\s*SameSite=Lax/i);
    expect(csrf).toMatch(/;\s*Secure/i);
    expect(csrf).not.toMatch(/HttpOnly/i); // read by the web for the double-submit header
  });

  it("are Secure when NODE_ENV is unset or production (a fresh API process)", async () => {
    const url = (f: string) => JSON.stringify(pathToFileURL(path.join(here, f)).href);
    const supertestUrl = JSON.stringify(pathToFileURL(createRequire(import.meta.url).resolve("supertest")).href);
    const script = `
      const { initDb, closeDb } = await import(${url("lib/db.ts")});
      await initDb();
      const { buildServer } = await import(${url("server.ts")});
      const request = (await import(${supertestUrl})).default;
      const res = await request(buildServer()).post("/api/v1/auth/login").send({ email: ${JSON.stringify(ADMIN)}, password: ${JSON.stringify(ADMIN_PW)} });
      console.log(JSON.stringify({ status: res.status, cookies: res.headers["set-cookie"] ?? [] }));
      await closeDb();
      process.exit(0);`;
    const cwd = mkdtempSync(path.join(tmpdir(), "balm-api-")); // no .env files here
    const run = (nodeEnv: string | undefined) =>
      new Promise<{ status: number; cookies: string[] }>((resolve, reject) => {
        // VITEST keeps the process from listening; NODE_ENV is the variable under test.
        const env: NodeJS.ProcessEnv = { ...process.env, VITEST: "1", MONGODB_URL: mongod.getUri() };
        delete env.SEED_DEMO;
        if (nodeEnv) env.NODE_ENV = nodeEnv;
        else delete env.NODE_ENV;
        execFile(process.execPath, ["--import", tsxUrl, "--input-type=module", "-e", script], { cwd, env }, (err, stdout, stderr) =>
          err ? reject(new Error(stderr || String(err))) : resolve(JSON.parse(stdout.trim().split("\n").pop() ?? "{}")),
        );
      });
    try {
      const [unset, production, development] = await Promise.all([run(undefined), run("production"), run("development")]);
      for (const r of [unset, production]) {
        expect(r.status).toBe(200);
        expect(r.cookies.find((c) => c.startsWith("balm_session="))).toMatch(/;\s*Secure.*HttpOnly|HttpOnly.*;\s*Secure/i);
        expect(r.cookies.find((c) => c.startsWith("balm_csrf="))).toMatch(/;\s*Secure/i);
      }
      // Only an explicit NODE_ENV=development (plain http on a LAN) drops Secure.
      expect(development.status).toBe(200);
      expect(development.cookies.join("\n")).not.toMatch(/Secure/i);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  }, 90_000);
});

describe("sessions", () => {
  it("store only a hash of the token", async () => {
    const token = (await login(ADMIN, ADMIN_PW))!;
    const { sessions } = await import("./modules/users.js");
    const { hashToken } = await import("./lib/crypto.js");
    const all = await sessions.all();
    expect(JSON.stringify(all)).not.toContain(token);
    expect(all.some((s) => s.tokenHash === hashToken(token))).toBe(true);
  });

  it("end after 15 minutes idle, and stay alive while in use", async () => {
    const { sessions } = await import("./modules/users.js");
    const { hashToken } = await import("./lib/crypto.js");
    const token = (await login(ADMIN, ADMIN_PW))!;
    const [s] = await sessions.query({ where: { tokenHash: hashToken(token) } });
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

    await sessions.update(s!.id, { lastSeenAt: ago(14) });
    expect((await authed("GET", "/api/v1/auth/me", token)).statusCode).toBe(200);
    expect(Date.parse((await sessions.find(s!.id))!.lastSeenAt)).toBeGreaterThan(Date.now() - 60_000); // refreshed

    await sessions.update(s!.id, { lastSeenAt: ago(16) });
    expect((await authed("GET", "/api/v1/auth/me", token)).statusCode).toBe(401);
    expect(await sessions.find(s!.id)).toBeNull();
  });

  it("from before token hashing are purged", async () => {
    const { sessions, purgeStaleSessions } = await import("./modules/users.js");
    await sessions.insert({ id: "sess_legacy", userId: "usr_seed1", expiresAt: new Date(Date.now() + 3_600_000).toISOString() } as never);
    expect(await purgeStaleSessions()).toBeGreaterThanOrEqual(1);
    expect(await sessions.find("sess_legacy")).toBeNull();
  });
});

describe("passwords and PINs", () => {
  it("new and changed passwords need 12+ characters with letters and numbers", async () => {
    const admin = await login(ADMIN, ADMIN_PW);
    const base = { name: "Pw Test", role: "cashier", pin: "5791" };
    for (const password of ["short1", "onlyletterslong", "123456789012"]) {
      const res = await authed("POST", "/api/v1/users", admin, { ...base, email: `pw.${password}@balm.local`, password });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toMatch(/12 characters/);
    }
    const ok = await authed("POST", "/api/v1/users", admin, { ...base, email: "pw.ok@balm.local", password: "counter-staff-2026" });
    expect(ok.statusCode).toBe(201);
    expect(await login("pw.ok@balm.local", "counter-staff-2026")).toBeTruthy();
    const id = (ok.json().data as { id: string }).id;
    expect((await authed("PATCH", `/api/v1/users/${id}`, admin, { password: "abc12" })).statusCode).toBe(400);
    expect((await authed("PATCH", `/api/v1/users/${id}`, admin, { password: "new-counter-pass-1" })).statusCode).toBe(200);
  });

  it("a PIN is never a full sign-in: off unless enabled on a counter PC, never for admins or managers", async () => {
    const admin = await login(ADMIN, ADMIN_PW);
    // Added without a password: the PIN does not become one.
    expect((await authed("POST", "/api/v1/users", admin, { name: "Pin Only", email: "pin.only@balm.local", role: "cashier", pin: "2468" })).statusCode).toBe(201);
    // A manager without a password could never sign in, so one isn't created.
    const noPw = await authed("POST", "/api/v1/users", admin, { name: "No Pw Mgr", email: "nopw.mgr@balm.local", role: "manager", pin: "1593" });
    expect(noPw.statusCode).toBe(400);
    expect(noPw.json().error.message).toMatch(/^password: Admins and managers need a password/);
    expect((await authed("POST", "/api/v1/users", admin, { name: "Pin Mgr", email: "pin.mgr@balm.local", role: "manager", pin: "1357", password: "manager-pass-2026" })).statusCode).toBe(201);
    expect(await login("pin.only@balm.local", "2468")).toBeNull();
    expect(await login(ADMIN, "8642")).toBeNull(); // ADMIN_PIN
    process.env.ALLOW_PIN_LOGIN = "true";
    try {
      expect(await login("pin.only@balm.local", "2468")).toBeTruthy();
      expect(await login(ADMIN, "8642")).toBeNull();
      expect(await login("pin.mgr@balm.local", "1357")).toBeNull();
    } finally {
      delete process.env.ALLOW_PIN_LOGIN;
    }
  });

  it("a PIN an older version also stored as the password doesn't sign in either", async () => {
    const { users } = await import("./modules/users.js");
    const { hashPassword } = await import("./lib/crypto.js");
    const pin = hashPassword("9753");
    await users.insert({ id: "usr_legacypin", name: "Legacy Pin", email: "legacy.pin@balm.local", role: "manager", phone: "", pinHash: pin, passwordHash: hashPassword("9753"), active: true, permissions: null });
    expect(await login("legacy.pin@balm.local", "9753")).toBeNull();
  });
});

describe("errors", () => {
  it("a 5xx never carries the message, code or stack outside development", async () => {
    const { errorHandler } = await import("./server.js");
    const mini = express();
    mini.use(pinoHttp({ level: "silent" }));
    mini.get("/boom", () => {
      throw Object.assign(new Error("connect ECONNREFUSED 10.0.0.5:27017 at /srv/balm/apps/api/src/lib/db.ts:44"), { code: "ECONNREFUSED" });
    });
    mini.use(errorHandler);
    const res = await request(mini).get("/boom");
    expect(res.status).toBe(500);
    expect(res.body.error).toMatchObject({ code: "internal_error", message: "Something went wrong." });
    expect(res.text).not.toMatch(/ECONNREFUSED|10\.0\.0\.5|db\.ts|stack/);
  });

  it("unknown routes get JSON 404s (after default-deny), and /metrics needs a session", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    expect((await inject({ url: "/api/v1/nope" })).statusCode).toBe(401);
    expect((await authed("GET", "/api/v1/nope", t)).json().error.code).toBe("not_found");
    expect((await inject({ url: "/metrics" })).statusCode).toBe(401);
    expect((await authed("GET", "/metrics", t)).statusCode).toBe(200);
  });
});

describe("request logs", () => {
  it("never hold session cookies, tokens, Set-Cookie, URL secrets or card numbers", async () => {
    const { httpLoggerOptions } = await import("./server.js");
    const lines: string[] = [];
    const mini = express();
    mini.use(pinoHttp({ ...httpLoggerOptions(), level: "info" }, { write: (s: string) => void lines.push(s) }));
    mini.get("/x", (req, res) => {
      req.log.error({ err: new Error("declined 4111 1111 1111 1111") }, "terminal said no");
      res.cookie("balm_session", "set-cookie-secret").json({ ok: true });
    });
    await request(mini)
      .get("/x?token=url-secret&q=4111111111111111")
      .set("cookie", "balm_session=cookie-secret; balm_csrf=csrf-cookie-secret")
      .set("authorization", "Bearer bearer-secret")
      .set("x-csrf-token", "csrf-secret")
      .set("verification-token", "rc-secret");
    const out = lines.join("\n");
    expect(lines.length).toBeGreaterThanOrEqual(2); // the error and the request
    expect(out).not.toMatch(/cookie-secret|bearer-secret|csrf-secret|rc-secret|url-secret|set-cookie-secret|4111 ?1111 ?1111 ?1111/);
    expect(out).toContain('"cookie":"[redacted]"');
    expect(out).toContain('"authorization":"[redacted]"');
    expect(out).toContain('"set-cookie":"[redacted]"');
    expect(out).toContain("[card number removed]");
  });

  it("never hold the raw body of a malformed request (a sign-in's password, a card number)", async () => {
    const { httpLoggerOptions, errorHandler } = await import("./server.js");
    const bad = '{"email":"owner@example.com","password":"Sup3r-Secret-Pass","note":"4111 1111 1111 1111",}';
    const lines: string[] = [];
    const mini = express();
    mini.use(pinoHttp({ ...httpLoggerOptions(), level: "info" }, { write: (s: string) => void lines.push(s) }));
    mini.use(express.json());
    mini.use(errorHandler);
    expect((await request(mini).post("/x").set("content-type", "application/json").send(bad)).status).toBe(400);
    expect(lines.join("\n")).toContain("request failed");
    expect(lines.join("\n")).not.toMatch(/Sup3r-Secret-Pass|4111/);
    // The API logs before it parses, so a parse error never falls back to the console.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await request(app).post("/api/v1/auth/login").set("content-type", "application/json").send(bad);
      expect(res.status).toBe(400);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe("error reports (Sentry)", () => {
  it("never carry cookies, credential headers, request bodies or card numbers", async () => {
    const { scrubEvent } = await import("./lib/sentry.js");
    const event = scrubEvent({
      type: undefined,
      message: "declined 4111 1111 1111 1111",
      request: {
        url: "https://bayarealandscapingmaterials.com/api/v1/auth/login",
        cookies: { balm_session: "cookie-secret" },
        headers: { Cookie: "balm_session=cookie-secret", Authorization: "Bearer bearer-secret", "x-csrf-token": "csrf-secret", "user-agent": "test" },
        data: { email: "owner@example.com", password: "Sup3r-Secret-Pass" },
      },
    });
    expect(JSON.stringify(event)).not.toMatch(/cookie-secret|bearer-secret|csrf-secret|Sup3r-Secret-Pass|4111/);
    expect(event.request?.headers).toEqual({ "user-agent": "test" });
  });
});

describe("image uploads", () => {
  const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const b64 = (s: string | Buffer) => Buffer.from(s).toString("base64");
  const svg = b64('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>');

  it("reject SVG, and anything whose bytes aren't PNG, JPEG, WebP or GIF", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    for (const data of [`data:image/svg+xml;base64,${svg}`, `data:image/png;base64,${svg}`, `data:text/html;base64,${b64("<script>1</script>")}`, `data:image/gif;base64,${b64("GIF80a")}`])
      expect((await authed("POST", "/api/v1/uploads", t, { data })).statusCode).toBe(400);
  });

  it("accept the four raster formats and serve them with nosniff and a sandboxed CSP", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    const jpeg = `data:image/jpeg;base64,${b64(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]))}`;
    const gif = `data:image/gif;base64,${b64("GIF89a\x01\x00\x01\x00")}`;
    const webp = `data:image/webp;base64,${b64("RIFF\x1a\x00\x00\x00WEBPVP8 ")}`;
    for (const [data, type] of [[PNG, "image/png"], [jpeg, "image/jpeg"], [gif, "image/gif"], [webp, "image/webp"]] as const) {
      const up = await authed("POST", "/api/v1/uploads", t, { data });
      expect(up.statusCode).toBe(201);
      const res = await inject({ url: (up.json().data as { url: string }).url });
      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toBe(type);
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toMatch(/^default-src 'none'.*sandbox$/);
    }
  });

  it("no longer serve an SVG stored before the rule", async () => {
    const { Collection } = await import("./lib/store.js");
    const uploads = new Collection<{ id: string; createdAt: string; updatedAt: string; contentType: string; base64: string }>("uploads");
    await uploads.insert({ id: "img_legacysvg", contentType: "image/svg+xml", base64: svg });
    expect((await inject({ url: "/api/v1/uploads/img_legacysvg" })).statusCode).toBe(404);
  });
});

describe("card numbers", () => {
  it("are rejected in free-text fields, naming the field", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    const res = await authed("POST", "/api/v1/customers", t, { name: "PAN Co", notes: "card 4111 1111 1111 1111 exp 12/28" });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toMatchObject({ code: "card_number", details: [{ path: "notes" }] });
    expect(res.body).not.toContain("4111");
  });

  it("are rejected on the public lead forms in the shape the website displays", async () => {
    const res = await inject({ method: "POST", url: "/api/v1/leads/contact", payload: { name: "Pat Lee", phone: "5105550100", message: "Charge 5555-5555-5555-4444 for the gravel" } });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.details).toEqual([{ path: "message", message: expect.any(String) }]);
  });

  it("can't pass as a payment reference or last 4", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    const base = { amount: 5, method: "terminal", provider: "elavon_terminal" };
    expect((await authed("POST", "/api/v1/payments", t, { ...base, reference: "4111111111111111" })).statusCode).toBe(422);
    expect((await authed("POST", "/api/v1/payments", t, { ...base, reference: "rec_A1", last4: "4111111111111111" })).statusCode).toBe(422);
    expect((await authed("POST", "/api/v1/payments", t, { ...base, reference: "ref_4111111111111111" })).statusCode).toBe(400);
    expect((await authed("POST", "/api/v1/payments", t, { ...base, reference: "rec_A1", last4: "41111" })).statusCode).toBe(400);
  });

  it("leave identifiers alone (a Luhn-valid id is not a card number)", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    const inv = (await authed("GET", "/api/v1/inventory", t)).json() as { data: { productId: string; qtyOnHand: number }[] };
    const pid = inv.data.find((r) => r.qtyOnHand > 2)!.productId;
    const res = await authed("POST", "/api/v1/orders", t, {
      type: "quote",
      clientId: "4111-1111-1111-1111",
      lines: [{ productId: pid, name: "x", unitLabel: "Each", qty: 1, unitPrice: 10 }],
      paymentMethod: "cash",
      taxRate: 0.0975,
    });
    expect(res.statusCode).toBe(201);
  });

  it("are removed from an inbound SMS before it is stored", async () => {
    const res = await inject({
      method: "POST",
      url: "/api/v1/messaging/webhook",
      headers: { "verification-token": "test-rc-verification-token" },
      payload: { body: { type: "SMS", direction: "Inbound", from: { phoneNumber: "+15105550123" }, subject: "my card is 4111 1111 1111 1111 thanks" } },
    });
    expect(res.statusCode).toBe(200);
    const { messages } = await import("./modules/messaging.js");
    const got = await messages.filter((m) => m.from === "+15105550123");
    expect(got.map((m) => m.body)).toEqual(["my card is [card number removed] thanks"]);
  });
});

describe("card payments", () => {
  it("are never mocked or simulated outside development", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    expect((await authed("POST", "/api/v1/payments", t, { amount: 5, method: "card" })).statusCode).toBe(409);
    expect((await authed("POST", "/api/v1/payments", t, { amount: 5, method: "terminal" })).statusCode).toBe(409);
    const sim = { amount: 5, method: "terminal", reference: "sim_ab12cd34", status: "succeeded" };
    expect((await authed("POST", "/api/v1/payments", t, { ...sim, provider: "elavon_sim" })).statusCode).toBe(409);
    expect((await authed("POST", "/api/v1/payments", t, { ...sim, provider: "elavon_terminal" })).statusCode).toBe(409);
    // Stripe card payments are recorded by the reader capture, from Stripe's result.
    const claimed = { amount: 5, method: "card", reference: "pi_3Abc123", provider: "stripe", status: "succeeded" };
    expect((await authed("POST", "/api/v1/payments", t, claimed)).statusCode).toBe(409);
  });

  it("record a real terminal result, cash and on-account", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    const card = await authed("POST", "/api/v1/payments", t, {
      amount: 5,
      method: "terminal",
      reference: "TuSjNzT0MjI4hu+mWAvGXuoe/Bbz5lcT=",
      provider: "elavon_terminal",
      authCode: "A1B2C3",
      cardBrand: "M/C",
      last4: "4444",
      entryMode: "CHIP",
    });
    expect(card.statusCode).toBe(201);
    expect(card.json().data).toMatchObject({ provider: "elavon_terminal", status: "succeeded", last4: "4444" });
    expect((await authed("POST", "/api/v1/payments", t, { amount: 5, method: "cash" })).json().data.provider).toBe("cash");
    expect((await authed("POST", "/api/v1/payments", t, { amount: 5, method: "account" })).json().data.provider).toBe("account");
  });

  it("Stripe Terminal routes answer 503 instead of simulating without a key", async () => {
    const t = await login(ADMIN, ADMIN_PW);
    expect((await authed("POST", "/api/v1/terminal/connection-token", t)).statusCode).toBe(503);
    expect((await authed("POST", "/api/v1/terminal/payment-intents", t, { amount: 5 })).statusCode).toBe(503);
    expect((await authed("POST", "/api/v1/terminal/payment-intents/pi_x/capture", t, { amount: 5 })).statusCode).toBe(503);
  });
});

describe("RingCentral webhook", () => {
  const sms = { body: { type: "SMS", direction: "Inbound", from: { phoneNumber: "+15105550199" }, subject: "HELLO" } };
  const hook = (headers: Record<string, string>, query = "") =>
    inject({ method: "POST", url: `/api/v1/messaging/webhook${query}`, headers, payload: sms });

  it("needs the Verification-Token header, not ?token=", async () => {
    expect((await hook({})).statusCode).toBe(401);
    expect((await hook({ "verification-token": "wrong" })).statusCode).toBe(401);
    expect((await hook({}, "?token=test-rc-verification-token")).statusCode).toBe(401);
    expect((await hook({ "verification-token": "test-rc-verification-token" })).statusCode).toBe(200);
  });

  it("still answers the subscription handshake", async () => {
    const res = await inject({ method: "POST", url: "/api/v1/messaging/webhook", headers: { "validation-token": "abc123" } });
    expect(res.statusCode).toBe(200);
    expect(res.headers["validation-token"]).toBe("abc123");
  });

  it("refuses every call when no token is configured, except in development", async () => {
    const { webhookAuthorized } = await import("./modules/messaging.js");
    expect(webhookAuthorized(undefined, undefined, false)).toBe(false);
    expect(webhookAuthorized("anything", undefined, false)).toBe(false);
    expect(webhookAuthorized(undefined, undefined, true)).toBe(true);
    expect(webhookAuthorized("tok", "tok", false)).toBe(true);
  });
});

describe("customer display socket", () => {
  it("only accepts signed-in staff from allowed origins; publishing needs register access", async () => {
    const { startDisplayServer } = await import("./lib/display.js");
    const wss = startDisplayServer(0, () => {}); // loopback (HOST default), any free port
    await new Promise((r) => wss.once("listening", r));
    const { port, address } = wss.address() as AddressInfo;
    expect(address).toBe("127.0.0.1");
    const admin = (await login(ADMIN, ADMIN_PW))!;
    const driver = (await login("driver@balm.local", DEMO_PW))!;
    const attempt = (query: string, headers: Record<string, string> = {}) =>
      new Promise<number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/?${query}`, { headers });
        ws.on("open", () => {
          ws.close();
          resolve(101);
        });
        ws.on("unexpected-response", (req, res) => {
          resolve(res.statusCode ?? 0);
          req.destroy();
        });
        ws.on("error", () => resolve(-1));
      });
    try {
      expect(await attempt("role=display&ws=MAIN")).toBe(401);
      expect(await attempt("role=display&ws=MAIN", { cookie: "balm_session=not-a-session" })).toBe(401);
      expect(await attempt("role=display&ws=MAIN", { cookie: `balm_session=${admin}` })).toBe(101);
      expect(await attempt(`role=display&ws=MAIN&token=${admin}`)).toBe(101);
      expect(await attempt("role=display&ws=MAIN", { cookie: `balm_session=${admin}`, origin: "https://evil.example" })).toBe(403);
      expect(await attempt("role=register&ws=MAIN", { cookie: `balm_session=${driver}` })).toBe(403);
      expect(await attempt("role=register&ws=MAIN", { cookie: `balm_session=${admin}`, origin: "https://www.bayarealandscapingmaterials.com" })).toBe(101);
    } finally {
      await new Promise((r) => wss.close(r));
    }
  });
});
