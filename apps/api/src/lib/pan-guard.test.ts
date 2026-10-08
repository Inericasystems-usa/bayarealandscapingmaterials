import { describe, expect, it } from "vitest";
import { containsPan, containsPanAnywhere, findPanFields, PAN_PLACEHOLDER, redactPan, redactPanDeep } from "./pan-guard.js";

// Published test card numbers, never real accounts.
const cards = [
  "4111111111111111", // Visa
  "4111 1111 1111 1111",
  "4111-1111-1111-1111",
  "5555555555554444", // Mastercard
  "378282246310005", // American Express, 15 digits
  "3782-822463-10005",
  "6011111111111117", // Discover
  "4222222222222", // Visa, 13 digits
  "6250941006528599", // UnionPay
];

const notCards = [
  "(650) 695-6404",
  "+1 650 695 6404",
  "650-695-6404",
  "94503",
  "2026-10-07",
  "ORD-20260617-0002",
  "Order 1234567890123", // 13 digits, fails Luhn
  "4111111111111112", // one digit off
  "12345678901234567890123", // longer than any card
  "Invoice 0000-1111",
];

describe("pan-guard", () => {
  it.each(cards)("finds and removes %s", (card) => {
    const text = `my card is ${card}, thanks`;
    expect(containsPan(text)).toBe(true);
    expect(redactPan(text)).toBe(`my card is ${PAN_PLACEHOLDER}, thanks`);
  });

  it.each(notCards)("leaves %s alone", (text) => {
    expect(containsPan(text)).toBe(false);
    expect(redactPan(text)).toBe(text);
  });

  it("finds a card number glued to letters only when asked to", () => {
    expect(containsPan("ref_4111111111111111")).toBe(false);
    expect(containsPanAnywhere("ref_4111111111111111")).toBe(true);
    expect(containsPanAnywhere("pi_3MtwBwLkdIwHu7ix28a3tqPa")).toBe(false);
  });

  it("names the fields that hold one, skipping identifiers, links and ad-click data", () => {
    const body = {
      notes: "card 4111 1111 1111 1111",
      lines: [{ name: "Gravel", productId: "4111111111111111" }, { name: "Visa 5555555555554444" }],
      clientId: "4111-1111-1111-1111",
      deviceId: "490154203237518", // an IMEI is Luhn-valid by design
      sku: "4111111111111111",
      phone: "+86 138 0013 8000",
      image: "https://d4111111111111111.cloudfront.net/x.jpg",
      attribution: { msclkid: "4111111111111111", landing_page: "/?id=4111111111111111" },
      password: "4111111111111111",
      ok: "nothing to see",
    };
    expect(findPanFields(body)).toEqual(["lines.1.name", "notes"]);
    expect(findPanFields({ q: "4111111111111111", cursor: "4111111111111111" }, "query")).toEqual(["query.q"]);
    expect(findPanFields(undefined)).toEqual([]);
  });

  it("walks deeply nested input without recursion", () => {
    let deep: unknown = "card 4111111111111111";
    for (let i = 0; i < 50_000; i++) deep = [deep];
    expect(findPanFields(deep)).toHaveLength(1);
  });

  it("redacts every string in an object", () => {
    const event = { message: "4111111111111111", extra: { list: ["a", "x 5555555555554444"] }, n: 4111111111111111 };
    expect(redactPanDeep(event)).toEqual({ message: PAN_PLACEHOLDER, extra: { list: ["a", `x ${PAN_PLACEHOLDER}`] }, n: 4111111111111111 });
  });
});
