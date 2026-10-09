// Signs terminal results for the API. The browser relays each card result from
// this bridge to the API, so the bridge signs it with HMAC-SHA256 under a
// secret it shares only with the API: the browser can pass the result on but
// can't make one up or change the sale, amount or outcome.
//
// The secret comes from pairing on the server
// (`pnpm --filter @balm/api terminal:devices pair "<name>"`) and lives only in
// this PC's apps/bridge/.env as TERMINAL_DEVICE_ID and TERMINAL_SIGNING_SECRET.
//
// The signed message must match apps/api/src/lib/terminal-signature.ts exactly;
// change both together.

const crypto = require("node:crypto");

const SIGNATURE_VERSION = "balm-terminal-v1";
const DEVICE_ID_FORMAT = /^[A-Za-z0-9_-]{1,40}$/;
const SECRET_FORMAT = /^[0-9a-f]{64}$/;

function signedMessage(r) {
  return JSON.stringify([
    SIGNATURE_VERSION,
    r.deviceId,
    r.saleId,
    r.amountCents,
    String(r.currency).toLowerCase(),
    r.reference,
    r.status,
    r.authCode ?? "",
    r.last4 ?? "",
    r.cardBrand ?? "",
    r.entryMode ?? "",
    r.ts,
  ]);
}

function hmac(secret, r) {
  return crypto.createHmac("sha256", secret).update(signedMessage(r), "utf8").digest("hex");
}

/** The signing settings from the environment, or why they can't be used. */
function signingConfig(env = process.env) {
  const deviceId = env.TERMINAL_DEVICE_ID || "";
  const secret = env.TERMINAL_SIGNING_SECRET || "";
  if (!deviceId && !secret) return { configured: false, problem: "not paired" };
  if (!DEVICE_ID_FORMAT.test(deviceId)) return { configured: false, problem: "TERMINAL_DEVICE_ID is missing or malformed" };
  if (!SECRET_FORMAT.test(secret)) return { configured: false, problem: "TERMINAL_SIGNING_SECRET must be the 64-character secret from pairing" };
  return { configured: true, deviceId, secret };
}

/**
 * The signature for one terminal sale result, as the API expects it next to
 * the result: { deviceId, ts, sig, currency }. `sale` is { saleId, amount,
 * currency }, `result` what the terminal driver returned.
 */
function signSaleResult(cfg, sale, result, now = Date.now()) {
  if (!cfg.configured) throw new Error(`terminal results can't be signed: ${cfg.problem}`);
  const currency = String(sale.currency || "usd").toLowerCase();
  const signed = {
    deviceId: cfg.deviceId,
    saleId: sale.saleId,
    amountCents: Math.round(Number(sale.amount) * 100),
    currency,
    reference: result.reference,
    status: result.approved ? "succeeded" : "failed",
    authCode: result.authCode,
    last4: result.last4,
    cardBrand: result.cardBrand,
    entryMode: result.entryMode,
    ts: now,
  };
  return { deviceId: cfg.deviceId, ts: now, sig: hmac(cfg.secret, signed), currency };
}

module.exports = { SIGNATURE_VERSION, signedMessage, hmac, signingConfig, signSaleResult };
