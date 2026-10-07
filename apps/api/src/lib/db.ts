import mongoose from "mongoose";
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
// or mongos). Standalone mongod does not — withTransaction() degrades gracefully.
let txnSupported = false;

/** Connect, register indexes, and probe transaction support. Idempotent-ish. */
export async function initDb(): Promise<void> {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.MONGODB_URL, { serverSelectionTimeoutMS: 8000 });
  }
  await syncAllIndexes();
  txnSupported = await probeTxnSupport();
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
 * transactions aren't available, so `fn` runs directly with no rollback — the
 * documented best-effort degrade (identical to the previous JSON-store fallback).
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
