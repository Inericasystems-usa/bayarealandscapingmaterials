import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { hashPassword, verifyPassword, newToken, hashToken } from "../lib/crypto.js";
import rateLimit from "express-rate-limit";
import { isDev } from "../config.js";
import { recordAudit } from "./audit.js";

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
}

interface Session extends Entity {
  tokenHash: string; // hashToken(token): the token itself is never stored
  userId: string;
  expiresAt: string; // ISO — sessions are valid for SESSION_TTL_MS from login
  lastSeenAt: string; // ISO — last authenticated request, written at most once a minute
}

// Absolute session lifetime. A POS shift fits comfortably; staff re-login daily.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
// A session idle for 15 minutes ends; the user signs in again (PCI DSS 8.2.8).
const IDLE_MS = 15 * 60 * 1000;
const TOUCH_MS = 60 * 1000;

export const users = new Collection<User>("users");
export const sessions = new Collection<Session>("sessions");

export type PublicUser = Omit<User, "passwordHash" | "pinHash">;
const publicUser = (u: User): PublicUser => {
  const { passwordHash: _p, pinHash: _pin, ...rest } = u;
  return rest;
};

const findSession = async (token: string): Promise<Session | null> =>
  (await sessions.query({ where: { tokenHash: hashToken(token) } }))[0] ?? null;

// A session is over once past its absolute expiry or idle for IDLE_MS.
const sessionOver = (s: Session, now: number): boolean =>
  !(Date.parse(s.expiresAt) > now) || !(now - Date.parse(s.lastSeenAt ?? s.createdAt) < IDLE_MS);

/** The active user behind a session token (or null). Ends expired and idle sessions. */
export async function userForToken(token: string | null | undefined): Promise<User | null> {
  if (!token) return null;
  const session = await findSession(token);
  if (!session) return null;
  const now = Date.now();
  if (sessionOver(session, now)) {
    await sessions.remove(session.id);
    return null;
  }
  if (now - Date.parse(session.lastSeenAt ?? session.createdAt) > TOUCH_MS)
    await sessions.update(session.id, { lastSeenAt: new Date(now).toISOString() });
  const user = await users.find(session.userId);
  return user && user.active ? user : null;
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
  const now = Date.now();
  const stale = await sessions.filter((s) => !s.tokenHash || sessionOver(s, now));
  for (const s of stale) await sessions.remove(s.id);
  return stale.length;
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
    const id = parsed.data.email.trim().toLowerCase();
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
    const user = await users.findBy((u) => u.email.toLowerCase() === id);
    // The account password, or the quick PIN where PIN sign-in is allowed (both stored hashed).
    const ok = user && user.active && credentialsMatch(user, parsed.data.password);
    if (!user || !ok) {
      if (attempt >= MAX_FAILS) await lock(failKey, n);
      return res.status(401).json({ error: { code: "bad_credentials", message: "Invalid email or password/PIN." } });
    }
    await loginFailures.bump(failKey, { max: { base: n } }); // a success starts a fresh window
    const token = newToken();
    const now = new Date();
    await sessions.insert({
      id: newId("sess"),
      tokenHash: hashToken(token),
      userId: user.id,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
      lastSeenAt: now.toISOString(),
    });
    // HttpOnly cookie = the token never has to live in JS-readable storage.
    res.cookie(SESSION_COOKIE, token, sessionCookieOpts());
    res.cookie(CSRF_COOKIE, newToken(), csrfCookieOpts());
    return res.json({ data: { token, user: publicUser(user) } });
  },
);

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
export const usersRoutes = Router();

usersRoutes.get("/", async (req, res) => {
  const me = await getAuthUser(req);
  if (!me) return res.status(401).json({ error: { code: "unauthorized", message: "Not signed in." } });
  // The list exposes each user's quick-login PIN — managers/admins only.
  if (me.role !== "admin" && me.role !== "manager")
    return res.status(403).json({ error: { code: "forbidden", message: "Admins only." } });
  const list = await users.all();
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
  const dupe = await users.findBy((u) => u.email.toLowerCase() === parsed.data.email.toLowerCase());
  if (dupe) return res.status(409).json({ error: { code: "exists", message: "Email already in use." } });
  const created = await users.insert({
    id: newId("usr"),
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
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
  if (me.role !== "admin") {
    if (parsed.data.role === "admin")
      return res.status(403).json({ error: { code: "forbidden", message: "Only an admin can grant the admin role." } });
    const target = await users.find(id);
    if (target?.role === "admin")
      return res.status(403).json({ error: { code: "forbidden", message: "Only an admin can modify an admin account." } });
  }
  const { password, pin, ...rest } = parsed.data;
  const patch: Partial<User> = { ...rest };
  if (password) patch.passwordHash = hashPassword(password);
  if (pin) patch.pinHash = hashPassword(pin); // reset PIN (never stored plaintext)
  const updated = await users.update(id, patch);
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
  // Soft-deactivate rather than delete, to preserve sales/timeclock history.
  const updated = await users.update(id_of(req), { active: false });
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "User not found" } });
  await recordAudit(me, "user.deactivate", `Deactivated ${updated.email}`, { targetId: updated.id });
  return res.json({ data: publicUser(updated) });
});

function id_of(req: Request): string {
  return (req.params as { id: string }).id;
}
