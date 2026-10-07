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

const http = require("node:http");
const terminal = require("./terminal");

let ThermalPrinter, PrinterTypes;
try {
  ({ printer: ThermalPrinter, types: PrinterTypes } = require("node-thermal-printer"));
} catch {
  console.warn("node-thermal-printer not installed — run `pnpm install` in apps/bridge.");
}

const PORT = process.env.BRIDGE_PORT ? Number(process.env.BRIDGE_PORT) : 9110;
const HOST = process.env.BRIDGE_HOST || "127.0.0.1"; // localhost-only by default
const IFACE = process.env.PRINTER_INTERFACE || "tcp://192.168.1.50";
const TOKEN = process.env.BRIDGE_TOKEN || ""; // when set, callers must present it

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
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
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
  if (req.method === "OPTIONS") return send(res, 204, {});

  if (req.url === "/health") {
    return send(res, 200, {
      ok: true,
      service: "balm-hardware-bridge",
      interface: IFACE,
      driver: Boolean(ThermalPrinter),
      terminal: terminal.info(),
    });
  }

  // Shared-token gate for action endpoints (CSRF protection). /health is exempt.
  if (TOKEN) {
    const provided = req.headers["x-bridge-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (provided !== TOKEN) return send(res, 401, { ok: false, error: "unauthorized" });
  }

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
  console.log(`  auth: ${TOKEN ? "shared-token required" : "OPEN (set BRIDGE_TOKEN to lock)"}`);
});
