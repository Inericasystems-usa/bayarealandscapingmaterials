import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { hashPassword, verifyPassword, newToken, hashToken } from "../lib/crypto.js";
import rateLimit from "express-rate-limit";
import { isDev, mfaOptional } from "../config.js";
import { recordAudit } from "./audit.js";
import { decryptField, encryptField } from "../lib/encryption.js";
import { matchTotp, newRecoveryCodes, newTotpSecret, normalizeRecoveryCode, otpauthUri } from "../lib/totp.js";

export const SESSION_COOKIE = "balm_session";
// Double-submit CSRF token. Readable by JS (NOT httpOnly) so the client echoes
// it in an x-csrf-token header on mutations; a cross-site forgery can't read it.
export const CSRF_COOKIE = "balm_csrf";

// HTTPS-only cookies everywhere except an explicit NODE_ENV=development (plain
// http over a LAN IP). Chromium and Firefox accept Secure cookies on
// http://localhost, so the counter PC keeps working.
const secureCookies = !isDev;

// NOTE: Express `res.cookie` takes maxAge in MILLISECONDS (Fastify used seconds).
const cookieBase = { secure: secureCookies, sameSite: "lax" as const, path: "/" };
const sessionCookieOpts = () => ({ ...cookieBase, httpOnly: true, maxAge: SESSION_TTL_MS });
const csrfCookieOpts = () => ({ ...cookieBase, httpOnly: false, maxAge: SESSION_TTL_MS });

export type Role = "admin" | "manager" | "cashier" | "trainee" | "driver";

export interface User extends Entity {
  name: string;
  email: string;
  role: Role;
  phone: string;
  pinHash: string; // scrypt hash of the 4-6 digit quick-login PIN (never plaintext)
  passwordHash: string; // NO_PASSWORD for PIN-only counter staff
  active: boolean;
  // Explicit allow-list of feature keys that OVERRIDES the role defaults.
  // null = use the role's default permission set.
  permissions: string[] | null;
  // Two-step sign-in (TOTP). The secret is encrypted at rest (lib/encryption.ts)
  // and, like the recovery-code digests and the last step, never leaves the API.
  mfaEnabled?: boolean;
  mfaSecret?: string;
  mfaLastStep?: number; // the newest 30-second step a code was accepted for
  mfaRecoveryHashes?: string[]; // hashToken() of each unused recovery code
  mfaEnrolledAt?: string;
}

interface Session extends Entity {
  tokenHash: string; // hashToken(token): the token itself is never stored
  userId: string;
  expiresAt: string; // ISO — sessions are valid for SESSION_TTL_MS from login
  lastSeenAt: string; // ISO — last authenticated request, written at most once a minute
  // When the session ends (the earlier of expiresAt and lastSeenAt + IDLE_MS),
  // as a Date for MongoDB's TTL index. The TTL monitor runs about once a
  // minute, so userForToken checks the limits itself as well.
  expireAt?: Date;
  mfa?: boolean; // the sign-in included a second step (TOTP or recovery code)
}

// Absolute session lifetime. A POS shift fits comfortably; staff re-login daily.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// A session idle for 15 minutes ends; the user signs in again (PCI DSS 8.2.8).
const IDLE_MS = 15 * 60 * 1000;
const TOUCH_MS = 60 * 1000;

export const users = new Collection<User>("users");
export const sessions = new Collection<Session>("sessions");

// What leaves the API about an account: no password, PIN or authenticator
// secrets, only whether two-step sign-in is set up.
const SECRET_FIELDS = ["passwordHash", "pinHash", "mfaSecret", "mfaLastStep", "mfaRecoveryHashes"] as const;
export type PublicUser = Omit<User, (typeof SECRET_FIELDS)[number]>;
const publicUser = (u: User): PublicUser => {
  const rest: Record<string, unknown> = { ...u };
  for (const f of SECRET_FIELDS) delete rest[f];
  return { ...(rest as PublicUser), mfaEnabled: Boolean(u.mfaEnabled) };
};

// Admins and managers sign in with a password and a code from an authenticator
// app (PCI DSS 8.4.2). In production there is no way round it; development and
// tests may set MFA_OPTIONAL_IN_DEVELOPMENT=true (config.ts).
const MFA_ROLES: readonly Role[] = ["admin", "manager"];
/** True when this account's sessions must have passed a second step. */
export const mfaRequiredFor = (u: Pick<User, "role">): boolean => MFA_ROLES.includes(u.role) && !mfaOptional();
// Anyone with an authenticator set up is asked for a code, required or not.
const needsSecondStep = (u: User): boolean => Boolean(u.mfaEnabled) || mfaRequiredFor(u);

/** How e-mails are stored and compared: trimmed and lower-cased. */
export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

const findSession = async (token: string): Promise<Session | null> => sessions.findOne({ tokenHash: hashToken(token) });

const sessionEnd = (expiresAt: string, lastSeenAt: string): Date =>
  new Date(Math.min(Date.parse(expiresAt), Date.parse(lastSeenAt) + IDLE_MS));

// A session is over once past its absolute expiry or idle for IDLE_MS.
const sessionOver = (s: Session, now: number): boolean =>
  !(Date.parse(s.expiresAt) > now) || !(now - Date.parse(s.lastSeenAt ?? s.createdAt) < IDLE_MS);

/**
 * The active user behind a session token (or null). Ends expired and idle
 * sessions. With `touch: false` the lookup is not activity: it never extends
 * the session (the customer-display relay checks this way).
 */
export async function userForToken(
  token: string | null | undefined,
  { touch = true }: { touch?: boolean } = {},
): Promise<User | null> {
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  const now = Date.now();
  if (sessionOver(session, now)) {
    await sessions.remove(session.id);
    return null;
  }
  if (touch && now - Date.parse(session.lastSeenAt ?? session.createdAt) > TOUCH_MS) {
    const lastSeenAt = new Date(now).toISOString();
    await sessions.update(session.id, { lastSeenAt, expireAt: sessionEnd(session.expiresAt, lastSeenAt) });
  }
  const user = await users.find(session.userId);
  if (!user || !user.active) return null;
  // A session without a second step (from before two-step sign-in, or from
  // before this account became a manager) ends once the account needs one.
  if (mfaRequiredFor(user) && !session.mfa) {
    await sessions.remove(session.id);
    return null;
  }
  return user;
}

// A Bearer token (tools/API, the web's in-memory copy) wins over the HttpOnly
// cookie, so the CSRF exemption for Bearer callers (lib/auth.ts) can't be had
// by adding a bogus Authorization header to a cookie-authenticated request.
function requestToken(req: Request): string | null {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  // cookie-parser turns a "j:"-prefixed value into an object; a token is a string.
  const cookie: unknown = req.cookies?.[SESSION_COOKIE];
  return bearer ?? (typeof cookie === "string" ? cookie : null);
}

/** Resolve the authenticated user from a Bearer token or the session cookie (or null). */
export async function getAuthUser(req: Request): Promise<User | null> {
  return userForToken(requestToken(req));
}

/** Delete sessions that can't be used any more, including any stored before tokens were hashed. */
export async function purgeStaleSessions(): Promise<number> {
  const now = new Date().toISOString();
  const idleSince = new Date(Date.now() - IDLE_MS).toISOString();
  return sessions.removeWhere({
    $or: [
      { tokenHash: { $in: [null, ""] } },
      { expiresAt: { $lte: now } },
      { lastSeenAt: { $lte: idleSince } },
      { lastSeenAt: { $in: [null, ""] }, createdAt: { $lte: idleSince } },
    ],
  });
}

/**
 * Store every e-mail the way sign-in compares it. Accounts saved before e-mails
 * were normalised everywhere (the seeded admin took ADMIN_EMAIL as typed) would
 * otherwise no longer match. Two accounts that differ only in case can't both
 * be normalised under the unique index: those are reported, by account id, for
 * the owner to merge. Returns how many were changed.
 */
export async function normalizeUserEmails(warn: (msg: string) => void = (m) => console.warn(m)): Promise<number> {
  const odd = await users.where({
    email: { $type: "string" },
    $expr: { $ne: ["$email", { $toLower: { $trim: { input: "$email" } } }] },
  });
  let changed = 0;
  for (const u of odd) {
    try {
      await users.update(u.id, { email: normalizeEmail(u.email) });
      changed++;
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err;
      warn(`⚠️  users: account ${u.id} has the same e-mail as another account apart from case; merge them in POS > Employees`);
    }
  }
  return changed;
}

// New and changed passwords: at least 12 characters, letters and digits (PCI DSS 8.3.6).
const PASSWORD_RULE = "Passwords need at least 12 characters, with letters and numbers.";
export const passwordSchema = z
  .string()
  .min(12, PASSWORD_RULE)
  .max(200)
  .regex(/[A-Za-z]/, PASSWORD_RULE)
  .regex(/[0-9]/, PASSWORD_RULE);
// Stored for staff added without a password: it matches nothing, so they can
// only use their PIN, and only where PIN sign-in is on.
const NO_PASSWORD = "!";

// A PIN is a quick switch between counter staff, never a full sign-in on its
// own: it works only where PIN sign-in is explicitly on (ALLOW_PIN_LOGIN=true on
// a counter PC; production hosts refuse the flag) or in development, and never
// for admins or managers, who always use their password.
const PIN_ROLES: readonly Role[] = ["cashier", "trainee", "driver"];
const pinMatches = (user: User, pin: string): boolean =>
  (isDev || process.env.ALLOW_PIN_LOGIN === "true") && PIN_ROLES.includes(user.role) && verifyPassword(pin, user.pinHash);
// A 4-6 digit secret is treated as a PIN even if it matches the password: staff
// added without a password used to get their PIN stored as the password too.
const PIN_SHAPED = /^\d{4,6}$/;
const credentialsMatch = (user: User, secret: string): boolean =>
  PIN_SHAPED.test(secret) ? pinMatches(user, secret) : verifyPassword(secret, user.passwordHash);

const pinSchema = z.string().regex(PIN_SHAPED, "PINs are 4 to 6 digits.");

// First zod issue as "field: message", readable in the Employees form.
const firstIssue = (e: z.ZodError): string => {
  const i = e.issues[0];
  return i ? `${i.path.join(".") || "input"}: ${i.message}` : "Invalid input";
};

const ROLES = ["admin", "manager", "cashier", "trainee", "driver"] as const;
const createSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    role: z.enum(ROLES),
    phone: z.string().default(""),
    pin: pinSchema,
    password: passwordSchema.optional(),
    permissions: z.array(z.string()).nullable().optional(),
  })
  // Admins and managers never sign in with a PIN: without a password they couldn't sign in at all.
  .refine((u) => u.password !== undefined || PIN_ROLES.includes(u.role), {
    path: ["password"],
    message: "Admins and managers need a password (12+ characters, letters and numbers).",
  });

// Per-account lockout on top of the per-IP rate limit: MAX_FAILS wrong attempts
// lock the account for 30 minutes (PCI DSS 8.3.4: at most 10 attempts, at least
// 30 minutes). Stored, so a restart doesn't reset it, under a hash of the typed
// address, so mistyped or junk addresses aren't kept. Each attempt is numbered
// atomically before its secret is checked, and the fields only ever grow, so a
// burst of parallel guesses can't get more than MAX_FAILS checked.
const MAX_FAILS = 5;
const LOCK_MS = 30 * 60 * 1000;
interface LoginFailure extends Entity {
  count: number; // attempts ever made
  base?: number; // count when the current window opened (last lock or success)
  lockedUntil?: string | null;
}
const loginFailures = new Collection<LoginFailure>("login_failures");

const lockedNow = (f: LoginFailure | null): boolean => Boolean(f?.lockedUntil && Date.parse(f.lockedUntil) > Date.now());

// Lock, and open the next window after attempt `n` (the largest n wins).
const lock = (key: string, n: number) =>
  loginFailures.bump(key, { max: { base: n, lockedUntil: new Date(Date.now() + LOCK_MS).toISOString() } });

// ── Auth routes (/api/v1/auth) ───────────────────────────────────────
export const authRoutes = Router();

// per-IP brute-force cap (relaxed under test; per-account lockout still applies)
authRoutes.post(
  "/login",
  rateLimit({ windowMs: 60_000, max: process.env.VITEST ? 1000 : 10 }),
  async (req, res) => {
    const parsed = z.object({ email: z.string(), password: z.string() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
    const id = normalizeEmail(parsed.data.email);
    const failKey = hashToken(id);
    const locked = { error: { code: "locked", message: "Too many attempts. Try again in 30 minutes." } };
    if (lockedNow(await loginFailures.find(failKey))) return res.status(429).json(locked);
    const tries = await loginFailures.bump(failKey, { inc: { count: 1 } });
    const n = tries.count;
    const attempt = n - (tries.base ?? 0); // this attempt's place in the current window
    // Locked meanwhile, or a parallel burst past the limit: refused unchecked.
    if (lockedNow(tries) || attempt > MAX_FAILS) {
      await lock(failKey, n);
      return res.status(429).json(locked);
    }
    const user = await users.findOne({ email: id });
    // The account password, or the quick PIN where PIN sign-in is allowed (both stored hashed).
    const ok = user && user.active && credentialsMatch(user, parsed.data.password);
    if (!user || !ok) {
      if (attempt >= MAX_FAILS) await lock(failKey, n);
      return res.status(401).json({ error: { code: "bad_credentials", message: "Invalid email or password/PIN." } });
    }
    // Password right, second step still to come: no session yet, only a
    // challenge that can do nothing but finish this sign-in (or enrol). The
    // attempt window stays open, so wrong codes count with wrong passwords.
    if (needsSecondStep(user)) {
      const purpose = user.mfaEnabled ? "verify" : "enrol";
      const challenge = await openChallenge(user, failKey, purpose);
      return res.json({ data: { mfa: purpose, ...challenge } });
    }
    await loginFailures.bump(failKey, { max: { base: n } }); // a success starts a fresh window
    return res.json({ data: await startSession(res, user, false) });
  },
);

/** Create a session for `user`, set its cookies, and return what the client gets. */
async function startSession(res: Response, user: User, mfa: boolean): Promise<{ token: string; user: PublicUser }> {
  const token = newToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  await sessions.insert({
    id: newId("sess"),
    tokenHash: hashToken(token),
    userId: user.id,
    expiresAt,
    lastSeenAt: now.toISOString(),
    expireAt: sessionEnd(expiresAt, now.toISOString()),
    mfa,
  });
  // HttpOnly cookie = the token never has to live in JS-readable storage.
  res.cookie(SESSION_COOKIE, token, sessionCookieOpts());
  res.cookie(CSRF_COOKIE, newToken(), csrfCookieOpts());
  return { token, user: publicUser(user) };
}

// ── Second step (/api/v1/auth/mfa/*) ─────────────────────────────────
// A correct password for an admin or manager opens a challenge: a random token
// (stored hashed) that lives five minutes and is good only for these routes.
// "enrol" when the account has no authenticator yet, "verify" when it has.
const CHALLENGE_MS = 5 * 60 * 1000;
const ISSUER = "Bay Area Landscaping Materials";
type ChallengePurpose = "verify" | "enrol";
interface MfaChallenge extends Entity {
  tokenHash: string;
  userId: string;
  failKey: string; // the sign-in lockout row, so wrong codes count with wrong passwords
  purpose: ChallengePurpose;
  secret?: string; // the authenticator secret being enrolled, encrypted
  expiresAt: string;
  expireAt?: Date; // for MongoDB's TTL index
}
const challenges = new Collection<MfaChallenge>("mfa_challenges");

async function openChallenge(user: User, failKey: string, purpose: ChallengePurpose): Promise<{ challenge: string; expiresAt: string }> {
  await challenges.removeWhere({ userId: user.id }); // one pending sign-in per account
  const token = newToken();
  const expireAt = new Date(Date.now() + CHALLENGE_MS);
  await challenges.insert({
    id: newId("mfa"),
    tokenHash: hashToken(token),
    userId: user.id,
    failKey,
    purpose,
    expiresAt: expireAt.toISOString(),
    expireAt,
  });
  return { challenge: token, expiresAt: expireAt.toISOString() };
}

const EXPIRED = { code: "mfa_expired", message: "That sign-in has expired. Sign in again." };
const WRONG_CODE = { code: "bad_code", message: "That code isn't right. Try the current code from your authenticator app." };
const LOCKED = { code: "locked", message: "Too many attempts. Try again in 30 minutes." };

/** The live challenge for `token` with its active user, or null (expired ones are removed). */
async function liveChallenge(token: string, purpose: ChallengePurpose): Promise<{ challenge: MfaChallenge; user: User } | null> {
  const challenge = await challenges.findOne({ tokenHash: hashToken(token) });
  if (!challenge) return null;
  if (!(Date.parse(challenge.expiresAt) > Date.now())) {
    await challenges.remove(challenge.id);
    return null;
  }
  if (challenge.purpose !== purpose) return null;
  const user = await users.find(challenge.userId);
  return user && user.active ? { challenge, user } : null;
}

/**
 * Check one code against the sign-in lockout: like a password attempt, each
 * code is numbered atomically before it is checked, and MAX_FAILS wrong ones
 * (passwords and codes together) lock the account for 30 minutes.
 */
async function attemptCode<T>(failKey: string, check: () => Promise<T | null>): Promise<{ ok: T } | { refused: "locked" | "wrong" }> {
  if (lockedNow(await loginFailures.find(failKey))) return { refused: "locked" };
  const tries = await loginFailures.bump(failKey, { inc: { count: 1 } });
  const n = tries.count;
  const attempt = n - (tries.base ?? 0);
  if (lockedNow(tries) || attempt > MAX_FAILS) {
    await lock(failKey, n);
    return { refused: "locked" };
  }
  const ok = await check();
  if (ok === null) {
    if (attempt >= MAX_FAILS) await lock(failKey, n);
    return { refused: "wrong" };
  }
  await loginFailures.bump(failKey, { max: { base: n } }); // a full sign-in starts a fresh window
  return { ok };
}

const refusal = (res: Response, why: "locked" | "wrong") =>
  why === "locked" ? res.status(429).json({ error: LOCKED }) : res.status(401).json({ error: WRONG_CODE });

// The stored secret, or null if it can't be read (a changed DATA_ENCRYPTION_KEY).
const readSecret = (stored: string | undefined): string | null => {
  const secret = stored ? decryptField(stored) : "";
  return /^[A-Z2-7]{16,}$/.test(secret) ? secret : null;
};

/**
 * Accept a TOTP code once: the step is claimed in the same write that checks
 * it is newer than the last one, so the same code sent twice (even at the same
 * moment) signs in only once.
 */
async function claimTotp(user: User, code: string): Promise<number | null> {
  const secret = readSecret(user.mfaSecret);
  if (!secret) return null;
  const step = matchTotp(secret, code, user.mfaLastStep);
  if (step === null) return null;
  const claimed = await users.updateIf(
    user.id,
    { mfaEnabled: true, $or: [{ mfaLastStep: { $lt: step } }, { mfaLastStep: null }] },
    { set: { mfaLastStep: step } },
  );
  return claimed ? step : null;
}

/** Use up one recovery code (removed in the same write that finds it). */
async function claimRecoveryCode(user: User, code: string): Promise<"recovery" | null> {
  const clean = normalizeRecoveryCode(code);
  if (!clean) return null;
  const digest = hashToken(clean);
  const claimed = await users.updateIf(user.id, { mfaEnabled: true, mfaRecoveryHashes: digest }, { pull: { mfaRecoveryHashes: digest } });
  return claimed ? "recovery" : null;
}

const mfaLimiter = rateLimit({ windowMs: 60_000, max: process.env.VITEST ? 1000 : 10 });
const challengeBody = z.object({ challenge: z.string().min(1).max(200) });
const codeBody = challengeBody.extend({ code: z.string().min(1).max(40) });
const typed = (code: string): string => code.replace(/\s/g, "");

// Enrolment, step 1: a new authenticator secret for this pending sign-in, as
// an otpauth:// link (the POS draws it as a QR code) and as a key to type in.
// Shown only while enrolling; once confirmed it never leaves the API again.
authRoutes.post("/mfa/enrol", mfaLimiter, async (req, res) => {
  const parsed = challengeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: "challenge is required" } });
  const live = await liveChallenge(parsed.data.challenge, "enrol");
  if (!live) return res.status(401).json({ error: EXPIRED });
  let stored = live.challenge.secret;
  if (!stored) {
    // Set only while still unset, so two parallel calls agree on one secret.
    const set = await challenges.updateIf(live.challenge.id, { secret: null }, { set: { secret: encryptField(newTotpSecret()) } });
    stored = (set ?? (await challenges.find(live.challenge.id)))?.secret;
  }
  const secret = readSecret(stored);
  if (!secret) return res.status(401).json({ error: EXPIRED });
  res.setHeader("cache-control", "no-store");
  return res.json({ data: { otpauthUri: otpauthUri(ISSUER, live.user.email, secret), secret, issuer: ISSUER, account: live.user.email } });
});

// Enrolment, step 2: a valid code from the new authenticator turns two-step
// sign-in on, issues ten single-use recovery codes (shown this once, stored as
// digests) and completes the sign-in.
authRoutes.post("/mfa/enrol/confirm", mfaLimiter, async (req, res) => {
  const parsed = codeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: "challenge and code are required" } });
  const live = await liveChallenge(parsed.data.challenge, "enrol");
  const secret = readSecret(live?.challenge.secret);
  if (!live || !secret) return res.status(401).json({ error: EXPIRED });
  const code = typed(parsed.data.code);
  const result = await attemptCode(live.challenge.failKey, async () => matchTotp(secret, code, null));
  if ("refused" in result) {
    if (result.refused === "locked") await challenges.remove(live.challenge.id);
    return refusal(res, result.refused);
  }
  const recoveryCodes = newRecoveryCodes();
  const enrolled = await users.updateIf(
    live.user.id,
    { mfaEnabled: { $ne: true } },
    {
      set: {
        mfaEnabled: true,
        mfaSecret: encryptField(secret),
        mfaLastStep: result.ok, // this code can't be used again to sign in
        mfaRecoveryHashes: recoveryCodes.map((c) => hashToken(normalizeRecoveryCode(c) ?? c)),
        mfaEnrolledAt: new Date().toISOString(),
      },
    },
  );
  await challenges.remove(live.challenge.id);
  if (!enrolled) return res.status(409).json({ error: { code: "mfa_already_enrolled", message: "Two-step sign-in is already set up. Sign in again." } });
  await recordAudit(enrolled, "user.mfa.enrol", `Set up two-step sign-in for ${enrolled.email}`, { targetId: enrolled.id });
  res.setHeader("cache-control", "no-store");
  return res.json({ data: { ...(await startSession(res, enrolled, true)), recoveryCodes } });
});

// Sign-in, second step: a current code from the authenticator, or one unused
// recovery code.
authRoutes.post("/mfa/verify", mfaLimiter, async (req, res) => {
  const parsed = codeBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: "challenge and code are required" } });
  const live = await liveChallenge(parsed.data.challenge, "verify");
  if (!live || !live.user.mfaEnabled) return res.status(401).json({ error: EXPIRED });
  const user = live.user;
  const code = typed(parsed.data.code);
  const result = await attemptCode<number | "recovery">(live.challenge.failKey, () =>
    /^\d{6}$/.test(code) ? claimTotp(user, code) : claimRecoveryCode(user, code),
  );
  if ("refused" in result) {
    if (result.refused === "locked") await challenges.remove(live.challenge.id);
    return refusal(res, result.refused);
  }
  await challenges.remove(live.challenge.id);
  const fresh = (await users.find(user.id)) ?? user;
  const recoveryCodesLeft = fresh.mfaRecoveryHashes?.length ?? 0;
  if (result.ok === "recovery")
    await recordAudit(fresh, "user.mfa.recovery_used", `Signed in with a recovery code (${recoveryCodesLeft} left)`, {
      targetId: fresh.id,
      left: recoveryCodesLeft,
    });
  return res.json({ data: { ...(await startSession(res, fresh, true)), recoveryCodesLeft } });
});

authRoutes.post("/logout", async (req, res) => {
  const token = requestToken(req);
  const session = token ? await findSession(token) : null;
  if (session) await sessions.remove(session.id);
  res.clearCookie(SESSION_COOKIE, { ...cookieBase, httpOnly: true });
  res.clearCookie(CSRF_COOKIE, cookieBase);
  return res.json({ data: { ok: true } });
});

authRoutes.get("/me", async (req, res) => {
  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: { code: "unauthorized", message: "Not signed in." } });
  // Backfill the CSRF cookie for sessions established before CSRF existed.
  if (!req.cookies?.[CSRF_COOKIE]) res.cookie(CSRF_COOKIE, newToken(), csrfCookieOpts());
  return res.json({ data: publicUser(user) });
});

// ── User management (/api/v1/users) — admin/manager only for writes ──

// Nobody deactivates or demotes their own account, and the last active admin
// stays, so the store can never be locked out of Employees. The admins are
// counted again after the write: two admins removing each other at the same
// moment can't both succeed.
type Refusal = { code: string; message: string };
const OWN_ACCOUNT: Refusal = {
  code: "own_account",
  message: "You can't deactivate your own account or change your own role; someone else has to do it.",
};
const LAST_ADMIN: Refusal = {
  code: "last_admin",
  message: "This is the last active admin account. Add or reactivate another admin first.",
};
const isActiveAdmin = (u: { role: Role; active: boolean }): boolean => u.role === "admin" && u.active;
const activeAdmins = async (): Promise<number> => users.count({ role: "admin", active: true });

/** Applies `patch` to `target` on behalf of `me`, or returns why it's refused (a 409). */
async function changeUser(me: User, target: User, patch: Partial<User>): Promise<{ user: User | null } | { refused: Refusal }> {
  const after = { role: patch.role ?? target.role, active: patch.active ?? target.active };
  if (target.id === me.id && (!after.active || after.role !== target.role)) return { refused: OWN_ACCOUNT };
  const removesAdmin = isActiveAdmin(target) && !isActiveAdmin(after);
  if (removesAdmin && (await activeAdmins()) < 2) return { refused: LAST_ADMIN };
  const user = await users.update(target.id, patch);
  if (user && removesAdmin && (await activeAdmins()) === 0) {
    // The other admin went at the same moment: put this account back as it was.
    const before = Object.fromEntries(Object.keys(patch).map((k) => [k, target[k as keyof User]]));
    await users.update(target.id, before as Partial<User>);
    return { refused: LAST_ADMIN };
  }
  return { user };
}

export const usersRoutes = Router();

usersRoutes.get("/", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: { code: "unauthorized", message: "Not signed in." } });
  // The list exposes each user's quick-login PIN — managers/admins only.
  if (me.role !== "admin" && me.role !== "manager")
    return res.status(403).json({ error: { code: "forbidden", message: "Admins only." } });
  const list = await users.all(); // the Employees screen lists every account
  return res.json({ data: list.map(publicUser) });
});

usersRoutes.post("/", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me || (me.role !== "admin" && me.role !== "manager"))
    return res.status(403).json({ error: { code: "forbidden", message: "Admins only." } });
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: firstIssue(parsed.error) } });
  // Only an admin may create an admin — otherwise a manager could mint a new
  // admin account and take over the store.
  if (parsed.data.role === "admin" && me.role !== "admin")
    return res.status(403).json({ error: { code: "forbidden", message: "Only an admin can create an admin account." } });
  const email = normalizeEmail(parsed.data.email);
  // The unique index on users.email backs this check up against a parallel create.
  const dupe = await users.findOne({ email });
  if (dupe) return res.status(409).json({ error: { code: "exists", message: "Email already in use." } });
  const created = await users.insert({
    id: newId("usr"),
    name: parsed.data.name,
    email,
    role: parsed.data.role,
    phone: parsed.data.phone,
    pinHash: hashPassword(parsed.data.pin),
    // No password means no password sign-in; the PIN never doubles as one.
    passwordHash: parsed.data.password ? hashPassword(parsed.data.password) : NO_PASSWORD,
    active: true,
    permissions: parsed.data.permissions ?? null,
  });
  await recordAudit(me, "user.create", `Created ${created.role} account for ${created.email}`, { targetId: created.id, role: created.role });
  return res.status(201).json({ data: publicUser(created) });
});

usersRoutes.patch("/:id", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me || (me.role !== "admin" && me.role !== "manager"))
    return res.status(403).json({ error: { code: "forbidden", message: "Admins only." } });
  const { id } = req.params as { id: string };
  const parsed = z
    .object({
      name: z.string().optional(),
      role: z.enum(ROLES).optional(),
      phone: z.string().optional(),
      pin: pinSchema.optional(),
      active: z.boolean().optional(),
      password: passwordSchema.optional(),
      permissions: z.array(z.string()).nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: firstIssue(parsed.error) } });
  // A manager must not be able to escalate to admin, nor edit/lock an existing
  // admin (password/PIN/active). Only admins manage admins and grant admin.
  if (me.role !== "admin" && parsed.data.role === "admin")
    return res.status(403).json({ error: { code: "forbidden", message: "Only an admin can grant the admin role." } });
  const target = await users.find(id);
  if (!target) return res.status(404).json({ error: { code: "not_found", message: "User not found" } });
  if (me.role !== "admin" && target.role === "admin")
    return res.status(403).json({ error: { code: "forbidden", message: "Only an admin can modify an admin account." } });
  const { password, pin, ...rest } = parsed.data;
  const patch: Partial<User> = { ...rest };
  if (password) patch.passwordHash = hashPassword(password);
  if (pin) patch.pinHash = hashPassword(pin); // reset PIN (never stored plaintext)
  const result = await changeUser(me, target, patch);
  if ("refused" in result) return res.status(409).json({ error: result.refused });
  const updated = result.user;
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "User not found" } });
  // Security-relevant: surface role/active/permission/credential changes.
  const changes: string[] = [];
  if (parsed.data.role) changes.push(`role→${parsed.data.role}`);
  if (parsed.data.active !== undefined) changes.push(parsed.data.active ? "reactivated" : "deactivated");
  if (parsed.data.permissions !== undefined) changes.push("permissions");
  if (password) changes.push("password reset");
  if (pin) changes.push("PIN reset");
  await recordAudit(me, "user.update", `Updated ${updated.email}${changes.length ? " — " + changes.join(", ") : ""}`, { targetId: updated.id, changes: Object.keys(parsed.data) });
  return res.json({ data: publicUser(updated) });
});

usersRoutes.delete("/:id", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me || me.role !== "admin")
    return res.status(403).json({ error: { code: "forbidden", message: "Admins only." } });
  const target = await users.find(id_of(req));
  if (!target) return res.status(404).json({ error: { code: "not_found", message: "User not found" } });
  // Soft-deactivate rather than delete, to preserve sales/timeclock history.
  const result = await changeUser(me, target, { active: false });
  if ("refused" in result) return res.status(409).json({ error: result.refused });
  const updated = result.user;
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "User not found" } });
  await recordAudit(me, "user.deactivate", `Deactivated ${updated.email}`, { targetId: updated.id });
  return res.json({ data: publicUser(updated) });
});

const MFA_FIELDS = ["mfaSecret", "mfaLastStep", "mfaRecoveryHashes", "mfaEnrolledAt"] as const;

// Turn two-step sign-in off for your own account: only with a current code from
// the authenticator (a recovery code won't do), so a session left open on a
// counter can't strip it. Wrong codes count towards the sign-in lockout.
usersRoutes.post("/me/mfa/remove", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: { code: "unauthorized", message: "Not signed in." } });
  if (!me.mfaEnabled) return res.status(409).json({ error: { code: "mfa_not_enrolled", message: "Two-step sign-in isn't set up." } });
  const parsed = z.object({ code: z.string().min(1).max(40) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: "code is required" } });
  const code = typed(parsed.data.code);
  const result = await attemptCode(hashToken(normalizeEmail(me.email)), () => claimTotp(me, code));
  if ("refused" in result) return refusal(res, result.refused);
  const updated = await users.update(me.id, { mfaEnabled: false }, { unset: [...MFA_FIELDS] });
  await recordAudit(me, "user.mfa.remove", `Turned off two-step sign-in for ${me.email}`, { targetId: me.id });
  return res.json({ data: updated ? publicUser(updated) : null });
});

// An admin resets someone else's two-step sign-in (a lost phone): their
// authenticator and recovery codes are deleted and their sessions end, so they
// set up a new authenticator at their next sign-in. Audited. Nobody resets
// their own this way.
usersRoutes.post("/:id/mfa/reset", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me || me.role !== "admin") return res.status(403).json({ error: { code: "forbidden", message: "Admins only." } });
  const target = await users.find(id_of(req));
  if (!target) return res.status(404).json({ error: { code: "not_found", message: "User not found" } });
  if (target.id === me.id)
    return res.status(409).json({
      error: { code: "own_account", message: "To turn off your own two-step sign-in, use a current code from your authenticator." },
    });
  const updated = await users.update(target.id, { mfaEnabled: false }, { unset: [...MFA_FIELDS] });
  await sessions.removeWhere({ userId: target.id });
  await challenges.removeWhere({ userId: target.id });
  await recordAudit(me, "user.mfa.reset", `Reset two-step sign-in for ${target.email}`, { targetId: target.id });
  return res.json({ data: updated ? publicUser(updated) : null });
});

function id_of(req: Request): string {
  return (req.params as { id: string }).id;
}
