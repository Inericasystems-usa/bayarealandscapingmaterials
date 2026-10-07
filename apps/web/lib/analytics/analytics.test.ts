import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { compact, buildUserData } from "./normalize";
import {
  track,
  trackQuoteFormSubmitted,
  trackContactFormSubmitted,
  trackPhoneClick,
  trackCalculatorCompleted,
} from "./track";
import { postLead } from "../leads-client";

/**
 * The measurement stack's load-bearing rules, tested at the seam that enforces
 * them. Node environment — `window` is stubbed rather than emulated, because
 * the only browser API involved is `window.dataLayer`.
 */

/** Minimal `window` stand-in — the code under test only reads these two keys. */
interface FakeWindow {
  dataLayer?: Record<string, unknown>[];
  location: { pathname: string };
}

function setWindow(value: FakeWindow) {
  Object.defineProperty(globalThis, "window", { configurable: true, value });
}

const fakeWindow = () => (globalThis as unknown as { window: FakeWindow }).window;

function resetDataLayer() {
  setWindow({ dataLayer: [], location: { pathname: "/request-quote" } });
}

/** Events currently on the dataLayer. */
const events = () => (fakeWindow().dataLayer ?? []).filter((e) => typeof e.event === "string");
const eventsNamed = (name: string) => events().filter((e) => e.event === name);

beforeEach(resetDataLayer);

describe("compact", () => {
  it("removes undefined, null and empty strings", () => {
    expect(
      compact({ a: "keep", b: undefined, c: null, d: "", e: 0, f: false }),
    ).toEqual({ a: "keep", e: 0, f: false });
  });

  it("keeps meaningful falsy values (0, false) — they are real data", () => {
    expect(compact({ quantity: 0, paid: false })).toEqual({ quantity: 0, paid: false });
  });

  it("recurses, and drops an object left with nothing in it", () => {
    expect(
      compact({ address: { city: "", region: undefined }, email_address: "a@b.com" }),
    ).toEqual({ email_address: "a@b.com" });
    expect(compact({ address: { city: "richmond", region: "" } })).toEqual({
      address: { city: "richmond" },
    });
  });
});

describe("buildUserData", () => {
  it("normalizes every field and stamps country US", () => {
    expect(
      buildUserData({
        name: "  Ravi Patel ",
        email: "  Ravi@Example.COM ",
        phone: "(510) 860-4461",
        street: "400 W Gertrude Ave",
        city: "Richmond",
        region: "CA",
        postalCode: " 94801 ",
      }),
    ).toEqual({
      email_address: "ravi@example.com",
      phone_number: "+15108604461",
      address: {
        first_name: "ravi",
        last_name: "patel",
        street: "400 w gertrude ave",
        city: "richmond",
        region: "ca",
        postal_code: "94801",
        country: "US",
      },
    });
  });

  it("OMITS a malformed phone rather than sending garbage", () => {
    const data = buildUserData({ name: "Ravi", email: "r@b.com", phone: "12345" });
    expect(data.phone_number).toBeUndefined();
    expect("phone_number" in data).toBe(false);
    expect(data.email_address).toBe("r@b.com");
  });

  it("omits an international number it cannot assert is US", () => {
    expect(buildUserData({ phone: "+442079460958" }).phone_number).toBeUndefined();
  });

  it("sends no address block at all when there is no address", () => {
    expect(buildUserData({ email: "r@b.com" })).toEqual({ email_address: "r@b.com" });
  });

  it("never emits an empty string for a missing field", () => {
    const data = buildUserData({ name: "", email: "  ", phone: "", city: "" });
    expect(data).toEqual({});
  });
});

describe("track", () => {
  it("pushes exactly one entry per call", () => {
    track({ event: "quote_form_started", form_location: "request_quote_page" });
    expect(events()).toHaveLength(1);
    expect(events()[0]).toEqual({
      event: "quote_form_started",
      form_location: "request_quote_page",
    });
  });

  it("creates the queue if the consent script never ran", () => {
    setWindow({ location: { pathname: "/" } });
    track({ event: "quote_form_started", form_location: "x" });
    expect(fakeWindow().dataLayer).toHaveLength(1);
  });
});

describe("conversion events", () => {
  const userData = { email_address: "r@b.com" };

  it("quote: exactly one event, carrying the server's lead id", () => {
    trackQuoteFormSubmitted({
      leadId: "lead_abc",
      material: "Class II Base Rock",
      quantity: "6.5 cubic yards",
      city: "Richmond",
      formLocation: "request_quote_page",
      userData,
    });
    const fired = eventsNamed("quote_form_submitted");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      lead_id: "lead_abc",
      material: "Class II Base Rock",
      city: "Richmond",
      form_location: "request_quote_page",
      user_data: userData,
    });
  });

  it("quote: nulls absent optional fields rather than omitting them", () => {
    trackQuoteFormSubmitted({
      leadId: "lead_1",
      material: "Bark",
      formLocation: "request_quote_page",
      userData,
    });
    expect(eventsNamed("quote_form_submitted")[0]).toMatchObject({
      quantity: null,
      city: null,
    });
  });

  it("contact: exactly one event", () => {
    trackContactFormSubmitted({ leadId: "lead_c1", userData });
    expect(eventsNamed("contact_form_submitted")).toHaveLength(1);
  });

  it("phone click: exactly one event, with location and path", () => {
    trackPhoneClick({ phoneNumber: "+15108604461", location: "sticky_bar" });
    const fired = eventsNamed("phone_click");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toEqual({
      event: "phone_click",
      phone_number: "+15108604461",
      location: "sticky_bar",
      page_path: "/request-quote",
    });
  });

  it("calculator: exactly one event, carrying yardage and no invented value", () => {
    trackCalculatorCompleted({
      material: "Class II Base Rock Virgin 3/4\"",
      cubicYards: 6.5,
    });
    const fired = eventsNamed("calculator_completed");
    expect(fired).toHaveLength(1);
    expect(fired[0]).toMatchObject({
      material: "Class II Base Rock Virgin 3/4\"",
      quantity: 6.5,
    });
    // The site publishes no prices, so nothing may report a dollar figure.
    expect(fired[0]).not.toHaveProperty("estimated_value");
  });
});

/**
 * The rule that matters most: a conversion means the SERVER created a record.
 * These exercise the exact sequence the forms run — postLead, then fire only
 * when a lead id came back.
 */
describe("conversion fires only after server success", () => {
  const mockFetch = (impl: () => Promise<Response> | Response) => {
    vi.stubGlobal("fetch", vi.fn(impl));
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  /** What both forms do, distilled. */
  async function submitAndMaybeTrack(payload: unknown) {
    const result = await postLead("quote", payload);
    if (result.leadId) {
      trackQuoteFormSubmitted({
        leadId: result.leadId,
        material: "Bark",
        formLocation: "request_quote_page",
        userData: {},
      });
    }
    return result;
  }

  afterEach(() => vi.unstubAllGlobals());

  it("201 with an id → exactly one conversion", async () => {
    mockFetch(() => json(201, { ok: true, id: "lead_1" }));
    const result = await submitAndMaybeTrack({});
    expect(result.leadId).toBe("lead_1");
    expect(eventsNamed("quote_form_submitted")).toHaveLength(1);
  });

  it("500 → ZERO conversion events", async () => {
    mockFetch(() => json(500, { error: "boom" }));
    const result = await submitAndMaybeTrack({});
    expect(result.ok).toBe(false);
    expect(result.leadId).toBeNull();
    expect(eventsNamed("quote_form_submitted")).toHaveLength(0);
  });

  it("422 validation failure → ZERO conversion events, with field details", async () => {
    mockFetch(() =>
      json(422, { error: { details: [{ path: "phone", message: "We need a phone." }] } }),
    );
    const result = await submitAndMaybeTrack({});
    expect(result.leadId).toBeNull();
    expect(result.details?.[0]?.message).toBe("We need a phone.");
    expect(eventsNamed("quote_form_submitted")).toHaveLength(0);
  });

  it("429 rate limit → ZERO conversion events", async () => {
    mockFetch(() => json(429, {}));
    await submitAndMaybeTrack({});
    expect(eventsNamed("quote_form_submitted")).toHaveLength(0);
  });

  it("network failure → ZERO conversion events", async () => {
    mockFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    const result = await submitAndMaybeTrack({});
    expect(result.status).toBe(0);
    expect(eventsNamed("quote_form_submitted")).toHaveLength(0);
  });

  it("honeypot 200 WITHOUT an id → ZERO conversion events", async () => {
    mockFetch(() => json(200, { ok: true }));
    const result = await submitAndMaybeTrack({});
    expect(result.ok).toBe(true);
    expect(result.leadId).toBeNull();
    expect(eventsNamed("quote_form_submitted")).toHaveLength(0);
  });

  it("two real submissions → two distinct lead ids and exactly two events", async () => {
    let n = 0;
    mockFetch(() => json(201, { ok: true, id: `lead_${++n}` }));
    const a = await submitAndMaybeTrack({});
    const b = await submitAndMaybeTrack({});
    expect(a.leadId).toBe("lead_1");
    expect(b.leadId).toBe("lead_2");
    expect(eventsNamed("quote_form_submitted")).toHaveLength(2);
  });
});
