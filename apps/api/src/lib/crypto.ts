import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

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
