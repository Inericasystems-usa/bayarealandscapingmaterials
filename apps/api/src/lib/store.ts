import { randomUUID } from "node:crypto";
import type { Model, SortOrder } from "mongoose";
import { getModel, toEntity } from "../models/base.js";
import { currentSession } from "./db.js";

/**
 * Generic collection store backed by MongoDB (Mongoose). Routes call only these
 * methods, so the persistence layer stays invisible to every module. Each named
 * Collection resolves to its typed Mongoose model (see ../models); when a name
 * has no declared model a permissive one is created (used by ad-hoc/test data).
 */

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

export interface Entity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

/** Keyset pagination request. */
export interface PageQuery {
  limit: number;
  cursor?: string | null; // opaque; encodes the last row's (createdAt, id)
  order?: "asc" | "desc"; // by createdAt (default "desc" — newest first)
  where?: Record<string, string>; // equality on top-level string fields
  likePrefix?: { field: string; value: string }; // startsWith on one field
}
export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
}

/** Indexed filter (no pagination) — fetch just the rows a report needs. Range
 *  bounds are inclusive string comparisons; the caller supplies exact bounds. */
export interface RangeQuery {
  where?: Record<string, string>; // equality on top-level string fields
  range?: { field: string; from?: string; to?: string };
  order?: "asc" | "desc"; // by the range field (or createdAt), default asc
}

// Opaque cursor = base64url("<createdAt> <id>"). A space can't appear in an ISO
// date or our ids, so it's an unambiguous separator.
const CURSOR_SEP = " ";
function encodeCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}${CURSOR_SEP}${id}`, "utf8").toString("base64url");
}
function decodeCursor(c: string): { createdAt: string; id: string } | null {
  try {
    const [createdAt, id] = Buffer.from(c, "base64url").toString("utf8").split(CURSOR_SEP);
    return createdAt !== undefined && id !== undefined ? { createdAt, id } : null;
  } catch {
    return null;
  }
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Fetch limit+1 rows, then split off the extra to compute the next cursor.
function pageResult<T extends Entity>(rows: T[], limit: number): PageResult<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null };
}

/**
 * Keyset-paginate an already-loaded, already-filtered array. For endpoints that
 * must filter in memory before paging (e.g. customer search, which decrypts PII
 * then substring-matches). Sorts by (createdAt, id) — same order as the store.
 */
export function paginateInMemory<T extends Entity>(
  items: T[],
  opts: { limit: number; cursor?: string | null; order?: "asc" | "desc" },
): PageResult<T> {
  const desc = (opts.order ?? "desc") === "desc";
  const key = (x: T): string => `${x.createdAt} ${x.id}`;
  const sorted = [...items].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * (desc ? -1 : 1));
  const cur = opts.cursor ? decodeCursor(opts.cursor) : null;
  const start = cur ? Math.max(0, sorted.findIndex((x) => x.createdAt === cur.createdAt && x.id === cur.id) + 1) : 0;
  return pageResult(sorted.slice(start, start + opts.limit + 1), opts.limit);
}

function buildInsert<T extends Entity>(data: Omit<T, "id" | "createdAt" | "updatedAt"> & { id?: string }): T {
  const now = new Date().toISOString();
  return { ...(data as object), id: data.id ?? newId("x"), createdAt: now, updatedAt: now } as T;
}

/** The active transaction session (or null) — threaded into every query. */
const sess = () => currentSession() ?? null;

/**
 * MongoDB-backed collection. Preserves the exact interface the JSON/Postgres
 * stores exposed — including the JS-predicate `find/filter`, which load the
 * collection then filter in memory (kept for parity with callers like customer
 * search that decrypt PII before matching).
 */
export class Collection<T extends Entity> {
  constructor(private readonly name: string) {}

  // Untyped internally on purpose — see getModel(). Collection<T> supplies the
  // caller-facing types; this avoids a tsc type-instantiation blow-up.
  private get model(): Model<Record<string, unknown>> {
    return getModel(this.name);
  }

  private async rows(): Promise<T[]> {
    const docs = await this.model
      .find({})
      .sort({ createdAt: 1, id: 1 })
      .session(sess())
      .lean();
    return docs.map((d) => toEntity<T>(d));
  }

  async all(): Promise<T[]> {
    return this.rows();
  }

  async find(id: string): Promise<T | null> {
    const doc = await this.model.findOne({ id }).session(sess()).lean();
    return doc ? toEntity<T>(doc) : null;
  }

  async findBy(pred: (x: T) => boolean): Promise<T | null> {
    return (await this.rows()).find(pred) ?? null;
  }

  async filter(pred: (x: T) => boolean): Promise<T[]> {
    return (await this.rows()).filter(pred);
  }

  async page(q: PageQuery): Promise<PageResult<T>> {
    const desc = (q.order ?? "desc") === "desc";
    const filter: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(q.where ?? {})) filter[k] = v;
    if (q.likePrefix) filter[q.likePrefix.field] = { $regex: `^${escapeRegex(q.likePrefix.value)}` };
    const cur = q.cursor ? decodeCursor(q.cursor) : null;
    if (cur) {
      const cmp = desc ? "$lt" : "$gt";
      filter.$or = [
        { createdAt: { [cmp]: cur.createdAt } },
        { createdAt: cur.createdAt, id: { [cmp]: cur.id } },
      ];
    }
    const dir: SortOrder = desc ? -1 : 1;
    const docs = await this.model
      .find(filter)
      .sort({ createdAt: dir, id: dir })
      .limit(q.limit + 1) // one extra to detect a next page
      .session(sess())
      .lean();
    return pageResult(docs.map((d) => toEntity<T>(d)), q.limit);
  }

  async query(q: RangeQuery): Promise<T[]> {
    const filter: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(q.where ?? {})) filter[k] = v;
    const rf = q.range?.field;
    if (rf && (q.range?.from !== undefined || q.range?.to !== undefined)) {
      const bounds: Record<string, string> = {};
      if (q.range?.from !== undefined) bounds.$gte = q.range.from;
      if (q.range?.to !== undefined) bounds.$lte = q.range.to;
      filter[rf] = bounds;
    }
    const orderField = rf ?? "createdAt";
    const dir: SortOrder = (q.order ?? "asc") === "desc" ? -1 : 1;
    const docs = await this.model
      .find(filter)
      .sort({ [orderField]: dir, id: dir })
      .session(sess())
      .lean();
    return docs.map((d) => toEntity<T>(d));
  }

  async insert(data: Omit<T, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<T> {
    const item = buildInsert<T>(data);
    const doc = new this.model(item);
    await doc.save(sess() ? { session: sess()! } : undefined);
    return item;
  }

  async update(id: string, patch: Partial<T>): Promise<T | null> {
    // Shallow top-level merge (parity with the previous stores): $set overrides
    // the given keys; id + updatedAt are forced. Drop undefined so a partial
    // patch leaves unspecified fields intact.
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const set = { ...clean, id, updatedAt: new Date().toISOString() };
    const doc = await this.model
      .findOneAndUpdate({ id }, { $set: set }, { new: true })
      .session(sess())
      .lean();
    return doc ? toEntity<T>(doc) : null;
  }

  /**
   * Atomic update of row `id`, created if missing: `inc` adds to numeric fields
   * and `max` raises fields to at least the given values (ISO dates compare
   * correctly as strings). Returns the updated row. Unlike find-then-update,
   * parallel calls never read the same value.
   */
  async bump(id: string, change: { inc?: { [K in keyof T]?: number }; max?: Partial<T> }): Promise<T> {
    const now = new Date().toISOString();
    const doc = await this.model
      .findOneAndUpdate(
        { id },
        {
          ...(change.inc && { $inc: change.inc }),
          ...(change.max && { $max: change.max }),
          $set: { updatedAt: now },
          $setOnInsert: { createdAt: now },
        },
        { new: true, upsert: true },
      )
      .session(sess())
      .lean();
    return toEntity<T>(doc);
  }

  async remove(id: string): Promise<boolean> {
    const r = await this.model.deleteOne({ id }).session(sess());
    return (r.deletedCount ?? 0) > 0;
  }

  async count(): Promise<number> {
    return this.model.countDocuments({}).session(sess());
  }

  async seedIfEmpty(items: T[]): Promise<boolean> {
    if ((await this.count()) > 0) return false;
    if (items.length) await this.model.insertMany(items, { ordered: false, session: sess() ?? undefined });
    return true;
  }
}
