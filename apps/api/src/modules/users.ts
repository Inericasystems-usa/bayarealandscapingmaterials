import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { hashPassword, verifyPassword, newToken } from "../lib/crypto.js";
import rateLimit from "express-rate-limit";
import { isProd } from "../config.js";
import { recordAudit } from "./audit.js";

export const SESSION_COOKIE = "balm_session";
// Double-submit CSRF token. Readable by JS (NOT httpOnly) so the client echoes
// it in an x-csrf-token header on mutations; a cross-site forgery can't read it.
export const CSRF_COOKIE = "balm_csrf";

// HTTPS-only cookies in production — UNLESS explicitly disabled for an http
// deployment. The offline desktop build serves the POS over http://localhost,
// where `Secure` cookies are dropped by some browsers/hosts (e.g. LAN IP), which
// silently breaks auth. Set COOKIE_SECURE=false there. Real HTTPS deploys leave
// it unset and keep secure cookies.
const secureCookies = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE !== "false"
  : isProd;

// NOTE: Express `res.cookie` takes maxAge in MILLISECONDS (Fastify used seconds).
const csrfCookieOpts = () => ({ httpOnly: false, secure: secureCookies, sameSite: "lax" as const, path: "/", maxAge: SESSION_TTL_MS });

export type Role = "admin" | "manager" | "cashier" | "trainee" | "driver";

export interface User extends Entity {
  name: string;
  email: string;
  role: Role;
  phone: string;
  pinHash: string; // scrypt hash of the 4-6 digit quick-login PIN (never plaintext)
  passwordHash: string;
  active: boolean;
  // Explicit allow-list of feature keys that OVERRIDES the role defaults.
  // null = use the role's default permission set.
  permissions: string[] | null;
}

interface Session extends Entity {
  token: string;
  userId: string;
  expiresAt: string; // ISO — sessions are valid for SESSION_TTL_MS from login
}

// Absolute session lifetime. A POS shift fits comfortably; staff re-login daily.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export const users = new Collection<User>("users");
export const sessions = new Collection<Session>("sessions");

export type PublicUser = Omit<User, "passwordHash" | "pinHash">;
const publicUser = (u: User): PublicUser => {
  const { passwordHash: _p, pinHash: _pin, ...rest } = u;
  return rest;
};

/** Resolve the authenticated user from the session cookie or a Bearer token (or null). */
export async function getAuthUser(req: Request): Promise<User | null> {
  // Accept the HttpOnly session cookie (preferred) or a Bearer token (tools/API).
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = req.cookies?.[SESSION_COOKIE] ?? bearer;
  if (!token) return null;
  const session = await sessions.findBy((s) => s.token === token);
  if (!session) return null;
  // Reject + purge expired (or legacy non-expiring) sessions.
  if (!session.expiresAt || new Date(session.expiresAt).getTime() < Date.now()) {
    await sessions.remove(session.id);
    return null;
  }
  const user = await users.find(session.userId);
  return user && user.active ? user : null;
}

const ROLES = ["admin", "manager", "cashier", "trainee", "driver"] as const;
const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.enum(ROLES),
  phone: z.string().default(""),
  pin: z.string().min(4).max(6),
  password: z.string().min(6).optional(),
  permissions: z.array(z.string()).nullable().optional(),
});

// Per-account lockout after repeated failures (in addition to per-IP rate limit).
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const failed = new Map<string, { count: number; until: number }>();
const isLocked = (id: string): boolean => (failed.get(id)?.until ?? 0) > Date.now();
function recordFail(id: string): void {
  const e = failed.get(id) ?? { count: 0, until: 0 };
  e.count += 1;
  if (e.count >= MAX_FAILS) {
    e.until = Date.now() + LOCK_MS;
    e.count = 0;
  }
  failed.set(id, e);
}

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
    if (isLocked(id))
      return res.status(429).json({ error: { code: "locked", message: "Too many attempts. Try again in a few minutes." } });
    const user = await users.findBy((u) => u.email.toLowerCase() === id);
    // Accept either the account password or the quick PIN (both stored hashed).
    const ok = user && user.active && (verifyPassword(parsed.data.password, user.passwordHash) || verifyPassword(parsed.data.password, user.pinHash));
    if (!user || !ok) {
      recordFail(id);
      return res.status(401).json({ error: { code: "bad_credentials", message: "Invalid email or password/PIN." } });
    }
    failed.delete(id);
    const session = await sessions.insert({
      id: newId("sess"),
      token: newToken(),
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    });
    // HttpOnly cookie = the token never has to live in JS-readable storage.
    res.cookie(SESSION_COOKIE, session.token, {
      httpOnly: true,
      secure: secureCookies,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_MS,
    });
    res.cookie(CSRF_COOKIE, newToken(), csrfCookieOpts());
    return res.json({ data: { token: session.token, user: publicUser(user) } });
  },
);

authRoutes.post("/logout", async (req, res) => {
  const header = req.headers.authorization;
  const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
  const token = req.cookies?.[SESSION_COOKIE] ?? bearer;
  if (token) {
    const session = await sessions.findBy((s) => s.token === token);
    if (session) await sessions.remove(session.id);
  }
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.clearCookie(CSRF_COOKIE, { path: "/" });
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
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
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
    passwordHash: hashPassword(parsed.data.password ?? parsed.data.pin),
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
      pin: z.string().min(4).max(6).optional(),
      active: z.boolean().optional(),
      password: z.string().min(6).optional(),
      permissions: z.array(z.string()).nullable().optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
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
