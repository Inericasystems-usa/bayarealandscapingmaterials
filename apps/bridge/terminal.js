// BALM terminal driver — drives the physical payment terminal (Ingenico Axium
// DX8000) on the counter LAN from the bridge.
//
// IMPORTANT: a payment terminal can't take a card by itself. The actual wire
// protocol is defined by the SEMI-INTEGRATION MIDDLEWARE your processor
// (Elavon) loaded onto the device — most commonly:
//   • Datacap (NETePay Hosted / DC Direct)  — XML over HTTPS (cloud) or TCP to
//     the device IP (DC Direct, on the LAN).
//   • Elavon's own semi-integration (Commerce/Engage local or cloud API).
//
// We isolate that behind one `sale()/voidTxn()` interface so the POS flow is
// identical regardless, and the bridge runs in "sim" until real credentials and
// the certified spec are wired in. Flip TERMINAL_PROVIDER to go live.

const CFG = {
  provider: (process.env.TERMINAL_PROVIDER || "sim").toLowerCase(), // sim | datacap | elavon
  host: process.env.TERMINAL_HOST || "", // device IP on the LAN, e.g. 192.168.1.60
  port: process.env.TERMINAL_PORT ? Number(process.env.TERMINAL_PORT) : 0,
  terminalId: process.env.TERMINAL_ID || "", // Pad / Lane / Terminal ID from Elavon
  merchant: process.env.TERMINAL_MERCHANT_ID || "", // Datacap MerchantID
  operator: process.env.TERMINAL_OPERATOR || "POS", // OperatorID shown on Datacap reports
  endpoint: process.env.TERMINAL_ENDPOINT || "", // gateway URL (Datacap DC Direct / NETePay Hosted)
  secret: process.env.TERMINAL_SECRET || "", // API key / token from the processor
};

function rid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function info() {
  const live = CFG.provider !== "sim";
  return {
    provider: CFG.provider,
    mode: live ? "live" : "simulated",
    // "configured" = sim is always ready; a real provider needs host/endpoint + id.
    configured: !live || Boolean((CFG.host || CFG.endpoint) && CFG.terminalId),
    host: CFG.host || null,
    terminalId: CFG.terminalId || null,
  };
}

// ── Simulated provider (works with no hardware) ───────────────────────
async function simSale(amount, reference) {
  await delay(1500); // mimic card insert/tap time
  const brands = ["VISA", "MASTERCARD", "AMEX", "DISCOVER"];
  const modes = ["CHIP", "CONTACTLESS", "SWIPE"];
  return {
    approved: true,
    message: "APPROVED",
    amount,
    reference: reference || rid("sim"),
    authCode: String(Math.floor(100000 + Math.random() * 900000)),
    cardBrand: brands[Math.floor(Math.random() * brands.length)],
    last4: String(Math.floor(1000 + Math.random() * 9000)),
    entryMode: modes[Math.floor(Math.random() * modes.length)],
    provider: "sim",
  };
}
async function simVoid(reference) {
  await delay(600);
  return { approved: true, message: "VOIDED", reference, provider: "sim" };
}

// ── Datacap provider (DC Direct / NETePay Hosted — Elavon back end) ────
// Pre-built to Datacap's JSON transaction contract. The field names below
// follow Datacap DC Direct; adjust to the exact spec Elavon/Datacap gives you.
// If your account is on the *classic* NETePay Hosted (XML) interface instead,
// swap the body/parse in gatewayPost() + datacapSale() for the XML command set
// (dsiEMVX: <TStream><Transaction>…</Transaction></TStream>) — the rest is the same.
async function gatewayPost(payload) {
  if (!CFG.endpoint) throw new Error("TERMINAL_ENDPOINT is not set (Datacap DC Direct URL)");
  const headers = { "content-type": "application/json", accept: "application/json" };
  if (CFG.secret) headers.authorization = `Bearer ${CFG.secret}`;
  const res = await fetch(CFG.endpoint, { method: "POST", headers, body: JSON.stringify(payload) });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`gateway returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`gateway error (${res.status}): ${text.slice(0, 200)}`);
  return json;
}

const digits = (s) => String(s || "").replace(/\D/g, "");
// Datacap echoes fields in PascalCase; tolerate camelCase too.
const pick = (o, key) => o?.[key] ?? o?.[key[0].toLowerCase() + key.slice(1)];

async function datacapSale(amount, reference) {
  const ref = reference || rid("ref");
  const resp = await gatewayPost({
    Transaction: {
      TranCode: "EMVSale",
      MerchantID: CFG.merchant || undefined,
      TerminalID: CFG.terminalId || undefined,
      OperatorID: CFG.operator || undefined,
      Amount: { Purchase: amount.toFixed(2) },
      InvoiceNo: ref,
      RefNo: ref,
    },
  });
  const approved = String(pick(resp, "CmdStatus") || "").toLowerCase() === "approved";
  const acct = digits(pick(resp, "AcctNo"));
  return {
    approved,
    message: pick(resp, "TextResponse") || (approved ? "APPROVED" : "DECLINED"),
    amount,
    // RecordNo is Datacap's token for follow-on voids/returns; keep it as our ref.
    reference: String(pick(resp, "RecordNo") || pick(resp, "RefNo") || ref),
    authCode: pick(resp, "AuthCode") || undefined,
    cardBrand: pick(resp, "CardType") || undefined,
    last4: acct ? acct.slice(-4) : undefined,
    entryMode: (pick(resp, "EntryMethod") || "").toUpperCase() || undefined,
    provider: "datacap",
  };
}

async function datacapVoid(reference) {
  const resp = await gatewayPost({
    Transaction: {
      TranCode: "EMVVoidSale",
      MerchantID: CFG.merchant || undefined,
      TerminalID: CFG.terminalId || undefined,
      OperatorID: CFG.operator || undefined,
      RecordNo: reference,
      RefNo: reference,
    },
  });
  const approved = String(pick(resp, "CmdStatus") || "").toLowerCase() === "approved";
  return { approved, message: pick(resp, "TextResponse") || (approved ? "VOIDED" : "VOID FAILED"), reference, provider: "datacap" };
}

// Elavon-direct (non-Datacap) semi-integration — wire if that's your path.
function elavonDirect() {
  throw new Error(
    `TERMINAL_PROVIDER="elavon" (Elavon-direct) is not yet wired. Provide Elavon's ` +
      `direct semi-integration spec + creds and implement it in terminal.js, or use ` +
      `TERMINAL_PROVIDER=datacap (pre-built) / sim.`,
  );
}

async function sale({ amount, reference }) {
  if (!(amount > 0)) throw new Error("amount must be positive");
  if (CFG.provider === "sim") return simSale(amount, reference);
  if (CFG.provider === "datacap") return datacapSale(amount, reference);
  return elavonDirect();
}
async function voidTxn({ reference }) {
  if (CFG.provider === "sim") return simVoid(reference);
  if (CFG.provider === "datacap") return datacapVoid(reference);
  return elavonDirect();
}

module.exports = { info, sale, voidTxn };
