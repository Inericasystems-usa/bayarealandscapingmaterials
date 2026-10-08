/**
 * First-touch attribution, kept in this browser's localStorage under `balm_attr`.
 *
 * Nothing on the server reads it from a cookie: the quote/contact forms read it
 * and post it in the body, and the API writes it onto the lead row. That is what
 * lets a delivered order months later be uploaded back to Google Ads against
 * the click that produced it. So it is not a cookie, and no script writes one.
 *
 * It is advertising data, so it is stored and sent only while the visitor
 * allows advertising (lib/consent.ts). Before an answer, the landing touch is
 * held in memory for the page view, so accepting a few seconds after arriving
 * from an ad still keeps that ad's click id.
 *
 * Contains no PII: click ids, UTMs, landing page and referrer only.
 */

import { adsAllowed } from "@/lib/consent";

export const CLICK_IDS = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"] as const;
export const UTMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export const ATTR_KEY = "balm_attr";
/** 90 days, in seconds — matches the Google Ads click-attribution window we report on. */
export const ATTR_TTL_SECONDS = 90 * 24 * 60 * 60;

export type ClickIdKey = (typeof CLICK_IDS)[number];
export type UtmKey = (typeof UTMS)[number];

export type Attribution = Partial<Record<ClickIdKey | UtmKey, string>> & {
  landing_page?: string;
  referrer?: string;
  captured_at?: string;
};

/** The touch seen before the visitor answered the cookie banner. Memory only. */
let pending: Attribution | null = null;

/** True once a record carries a real marketing touch (a click id or a utm_source). */
export function isPaidOrCampaignTouch(a: Attribution | null): boolean {
  if (!a) return false;
  return CLICK_IDS.some((k) => Boolean(a[k])) || Boolean(a.utm_source);
}

function parse(raw: string | null | undefined): Attribution | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

function expired(a: Attribution): boolean {
  const at = a.captured_at ? Date.parse(a.captured_at) : NaN;
  return !Number.isFinite(at) || Date.now() - at > ATTR_TTL_SECONDS * 1000;
}

function readStored(): Attribution | null {
  try {
    const a = parse(window.localStorage.getItem(ATTR_KEY));
    if (a && expired(a)) {
      window.localStorage.removeItem(ATTR_KEY);
      return null;
    }
    return a;
  } catch {
    return null;
  }
}

function store(a: Attribution): void {
  try {
    window.localStorage.setItem(ATTR_KEY, JSON.stringify(a));
  } catch {
    // Storage blocked: attribution is lost for this visitor, the page is not.
  }
}

/**
 * Earlier releases kept this record in a `balm_attr` cookie. Take its value
 * once and expire it, so the cookie disappears from returning browsers.
 */
function takeLegacyCookie(): Attribution | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)balm_attr=([^;]*)/);
  if (!match) return null;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${ATTR_KEY}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  try {
    return parse(decodeURIComponent(match[1] ?? ""));
  } catch {
    return null;
  }
}

/** The stored record, or null when absent, expired, corrupt, or when the
 *  visitor does not allow advertising. This is what the lead forms post. */
export function readAttribution(): Attribution | null {
  if (typeof window === "undefined" || !adsAllowed()) return null;
  return readStored();
}

/** Forget everything: called when the visitor turns advertising off. */
export function clearAttribution(): void {
  pending = null;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ATTR_KEY);
  } catch {
    // Nothing stored that could be read either.
  }
}

/** Pull the tracked parameters out of a query string. */
export function parseTouch(params: URLSearchParams): Attribution {
  const touch: Attribution = {};
  for (const key of [...CLICK_IDS, ...UTMS]) {
    const v = params.get(key);
    if (v) touch[key] = v.slice(0, 512); // bound it — it is stored and posted
  }
  return touch;
}

/**
 * Record this visit, first touch wins.
 *
 * Precedence, deliberately:
 *   1. Nothing stored yet → store this visit, whatever it is (an organic first
 *      landing page + referrer is still first-touch data worth keeping).
 *   2. Something stored that already has a click id or utm_source → keep it.
 *      A later visit NEVER overwrites a real marketing touch.
 *   3. Stored record is organic-only and this visit carries a click id/UTM →
 *      upgrade to the marketing touch. This is the one overwrite allowed, and it
 *      is the opposite of the case the spec forbids (organic clobbering paid).
 *
 * Without advertising consent the result is held in memory only and stored the
 * moment consent is given (the caller runs this again then).
 */
export function captureAttribution(params: URLSearchParams): Attribution | null {
  if (typeof window === "undefined") return null;
  const legacy = takeLegacyCookie();
  const allowed = adsAllowed();
  const stored = allowed ? readStored() : null;
  const existing = stored ?? pending ?? legacy;
  const touch = parseTouch(params);

  let record = existing;
  if (!existing || (!isPaidOrCampaignTouch(existing) && isPaidOrCampaignTouch(touch))) {
    record = {
      ...touch,
      landing_page: window.location.pathname + window.location.search,
      referrer: document.referrer || undefined,
      captured_at: new Date().toISOString(),
    };
  }
  if (!record) return null;

  if (!allowed) {
    pending = record;
    return null;
  }
  if (record !== stored) store(record);
  pending = null;
  return record;
}
