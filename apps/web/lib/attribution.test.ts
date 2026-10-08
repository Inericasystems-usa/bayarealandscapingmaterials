import { describe, it, expect, beforeEach } from "vitest";
import {
  ATTR_KEY,
  ATTR_TTL_SECONDS,
  captureAttribution,
  clearAttribution,
  readAttribution,
  parseTouch,
} from "./attribution";
import { CONSENT_KEY, CONSENT_VERSION, DENIED, GRANTED, type ConsentState } from "./consent";

/**
 * First-touch attribution. A Map stands in for localStorage and a minimal
 * cookie jar for `document.cookie` (a getter/setter pair over a string, which
 * is exactly what the real accessor is), so no DOM library is needed.
 */

let storage: Map<string, string>;
let jar: Record<string, string> = {};
let cookieWrites: string[] = [];

function installFakeDocument() {
  jar = {};
  cookieWrites = [];
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      },
      set cookie(raw: string) {
        cookieWrites.push(raw);
        const [pair] = raw.split(";");
        const eq = pair?.indexOf("=") ?? -1;
        if (!pair || eq < 0) return;
        if (/max-age=0/i.test(raw)) delete jar[pair.slice(0, eq)];
        else jar[pair.slice(0, eq)] = pair.slice(eq + 1);
      },
      referrer: "https://www.google.com/",
    },
  });
}

function setLocation(search: string, pathname = "/landing", protocol = "https:") {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { protocol, pathname, search },
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
      },
    },
  });
}

function setGPC(on: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { globalPrivacyControl: on },
  });
}

function answer(state: ConsentState) {
  storage.set(CONSENT_KEY, JSON.stringify({ v: CONSENT_VERSION, at: new Date().toISOString(), gpc: false, state }));
}

/** Visit the site with the given query string. */
function visit(search: string, pathname = "/landing") {
  setLocation(search, pathname);
  return captureAttribution(new URLSearchParams(search));
}

beforeEach(() => {
  storage = new Map();
  installFakeDocument();
  setLocation("");
  setGPC(false);
  clearAttribution();
  answer(GRANTED);
});

describe("parseTouch", () => {
  it("picks up every click id and UTM", () => {
    const touch = parseTouch(
      new URLSearchParams(
        "gclid=A&gbraid=B&wbraid=C&msclkid=D&fbclid=E" +
          "&utm_source=google&utm_medium=cpc&utm_campaign=brand&utm_term=t&utm_content=c",
      ),
    );
    expect(touch).toEqual({
      gclid: "A",
      gbraid: "B",
      wbraid: "C",
      msclkid: "D",
      fbclid: "E",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: "brand",
      utm_term: "t",
      utm_content: "c",
    });
  });

  it("ignores unrelated query parameters", () => {
    expect(parseTouch(new URLSearchParams("q=bark&page=2"))).toEqual({});
  });
});

describe("first touch wins", () => {
  it("stores a gclid on the first visit", () => {
    visit("?gclid=TEST123");
    const stored = readAttribution();
    expect(stored?.gclid).toBe("TEST123");
    expect(stored?.landing_page).toBe("/landing?gclid=TEST123");
    expect(stored?.referrer).toBe("https://www.google.com/");
    expect(stored?.captured_at).toBeTruthy();
  });

  it("KEEPS the original gclid when a later visit arrives with only UTMs", () => {
    visit("?gclid=TEST123");
    visit("?utm_source=google&utm_medium=organic", "/products");

    const stored = readAttribution();
    expect(stored?.gclid).toBe("TEST123");
    // The later touch must not have leaked in at all.
    expect(stored?.utm_source).toBeUndefined();
    expect(stored?.landing_page).toBe("/landing?gclid=TEST123");
  });

  it("KEEPS the original gclid on a later visit with no query string at all", () => {
    visit("?gclid=TEST123");
    visit("", "/contact");
    expect(readAttribution()?.gclid).toBe("TEST123");
  });

  it("does not let a later paid click overwrite the first one", () => {
    visit("?gclid=FIRST");
    visit("?gclid=SECOND", "/products");
    expect(readAttribution()?.gclid).toBe("FIRST");
  });

  it("records an organic first visit, then upgrades it to a real click", () => {
    // Organic landing: worth keeping, but it is not a marketing touch.
    visit("");
    expect(readAttribution()?.gclid).toBeUndefined();
    expect(readAttribution()?.landing_page).toBe("/landing");

    // A genuine ad click afterwards SHOULD win — this is the opposite of the
    // case first-touch protects against (organic clobbering paid).
    visit("?gclid=LATER", "/request-quote");
    expect(readAttribution()?.gclid).toBe("LATER");
  });
});

describe("advertising consent", () => {
  it("stores nothing before the visitor answers, and keeps the landing touch once they accept", () => {
    storage.delete(CONSENT_KEY);
    visit("?gclid=AD1");
    expect(storage.has(ATTR_KEY)).toBe(false);
    expect(readAttribution()).toBeNull();

    // Accepting on the next page still credits the ad they arrived from.
    answer(GRANTED);
    visit("", "/request-quote");
    expect(readAttribution()?.gclid).toBe("AD1");
    expect(readAttribution()?.landing_page).toBe("/landing?gclid=AD1");
  });

  it("stores nothing after Reject", () => {
    answer(DENIED);
    visit("?gclid=AD1");
    expect(storage.has(ATTR_KEY)).toBe(false);
    expect(readAttribution()).toBeNull();
  });

  it("stores nothing when Global Privacy Control is on, whatever was accepted", () => {
    setGPC(true);
    visit("?gclid=AD1");
    expect(storage.has(ATTR_KEY)).toBe(false);
    expect(readAttribution()).toBeNull();
  });

  it("forgets the record when advertising is turned off", () => {
    visit("?gclid=AD1");
    expect(storage.has(ATTR_KEY)).toBe(true);
    clearAttribution();
    expect(storage.has(ATTR_KEY)).toBe(false);
  });
});

describe("storage", () => {
  it("never writes a cookie", () => {
    visit("?gclid=TEST123");
    visit("?utm_source=google", "/products");
    expect(cookieWrites).toEqual([]);
    expect(document.cookie).toBe("");
  });

  it("expires the cookie earlier releases wrote, keeping its touch", () => {
    jar.balm_attr = encodeURIComponent(
      JSON.stringify({ gclid: "OLD", landing_page: "/", captured_at: new Date().toISOString() }),
    );
    visit("");
    expect(jar.balm_attr).toBeUndefined();
    expect(cookieWrites[0]).toMatch(/^balm_attr=; Max-Age=0; Path=\/; SameSite=Lax; Secure$/);
    expect(readAttribution()?.gclid).toBe("OLD");
  });

  it("drops a record older than 90 days", () => {
    const old = new Date(Date.now() - (ATTR_TTL_SECONDS + 60) * 1000).toISOString();
    storage.set(ATTR_KEY, JSON.stringify({ gclid: "STALE", captured_at: old }));
    expect(readAttribution()).toBeNull();
    expect(storage.has(ATTR_KEY)).toBe(false);
    expect(ATTR_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });
});

describe("readAttribution", () => {
  it("returns null when nothing is stored", () => {
    expect(readAttribution()).toBeNull();
  });

  it("returns null rather than throwing on a corrupt record", () => {
    storage.set(ATTR_KEY, "not-json");
    expect(readAttribution()).toBeNull();
  });
});
