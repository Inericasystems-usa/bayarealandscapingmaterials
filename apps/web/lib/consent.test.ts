import { describe, it, expect, beforeEach, vi } from "vitest";
import { runInNewContext } from "node:vm";
import {
  CONSENT_BOOT_SCRIPT,
  CONSENT_CHANGE_EVENT,
  CONSENT_KEY,
  CONSENT_VERSION,
  DENIED,
  GRANTED,
  adsAllowed,
  applyConsent,
  readConsent,
} from "./consent";

/**
 * The consent layer. The boot script runs in a bare VM context, the way the
 * browser runs it: before anything else, with only the page's own globals.
 */

let storage: Map<string, string>;
let gtag: ReturnType<typeof vi.fn>;
let dispatched: Event[];
let htmlAttributes: Set<string>;

function setGPC(on: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { globalPrivacyControl: on },
  });
}

beforeEach(() => {
  storage = new Map();
  gtag = vi.fn();
  dispatched = [];
  htmlAttributes = new Set();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
      },
      gtag,
      dispatchEvent: (e: Event) => dispatched.push(e),
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { setAttribute: (name: string) => htmlAttributes.add(name) } },
  });
  setGPC(false);
});

/** Run the boot script for a page and return what it queued for the tags. */
function boot(pathname: string, stored?: unknown, gpc = false) {
  const local = new Map<string, string>();
  if (stored) local.set(CONSENT_KEY, JSON.stringify(stored));
  const attrs = new Set<string>();
  const sandbox: Record<string, unknown> = {
    location: { pathname },
    localStorage: { getItem: (k: string) => local.get(k) ?? null },
    navigator: { globalPrivacyControl: gpc },
    document: { documentElement: { setAttribute: (name: string) => attrs.add(name) } },
  };
  sandbox.window = sandbox;
  runInNewContext(CONSENT_BOOT_SCRIPT, sandbox);
  const layer = (sandbox.dataLayer as ArrayLike<unknown>[] | undefined)?.map((a) => Array.from(a));
  return { layer, attrs, gtag: sandbox.gtag };
}

describe("boot script", () => {
  it("queues Consent Mode defaults, all denied, before anything else", () => {
    const { layer } = boot("/");
    expect(layer?.[0]).toEqual([
      "consent",
      "default",
      {
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
        analytics_storage: "denied",
        functionality_storage: "granted",
        security_storage: "granted",
        wait_for_update: 500,
      },
    ]);
    expect(layer).toContainEqual(["set", "ads_data_redaction", true]);
    expect(layer).toContainEqual(["set", "url_passthrough", true]);
    expect(layer).toContainEqual(["set", "cookie_flags", "secure;samesite=lax"]);
    // No stored answer: no update, and the banner stays visible.
    expect(layer?.some((e) => e[1] === "update")).toBe(false);
  });

  it("replays a stored answer and hides the banner", () => {
    const { layer, attrs } = boot("/products", { v: CONSENT_VERSION, at: "", gpc: false, state: GRANTED });
    expect(layer?.at(-1)).toEqual([
      "consent",
      "update",
      { ad_storage: "granted", ad_user_data: "granted", ad_personalization: "granted", analytics_storage: "granted" },
    ]);
    expect(attrs.has("data-consent-answered")).toBe(true);
  });

  it("keeps advertising denied under Global Privacy Control", () => {
    const { layer } = boot("/", { v: CONSENT_VERSION, at: "", gpc: true, state: GRANTED }, true);
    expect(layer?.at(-1)?.[2]).toMatchObject({ ad_storage: "denied", ad_user_data: "denied", analytics_storage: "granted" });
  });

  it("ignores an answer to an older version of the question", () => {
    const { layer, attrs } = boot("/", { v: CONSENT_VERSION - 1, at: "", gpc: false, state: GRANTED });
    expect(layer?.some((e) => e[1] === "update")).toBe(false);
    expect(attrs.size).toBe(0);
  });

  it("does nothing on staff screens, which load no tags", () => {
    for (const path of ["/pos", "/pos/orders", "/customer-display"]) {
      const { layer, gtag: g } = boot(path);
      expect(layer).toBeUndefined();
      expect(g).toBeUndefined();
    }
    expect(boot("/postal-codes").layer).toBeDefined();
  });
});

describe("applyConsent", () => {
  it("updates the tags, stores the answer and announces it", () => {
    applyConsent(GRANTED);
    expect(gtag).toHaveBeenCalledWith("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
    });
    expect(readConsent()?.state).toEqual(GRANTED);
    expect(adsAllowed()).toBe(true);
    expect(dispatched.map((e) => e.type)).toEqual([CONSENT_CHANGE_EVENT]);
    expect(htmlAttributes.has("data-consent-answered")).toBe(true);
  });

  it("stores Reject as an answer, with advertising off", () => {
    applyConsent(DENIED);
    expect(readConsent()?.state).toEqual(DENIED);
    expect(adsAllowed()).toBe(false);
  });

  it("never records advertising as granted under Global Privacy Control", () => {
    setGPC(true);
    applyConsent(GRANTED);
    expect(readConsent()?.state).toEqual({ ...DENIED, analytics_storage: true });
    expect(readConsent()?.gpc).toBe(true);
    expect(adsAllowed()).toBe(false);
  });

  it("keeps the answer out of cookies", () => {
    applyConsent(GRANTED);
    expect(storage.has(CONSENT_KEY)).toBe(true);
    expect("cookie" in document).toBe(false);
  });
});
