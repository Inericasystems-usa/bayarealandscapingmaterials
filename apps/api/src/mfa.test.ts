import { beforeAll, afterAll, describe, it, expect } from "vitest";
import request from "supertest";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { Express } from "express";
import { hotp, totpStep } from "./lib/totp.js";

// Two-step sign-in for admins and managers (PCI DSS 8.4.2), end to end against
// an in-memory MongoDB. NODE_ENV=test without MFA_OPTIONAL_IN_DEVELOPMENT, so
// the requirement is on exactly as in production. Codes are made here with the
// same RFC 6238 algorithm an authenticator app uses.
process.env.NODE_ENV = "test";
process.env.DATA_ENCRYPTION_KEY = "test-data-encryption-key-0123456789abcdef";
process.env.ADMIN_EMAIL = "owner@balm.local";
process.env.ADMIN_PASSWORD = "owner-pass-2468-mfa";
process.env.ADMIN_PIN = "8642";
delete process.env.SEED_DEMO;
delete process.env.MFA_OPTIONAL_IN_DEVELOPMENT;
delete process.env.ALLOW_PIN_LOGIN;
delete process.env.STRIPE_SECRET_KEY;

const ADMIN = "owner@balm.local";
const ADMIN_PW = "owner-pass-2468-mfa";
const STAFF_PW = "staff-pass-1357-mfa";

let app: Express;
let mongod: MongoMemoryServer;
let usersStore: typeof import("./modules/users.js").users;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env.MONGODB_URL = mongod.getUri();
  const { initDb } = await import("./lib/db.js");
  await initDb();
  const { buildServer } = await import("./server.js");
  app = buildServer();
  const { seedData } = await import("./seed.js");
  await seedData(() => {});
  usersStore = (await import("./modules/users.js")).users;
}, 120_000);

afterAll(async () => {
  const { closeDb } = await import("./lib/db.js");
  await closeDb();
  await mongod?.stop();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- response bodies are checked field by field
type Res = { status: number; body: any; headers: Record<string, unknown> };
async function post(url: string, body: unknown, token?: string): Promise<Res> {
  let r = request(app).post(url);
  if (token) r = r.set("authorization", `Bearer ${token}`);
  const res = await r.send(body as object);
  return { status: res.status, body: res.body, headers: res.headers };
}
async function get(url: string, token: string): Promise<Res> {
  const res = await request(app).get(url).set("authorization", `Bearer ${token}`);
  return { status: res.status, body: res.body, headers: res.headers };
}
const signIn = (email: string, password: string) => post("/api/v1/auth/login", { email, password });

const stored = async (email: string) => (await usersStore.findOne({ email }))!;

/** A code the API hasn't seen yet: the step after the last one used, if it is within the accepted window. */
async function freshCode(secret: string, email: string): Promise<string> {
  const last = (await stored(email)).mfaLastStep ?? -1;
  const now = totpStep();
  const step = Math.max(last + 1, now - 1);
  if (step > now + 1) throw new Error("no unused code in the window yet");
  return hotp(secret, step);
}

/** Sign in for the first time and enrol: returns the secret, session token and recovery codes. */
async function enrol(email: string, password: string) {
  const first = await signIn(email, password);
  expect(first.status).toBe(200);
  expect(first.body.data).toMatchObject({ mfa: "enrol", challenge: expect.any(String) });
  const challenge = first.body.data.challenge as string;
  const setup = await post("/api/v1/auth/mfa/enrol", { challenge });
  expect(setup.status).toBe(200);
  const secret = setup.body.data.secret as string;
  const done = await post("/api/v1/auth/mfa/enrol/confirm", { challenge, code: hotp(secret, totpStep()) });
  expect(done.status).toBe(200);
  return { secret, token: done.body.data.token as string, recoveryCodes: done.body.data.recoveryCodes as string[], setup: setup.body.data };
}

let adminToken = "";
let adminSecret = "";
let adminRecovery: string[] = [];

async function addStaff(email: string, role: string) {
  const res = await post("/api/v1/users", { name: email, email, role, pin: "4826", password: STAFF_PW }, adminToken);
  expect(res.status).toBe(201);
  return res.body.data as { id: string };
}

describe("two-step sign-in for admins and managers", () => {
  it("gives a correct password only an enrolment challenge: no session, no cookies", async () => {
    const res = await signIn(ADMIN, ADMIN_PW);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ mfa: "enrol", challenge: expect.stringMatching(/^[0-9a-f]{48}$/), expiresAt: expect.any(String) });
    expect(res.body.data.token).toBeUndefined();
    expect(res.headers["set-cookie"]).toBeUndefined();
    // The pending sign-in lasts five minutes at most.
    expect(Date.parse(res.body.data.expiresAt) - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    // The challenge is not a session: it opens nothing.
    expect((await get("/api/v1/auth/me", res.body.data.challenge)).status).toBe(401);
    expect((await get("/api/v1/customers", res.body.data.challenge)).status).toBe(401);
  });

  it("enrols: otpauth link and key, a wrong code refused, a right one signs in with ten recovery codes", async () => {
    const first = await signIn(ADMIN, ADMIN_PW);
    const challenge = first.body.data.challenge as string;
    const setup = await post("/api/v1/auth/mfa/enrol", { challenge });
    expect(setup.status).toBe(200);
    const { secret, otpauthUri } = setup.body.data as { secret: string; otpauthUri: string };
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(otpauthUri).toBe(
      `otpauth://totp/Bay%20Area%20Landscaping%20Materials:owner%40balm.local?secret=${secret}` +
        "&issuer=Bay%20Area%20Landscaping%20Materials&algorithm=SHA1&digits=6&period=30",
    );
    // Asking again during the same sign-in gives the same secret.
    expect((await post("/api/v1/auth/mfa/enrol", { challenge })).body.data.secret).toBe(secret);

    const wrong = await post("/api/v1/auth/mfa/enrol/confirm", { challenge, code: hotp(secret, totpStep() + 5) });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe("bad_code");

    const done = await post("/api/v1/auth/mfa/enrol/confirm", { challenge, code: hotp(secret, totpStep()) });
    expect(done.status).toBe(200);
    expect(String(done.headers["set-cookie"])).toMatch(/balm_session=.*HttpOnly/i);
    const { token, user, recoveryCodes } = done.body.data;
    expect(user).toMatchObject({ email: ADMIN, mfaEnabled: true });
    expect(user.mfaSecret).toBeUndefined();
    expect(user.mfaRecoveryHashes).toBeUndefined();
    expect(recoveryCodes).toHaveLength(10);
    adminToken = token;
    adminSecret = secret;
    adminRecovery = recoveryCodes;

    // The challenge is used up.
    expect((await post("/api/v1/auth/mfa/enrol", { challenge })).status).toBe(401);
    // A full session: business routes open.
    expect((await get("/api/v1/customers", token)).status).toBe(200);
    expect((await get("/api/v1/auth/me", token)).body.data).toMatchObject({ mfaEnabled: true });
  });

  it("stores the secret encrypted and the recovery codes only as digests, and never returns them", async () => {
    const row = await stored(ADMIN);
    expect(row.mfaSecret).toMatch(/^enc:v1:/);
    expect(row.mfaSecret).not.toContain(adminSecret);
    expect(row.mfaRecoveryHashes).toHaveLength(10);
    for (const code of adminRecovery) expect(row.mfaRecoveryHashes!.join(",")).not.toContain(code.replace(/-/g, ""));
    const list = await get("/api/v1/users", adminToken);
    const me = (list.body.data as Record<string, unknown>[]).find((u) => u.email === ADMIN)!;
    expect(me).toMatchObject({ mfaEnabled: true });
    expect(Object.keys(me).filter((k) => /secret|recovery|laststep/i.test(k))).toEqual([]);
    expect(JSON.stringify(list.body)).not.toContain(adminSecret);
  });

  it("signs in with password then code; a code already used is refused", async () => {
    const res = await signIn(ADMIN, ADMIN_PW);
    expect(res.body.data).toMatchObject({ mfa: "verify" });
    const challenge = res.body.data.challenge as string;
    // The code that confirmed enrolment can't be used again in its window.
    const reused = await post("/api/v1/auth/mfa/verify", { challenge, code: hotp(adminSecret, (await stored(ADMIN)).mfaLastStep!) });
    expect(reused.status).toBe(401);
    const code = await freshCode(adminSecret, ADMIN);
    const ok = await post("/api/v1/auth/mfa/verify", { challenge, code });
    expect(ok.status).toBe(200);
    expect((await get("/api/v1/auth/me", ok.body.data.token)).status).toBe(200);

    // The same code on a new sign-in: refused, it has been used.
    const again = await signIn(ADMIN, ADMIN_PW);
    expect((await post("/api/v1/auth/mfa/verify", { challenge: again.body.data.challenge, code })).status).toBe(401);
  });

  it("accepts the same code only once when it arrives twice at the same moment", async () => {
    const email = "mfa.race@balm.local";
    await addStaff(email, "manager");
    const { secret } = await enrol(email, STAFF_PW);
    const res = await signIn(email, STAFF_PW);
    const challenge = res.body.data.challenge as string;
    const code = await freshCode(secret, email);
    const [a, b] = await Promise.all([
      post("/api/v1/auth/mfa/verify", { challenge, code }),
      post("/api/v1/auth/mfa/verify", { challenge, code }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 401]);
  });

  it("takes each recovery code once", async () => {
    const code = adminRecovery[0]!;
    const first = await signIn(ADMIN, ADMIN_PW);
    const ok = await post("/api/v1/auth/mfa/verify", { challenge: first.body.data.challenge, code: code.toUpperCase().replace(/-/g, " ") });
    expect(ok.status).toBe(200);
    expect(ok.body.data.recoveryCodesLeft).toBe(9);
    const second = await signIn(ADMIN, ADMIN_PW);
    const reused = await post("/api/v1/auth/mfa/verify", { challenge: second.body.data.challenge, code });
    expect(reused.status).toBe(401);
    // The challenge survives a wrong code; another recovery code still works.
    const next = await post("/api/v1/auth/mfa/verify", { challenge: second.body.data.challenge, code: adminRecovery[1]! });
    expect(next.status).toBe(200);
    expect((await stored(ADMIN)).mfaRecoveryHashes).toHaveLength(8);
    const { auditLog } = await import("./modules/audit.js");
    expect(await auditLog.count({ action: "user.mfa.recovery_used" })).toBe(2);
  });

  it("counts wrong codes towards the account lockout", async () => {
    const email = "mfa.lock@balm.local";
    await addStaff(email, "manager");
    const res = await signIn(email, STAFF_PW); // attempt 1 of 5 in this window
    const challenge = res.body.data.challenge as string;
    const setup = await post("/api/v1/auth/mfa/enrol", { challenge });
    const secret = setup.body.data.secret as string;
    for (let i = 0; i < 4; i++) {
      const wrong = await post("/api/v1/auth/mfa/enrol/confirm", { challenge, code: hotp(secret, totpStep() + 7 + i) });
      expect(wrong.status).toBe(401);
    }
    // Five failures in the window: locked, even with the right code or password.
    expect((await post("/api/v1/auth/mfa/enrol/confirm", { challenge, code: hotp(secret, totpStep()) })).status).toBe(429);
    const locked = await signIn(email, STAFF_PW);
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe("locked");
  });

  it("lets a pending sign-in expire after five minutes", async () => {
    const email = "mfa.expire@balm.local";
    await addStaff(email, "manager");
    const res = await signIn(email, STAFF_PW);
    const challenge = res.body.data.challenge as string;
    const { Collection } = await import("./lib/store.js");
    const challenges = new Collection<{ id: string; createdAt: string; updatedAt: string; userId: string; expiresAt: string }>("mfa_challenges");
    const row = (await challenges.findOne({ userId: (await stored(email)).id }))!;
    await challenges.update(row.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    const late = await post("/api/v1/auth/mfa/enrol", { challenge });
    expect(late.status).toBe(401);
    expect(late.body.error.code).toBe("mfa_expired");
    expect(await challenges.find(row.id)).toBeNull(); // removed
  });

  it("ends an admin or manager session that has no second step", async () => {
    const { sessions } = await import("./modules/users.js");
    const { hashToken, newToken } = await import("./lib/crypto.js");
    const token = newToken();
    const now = new Date().toISOString();
    await sessions.insert({
      id: "sess_nomfa",
      tokenHash: hashToken(token),
      userId: (await stored(ADMIN)).id,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
      lastSeenAt: now,
    });
    expect((await get("/api/v1/auth/me", token)).status).toBe(401);
    expect(await sessions.find("sess_nomfa")).toBeNull();
  });

  it("leaves counter staff on password sign-in", async () => {
    const email = "mfa.cashier@balm.local";
    await addStaff(email, "cashier");
    const res = await signIn(email, STAFF_PW);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    expect(res.body.data.mfa).toBeUndefined();
  });

  it("lets an admin reset someone else's two-step sign-in (audited), never their own", async () => {
    const email = "mfa.reset@balm.local";
    const staff = await addStaff(email, "manager");
    const { token } = await enrol(email, STAFF_PW);
    expect((await get("/api/v1/auth/me", token)).status).toBe(200);

    // A manager can't reset anyone; an admin can't reset themselves this way.
    expect((await post(`/api/v1/users/${staff.id}/mfa/reset`, {}, token)).status).toBe(403);
    const adminId = (await stored(ADMIN)).id;
    expect((await post(`/api/v1/users/${adminId}/mfa/reset`, {}, adminToken)).status).toBe(409);

    const reset = await post(`/api/v1/users/${staff.id}/mfa/reset`, {}, adminToken);
    expect(reset.status).toBe(200);
    expect(reset.body.data).toMatchObject({ mfaEnabled: false });
    const row = await stored(email);
    expect(row.mfaSecret).toBeUndefined();
    expect(row.mfaRecoveryHashes).toBeUndefined();
    expect((await get("/api/v1/auth/me", token)).status).toBe(401); // their sessions ended
    const { auditLog } = await import("./modules/audit.js");
    expect(await auditLog.findOne({ action: "user.mfa.reset", "meta.targetId": staff.id })).toMatchObject({ userId: adminId });
    // Next sign-in enrols a new authenticator.
    expect((await signIn(email, STAFF_PW)).body.data).toMatchObject({ mfa: "enrol" });
  });

  it("removes your own only with a current authenticator code", async () => {
    const email = "mfa.self@balm.local";
    await addStaff(email, "manager");
    const { token, secret, recoveryCodes } = await enrol(email, STAFF_PW);
    expect((await post("/api/v1/users/me/mfa/remove", {}, token)).status).toBe(400);
    expect((await post("/api/v1/users/me/mfa/remove", { code: hotp(secret, totpStep() + 9) }, token)).status).toBe(401);
    expect((await post("/api/v1/users/me/mfa/remove", { code: recoveryCodes[0] }, token)).status).toBe(401);
    // The code that finished enrolment has been used.
    expect((await post("/api/v1/users/me/mfa/remove", { code: hotp(secret, (await stored(email)).mfaLastStep!) }, token)).status).toBe(401);
    const removed = await post("/api/v1/users/me/mfa/remove", { code: await freshCode(secret, email) }, token);
    expect(removed.status).toBe(200);
    expect(removed.body.data).toMatchObject({ mfaEnabled: false });
    const { auditLog } = await import("./modules/audit.js");
    expect(await auditLog.count({ action: "user.mfa.remove" })).toBe(1);
  });

  it("is optional only where MFA_OPTIONAL_IN_DEVELOPMENT=true outside production, and enrolled accounts still use it", async () => {
    const email = "mfa.optional@balm.local";
    await addStaff(email, "manager");
    process.env.MFA_OPTIONAL_IN_DEVELOPMENT = "true";
    try {
      const plain = await signIn(email, STAFF_PW);
      expect(plain.body.data.token).toEqual(expect.any(String));
      expect((await get("/api/v1/auth/me", plain.body.data.token)).status).toBe(200);
      expect((await signIn(ADMIN, ADMIN_PW)).body.data).toMatchObject({ mfa: "verify" });
    } finally {
      delete process.env.MFA_OPTIONAL_IN_DEVELOPMENT;
    }
    // Back on: the session without a second step no longer works, and sign-in asks to enrol.
    expect((await signIn(email, STAFF_PW)).body.data).toMatchObject({ mfa: "enrol" });
  });
});
