import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { syncAllIndexes } from "./index.js";

/**
 * Index building at start: a unique index that can't be built is reported by
 * collection and name instead of vanishing, and the TTL index on sessions is
 * there for MongoDB to expire them.
 */
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri("balm_index_test"), { autoIndex: false });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const indexes = async (collection: string) =>
  (await mongoose.connection.db!.collection(collection).indexes()) as { name?: string; unique?: boolean; expireAfterSeconds?: number }[];

describe("index sync", () => {
  it("reports a unique index blocked by duplicates, and still indexes the lookups", async () => {
    const users = mongoose.connection.db!.collection("users");
    const now = new Date().toISOString();
    await users.insertMany([
      { id: "usr_a", email: "dup@example.com", createdAt: now },
      { id: "usr_b", email: "dup@example.com", createdAt: now },
    ]);
    const warnings: string[] = [];
    await syncAllIndexes((m) => warnings.push(m));
    const warning = warnings.find((w) => w.includes("users"));
    expect(warning).toMatch(/users: index email_1 \(unique\) was not built \(DuplicateKey; the collection holds duplicate values\)/);
    expect(warning).not.toContain("dup@example.com"); // the duplicate value stays out of the log
    const email = (await indexes("users")).find((i) => i.name === "email_1");
    expect(email).toBeDefined();
    expect(email?.unique).toBeFalsy();
    // Every other collection's indexes were built regardless.
    expect((await indexes("orders")).map((i) => i.name)).toContain("clientId_1");

    // Once the duplicate is gone, the next start builds the unique index.
    await users.deleteOne({ id: "usr_b" });
    warnings.length = 0;
    await syncAllIndexes((m) => warnings.push(m));
    expect(warnings).toEqual([]);
    expect((await indexes("users")).find((i) => i.name === "email_1")?.unique).toBe(true);
    await expect(users.insertOne({ id: "usr_c", email: "dup@example.com" })).rejects.toMatchObject({ code: 11000 });
  });

  it("expire sessions by their expireAt date", async () => {
    await syncAllIndexes(() => undefined);
    const ttl = (await indexes("sessions")).find((i) => i.name === "expireAt_1");
    expect(ttl?.expireAfterSeconds).toBe(0);
  });
});
