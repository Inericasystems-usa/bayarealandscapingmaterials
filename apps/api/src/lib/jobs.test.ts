import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { createJobRunner } from "./jobs.js";

/**
 * The runner's promises: no overlapping runs, one instance per job, retries
 * with backoff, honest health. Real timers with short intervals.
 */
let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const quiet = () => undefined;

describe("job runner", () => {
  it("never starts a run while the previous one is still going", async () => {
    const runner = createJobRunner({ collection: "jobs_overlap", log: quiet });
    let active = 0;
    let maxActive = 0;
    let runs = 0;
    runner.start({
      name: "slow",
      everyMs: 10,
      runAtStart: true,
      run: async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        runs += 1;
        await sleep(80); // eight intervals long
        active -= 1;
      },
    });
    await sleep(400);
    await runner.stop();
    expect(runs).toBeGreaterThanOrEqual(2);
    expect(maxActive).toBe(1);
  });

  it("runs a job on one instance at a time", async () => {
    const a = createJobRunner({ owner: "instance-a", collection: "jobs_lease", log: quiet });
    const b = createJobRunner({ owner: "instance-b", collection: "jobs_lease", log: quiet });
    let concurrent = 0;
    let maxConcurrent = 0;
    const run = async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await sleep(60);
      concurrent -= 1;
    };
    a.start({ name: "sweep", everyMs: 5, runAtStart: true, leaseMs: 5_000, run });
    b.start({ name: "sweep", everyMs: 5, runAtStart: true, leaseMs: 5_000, run });
    await sleep(500);
    await Promise.all([a.stop(), b.stop()]);
    expect(maxConcurrent).toBe(1);
  });

  it("retries a failed run sooner than the interval, and records the failure", async () => {
    const logs: string[] = [];
    const runner = createJobRunner({ collection: "jobs_retry", log: (m) => logs.push(m) });
    let calls = 0;
    runner.start({
      name: "flaky",
      everyMs: 60 * 60_000, // an hour: only a retry can bring a second call within the test
      runAtStart: true,
      run: async () => {
        calls += 1;
        throw new Error("provider timeout");
      },
    });
    await sleep(300);
    expect(calls).toBe(1);
    expect(logs.join("\n")).toMatch(/flaky failed \(1 in a row\), retrying in 30s: provider timeout/);
    expect(await runner.health()).toEqual({ flaky: "failing" });
    const row = await mongoose.connection.db!.collection("jobs_retry").findOne({ id: "flaky" });
    expect(row?.failures).toBe(1);
    expect(row?.lastError).toBe("provider timeout");
    await runner.stop();
  });

  it("reports ok after a success and stale when nothing has succeeded for three intervals", async () => {
    const runner = createJobRunner({ collection: "jobs_health", log: quiet });
    runner.start({ name: "fine", everyMs: 1_000, runAtStart: true, run: async () => undefined });
    await sleep(200);
    expect(await runner.health()).toEqual({ fine: "ok" });
    expect(await runner.health(Date.now() + 10 * 60_000)).toEqual({ fine: "stale" });
    await runner.stop();
  });

  it("hands its lease back on stop, so another instance takes over at once", async () => {
    const a = createJobRunner({ owner: "old-release", collection: "jobs_handover", log: quiet });
    const b = createJobRunner({ owner: "new-release", collection: "jobs_handover", log: quiet });
    let ranOnB = 0;
    a.start({ name: "renew", everyMs: 60_000, runAtStart: true, leaseMs: 60 * 60_000, run: () => sleep(150) });
    await sleep(50); // a holds the lease mid-run
    await a.stop();
    b.start({ name: "renew", everyMs: 60_000, runAtStart: true, run: async () => void (ranOnB += 1) });
    await sleep(200);
    await b.stop();
    expect(ranOnB).toBe(1);
  });
});
