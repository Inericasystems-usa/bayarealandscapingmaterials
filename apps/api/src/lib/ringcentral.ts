import { config } from "../config.js";

/**
 * RingCentral server-to-server client (ADR-0004). Same philosophy as stripe.ts:
 * when the RC_* env vars are present the messaging module sends real SMS via
 * RingCentral; otherwise it runs in "simulated" mode (texts are logged + stored
 * but never leave the building) so the whole flow works in dev with no account.
 * Flipping to live is purely an env-var change.
 *
 * Auth: JWT bearer grant. We exchange the long-lived JWT for a short-lived
 * access token and cache it until just before it expires.
 */

const SERVER = config.RC_SERVER_URL ?? "https://platform.ringcentral.com";

export function isRingCentralConfigured(): boolean {
  return Boolean(
    config.RC_CLIENT_ID && config.RC_CLIENT_SECRET && config.RC_JWT && config.RC_SMS_FROM,
  );
}

export function ringCentralMode(): "live" | "simulated" {
  return isRingCentralConfigured() ? "live" : "simulated";
}

/** Normalize a US phone number to E.164 (+1XXXXXXXXXX). Returns null if unusable. */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (hasPlus && digits.length >= 11) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return null;
}

// ── Access-token cache ────────────────────────────────────────────────
let accessToken: string | null = null;
let tokenExpiresAt = 0; // epoch ms

async function getAccessToken(): Promise<string> {
  if (accessToken && Date.now() < tokenExpiresAt - 60_000) return accessToken;

  const basic = Buffer.from(`${config.RC_CLIENT_ID}:${config.RC_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${SERVER}/restapi/oauth/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${basic}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: config.RC_JWT as string,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`RingCentral token exchange failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  accessToken = json.access_token;
  tokenExpiresAt = Date.now() + json.expires_in * 1000;
  return accessToken;
}

export interface SendResult {
  id: string;
  status: string;
  simulated: boolean;
}

/**
 * Send an SMS. In simulated mode returns a deterministic fake id without any
 * network call. The caller is responsible for opt-out checks and persistence.
 */
export async function sendSms(to: string, text: string): Promise<SendResult> {
  const e164 = toE164(to);
  if (!e164) throw new Error(`Invalid destination phone number: ${to}`);

  if (!isRingCentralConfigured()) {
    return { id: `sim_${Date.now().toString(36)}`, status: "Sent", simulated: true };
  }

  const token = await getAccessToken();
  const res = await fetch(`${SERVER}/restapi/v1.0/account/~/extension/~/sms`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: { phoneNumber: config.RC_SMS_FROM },
      to: [{ phoneNumber: e164 }],
      text,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`RingCentral SMS send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: number | string; messageStatus?: string };
  return { id: String(json.id), status: json.messageStatus ?? "Queued", simulated: false };
}

export interface RcMessageStatus {
  id: string;
  messageStatus: string; // Queued | Sent | Delivered | DeliveryFailed | SendingFailed
}

/**
 * Poll the message-store for recent OUTBOUND SMS and their delivery status.
 * Used to reconcile our local message log when webhooks aren't reachable
 * (e.g. local dev with no public URL). Returns [] in simulated mode.
 */
export async function fetchOutboundStatuses(sinceISO: string): Promise<RcMessageStatus[]> {
  if (!isRingCentralConfigured()) return [];
  const token = await getAccessToken();
  const url =
    `${SERVER}/restapi/v1.0/account/~/extension/~/message-store` +
    `?messageType=SMS&direction=Outbound&dateFrom=${encodeURIComponent(sinceISO)}&perPage=100`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`RingCentral message-store fetch failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { records?: { id: number | string; messageStatus?: string }[] };
  return (json.records ?? []).map((r) => ({ id: String(r.id), messageStatus: r.messageStatus ?? "Sent" }));
}

/**
 * Best-effort: create a webhook subscription for inbound SMS so RingCentral
 * POSTs new messages to our /webhook endpoint. Safe to call on boot — failures
 * are logged by the caller and never crash the server. No-op unless both the
 * RC creds and a public RC_WEBHOOK_URL are configured.
 */
export async function ensureInboundSubscription(): Promise<{ created: boolean; reason?: string }> {
  if (!isRingCentralConfigured() || !config.RC_WEBHOOK_URL) {
    return { created: false, reason: "not_configured" };
  }
  const token = await getAccessToken();
  const res = await fetch(`${SERVER}/restapi/v1.0/subscription`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      eventFilters: [
        // New inbound SMS (and STOP/HELP keywords).
        "/restapi/v1.0/account/~/extension/~/message-store/instant?type=SMS",
        // Outbound delivery-status changes (Sent → Delivered / DeliveryFailed).
        "/restapi/v1.0/account/~/extension/~/message-store?type=SMS&direction=Outbound",
      ],
      deliveryMode: { transportType: "WebHook", address: config.RC_WEBHOOK_URL },
      expiresIn: 604800, // 7 days; renew via a scheduled job in production
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { created: false, reason: `${res.status}: ${detail.slice(0, 200)}` };
  }
  return { created: true };
}
