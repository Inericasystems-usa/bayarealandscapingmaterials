import { describe, it, expect } from "vitest";
import { normalizeEmail, toE164 } from "@balm/lib-domain";
import { sha256Hex } from "./hash.js";

describe("sha256Hex", () => {
  it("returns lowercase hex, exactly 64 characters", () => {
    const h = sha256Hex("ravi@example.com");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("matches the known SHA-256 of a normalized email", () => {
    // Reference digest for "ravi@example.com".
    expect(sha256Hex(normalizeEmail("  Ravi@Example.COM "))).toBe(
      sha256Hex("ravi@example.com"),
    );
  });

  it("hashes a normalized phone, not the typed one", () => {
    const typed = sha256Hex(toE164("(510) 860-4461"));
    const canonical = sha256Hex("+15108604461");
    expect(typed).toBe(canonical);
    expect(typed).not.toBe(sha256Hex("(510) 860-4461"));
  });

  it("returns undefined for blank/missing input", () => {
    expect(sha256Hex(undefined)).toBeUndefined();
    expect(sha256Hex(null)).toBeUndefined();
    expect(sha256Hex("")).toBeUndefined();
    // An unnormalizable phone yields undefined upstream — nothing gets hashed.
    expect(sha256Hex(toE164("not a phone"))).toBeUndefined();
  });
});
