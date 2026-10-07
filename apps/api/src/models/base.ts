import mongoose, { Schema, type Model } from "mongoose";

// Field definitions are kept loosely typed (`FieldDefs`) on purpose: letting tsc
// infer a document type from each of the ~28 schema literals against Mongoose's
// SchemaDefinition generic blows up the type-checker's heap.
type FieldDefs = Record<string, unknown>;

/**
 * Shared Mongoose foundation for every entity model.
 *
 * Each collection gets its OWN typed schema (see ./index.ts). This module holds
 * the pieces they share: the base `id`/`createdAt`/`updatedAt` fields, the schema
 * options that keep documents byte-for-byte compatible with the pre-Mongo wire
 * contract, and the registry the store reads models from.
 *
 * Contract-preservation rules baked in here:
 *   • `createdAt`/`updatedAt` are ISO **strings**, not Mongoose `Date`s — the
 *     keyset cursor and range queries compare them lexicographically, exactly as
 *     the old Postgres/JSON store did. (So NOT `timestamps: true`.)
 *   • `versionKey: false` drops `__v`; `toEntity()` strips `_id` on read — callers
 *     see only the fields the entity interface declares.
 *   • `minimize: false` keeps empty sub-objects (`{}`) instead of dropping them.
 */

// The three fields every Entity carries. `id` is our application id (e.g.
// `prd_ab12cd34`), unique and indexed — Mongo's own `_id` is ignored on the wire.
const BASE_FIELDS: FieldDefs = {
  id: { type: String, required: true, unique: true },
  createdAt: { type: String, index: true },
  updatedAt: { type: String },
};

const SCHEMA_OPTS = { versionKey: false, minimize: false, strict: true } as const;

/**
 * Build + register a model for `name` with the given field definitions and
 * secondary indexes. Idempotent — returns the existing model if already defined
 * (so hot-reload / repeated imports don't throw OverwriteModelError).
 */
export function defineModel(
  name: string,
  fields: FieldDefs,
  indexes: Array<Record<string, 1 | -1>> = [],
): Model<FieldDefs> {
  const existing = mongoose.models[name];
  if (existing) return existing as unknown as Model<FieldDefs>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = new Schema<FieldDefs>({ ...BASE_FIELDS, ...fields } as any, { collection: name, ...SCHEMA_OPTS });
  for (const idx of indexes) schema.index(idx);
  // 3rd arg pins the exact collection name (no Mongoose auto-pluralization).
  return mongoose.model<FieldDefs>(name, schema, name);
}

// Loose fallback for ad-hoc collections without a declared schema (e.g. tests).
function looseModel(name: string): Model<FieldDefs> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const schema = new Schema<FieldDefs>({ ...BASE_FIELDS } as any, { collection: name, ...SCHEMA_OPTS, strict: false });
  return mongoose.model<FieldDefs>(name, schema, name);
}

/**
 * Resolve the model for a collection name — typed if declared, else loose.
 * Returned deliberately untyped (`Model<any>`): Mongoose's FilterQuery<T> expands
 * recursively over nested entity fields and would explode tsc across our ~28
 * collections. The caller-facing typing lives in Collection<T> (lib/store.ts).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getModel(name: string): Model<any> {
  const existing = mongoose.models[name];
  return existing ?? looseModel(name);
}

/** Strip Mongo internals so a lean doc matches the exact wire entity shape. */
export function toEntity<T>(doc: unknown): T {
  if (!doc || typeof doc !== "object") return doc as T;
  const { _id, __v, ...rest } = doc as Record<string, unknown>;
  void _id;
  void __v;
  return rest as T;
}
