import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { config } from "../config.js";

/**
 * Application-level field encryption at rest for sensitive data (customer PII,
 * the website sync token). AES-256-GCM with a key derived from
 * DATA_ENCRYPTION_KEY.
 *
 * Production refuses to start without a key (config.ts). Elsewhere, with no
 * key, values are stored as plaintext and a one-time warning is logged.
 * Decryption is back-compatible: anything without the `enc:v1:` prefix is
 * returned unchanged, so plaintext written before the key was set keeps
 * working; it is encrypted the next time it is written, or all at once by
 * `pnpm --filter @balm/api encrypt:fields` (src/scripts/encrypt-fields.ts).
 *
 * Note: this is randomized (per-value IV), so it is NOT searchable at rest —
 * decrypt into memory before filtering. Do not use it for exact-match lookup
 * keys (e.g. the SMS opt-out phone index).
 */

const PREFIX = "enc:v1:";
const IV_LEN = 12;
const TAG_LEN = 16;

let cachedKey: Buffer | null | undefined; // undefined = not yet resolved
function getKey(): Buffer | null {
  if (cachedKey === undefined) {
    const raw = config.DATA_ENCRYPTION_KEY?.trim();
    // Derive a stable 32-byte key from any configured secret (any string works).
    cachedKey = raw ? scryptSync(raw, "inerica-pos-data-v1", 32) : null;
  }
  return cachedKey;
}

let warned = false;
function warnOnce(): void {
  if (!warned) {
    warned = true;
    console.warn("⚠️  DATA_ENCRYPTION_KEY not set — sensitive fields stored as plaintext.");
  }
}

/** True for a value already encrypted by encryptField. */
export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

/** True when a data-encryption key is configured. */
export function isEncryptionConfigured(): boolean {
  return getKey() !== null;
}

/** Encrypt a value for storage. No-op on empty / already-encrypted / unconfigured. */
export function encryptField(plaintext: string): string {
  if (!plaintext || plaintext.startsWith(PREFIX)) return plaintext;
  const key = getKey();
  if (!key) {
    warnOnce();
    return plaintext;
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt a stored value. Non-encrypted input is returned unchanged (back-compat). */
export function decryptField(value: string): string {
  if (!value || !value.startsWith(PREFIX)) return value;
  const key = getKey();
  if (!key) return value; // no key to decrypt with — return as stored
  try {
    const buf = Buffer.from(value.slice(PREFIX.length), "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    return value; // corrupt or wrong key — return raw rather than crash a read
  }
}
