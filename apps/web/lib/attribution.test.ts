import { describe, it, expect, beforeEach } from "vitest";
import {
  ATTR_COOKIE,
  ATTR_TTL_SECONDS,
  captureAttribution,
  readAttribution,
  parseTouch,
} from "./attribution";

/**
 * First-touch attribution. A minimal cookie jar stands in for `document.cookie`
 * — the real accessor is a getter/setter pair over a string, which is exactly
 * what this reproduces, so no DOM library is needed.
 */

let jar: Record<string, string> = {};
let lastSetCookie = "";

function installFakeDocument() {
  jar = {};
  lastSetCookie = "";
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return Object.entries(jar)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
      },
      set cookie(raw: string) {
        lastSetCookie = raw;
        const [pair] = raw.split(";");
        const eq = pair?.indexOf("=") ?? -1;
        if (pair && eq > -1) jar[pair.slice(0, eq)] = pair.slice(eq + 1);
      },
      referrer: "https://www.google.com/",
    },
  });
}

function setLocation(search: string, pathname = "/landing") {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { protocol: "https:", pathname, search } },
  });
}

/** Visit the site with the given query string. */
function visit(search: string, pathname = "/landing") {
  setLocation(search, pathname);
  return captureAttribution(new URLSearchParams(search));
}

beforeEach(() => {
  installFakeDocument();
  setLocation("");
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

describe("cookie flags", () => {
  it("is scoped to the site, Lax, Secure over https, with a 90-day TTL", () => {
    visit("?gclid=TEST123");
    expect(lastSetCookie).toContain(`${ATTR_COOKIE}=`);
    expect(lastSetCookie).toContain("path=/");
    expect(lastSetCookie).toContain("SameSite=Lax");
    expect(lastSetCookie).toContain("Secure");
    expect(lastSetCookie).toContain(`max-age=${ATTR_TTL_SECONDS}`);
    expect(ATTR_TTL_SECONDS).toBe(90 * 24 * 60 * 60);
  });

  it("omits Secure on plain http so local dev still works", () => {
    installFakeDocument();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { location: { protocol: "http:", pathname: "/", search: "?gclid=X" } },
    });
    captureAttribution(new URLSearchParams("?gclid=X"));
    expect(lastSetCookie).not.toContain("Secure");
  });
});

describe("readAttribution", () => {
  it("returns null when nothing is stored", () => {
    expect(readAttribution()).toBeNull();
  });

  it("returns null rather than throwing on a corrupt cookie", () => {
    jar[ATTR_COOKIE] = "not-json";
    expect(readAttribution()).toBeNull();
  });
});
