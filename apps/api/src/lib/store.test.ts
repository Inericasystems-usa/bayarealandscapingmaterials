import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

/**
 * The store's database-side filters, on a single-node replica set (what
 * production runs): they see a transaction's own writes, roll back with it, and
 * the hot lookups run on an index rather than a collection scan.
 */
let rs: MongoMemoryReplSet;
let store: typeof import("./store.js");
let db: typeof import("./db.js");
const log: string[] = [];

interface Row {
  id: string;
  createdAt: string;
  updatedAt: string;
  kind: string;
  n: number;
  name?: string;
}

beforeAll(async () => {
  rs = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URL = rs.getUri("balm_store_test");
  db = await import("./db.js");
  await db.initDb({ nodeEnv: "production", log: (m) => log.push(m) });
  store = await import("./store.js");
}, 120_000);

afterAll(async () => {
  await db?.closeDb();
  await rs?.stop();
});

describe("store filters", () => {
  it("find, sort, limit, count, list distinct values and delete in the database", async () => {
    const rows = new store.Collection<Row>("store_rows");
    for (const [i, kind] of ["a", "b", "a", "c", "a"].entries())
      await rows.insert({ id: `r${i}`, kind, n: i, name: i === 3 ? "a.b*c" : `name${i}` });
    expect((await rows.findOne({ kind: "a" }))?.id).toBe("r0"); // oldest first, like findBy
    expect((await rows.findOne({ kind: "a" }, { sort: { n: -1 } }))?.id).toBe("r4");
    expect(await rows.findOne({ kind: "z" })).toBeNull();
    expect((await rows.where({ kind: "a" }, { sort: { n: -1 }, limit: 2 })).map((r) => r.id)).toEqual(["r4", "r2"]);
    expect((await rows.where({ n: { $gte: 1, $lte: 3 } })).map((r) => r.id)).toEqual(["r1", "r2", "r3"]);
    expect(await rows.count({ kind: "a" })).toBe(3);
    expect(await rows.count()).toBe(5);
    expect((await rows.distinct("kind")).sort()).toEqual(["a", "b", "c"]);
    // A prefix is matched literally: regex characters in it mean nothing.
    expect((await rows.where({ name: store.startsWith("a.b*") })).map((r) => r.id)).toEqual(["r3"]);
    expect(await rows.where({ name: store.startsWith("a.") })).toHaveLength(1);
    expect(await rows.where({ name: store.startsWith(".*") })).toHaveLength(0);
    expect(await rows.removeWhere({ kind: "a" })).toBe(3);
    expect(await rows.count()).toBe(2);
  });

  it("update can remove fields", async () => {
    const rows = new store.Collection<Row>("store_unset");
    await rows.insert({ id: "u1", kind: "x", n: 1, name: "gone" });
    const after = await rows.update("u1", { n: 2 }, { unset: ["name"] });
    expect(after).toMatchObject({ id: "u1", n: 2 });
    expect(after && "name" in after).toBe(false);
  });
});

describe("transactions on a replica set", () => {
  it("are on, and the start says so", () => {
    expect(db.transactionsSupported()).toBe(true);
    expect(log.join("\n")).toMatch(/transactions: on/);
  });

  it("filters see the transaction's own writes, and a failure rolls them back", async () => {
    const rows = new store.Collection<Row>("store_txn");
    await rows.insert({ id: "t0", kind: "keep", n: 0 });
    const seen = await db.withTransaction(async () => {
      await rows.insert({ id: "t1", kind: "new", n: 1 });
      return { one: await rows.findOne({ kind: "new" }), many: await rows.where({ kind: "new" }), count: await rows.count({ kind: "new" }) };
    });
    expect(seen.one?.id).toBe("t1");
    expect(seen.many).toHaveLength(1);
    expect(seen.count).toBe(1);

    await expect(
      db.withTransaction(async () => {
        await rows.insert({ id: "t2", kind: "doomed", n: 2 });
        expect(await rows.findOne({ kind: "doomed" })).not.toBeNull();
        expect(await rows.removeWhere({ kind: "keep" })).toBe(1);
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(await rows.findOne({ kind: "doomed" })).toBeNull();
    expect(await rows.count({ kind: "keep" })).toBe(1);
  });
});

describe("hot lookups use an index", () => {
  // The index the winning plan reads, or "COLLSCAN".
  async function planIndex(collection: string, filter: Record<string, unknown>, sort: Record<string, 1 | -1> = { createdAt: 1, id: 1 }) {
    const { getModel } = await import("../models/base.js");
    const plan = JSON.stringify(await getModel(collection).find(filter).sort(sort).explain("queryPlanner"));
    return /COLLSCAN/.test(plan) ? "COLLSCAN" : (/"indexName":"([^"]+)"/.exec(plan)?.[1] ?? "none");
  }

  it("for sessions, sign-in, offline sales, stock, messaging, drawers and leads", async () => {
    // Enough rows that a selective index clearly wins over the createdAt one.
    const { getModel } = await import("../models/base.js");
    const now = new Date().toISOString();
    const many = (f: (i: number) => Record<string, unknown>) => Array.from({ length: 60 }, (_, i) => ({ id: `x${i}`, createdAt: now, ...f(i) }));
    await getModel("sessions").insertMany(many((i) => ({ tokenHash: `h${i}`, userId: `u${i}` })));
    await getModel("users").insertMany(many((i) => ({ email: `user${i}@example.com`, role: "cashier" })));
    await getModel("orders").insertMany(many((i) => ({ clientId: `c${i}`, number: `ORD-20260101-${i}` })));
    await getModel("inventory").insertMany(many((i) => ({ productId: `p${i}` })));
    await getModel("message_optouts").insertMany(many((i) => ({ phone: `+1510555${1000 + i}` })));
    await getModel("register-sessions").insertMany(many((i) => ({ status: i ? "closed" : "open", workstationId: `w${i}` })));
    await getModel("leads").insertMany(many((i) => ({ email_sha256: `e${i}`, phone_sha256: `p${i}` })));

    expect(await planIndex("sessions", { tokenHash: "h7" })).toBe("tokenHash_1");
    expect(await planIndex("users", { email: "user7@example.com" })).toBe("email_1");
    expect(await planIndex("orders", { clientId: "c7" })).toBe("clientId_1");
    expect(await planIndex("orders", { number: { $regex: "^ORD-20260101-7" } })).toBe("number_1");
    expect(await planIndex("inventory", { productId: "p7" })).toBe("productId_1");
    expect(await planIndex("message_optouts", { phone: "+15105551007" })).toBe("phone_1");
    expect(await planIndex("register-sessions", { status: "open", workstationId: "w0" })).toBe("workstationId_1_status_1");
    expect(await planIndex("leads", { email_sha256: "e7" })).toBe("email_sha256_1");
  });
});
