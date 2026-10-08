import mongoose, { mongo } from "mongoose";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "../config.js";
import { syncAllIndexes } from "../models/index.js";

/**
 * MongoDB connection (via Mongoose) — the sole persistence backend. Every
 * collection is a typed Mongoose model (see ../models); the store (lib/store.ts)
 * talks to those models through the Collection<T> façade, so modules are unaware
 * of Mongo.
 *
 * Importing this module registers all models (side effect of importing
 * ../models). `initDb()` opens the connection and builds indexes.
 */

export function isDbConfigured(): boolean {
  return Boolean(config.MONGODB_URL);
}

export function storeMode(): "mongodb" {
  return "mongodb";
}

// ── Multi-tenancy seam (dormant) ──────────────────────────────────────
// Kept for API compatibility with the previous store. There is one tenant per
// deployment today, so nothing scopes by it; a future cloud version resolves the
// tenant per request and wraps handlers in runWithTenant().
export const DEFAULT_TENANT = "default";
const tenantStore = new AsyncLocalStorage<string>();
export function currentTenant(): string {
  return tenantStore.getStore() ?? DEFAULT_TENANT;
}
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return tenantStore.run(tenantId, fn);
}

// Whether the connected server supports multi-document transactions (replica set
// or mongos). Standalone mongod does not: withTransaction() then runs without
// rollback, which production refuses (see transactionModeProblem).
let txnSupported = false;

/** Whether multi-document transactions are in use (false until initDb() runs). */
export function transactionsSupported(): boolean {
  return txnSupported;
}

/**
 * Why the API must not run against this server, or null. Production needs a
 * replica set (a single-node one is fine; MongoDB Atlas always is one): on a
 * standalone server a sale's stock moves and order row can half-commit. Setting
 * MONGODB_ALLOW_STANDALONE=true accepts that explicitly.
 */
export function transactionModeProblem(nodeEnv: string, supported: boolean, allowStandalone: string | undefined): string | null {
  if (supported || nodeEnv !== "production" || allowStandalone === "true") return null;
  return (
    "MongoDB is a standalone server, so writes that belong together can't be made atomic. " +
    "Run it as a replica set (deploy/DEPLOY.md), or set MONGODB_ALLOW_STANDALONE=true to accept non-atomic writes."
  );
}

/**
 * Connect, build indexes, and probe transaction support. In production a
 * standalone server is refused (transactionModeProblem). Idempotent-ish.
 */
export async function initDb(
  opts: { nodeEnv?: string; allowStandalone?: string; log?: (msg: string) => void } = {},
): Promise<void> {
  const { nodeEnv = config.NODE_ENV, allowStandalone = config.MONGODB_ALLOW_STANDALONE, log = (m) => console.log(m) } = opts;
  if (mongoose.connection.readyState === 0) {
    // Indexes are built once below, where failures are reported, not on model compile.
    await mongoose.connect(config.MONGODB_URL, { serverSelectionTimeoutMS: 8000, autoIndex: false });
  }
  await syncAllIndexes();
  txnSupported = await probeTxnSupport();
  const problem = transactionModeProblem(nodeEnv, txnSupported, allowStandalone);
  if (problem) throw new Error(problem);
  log(
    txnSupported
      ? "🗄️  MongoDB transactions: on (replica set)"
      : "🗄️  MongoDB transactions: OFF (standalone server, writes are not atomic)",
  );
}

async function probeTxnSupport(): Promise<boolean> {
  try {
    const info = (await mongoose.connection.db?.admin().command({ hello: 1 })) as
      | { setName?: string; msg?: string }
      | undefined;
    return Boolean(info?.setName) || info?.msg === "isdbgrid";
  } catch {
    return false;
  }
}

/** The GridFS bucket holding uploaded image bytes (collections uploads.files and uploads.chunks). */
export function uploadsBucket(): mongo.GridFSBucket {
  const db = mongoose.connection.db;
  if (!db) throw new Error("MongoDB is not connected");
  return new mongo.GridFSBucket(db, { bucketName: "uploads" });
}

/** Liveness probe target for /ready. Throws if Mongo is unreachable. */
export async function ping(): Promise<void> {
  await mongoose.connection.db?.admin().command({ ping: 1 });
}

export async function closeDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

// ── Transactions ──────────────────────────────────────────────────────
// AsyncLocalStorage binds the active session (and post-commit callbacks) to the
// current async scope, so the store's Collection methods automatically pass the
// session when inside withTransaction() — no API changes at the call sites.
interface TxCtx {
  session: mongoose.ClientSession | null;
  after: Array<() => void>;
}
const txStore = new AsyncLocalStorage<TxCtx>();

/** The active transaction session, or undefined when not in one. */
export function currentSession(): mongoose.ClientSession | undefined {
  return txStore.getStore()?.session ?? undefined;
}

/** Run a side-effect after the current transaction commits (immediately if none). */
export function afterCommit(fn: () => void): void {
  const ctx = txStore.getStore();
  if (ctx) ctx.after.push(fn);
  else fn();
}

function runAfter(ctx: TxCtx): void {
  for (const cb of ctx.after) {
    try {
      cb();
    } catch {
      /* post-commit side-effects are best-effort */
    }
  }
}

/**
 * Run `fn` atomically when the server supports transactions (replica set); every
 * store write inside then commits/rolls back together. On a standalone mongod
 * (development and tests; production only with MONGODB_ALLOW_STANDALONE=true)
 * `fn` runs directly with no rollback.
 * Post-commit callbacks fire once `fn` completes either way.
 *
 * The transaction-support decision is made BEFORE running `fn`, so a business
 * error thrown inside `fn` is never retried non-transactionally (no double-apply).
 */
export async function withTransaction<T>(fn: () => Promise<T>): Promise<T> {
  if (!txnSupported) {
    const ctx: TxCtx = { session: null, after: [] };
    const result = await txStore.run(ctx, fn);
    runAfter(ctx);
    return result;
  }
  const session = await mongoose.connection.startSession();
  const ctx: TxCtx = { session, after: [] };
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await txStore.run(ctx, fn);
    });
    runAfter(ctx);
    return result;
  } finally {
    await session.endSession().catch(() => undefined);
  }
}
