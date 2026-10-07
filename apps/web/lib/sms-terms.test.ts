import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  MODAL_PROGRAM_TERMS,
  PROGRAM_TERMS,
  SMS_FREQUENCY,
  SMS_MESSAGE_TYPES,
  SMS_TERMS_HEADING,
  SMS_TERMS_INTRO,
} from "./sms-terms";
import { hasSeen, markSeen } from "./local-flag";

/**
 * Compliance wording is load-bearing: a carrier audit compares what a visitor
 * was shown against what was filed. These pin the exact strings so a future
 * "tidy-up" of the copy fails loudly instead of silently changing a disclosure.
 */
describe("SMS terms content", () => {
  it("uses the required heading", () => {
    expect(SMS_TERMS_HEADING).toBe("SMS Terms & Conditions");
  });

  it("states that consent is not a condition of purchase", () => {
    expect(SMS_TERMS_INTRO).toBe(
      "By providing your mobile number to Bay Area Landscaping Materials, you consent to " +
        "receive text messages from us at that number. Consent is not a condition of purchase.",
    );
  });

  it("lists exactly the five approved message types, in order", () => {
    expect(SMS_MESSAGE_TYPES).toEqual([
      "Quote and estimate responses",
      "Order confirmations and material availability updates",
      "Delivery scheduling, driver ETA, and delivery-complete notifications",
      "Invoice, payment, and account notifications",
      "Customer service replies to your inquiries",
    ]);
  });

  it("states message frequency", () => {
    expect(SMS_FREQUENCY).toBe(
      "Message frequency may vary based on your order activity and interactions with us.",
    );
  });

  it("keeps every carrier-required disclosure: STOP, HELP, rates, liability", () => {
    const flat = PROGRAM_TERMS.map((b) =>
      [b.lead ?? "", ...b.parts.map((p) => (typeof p === "string" ? p : "strong" in p ? p.strong : p.link.label))].join(""),
    ).join(" ");
    expect(flat).toContain("STOP");
    expect(flat).toContain("HELP");
    expect(flat).toContain("Message and data rates may apply");
    expect(flat).toContain("Carriers are not liable for delayed or undelivered messages");
    expect(flat).toContain("Privacy Policy");
    expect(flat).toContain("We do not share mobile opt-in data with third parties");
  });

  it("modal omits only the duplicate frequency bullet, keeping the rest", () => {
    expect(MODAL_PROGRAM_TERMS.map((b) => b.id)).toEqual(
      PROGRAM_TERMS.filter((b) => b.id !== "frequency").map((b) => b.id),
    );
    // Nothing carrier-required may be dropped from the modal.
    for (const id of ["stop", "help", "rates", "carriers", "privacy"]) {
      expect(MODAL_PROGRAM_TERMS.some((b) => b.id === id)).toBe(true);
    }
  });
});

describe("local-flag (dismissal persistence)", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reports unseen until marked, then seen", () => {
    expect(hasSeen("balm_sms_terms_seen")).toBe(false);
    markSeen("balm_sms_terms_seen");
    expect(hasSeen("balm_sms_terms_seen")).toBe(true);
  });

  it("does not throw when localStorage is blocked, and fails to 'unseen'", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem() {
          throw new DOMException("denied");
        },
        setItem() {
          throw new DOMException("denied");
        },
      },
    });
    expect(() => markSeen("k")).not.toThrow();
    expect(hasSeen("k")).toBe(false);
  });

  it("is inert during server rendering", () => {
    vi.stubGlobal("window", undefined);
    expect(hasSeen("k")).toBe(false);
    expect(() => markSeen("k")).not.toThrow();
  });
});
