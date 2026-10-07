import { describe, it, expect, beforeAll, afterAll } from "vitest";

// Set the key BEFORE importing the module (config reads env at import time, and
// the module derives its key lazily on first use).
let enc: typeof import("./encryption.js");
beforeAll(async () => {
  process.env.DATA_ENCRYPTION_KEY = "unit-test-secret-key";
  enc = await import("./encryption.js");
});
// Don't leak the key to other test files sharing the worker process.
afterAll(() => {
  delete process.env.DATA_ENCRYPTION_KEY;
});

describe("field encryption (AES-256-GCM)", () => {
  it("is configured when a key is present", () => {
    expect(enc.isEncryptionConfigured()).toBe(true);
  });

  it("round-trips a value", () => {
    const plain = "customer@example.com";
    const ct = enc.encryptField(plain);
    expect(ct).not.toBe(plain);
    expect(ct.startsWith("enc:v1:")).toBe(true);
    expect(enc.decryptField(ct)).toBe(plain);
  });

  it("uses a fresh IV so the same input yields different ciphertext", () => {
    const a = enc.encryptField("555-123-4567");
    const b = enc.encryptField("555-123-4567");
    expect(a).not.toBe(b);
    expect(enc.decryptField(a)).toBe("555-123-4567");
    expect(enc.decryptField(b)).toBe("555-123-4567");
  });

  it("is idempotent — never double-encrypts", () => {
    const once = enc.encryptField("secret");
    expect(enc.encryptField(once)).toBe(once);
  });

  it("passes through empty strings", () => {
    expect(enc.encryptField("")).toBe("");
    expect(enc.decryptField("")).toBe("");
  });

  it("decrypts legacy plaintext unchanged (back-compat)", () => {
    expect(enc.decryptField("400 W Gertrude Ave")).toBe("400 W Gertrude Ave");
  });

  it("returns raw on tampered/corrupt ciphertext rather than throwing", () => {
    expect(enc.decryptField("enc:v1:not-valid-base64!!")).toBe("enc:v1:not-valid-base64!!");
  });
});
