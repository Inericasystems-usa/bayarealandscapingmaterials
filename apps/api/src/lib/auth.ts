import type { Request, Response, NextFunction, RequestHandler } from "express";
import { getAuthUser, CSRF_COOKIE, type User, type Role } from "../modules/users.js";
import { can } from "./permissions.js";

/**
 * Default-deny authentication. A single global middleware requires a valid
 * session on every route EXCEPT the small public allow-list below. New routes
 * are protected automatically — you have to opt *out* (add to the allow-list),
 * so access can't be forgotten the way per-route checks were.
 */

// Reachable without a session. Everything else needs a valid session/bearer token.
function isPublic(method: string, rawUrl: string): boolean {
  if (method === "OPTIONS") return true; // CORS preflight
  const path = rawUrl.split("?")[0] ?? rawUrl;

  // Liveness/readiness + API root. (/metrics needs a session: process gauges
  // aren't for the internet.)
  if (method === "GET" && (path === "/health" || path === "/ready" || path === "/api/v1" || path === "/api/v1/health")) return true;
  // Auth endpoints self-handle (login is public; /me and /logout 401 on their own).
  if (path.startsWith("/api/v1/auth/")) return true;
  // Public website: browse the catalog…
  if (method === "GET" && path.startsWith("/api/v1/products")) return true;
  // …and load product images (uploaded via the POS).
  if (method === "GET" && path.startsWith("/api/v1/uploads/")) return true;
  // …and submit the contact / quote forms (but NOT GET /leads, the admin list).
  if (method === "POST" && (path === "/api/v1/leads/contact" || path === "/api/v1/leads/quote")) return true;
  // …and report a browser error (small, scrubbed and rate-limited: modules/client-errors.ts).
  if (method === "POST" && path === "/api/v1/client-errors") return true;
  // Google Ads fetches the offline-conversion file on a schedule (HTTP Basic
  // credentials checked by the route itself; off unless configured).
  if (method === "GET" && path === "/api/v1/leads/offline-conversions/feed.csv") return true;
  // RingCentral posts inbound SMS + delivery receipts here (verified by its own token).
  if (method === "POST" && path === "/api/v1/messaging/webhook") return true;
  // Telematics platform/device pushes GPS positions here (verified by its own token).
  if (method === "POST" && path === "/api/v1/fleet/telematics") return true;
  // Website sync receiver — Inerica POS pushes catalog + pulls orders/leads here
  // (every /sync endpoint verifies its own x-inerica-token).
  if (path.startsWith("/api/v1/sync/")) return true;

  return false;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      authUser: User | null;
    }
  }
}

/**
 * The global authentication guard middleware. Register with `app.use(...)`
 * before mounting routers. Authenticates, enforces CSRF, and sets req.authUser.
 */
export const authGuard: RequestHandler = async (req: Request, res: Response, next: NextFunction) => {
  req.authUser = null;
  if (isPublic(req.method, req.originalUrl)) return next();
  const user = await getAuthUser(req);
  if (!user) {
    res.status(401).send({ error: { code: "unauthorized", message: "Authentication required." } });
    return;
  }
  req.authUser = user;

  // CSRF (double-submit): cookie-authenticated mutations must echo the token from
  // the JS-readable csrf cookie in an x-csrf-token header. Bearer-token callers
  // (SDK/api-client-with-token, external integrations) aren't CSRF-able and are
  // exempt. Only enforced once a csrf cookie exists (grace for older sessions,
  // which get one backfilled on their next /me).
  const mutating = req.method !== "GET" && req.method !== "HEAD" && req.method !== "OPTIONS";
  const usesBearer = req.headers.authorization?.startsWith("Bearer ");
  if (mutating && !usesBearer) {
    const cookie = req.cookies?.[CSRF_COOKIE];
    if (cookie && req.headers["x-csrf-token"] !== cookie) {
      res.status(403).send({ error: { code: "csrf", message: "Invalid or missing CSRF token." } });
      return;
    }
  }
  next();
};

/**
 * Role gate for a handler. The global guard has already authenticated; this
 * narrows to specific roles. Returns the user, or null after sending 401/403.
 */
export function requireRole(req: Request, res: Response, ...roles: Role[]): User | null {
  const u = req.authUser;
  if (!u) {
    res.status(401).send({ error: { code: "unauthorized", message: "Authentication required." } });
    return null;
  }
  if (roles.length && !roles.includes(u.role)) {
    res.status(403).send({ error: { code: "forbidden", message: "Insufficient permissions." } });
    return null;
  }
  return u;
}

/**
 * Permission gate honoring the role default OR a user's explicit `permissions`
 * override (admin/manager always pass). Returns the user, or null after 401/403.
 */
export function requirePermission(req: Request, res: Response, key: string): User | null {
  const u = req.authUser;
  if (!u) {
    res.status(401).send({ error: { code: "unauthorized", message: "Authentication required." } });
    return null;
  }
  if (!can(u, key)) {
    res.status(403).send({ error: { code: "forbidden", message: `Requires '${key}' access.` } });
    return null;
  }
  return u;
}

/** Router middleware: gate every mutating (non-GET) route to a permission. */
export function guardWrites(key: string): RequestHandler {
  return (req, res, next) => {
    if (req.method === "GET") return next();
    if (!requirePermission(req, res, key)) return; // 401/403 already sent
    next();
  };
}

/** Router middleware: gate every route (including reads) to a permission. */
export function guardAll(key: string): RequestHandler {
  return (req, res, next) => {
    if (!requirePermission(req, res, key)) return; // 401/403 already sent
    next();
  };
}
