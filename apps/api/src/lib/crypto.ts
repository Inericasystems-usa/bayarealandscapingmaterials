import { scryptSync, randomBytes, timingSafeEqual, createHash } from "node:crypto";

/**
 * Password hashing (scrypt) + opaque session tokens. No external deps — this is
 * the same primitive a production auth service would use; only the session
 * store changes when we move off the file store.
 */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const test = scryptSync(password, salt, 64);
  const orig = Buffer.from(hash, "hex");
  return test.length === orig.length && timingSafeEqual(test, orig);
}

export function newToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * One-way digest of a session token (or other lookup key). The store keeps only
 * this, so a database copy can't be replayed as a login (PCI DSS 8.3.2). Tokens
 * are 192-bit random, so a fast hash is enough.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Constant-time string compare (no secret leaks through response timing). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
