/**
 * Local hardware bridge client (cash drawer + thermal printer). Posts to the
 * bridge running on the counter PC; when it's offline every call degrades
 * gracefully so the POS keeps working (browser print + simulated kick).
 *
 * The bridge answers only the POS origin and only with that PC's token. The
 * token is never part of the build (every NEXT_PUBLIC_* value ships in public
 * JS): each counter PC is paired once by opening /pos#bridge-token=<token> in
 * the browser the register runs in (`pnpm run pair` in apps/bridge prints the
 * link). The token is checked against the bridge, kept in that browser's
 * localStorage only, and the page reloads without it in the address bar.
 */
const BRIDGE = process.env.NEXT_PUBLIC_BRIDGE_URL ?? "http://localhost:9110";
const TOKEN_KEY = "balm_bridge_token";
const PAIR_PREFIX = "#bridge-token=";

let pairing: Promise<void> | undefined;

function storedToken(): string {
  try {
    return window.localStorage.getItem(TOKEN_KEY) ?? "";
  } catch {
    return "";
  }
}

/** One-time pairing from the URL fragment, which never reaches a server or a log. */
function pairFromUrl(): Promise<void> {
  if (pairing) return pairing;
  pairing = (async () => {
    if (typeof window === "undefined" || !window.location.hash.startsWith(PAIR_PREFIX)) return;
    const candidate = window.location.hash.slice(PAIR_PREFIX.length);
    try {
      const res = await fetch(`${BRIDGE}/pay/status`, {
        headers: { "x-bridge-token": candidate },
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      });
      // Keep only a token this PC's bridge accepts, so a crafted link can't unpair the register.
      if (res.ok) window.localStorage.setItem(TOKEN_KEY, candidate);
    } catch {
      // Bridge offline or storage blocked: start the bridge and open the link again.
    }
    // A full reload drops the token from the address bar and from this history entry.
    window.location.replace(window.location.pathname + window.location.search);
  })();
  return pairing;
}

// Opening the link in a tab that already shows /pos only changes the fragment
// (no reload), so pair then too.
if (typeof window !== "undefined") {
  window.addEventListener("hashchange", () => {
    if (!window.location.hash.startsWith(PAIR_PREFIX)) return;
    pairing = undefined;
    void pairFromUrl();
  });
}

/** Headers for bridge calls — this PC's pairing token, once it has one. */
async function bridgeHeaders(extra?: Record<string, string>): Promise<Record<string, string>> {
  await pairFromUrl();
  const token = storedToken();
  return { ...(token ? { "x-bridge-token": token } : {}), ...(extra ?? {}) };
}

export async function bridgeOnline(): Promise<boolean> {
  try {
    const res = await fetch(`${BRIDGE}/health`, { headers: await bridgeHeaders(), cache: "no-store", signal: AbortSignal.timeout(1200) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Pop the cash drawer. Returns whether a real bridge handled it. */
export async function kickDrawer(): Promise<"kicked" | "simulated"> {
  try {
    const res = await fetch(`${BRIDGE}/kick`, { method: "POST", headers: await bridgeHeaders(), signal: AbortSignal.timeout(1500) });
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
      headers: await bridgeHeaders({ "content-type": "application/json" }),
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
  /** "off" = no TERMINAL_PROVIDER on the counter PC; terminal sales are declined. */
  mode: "live" | "simulated" | "off";
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
    const res = await fetch(`${BRIDGE}/pay/status`, { headers: await bridgeHeaders(), cache: "no-store", signal: AbortSignal.timeout(1500) });
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
    headers: await bridgeHeaders({ "content-type": "application/json" }),
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
      headers: await bridgeHeaders({ "content-type": "application/json" }),
      body: JSON.stringify({ reference }),
      signal: AbortSignal.timeout(30000),
    });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; result?: { approved?: boolean } } | null;
    return Boolean(body?.ok && body.result?.approved);
  } catch {
    return false;
  }
}
