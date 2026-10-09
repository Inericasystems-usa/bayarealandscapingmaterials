import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Collection, newId, type Entity } from "./store.js";
import { decryptField, encryptField } from "./encryption.js";

/**
 * Terminal results signed by the counter-PC bridge. The browser only relays a
 * card approval from the bridge to the API, so the bridge signs each result
 * with HMAC-SHA256 under a secret shared with the API when the bridge was
 * paired (`pnpm --filter @balm/api terminal:devices pair "<name>"`). The secret
 * lives in the bridge's own apps/bridge/.env and, encrypted, in
 * `terminal_devices` here: never in the browser, so a script in the POS page
 * can't make up an approval.
 *
 * The signed message is the JSON array built by `signedMessage`, the same in
 * apps/bridge/signing.js; change both together.
 */

export const SIGNATURE_VERSION = "balm-terminal-v1";
// A result is recorded within moments of the card being taken; anything older
// than five minutes is refused. A minute of clock difference the other way is
// allowed for a counter PC whose clock runs ahead.
export const MAX_AGE_MS = 5 * 60 * 1000;
const MAX_FUTURE_MS = 60 * 1000;

export interface TerminalDevice extends Entity {
  name: string;
  secret: string; // HMAC key, encrypted at rest
  active: boolean;
  lastUsedAt?: string;
  revokedAt?: string;
}
export const terminalDevices = new Collection<TerminalDevice>("terminal_devices");

interface TerminalReceipt extends Entity {
  deviceId: string;
  saleId: string;
  reference: string;
  expireAt: Date;
}
const receipts = new Collection<TerminalReceipt>("terminal_receipts");

/** The fields a signature covers. Missing optional fields are signed as "". */
export interface SignedResult {
  deviceId: string;
  saleId: string;
  amountCents: number;
  currency: string;
  reference: string; // the terminal's transaction id (Datacap RecordNo)
  status: "succeeded" | "failed";
  authCode?: string;
  last4?: string;
  cardBrand?: string;
  entryMode?: string;
  ts: number; // milliseconds since 1970, when the bridge signed it
}

export function signedMessage(r: SignedResult): string {
  return JSON.stringify([
    SIGNATURE_VERSION,
    r.deviceId,
    r.saleId,
    r.amountCents,
    r.currency.toLowerCase(),
    r.reference,
    r.status,
    r.authCode ?? "",
    r.last4 ?? "",
    r.cardBrand ?? "",
    r.entryMode ?? "",
    r.ts,
  ]);
}

export function signResult(secret: string, r: SignedResult): string {
  return createHmac("sha256", secret).update(signedMessage(r), "utf8").digest("hex");
}

export type SignatureRefusal = { code: string; message: string };
const refuse = (code: string, message: string): { refused: SignatureRefusal } => ({ refused: { code, message } });

/**
 * Accept a signed terminal result once. Refused when the signature is missing
 * or wrong (which covers a different sale, amount or status), from an unknown
 * or revoked bridge, older than five minutes, or already used.
 */
export async function acceptSignedResult(
  r: SignedResult,
  signature: string | undefined,
  nowMs: number = Date.now(),
): Promise<{ device: TerminalDevice } | { refused: SignatureRefusal }> {
  if (!signature || !/^[0-9a-f]{64}$/.test(signature) || !r.deviceId)
    return refuse("unsigned_terminal_result", "This card result isn't signed by a paired terminal bridge. Pair the bridge (apps/bridge/README.md).");
  const device = await terminalDevices.find(r.deviceId);
  const secret = device?.active ? decryptField(device.secret) : "";
  if (!device || !secret || secret.startsWith("enc:"))
    return refuse("unknown_terminal", "This terminal bridge isn't paired with the store. Pair it again (apps/bridge/README.md).");
  const expected = Buffer.from(signResult(secret, r), "hex");
  if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
    return refuse("bad_terminal_signature", "The card result doesn't match what the terminal approved.");
  if (!Number.isFinite(r.ts) || nowMs - r.ts > MAX_AGE_MS || r.ts - nowMs > MAX_FUTURE_MS)
    return refuse("stale_terminal_result", "The card result is too old to record. Check the counter PC's clock.");
  try {
    // The digest is the row id, so the unique index on id refuses a second use.
    await receipts.insert({
      id: `trc_${createHash("sha256").update(signature).digest("hex")}`,
      deviceId: device.id,
      saleId: r.saleId,
      reference: r.reference,
      expireAt: new Date(r.ts + 2 * MAX_AGE_MS),
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return refuse("replayed_terminal_result", "This card result has already been recorded.");
    throw err;
  }
  await terminalDevices.update(device.id, { lastUsedAt: new Date(nowMs).toISOString() });
  return { device };
}

/** Pair a new bridge: returns its id and the secret to put in its apps/bridge/.env (shown once). */
export async function pairTerminalDevice(name: string): Promise<{ device: TerminalDevice; secret: string }> {
  const secret = randomBytes(32).toString("hex");
  const device = await terminalDevices.insert({ id: newId("tdev"), name, secret: encryptField(secret), active: true });
  return { device, secret };
}

/** Stop accepting results signed by a bridge (a replaced or lost counter PC). */
export async function revokeTerminalDevice(id: string): Promise<TerminalDevice | null> {
  return terminalDevices.update(id, { active: false, revokedAt: new Date().toISOString() });
}
