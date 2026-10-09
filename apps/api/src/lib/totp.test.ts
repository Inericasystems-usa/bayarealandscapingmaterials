import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  hotp,
  matchTotp,
  newRecoveryCodes,
  newTotpSecret,
  normalizeRecoveryCode,
  otpauthUri,
  totpCode,
  totpStep,
} from "./totp.js";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890". The RFC lists
// 8-digit codes; 6-digit codes are their last six digits.
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii"));
const RFC_VECTORS: [number, string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

describe("TOTP (RFC 6238)", () => {
  it("matches the RFC test vectors", () => {
    expect(RFC_SECRET).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    for (const [seconds, code] of RFC_VECTORS) expect(totpCode(RFC_SECRET, seconds * 1000)).toBe(code);
  });

  it("matches the RFC 4226 HOTP vectors", () => {
    expect([0, 1, 2, 3, 9].map((c) => hotp(RFC_SECRET, c))).toEqual(["755224", "287082", "359152", "969429", "520489"]);
  });

  it("round-trips base32 and reads it as people type it", () => {
    const buf = Buffer.from("any bytes at all \x00\xff", "latin1");
    expect(base32Decode(base32Encode(buf))).toEqual(buf);
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq")).toEqual(Buffer.from("12345678901234567890"));
    expect(() => base32Decode("not!base32")).toThrow();
  });

  it("makes 160-bit secrets", () => {
    const s = newTotpSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
    expect(newTotpSecret()).not.toBe(s);
  });

  it("accepts the step before and after now, and only steps after the last one used", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const at = (s: number) => hotp(RFC_SECRET, s);
    expect(matchTotp(RFC_SECRET, at(step), null, now)).toBe(step);
    expect(matchTotp(RFC_SECRET, at(step - 1), null, now)).toBe(step - 1);
    expect(matchTotp(RFC_SECRET, at(step + 1), null, now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, at(step - 2), null, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, at(step + 2), null, now)).toBeNull();
    // Used once: the same code, or an older one, is refused.
    expect(matchTotp(RFC_SECRET, at(step), step, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, at(step - 1), step, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, at(step + 1), step, now)).toBe(step + 1);
    expect(matchTotp(RFC_SECRET, "12345", null, now)).toBeNull();
    expect(matchTotp(RFC_SECRET, "abcdef", null, now)).toBeNull();
  });

  it("builds the otpauth:// link authenticator apps read", () => {
    const uri = otpauthUri("Bay Area Landscaping Materials", "owner@example.com", RFC_SECRET);
    expect(uri).toBe(
      "otpauth://totp/Bay%20Area%20Landscaping%20Materials:owner%40example.com" +
        "?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Bay%20Area%20Landscaping%20Materials&algorithm=SHA1&digits=6&period=30",
    );
  });

  it("makes ten distinct recovery codes and reads them however they're typed", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{4}(-[a-z2-7]{4}){3}$/);
    const c = codes[0]!;
    expect(normalizeRecoveryCode(c.toUpperCase().replace(/-/g, " "))).toBe(c.replace(/-/g, ""));
    expect(normalizeRecoveryCode("123456")).toBeNull();
  });
});
