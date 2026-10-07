import { createHash } from "node:crypto";

/**
 * SHA-256 for Google conversion matching (Enhanced Conversions for leads,
 * offline conversion import).
 *
 * Google compares hashes of NORMALIZED values, so callers must normalize first
 * — `normalizeEmail` / `toE164` from @balm/lib-domain, the exact same functions
 * the browser uses. Hashing an un-normalized value produces a digest that
 * silently matches nothing.
 *
 * Output is lowercase hex, always 64 characters — the format Google's importer
 * expects.
 *
 * The raw value never leaves this function: it is hashed and discarded, and no
 * caller logs it.
 */
export function sha256Hex(value: string | undefined | null): string | undefined {
  if (!value) return undefined;
  return createHash("sha256").update(value, "utf8").digest("hex");
}
