// Starts the bridge as a separate process (simulated terminal, no printer) and
// checks the payment routes. Run with `pnpm test` (node --test) in apps/bridge.
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const signing = require("./signing");

const TOKEN = "t".repeat(40);
const ORIGIN = "http://localhost:3000";
const SECRET = "ab".repeat(32);

function startBridge(port, extraEnv) {
  const env = {
    ...process.env,
    BRIDGE_PORT: String(port),
    BRIDGE_TOKEN: TOKEN,
    BRIDGE_ALLOWED_ORIGINS: ORIGIN,
    TERMINAL_DEVICE_ID: "",
    TERMINAL_SIGNING_SECRET: "",
    ...extraEnv,
  };
  const child = spawn(process.execPath, [path.join(__dirname, "index.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
  return new Promise((resolve, reject) => {
    let out = "";
    const timer = setTimeout(() => reject(new Error(`bridge did not start: ${out}`)), 10000);
    const onData = (d) => {
      out += d;
      if (out.includes("BALM hardware bridge on")) {
        clearTimeout(timer);
        resolve(child);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", () => reject(new Error(`bridge exited: ${out}`)));
  });
}

function post(port, route, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: route,
        method: "POST",
        headers: { "content-type": "application/json", origin: ORIGIN, "x-bridge-token": TOKEN, "content-length": Buffer.byteLength(data) },
      },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
      },
    );
    req.on("error", reject);
    req.end(data);
  });
}

test("a paired bridge signs each sale result for the sale and amount it was asked for", async () => {
  const port = 19110 + Math.floor(Math.random() * 500);
  const bridge = await startBridge(port, { TERMINAL_PROVIDER: "sim", TERMINAL_DEVICE_ID: "tdev_test0002", TERMINAL_SIGNING_SECRET: SECRET });
  try {
    assert.equal((await post(port, "/pay/sale", { amount: 12.5 })).status, 400); // no sale id
    const before = Date.now();
    const res = await post(port, "/pay/sale", { amount: 12.5, saleId: "ord_signme01" });
    assert.equal(res.status, 200);
    const r = res.body.result;
    assert.equal(r.saleId, "ord_signme01");
    assert.equal(r.currency, "usd");
    assert.equal(r.signature.deviceId, "tdev_test0002");
    assert.ok(r.signature.ts >= before && r.signature.ts <= Date.now());
    const expected = signing.hmac(SECRET, {
      deviceId: "tdev_test0002",
      saleId: "ord_signme01",
      amountCents: 1250,
      currency: "usd",
      reference: r.reference,
      status: "succeeded",
      authCode: r.authCode,
      last4: r.last4,
      cardBrand: r.cardBrand,
      entryMode: r.entryMode,
      ts: r.signature.ts,
    });
    assert.equal(r.signature.sig, expected);
  } finally {
    bridge.kill();
  }
});

test("a live terminal on an unpaired bridge takes no card", async () => {
  const port = 19700 + Math.floor(Math.random() * 500);
  // Datacap with an endpoint that is never reached: the bridge refuses first.
  const bridge = await startBridge(port, { TERMINAL_PROVIDER: "datacap", TERMINAL_ENDPOINT: "https://127.0.0.1:1/never", TERMINAL_ID: "1" });
  try {
    const res = await post(port, "/pay/sale", { amount: 12.5, saleId: "ord_unpaired" });
    assert.equal(res.status, 409);
    assert.match(res.body.error, /isn't paired/);
  } finally {
    bridge.kill();
  }
});
