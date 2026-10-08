/**
 * Cookie consent for the public site.
 *
 * Google Analytics and Google Ads run through Tag Manager (lib/google-tags.ts).
 * What the visitor is promised, and where each promise is kept:
 *
 *   • Every optional category is denied until the visitor actively chooses.
 *     CONSENT_BOOT_SCRIPT sets Consent Mode v2 to "denied" before Tag Manager
 *     loads, so Google sets no cookies on a first visit.
 *   • Reject is exactly as easy as Accept, and closing or scrolling is not
 *     agreement (components/ConsentBanner.tsx).
 *   • A change applies at once, without a reload. "Cookie settings" in the
 *     footer reopens the banner with the answers currently in force.
 *   • Global Privacy Control keeps the advertising signals off.
 *   • The answer lives in localStorage, never in a cookie: storing it in a
 *     cookie would set a cookie in order to ask about cookies, and the boot
 *     script has to read it synchronously before any tag runs.
 *
 * Staff screens (/pos, /customer-display) load no tags, so none of this runs there.
 */

import { pushConsentUpdate } from "@/lib/analytics/track";

/** The four parameters Google Consent Mode v2 reads. */
export type ConsentSignal =
  | "analytics_storage"
  | "ad_storage"
  | "ad_user_data"
  | "ad_personalization";

export type ConsentState = Record<ConsentSignal, boolean>;

/** Every optional signal off: the state before anyone has chosen anything. */
export const DENIED: ConsentState = {
  analytics_storage: false,
  ad_storage: false,
  ad_user_data: false,
  ad_personalization: false,
};

export const GRANTED: ConsentState = {
  analytics_storage: true,
  ad_storage: true,
  ad_user_data: true,
  ad_personalization: true,
};

/** The advertising three. Global Privacy Control turns off exactly this set. */
export const AD_SIGNALS: readonly ConsentSignal[] = [
  "ad_storage",
  "ad_user_data",
  "ad_personalization",
];

/** What the banner offers, one row per signal. */
export const CONSENT_CATEGORIES: readonly { signal: ConsentSignal; name: string; what: string }[] = [
  {
    signal: "analytics_storage",
    name: "Analytics",
    what: "Google Analytics counts visits and shows which pages people use, so we can improve the site.",
  },
  {
    signal: "ad_storage",
    name: "Advertising cookies",
    what: "Lets Google Ads record that your visit came from one of our ads, so we know which ads are worth paying for.",
  },
  {
    signal: "ad_user_data",
    name: "Advertising data",
    what: "Lets us share what Google needs to match a quote request to the ad that led to it.",
  },
  {
    signal: "ad_personalization",
    name: "Personalized ads",
    what: "Lets Google show you our ads on other sites after you visit this one.",
  },
];

/**
 * Bumped whenever a category starts covering something it did not cover
 * before. An answer to an older version is not an answer to the current
 * question, so the banner asks again. Narrowing a category needs no bump.
 */
export const CONSENT_VERSION = 1;

export const CONSENT_KEY = "balm_consent";

export interface StoredConsent {
  /** CONSENT_VERSION at the time of the answer. */
  v: number;
  /** ISO timestamp of the answer. */
  at: string;
  /** Whether Global Privacy Control was on when the answer was recorded. */
  gpc: boolean;
  state: ConsentState;
}

/** Fired on window by the footer link to reopen the banner. */
export const OPEN_CONSENT_EVENT = "balm:open-consent";
/** Fired on window after every answer, with the effective state as detail. */
export const CONSENT_CHANGE_EVENT = "balm:consent-change";

/**
 * Global Privacy Control. It has a defined legal meaning in California and is
 * treated as an instruction to keep advertising off, not as a full answer: the
 * banner still appears and analytics can still be chosen.
 */
export function hasGPC(): boolean {
  if (typeof navigator === "undefined") return false;
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

/** The stored answer, or null if there is none, it is unreadable, or it
 *  predates the current version of the categories. */
export function readConsent(): StoredConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredConsent | null;
    if (parsed?.v !== CONSENT_VERSION) return null;
    if (!parsed.state || typeof parsed.state !== "object") return null;
    return parsed;
  } catch {
    // Private mode, blocked storage, corrupt value: treat as no answer, which
    // is the safe direction. The banner appears and nothing is granted.
    return null;
  }
}

/** Force the advertising signals off when Global Privacy Control is on. */
export function withGPC(state: ConsentState): ConsentState {
  if (!hasGPC()) return state;
  const out = { ...state };
  for (const s of AD_SIGNALS) out[s] = false;
  return out;
}

/** True only while the visitor allows advertising storage and data sharing. */
export function adsAllowed(): boolean {
  const state = readConsent()?.state;
  return Boolean(state?.ad_storage && state.ad_user_data) && !hasGPC();
}

/**
 * Apply an answer: update every tag on the page, store it, and announce it.
 * Tags re-evaluate on the update, so the change takes effect without a reload.
 */
export function applyConsent(state: ConsentState, persist = true): void {
  if (typeof window === "undefined") return;
  const effective = withGPC(state);
  const value = (on: boolean) => (on ? "granted" : "denied");

  pushConsentUpdate({
    analytics_storage: value(effective.analytics_storage),
    ad_storage: value(effective.ad_storage),
    ad_user_data: value(effective.ad_user_data),
    ad_personalization: value(effective.ad_personalization),
  });

  if (persist) {
    try {
      const record: StoredConsent = {
        v: CONSENT_VERSION,
        at: new Date().toISOString(),
        gpc: hasGPC(),
        state: effective,
      };
      window.localStorage.setItem(CONSENT_KEY, JSON.stringify(record));
    } catch {
      // Storage blocked: the choice still applies to this page view, and the
      // banner asks again next time. Better than failing the click.
    }
    // Answered: the banner each page renders stays hidden from now on.
    document.documentElement.setAttribute("data-consent-answered", "");
  }

  window.dispatchEvent(new CustomEvent<ConsentState>(CONSENT_CHANGE_EVENT, { detail: effective }));
}

/** What the footer's "Cookie settings" link calls. */
export function openConsentPreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CONSENT_EVENT));
}

/**
 * Runs inline in <head> (app/layout.tsx) before any other script, so the
 * Consent Mode defaults are in place before Tag Manager evaluates a single tag.
 *
 * - Everything optional starts denied; `wait_for_update` gives a returning
 *   visitor's stored answer, replayed just below, time to arrive first.
 * - `ads_data_redaction` strips ad identifiers from requests while ad_storage
 *   is denied; `url_passthrough` carries click ids between pages in the URL
 *   instead of in storage.
 * - `cookie_flags` makes the cookies Google sets after consent Secure and
 *   SameSite=Lax.
 * - A stored answer marks <html> so the server-rendered banner stays hidden.
 */
export const CONSENT_BOOT_SCRIPT = `
(function(){
  if (/^\\/(pos|customer-display)(\\/|$)/.test(location.pathname)) return;
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = gtag;

  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });
  gtag('set', 'ads_data_redaction', true);
  gtag('set', 'url_passthrough', true);
  gtag('set', 'cookie_flags', 'secure;samesite=lax');

  try {
    var raw = localStorage.getItem('${CONSENT_KEY}');
    if (!raw) return;
    var saved = JSON.parse(raw);
    if (!saved || saved.v !== ${CONSENT_VERSION} || !saved.state) return;
    document.documentElement.setAttribute('data-consent-answered', '');
    var s = saved.state;
    var gpc = navigator.globalPrivacyControl === true;
    var ad = function(v){ return (v && !gpc) ? 'granted' : 'denied'; };
    gtag('consent', 'update', {
      ad_storage: ad(s.ad_storage),
      ad_user_data: ad(s.ad_user_data),
      ad_personalization: ad(s.ad_personalization),
      analytics_storage: s.analytics_storage ? 'granted' : 'denied'
    });
  } catch (e) {}
})();
`.trim();
