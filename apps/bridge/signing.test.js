// Run with `pnpm test` (node --test) in apps/bridge.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const signing = require("./signing");

const SECRET = "0123456789abcdef".repeat(4);
const CFG = { configured: true, deviceId: "tdev_test0001", secret: SECRET };
const SALE = { saleId: "ord_ab12cd34", amount: 107.42, currency: "USD" };
const RESULT = { approved: true, reference: "RecNo-998877", authCode: "A1B2C3", last4: "4444", cardBrand: "M/C", entryMode: "CHIP" };
const TS = 1760000000000;

test("signs the known vector the API checks against (apps/api terminal-signature tests)", () => {
  assert.deepEqual(signing.signSaleResult(CFG, SALE, RESULT, TS), {
    deviceId: "tdev_test0001",
    ts: TS,
    sig: "39d77d13c3005f243cc920465b34dfdc6cefc9868d9697863aa5afeae6b03650",
    currency: "usd",
  });
});

test("the signature is HMAC-SHA256 over the sale, amount in cents, currency, result and time", () => {
  const message = JSON.stringify([
    "balm-terminal-v1", "tdev_test0001", "ord_ab12cd34", 10742, "usd", "RecNo-998877", "succeeded", "A1B2C3", "4444", "M/C", "CHIP", TS,
  ]);
  const expected = crypto.createHmac("sha256", SECRET).update(message).digest("hex");
  assert.equal(signing.signSaleResult(CFG, SALE, RESULT, TS).sig, expected);
});

test("any change to the sale, amount, outcome or time changes the signature", () => {
  const base = signing.signSaleResult(CFG, SALE, RESULT, TS).sig;
  const variants = [
    signing.signSaleResult(CFG, { ...SALE, saleId: "ord_other" }, RESULT, TS),
    signing.signSaleResult(CFG, { ...SALE, amount: 107.43 }, RESULT, TS),
    signing.signSaleResult(CFG, { ...SALE, currency: "cad" }, RESULT, TS),
    signing.signSaleResult(CFG, SALE, { ...RESULT, approved: false }, TS),
    signing.signSaleResult(CFG, SALE, { ...RESULT, reference: "RecNo-1" }, TS),
    signing.signSaleResult(CFG, SALE, { ...RESULT, last4: "1111" }, TS),
    signing.signSaleResult(CFG, SALE, RESULT, TS + 1),
    signing.signSaleResult({ ...CFG, secret: "f".repeat(64) }, SALE, RESULT, TS),
  ];
  for (const v of variants) assert.notEqual(v.sig, base);
});

test("reads its settings from the environment and refuses malformed ones", () => {
  assert.equal(signing.signingConfig({}).configured, false);
  assert.equal(signing.signingConfig({ TERMINAL_DEVICE_ID: "tdev_1" }).configured, false);
  assert.equal(signing.signingConfig({ TERMINAL_DEVICE_ID: "tdev_1", TERMINAL_SIGNING_SECRET: "short" }).configured, false);
  assert.equal(signing.signingConfig({ TERMINAL_DEVICE_ID: "bad id!", TERMINAL_SIGNING_SECRET: SECRET }).configured, false);
  assert.deepEqual(signing.signingConfig({ TERMINAL_DEVICE_ID: "tdev_1", TERMINAL_SIGNING_SECRET: SECRET }), {
    configured: true,
    deviceId: "tdev_1",
    secret: SECRET,
  });
  assert.throws(() => signing.signSaleResult({ configured: false, problem: "not paired" }, SALE, RESULT), /not paired/);
});
