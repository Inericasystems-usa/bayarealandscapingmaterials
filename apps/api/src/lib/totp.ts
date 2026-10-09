import { createHmac, randomBytes } from "node:crypto";
import { safeEqual } from "./crypto.js";

/**
 * Time-based one-time codes (RFC 6238) for admin and manager sign-in: 30-second
 * steps, 6 digits, HMAC-SHA1, which is what every authenticator app (Google
 * Authenticator, Microsoft Authenticator, 1Password, Authy) expects by default.
 * Built on node:crypto only.
 */

export const TOTP_PERIOD_S = 30;
export const TOTP_DIGITS = 6;
// A code from the step before or after the current one is still accepted, so a
// phone clock a few seconds out (or a code typed as it rolls over) works.
const DRIFT_STEPS = 1;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 without padding, as authenticator apps take secrets. */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Reads base32 the way people type it: any case, spaces and padding ignored. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const v = BASE32.indexOf(ch);
    if (v < 0) throw new Error("not base32");
    value = (value << 5) | v;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new 160-bit secret (the RFC 4226 recommended length), base32. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 30-second step a moment falls in. */
export function totpStep(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_S);
}

/** The RFC 4226 code for one counter value. */
export function hotp(secret: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** TOTP_DIGITS;
  return String(bin).padStart(TOTP_DIGITS, "0");
}

/** The code an authenticator shows at `nowMs`. */
export function totpCode(secret: string, nowMs: number = Date.now()): string {
  return hotp(secret, totpStep(nowMs));
}

/**
 * The step `code` belongs to, or null. Only steps after `lastStep` count, so a
 * code that has been used once (or an older one) is refused for the rest of
 * its window.
 */
export function matchTotp(secret: string, code: string, lastStep: number | null | undefined, nowMs: number = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpStep(nowMs);
  let found: number | null = null;
  // Every candidate is checked, so the time taken doesn't say which one matched.
  for (let step = now - DRIFT_STEPS; step <= now + DRIFT_STEPS; step++) {
    if (safeEqual(hotp(secret, step), code) && step > (lastStep ?? -1) && found === null) found = step;
  }
  return found;
}

/** The otpauth:// link an authenticator app reads from the QR code. */
export function otpauthUri(issuer: string, account: string, secret: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_S),
  });
  return `otpauth://totp/${label}?${params.toString().replace(/\+/g, "%20")}`;
}

// Recovery codes: 16 base32 characters (80 bits) in four groups, e.g.
// "k7wq-3mzp-x2ra-9tfd". Random enough that a SHA-256 digest is a safe way to
// store them, like session tokens.
const RECOVERY_GROUPS = 4;
const RECOVERY_GROUP_LEN = 4;

/** Ten new single-use recovery codes, as shown to the user once. */
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const raw = base32Encode(randomBytes(10)).toLowerCase(); // 16 characters
    const groups: string[] = [];
    for (let g = 0; g < RECOVERY_GROUPS; g++) groups.push(raw.slice(g * RECOVERY_GROUP_LEN, (g + 1) * RECOVERY_GROUP_LEN));
    return groups.join("-");
  });
}

/** A recovery code as typed (any case, with or without dashes or spaces), or null if it isn't one. */
export function normalizeRecoveryCode(input: string): string | null {
  const clean = input.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-z2-7]{16}$/.test(clean) ? clean : null;
}
