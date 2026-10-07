/**
 * Local hardware bridge client (cash drawer + thermal printer). Posts to the
 * bridge running on the counter PC; when it's offline every call degrades
 * gracefully so the POS keeps working (browser print + simulated kick).
 */
const BRIDGE = process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:9110";
const BRIDGE_TOKEN = process.env.NEXT_PUBLIC_BRIDGE_TOKEN ?? "";

/** Headers for bridge calls — includes the shared token when configured. */
function bridgeHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...(BRIDGE_TOKEN ? { "x-bridge-token": BRIDGE_TOKEN } : {}), ...(extra ?? {}) };
}

export async function bridgeOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE}/health`, { headers: bridgeHeaders(), cache: "no-store", signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pop the cash drawer. Returns whether a real bridge handled it. */
export async function kickDrawer(): Promise<"kicked" | "simulated"> {
  try {
    const res = await fetch(`${BRIDGE}/kick`, { method: "POST", headers: bridgeHeaders(), signal: AbortSignal.timeout(1500) });
    return res.ok ? "kicked" : "simulated";
  } catch {
    return "simulated";
  }
}

/** Print to the thermal printer via the bridge. Caller falls back to browser print. */
export async function printThermal(payload: unknown): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE}/print`, {
      method: "POST",
      headers: bridgeHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Payment terminal (Ingenico Axium DX8000 via the bridge) ───────────
export interface TerminalInfo {
  provider: string;
  mode: "live" | "simulated";
  configured: boolean;
  host: string | null;
  terminalId: string | null;
}

export interface TerminalSaleResult {
  approved: boolean;
  message: string;
  amount: number;
  reference: string;
  authCode?: string;
  cardBrand?: string;
  last4?: string;
  entryMode?: string;
  provider: string;
}

/** Is the bridge reachable and what terminal is configured? null if offline. */
export async function terminalInfo(): Promise<TerminalInfo | null> {
  try {
    const res = await fetch(`${BRIDGE}/pay/status`, { headers: bridgeHeaders(), cache: "no-store", signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const body = (await res.json()) as { terminal?: TerminalInfo };
    return body.terminal ?? null;
  } catch {
    return null;
  }
}

/**
 * Run a card sale on the physical terminal. The customer inserts/taps/swipes on
 * the DX8000; this resolves with the approval (or decline). Throws if the bridge
 * is unreachable so the caller can fall back or surface the error.
 */
export async function terminalSale(amount: number, reference?: string): Promise<TerminalSaleResult> {
  const res = await fetch(`${BRIDGE}/pay/sale`, {
    method: "POST",
    headers: bridgeHeaders({ "content-type": "application/json" }),
    body: JSON.stringify({ amount, reference }),
    // EMV card-present can take a while (PIN, app selection) — generous timeout.
    signal: AbortSignal.timeout(120000),
  });
  const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: TerminalSaleResult; error?: string } | null;
  if (!res.ok || !body?.ok || !body.result) {
    throw new Error(body?.error ?? `Terminal error (${res.status})`);
  }
  return body.result;
}

/** Void a prior terminal sale by reference. */
export async function terminalVoid(reference: string): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE}/pay/void`, {
      method: "POST",
      headers: bridgeHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ reference }),
      signal: AbortSignal.timeout(30000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: { approved?: boolean } } | null;
    return Boolean(body?.ok && body.result?.approved);
  } catch {
    return false;
  }
}
