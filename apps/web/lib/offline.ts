/**
 * Offline resilience for the register. When the API is unreachable (a LAN blip),
 * completed CASH/ACCOUNT sales are queued in localStorage and replayed when the
 * connection returns. Each carries an idempotency `clientId` so a replay can't
 * duplicate the order server-side. Card/terminal sales require the network and
 * are blocked while offline (no way to authorize a card without it).
 *
 * localStorage (not IndexedDB) is deliberate: an offline window holds a handful
 * of sales, the payload is tiny, and a synchronous, easy-to-reason-about store
 * beats the ceremony. Upgrade to IndexedDB if offline volume ever grows.
 */

const QUEUE_KEY = "balm_pending_sales";

export interface PendingSale {
  clientId: string;
  payload: unknown; // the createOrder payload
  total: number;
  queuedAt: string;
}

// ── Queue ─────────────────────────────────────────────────────────────
export function getPending(): PendingSale[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]") as PendingSale[];
  } catch {
    return [];
  }
}
function writePending(list: PendingSale[]): void {
  localStorage.setItem(QUEUE_KEY, JSON.stringify(list));
  pendingListeners.forEach((l) => l(list.length));
}
export function enqueueSale(sale: PendingSale): void {
  writePending([...getPending(), sale]);
}
export function dequeueSale(clientId: string): void {
  writePending(getPending().filter((s) => s.clientId !== clientId));
}
export function pendingCount(): number {
  return getPending().length;
}

const pendingListeners = new Set<(n: number) => void>();
export function onPendingChange(fn: (n: number) => void): () => void {
  pendingListeners.add(fn);
  return () => pendingListeners.delete(fn);
}

// ── Reachability ──────────────────────────────────────────────────────
// Driven by the api-client: a network error flips us offline, any success flips
// us back. navigator.onLine alone is unreliable for a same-LAN API blip.
let reachable = true;
const reachListeners = new Set<(v: boolean) => void>();

export function isReachable(): boolean {
  return reachable;
}
export function setReachable(v: boolean): void {
  if (v === reachable) return;
  reachable = v;
  reachListeners.forEach((l) => l(v));
}
export function onReachableChange(fn: (v: boolean) => void): () => void {
  reachListeners.add(fn);
  return () => reachListeners.delete(fn);
}

/** True for a fetch that failed to reach the server (vs. an HTTP error status). */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError && /fetch|network|load failed/i.test(e.message);
}
