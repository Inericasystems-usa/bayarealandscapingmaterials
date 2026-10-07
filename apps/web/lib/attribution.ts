/**
 * First-touch attribution, stored in the `balm_attr` first-party cookie.
 *
 * The website and the API are different origins, so this cookie never travels on
 * its own — the quote/contact forms read it and post it in the body, and the API
 * writes it onto the lead row. That is what lets a delivered order months later
 * be uploaded back to Google Ads against the click that produced it.
 *
 * Contains no PII: click ids, UTMs, landing page and referrer only.
 */

export const CLICK_IDS = ["gclid", "gbraid", "wbraid", "msclkid", "fbclid"] as const;
export const UTMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export const ATTR_COOKIE = "balm_attr";
/** 90 days, in seconds — matches the Google Ads click-attribution window we report on. */
export const ATTR_TTL_SECONDS = 90 * 24 * 60 * 60;

export type ClickIdKey = (typeof CLICK_IDS)[number];
export type UtmKey = (typeof UTMS)[number];

export type Attribution = Partial<Record<ClickIdKey | UtmKey, string>> & {
  landing_page?: string;
  referrer?: string;
  captured_at?: string;
};

/** True once a record carries a real marketing touch (a click id or a utm_source). */
export function isPaidOrCampaignTouch(a: Attribution | null): boolean {
  if (!a) return false;
  return CLICK_IDS.some((k) => Boolean(a[k])) || Boolean(a.utm_source);
}

/** Read and parse the cookie. Returns null when absent or corrupt. */
export function readAttribution(): Attribution | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\s*)${ATTR_COOKIE}=([^;]*)`));
  if (!match?.[1]) return null;
  try {
    const parsed: unknown = JSON.parse(decodeURIComponent(match[1]));
    return parsed && typeof parsed === "object" ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

function writeAttribution(a: Attribution): void {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    `${ATTR_COOKIE}=${encodeURIComponent(JSON.stringify(a))}` +
    `; path=/; max-age=${ATTR_TTL_SECONDS}; SameSite=Lax${secure}`;
}

/** Pull the tracked parameters out of a query string. */
export function parseTouch(params: URLSearchParams): Attribution {
  const touch: Attribution = {};
  for (const key of [...CLICK_IDS, ...UTMS]) {
    const v = params.get(key);
    if (v) touch[key] = v.slice(0, 512); // bound it — these end up in a cookie
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
 */
export function captureAttribution(params: URLSearchParams): Attribution | null {
  if (typeof document === "undefined") return null;
  const existing = readAttribution();
  const touch = parseTouch(params);

  if (existing && (isPaidOrCampaignTouch(existing) || !isPaidOrCampaignTouch(touch))) {
    return existing;
  }

  const record: Attribution = {
    ...touch,
    landing_page: window.location.pathname + window.location.search,
    referrer: document.referrer || undefined,
    captured_at: new Date().toISOString(),
  };
  writeAttribution(record);
  return record;
}
