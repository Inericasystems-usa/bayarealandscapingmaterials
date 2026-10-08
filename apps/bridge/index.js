// BALM Hardware Bridge — runs on the counter PC. The browser POS can't talk to
// USB/serial thermal printers or cash drawers directly, so this local service
// exposes /print and /kick over HTTP and drives the printer via ESC/POS.
//
//   PRINTER_INTERFACE examples:
//     tcp://192.168.1.50        (network printer)
//     printer:EPSON_TM_T20      (named OS printer)
//     //./COM3                  (serial)
//
// Cash drawers are kicked by a pulse the printer sends down the RJ11 line, so a
// drawer "kick" is just an ESC/POS command to the printer.
//
// Any website open on the counter PC can send requests to localhost, so CORS
// headers alone protect nothing here. The bridge listens on loopback only,
// answers only the POS origin(s) in BRIDGE_ALLOWED_ORIGINS, and every call
// except /health must carry this PC's BRIDGE_TOKEN (PCI DSS 6.2.4, CSRF).
// `pnpm run pair` creates the token and prints the one-time pairing link.

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Per-PC settings live in apps/bridge/.env (gitignored). Real environment
// variables win over the file. Loaded before ./terminal reads TERMINAL_*.
const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE)) {
  if (typeof process.loadEnvFile !== "function") fail("Node.js 20.12 or newer is needed to read apps/bridge/.env.");
  process.loadEnvFile(ENV_FILE);
}

const terminal = require("./terminal");

let ThermalPrinter, PrinterTypes;
try {
  ({ printer: ThermalPrinter, types: PrinterTypes } = require("node-thermal-printer"));
} catch {
  console.warn("node-thermal-printer not installed — run `pnpm install` in apps/bridge.");
}

const PORT = process.env.BRIDGE_PORT ? Number(process.env.BRIDGE_PORT) : 9110;
const HOST = process.env.BRIDGE_HOST || "127.0.0.1"; // loopback only, enforced below
const IFACE = process.env.PRINTER_INTERFACE || "tcp://192.168.1.50";
const TOKEN = process.env.BRIDGE_TOKEN || ""; // required, no default
const ORIGINS = parseOrigins(process.env.BRIDGE_ALLOWED_ORIGINS || "https://bayarealandscapingmaterials.com");

const BIND_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]); // as URL hostnames
const TOKEN_FORMAT = /^[A-Za-z0-9._~-]{32,}$/;

function fail(message) {
  console.error(message);
  process.exit(1);
}

// Exact origins only. Plain http is accepted just for a POS served from this PC.
function parseOrigins(list) {
  const origins = new Set();
  for (const raw of list.split(",").map((s) => s.trim()).filter(Boolean)) {
    let url;
    try {
      url = new URL(raw);
    } catch {
      fail(`BRIDGE_ALLOWED_ORIGINS: "${raw}" is not an origin such as https://bayarealandscapingmaterials.com`);
    }
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) {
      fail(`BRIDGE_ALLOWED_ORIGINS: "${raw}" must use https (plain http only for localhost)`);
    }
    origins.add(url.origin);
  }
  if (origins.size === 0) fail("BRIDGE_ALLOWED_ORIGINS is empty");
  return origins;
}

// One-time pairing: create this PC's token if it has none, then print the link
// to open in the browser the register runs in (apps/web/lib/hardware.ts).
if (process.argv.includes("--pair")) {
  let token = TOKEN;
  if (!token) {
    token = crypto.randomBytes(32).toString("hex");
    const existing = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
    const sep = existing && !existing.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(ENV_FILE, `${existing}${sep}BRIDGE_TOKEN=${token}\n`, { mode: 0o600 });
    console.log(`New bridge token saved to ${ENV_FILE}.`);
  } else if (!TOKEN_FORMAT.test(token)) {
    fail("BRIDGE_TOKEN is too weak: use at least 32 characters of A-Z, a-z, 0-9, '.', '_', '~' or '-'.");
  }
  console.log("Start (or restart) the bridge, sign in to the POS in the browser the register uses on this PC,");
  console.log("then open this link there once. It holds the token: keep it on this PC.");
  for (const origin of ORIGINS) console.log(`  ${origin}/pos#bridge-token=${token}`);
  process.exit(0);
}

if (!BIND_HOSTS.has(HOST)) fail(`BRIDGE_HOST must be a loopback address such as 127.0.0.1, not ${HOST}`);
if (!TOKEN) fail("BRIDGE_TOKEN is not set. Run `pnpm run pair` once on this PC to create it (see README, Pairing).");
if (!TOKEN_FORMAT.test(TOKEN)) {
  fail("BRIDGE_TOKEN is too weak: use at least 32 characters of A-Z, a-z, 0-9, '.', '_', '~' or '-'.");
}

// Compare digests so neither the length nor the content leaks through timing.
const TOKEN_DIGEST = crypto.createHash("sha256").update(TOKEN).digest();
function tokenOk(value) {
  if (typeof value !== "string") return false;
  return crypto.timingSafeEqual(crypto.createHash("sha256").update(value).digest(), TOKEN_DIGEST);
}

// DNS rebinding: a site whose name resolves to 127.0.0.1 arrives with its own
// host name in the Host header, so only loopback names are served.
function hostOk(host) {
  if (!host) return false;
  try {
    return LOOPBACK_NAMES.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

function makePrinter() {
  if (!ThermalPrinter) throw new Error("printer driver not installed");
  return new ThermalPrinter({
    type: (PrinterTypes && PrinterTypes.EPSON) || "epson",
    interface: IFACE,
    removeSpecialCharacters: false,
    options: { timeout: 3000 },
  });
}

function send(res, code, body) {
  res.writeHead(code, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || "{}");
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  const allowed = typeof origin === "string" && ORIGINS.has(origin);
  if (allowed) {
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
  }

  if (!hostOk(req.headers.host)) return send(res, 403, { ok: false, error: "forbidden" });
  // Browsers send Origin on every cross-site call; only the POS may make them.
  if (origin !== undefined && !allowed) return send(res, 403, { ok: false, error: "origin not allowed" });

  if (req.method === "OPTIONS") {
    if (!allowed) return send(res, 403, { ok: false, error: "origin not allowed" });
    res.writeHead(204, {
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-bridge-token",
      // Chrome asks before a public site may reach a loopback service.
      "access-control-allow-private-network": "true",
      "access-control-max-age": "600",
    });
    return res.end();
  }

  // Liveness for local checks (curl on this PC): no token, nothing sensitive.
  if (req.url === "/health") {
    const { provider, mode } = terminal.info();
    return send(res, 200, {
      ok: true,
      service: "balm-hardware-bridge",
      driver: Boolean(ThermalPrinter),
      terminal: { provider, mode },
    });
  }

  if (!allowed) return send(res, 403, { ok: false, error: "origin not allowed" });
  if (!tokenOk(req.headers["x-bridge-token"])) return send(res, 401, { ok: false, error: "unauthorized" });

  // ── Payment terminal (Ingenico Axium DX8000 via Elavon) ──────────────
  if (req.url === "/pay/status" && req.method === "GET") {
    return send(res, 200, { ok: true, terminal: terminal.info() });
  }

  if (req.url === "/pay/sale" && req.method === "POST") {
    const body = await readJson(req);
    const amount = Number(body.amount);
    if (!(amount > 0)) return send(res, 400, { ok: false, error: "amount must be positive" });
    try {
      const result = await terminal.sale({ amount, reference: body.reference });
      // Decline is a normal business outcome — 200 with approved:false.
      return send(res, 200, { ok: true, result });
    } catch (e) {
      return send(res, 502, { ok: false, error: String(e && e.message ? e.message : e) });
    }
  }

  if (req.url === "/pay/void" && req.method === "POST") {
    const body = await readJson(req);
    if (!body.reference) return send(res, 400, { ok: false, error: "reference required" });
    try {
      const result = await terminal.voidTxn({ reference: body.reference });
      return send(res, 200, { ok: true, result });
    } catch (e) {
      return send(res, 502, { ok: false, error: String(e && e.message ? e.message : e) });
    }
  }

  if (req.url === "/kick" && req.method === "POST") {
    try {
      const p = makePrinter();
      p.openCashDrawer(); // ESC/POS drawer-kick pulse
      await p.execute();
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 502, { ok: false, error: String(e) });
    }
  }

  if (req.url === "/print" && req.method === "POST") {
    const body = await readJson(req);
    try {
      const p = makePrinter();
      if (body.store) { p.alignCenter(); p.bold(true); p.println(body.store); p.bold(false); }
      if (body.address) { p.println(body.address); }
      p.drawLine();
      p.alignLeft();
      if (body.number) p.println(body.number);
      for (const l of body.lines || []) {
        p.tableCustom([
          { text: `${l.qty} x ${l.name}`, align: "LEFT", width: 0.7 },
          { text: l.lineTotal, align: "RIGHT", width: 0.3 },
        ]);
      }
      p.drawLine();
      if (body.total != null) { p.bold(true); p.tableCustom([{ text: "TOTAL", align: "LEFT", width: 0.6 }, { text: body.total, align: "RIGHT", width: 0.4 }]); p.bold(false); }
      p.alignCenter();
      p.println("Thank you!");
      p.cut();
      if (body.kick) p.openCashDrawer();
      await p.execute();
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 502, { ok: false, error: String(e) });
    }
  }

  send(res, 404, { ok: false, error: "not found" });
});

server.listen(PORT, HOST, () => {
  const t = terminal.info();
  console.log(`BALM hardware bridge on http://${HOST}:${PORT} (printer: ${IFACE})`);
  console.log(`  payment terminal: ${t.provider} (${t.mode})${t.host ? ` @ ${t.host}` : ""}`);
  console.log(`  callers: ${[...ORIGINS].join(", ")} with this PC's bridge token`);
  if (t.provider === "sim") console.warn("  SIMULATED terminal: every sale is approved and no card is charged. Demos only.");
  if (t.mode === "off") console.warn("  No TERMINAL_PROVIDER set: the Terminal tender is declined until one is configured.");
});
