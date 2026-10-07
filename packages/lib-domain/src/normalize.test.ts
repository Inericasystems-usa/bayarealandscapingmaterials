import { describe, it, expect } from "vitest";
import { normalizeEmail, toE164, normalizeName, splitName } from "./index.js";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Ravi.Patel@Example.COM ")).toBe("ravi.patel@example.com");
    expect(normalizeEmail("\tinfo@BALM.com\n")).toBe("info@balm.com");
  });
  it("returns undefined for blank/missing — never an empty string", () => {
    expect(normalizeEmail(undefined)).toBeUndefined();
    expect(normalizeEmail(null)).toBeUndefined();
    expect(normalizeEmail("")).toBeUndefined();
    expect(normalizeEmail("   ")).toBeUndefined();
  });
});

describe("toE164", () => {
  it("normalizes a 10-digit US number", () => {
    expect(toE164("5108604461")).toBe("+15108604461");
  });
  it("normalizes an 11-digit number beginning with 1", () => {
    expect(toE164("15108604461")).toBe("+15108604461");
    expect(toE164("+1 510 860 4461")).toBe("+15108604461");
  });
  it("normalizes formatted input", () => {
    expect(toE164("(510) 860-4461")).toBe("+15108604461");
    expect(toE164(" 510.860.4461 ")).toBe("+15108604461");
    expect(toE164("510-860-4461 ext")).toBe("+15108604461");
  });
  it("returns undefined for non-US / unresolvable international numbers", () => {
    // +44 20 7946 0958 — 12 digits, not a US number we can assert.
    expect(toE164("+442079460958")).toBeUndefined();
    // 11 digits not starting with the US country code.
    expect(toE164("25108604461")).toBeUndefined();
  });
  it("returns undefined for garbage and blanks", () => {
    expect(toE164(undefined)).toBeUndefined();
    expect(toE164(null)).toBeUndefined();
    expect(toE164("")).toBeUndefined();
    expect(toE164("not a phone")).toBeUndefined();
    expect(toE164("123")).toBeUndefined();
    expect(toE164("----")).toBeUndefined();
  });
});

describe("normalizeName", () => {
  it("trims, lowercases and strips disallowed characters", () => {
    expect(normalizeName("  Ravi  ")).toBe("ravi");
    expect(normalizeName("O'Brien")).toBe("o'brien");
    expect(normalizeName("Smith-Jones")).toBe("smith-jones");
    expect(normalizeName("Dr. Ravi 3rd!")).toBe("dr ravi rd");
  });
  it("returns undefined when nothing survives normalization", () => {
    expect(normalizeName(undefined)).toBeUndefined();
    expect(normalizeName(null)).toBeUndefined();
    expect(normalizeName("")).toBeUndefined();
    expect(normalizeName("   ")).toBeUndefined();
    expect(normalizeName("12345")).toBeUndefined();
  });
});

describe("splitName", () => {
  it("splits first token from the rest", () => {
    expect(splitName("Ravi Patel")).toEqual({ firstName: "ravi", lastName: "patel" });
    expect(splitName("  Maria  De La Cruz ")).toEqual({
      firstName: "maria",
      lastName: "de la cruz",
    });
  });
  it("leaves lastName undefined for a single token", () => {
    expect(splitName("Ravi")).toEqual({ firstName: "ravi", lastName: undefined });
  });
  it("handles blank input", () => {
    expect(splitName(undefined)).toEqual({ firstName: undefined, lastName: undefined });
    expect(splitName("   ")).toEqual({ firstName: undefined, lastName: undefined });
  });
});
