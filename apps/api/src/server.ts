import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { pinoHttp, type Options as HttpLoggerOptions } from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { config, isDev, isAllowedOrigin } from "./config.js";
import leadsRoutes from "./modules/leads/routes.js";
import catalogRoutes from "./modules/catalog.js";
import inventoryRoutes from "./modules/inventory.js";
import vendorRoutes from "./modules/vendors.js";
import purchasingRoutes from "./modules/purchasing.js";
import salesRoutes from "./modules/sales.js";
import reportsRoutes from "./modules/reports.js";
import fleetRoutes, { telematicsIngestRoutes } from "./modules/fleet.js";
import uploadsRoutes from "./modules/uploads.js";
import taxonomyRoutes from "./modules/taxonomy.js";
import integrationRoutes, { syncReceiverRoutes, registerWebsiteSync, startWebsitePull } from "./modules/sync.js";
import auditRoutes from "./modules/audit.js";
import deliveriesRoutes from "./modules/deliveries.js";
import paymentsRoutes from "./modules/payments.js";
import { authRoutes, usersRoutes, purgeStaleSessions, normalizeUserEmails } from "./modules/users.js";
import timeclockRoutes from "./modules/timeclock.js";
import settingsRoutes from "./modules/settings.js";
import customersRoutes from "./modules/customers.js";
import ordersRoutes from "./modules/orders.js";
import terminalRoutes from "./modules/terminal.js";
import registerRoutes from "./modules/register.js";
import aiRoutes from "./modules/ai.js";
import notificationRoutes, { registerNotificationSubscribers } from "./modules/notifications.js";
import messagingRoutes, {
  registerMessagingSubscribers,
  startMessagingJobs,
} from "./modules/messaging.js";
import { ensureInboundSubscription, ringCentralMode } from "./lib/ringcentral.js";
import { authGuard } from "./lib/auth.js";
import { initSentry, isSentryEnabled, captureError } from "./lib/sentry.js";
import { isDbConfigured, initDb, closeDb, storeMode, ping } from "./lib/db.js";
import { jobs } from "./lib/jobs.js";
import { startTelematics } from "./modules/telematics.js";
import { startDisplayServer } from "./lib/display.js";
import { redactPan, rejectCardNumbers } from "./lib/pan-guard.js";
import { seedData } from "./seed.js";

// Credentials in a query string, and any card number, never reach the logs.
const scrubUrl = (url: string | undefined): string =>
  redactPan(String(url ?? "").replace(/([?&](?:token|access_token|api_key|key|secret)=)[^&#]*/gi, "$1[redacted]"));

/**
 * Request-log options. Session cookies, Bearer tokens, CSRF and integration
 * tokens and Set-Cookie are censored, and card numbers are scrubbed from URLs
 * and error messages (PCI DSS 3.3.1, 8.3.2, 10.3).
 */
export function httpLoggerOptions(underTest = false): HttpLoggerOptions {
  return {
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const existing = (req.headers["x-request-id"] as string) || randomUUID();
      res.setHeader("x-request-id", existing);
      return existing;
    },
    autoLogging: !underTest,
    transport: isDev && !underTest ? { target: "pino-pretty", options: { colorize: true } } : undefined,
    level: underTest ? "silent" : "info",
    redact: {
      paths: [
        "req.headers.cookie",
        "req.headers.authorization",
        'req.headers["x-csrf-token"]',
        'req.headers["x-inerica-token"]',
        'req.headers["x-telematics-token"]',
        'req.headers["verification-token"]',
        'res.headers["set-cookie"]',
      ],
      censor: "[redacted]",
    },
    serializers: {
      // The parsed query is left out: the scrubbed url already carries it.
      req: (r: { id: unknown; method: string; url: string; headers: unknown; remoteAddress: string; remotePort: number }) => ({
        id: r.id,
        method: r.method,
        url: scrubUrl(r.url),
        headers: r.headers,
        remoteAddress: r.remoteAddress,
        remotePort: r.remotePort,
      }),
      // A body-parser error carries the raw request body (a sign-in's password,
      // a card number): it is never logged.
      err: (e: unknown) => {
        if (!e || typeof e !== "object") return e;
        const { body: _body, ...out } = e as Record<string, unknown>;
        for (const [k, v] of Object.entries(out)) if (typeof v === "string") out[k] = redactPan(v);
        return out;
      },
    },
  };
}

/** Structured JSON errors. Outside development a 5xx never carries the error's message, code or stack. */
export function errorHandler(
  err: Error & { statusCode?: number; status?: number; code?: string },
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const raw = Number(err.statusCode ?? err.status);
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;
  (req.log ?? console).error({ err, route: scrubUrl(req.originalUrl) }, "request failed");
  if (status >= 500) captureError(err, { route: scrubUrl(req.originalUrl), trace_id: req.id });
  if (res.headersSent) return;
  const hide = status >= 500 && !isDev;
  res.status(status).send({
    error: {
      code: hide ? "internal_error" : (err.code ?? "internal_error"),
      message: hide ? "Something went wrong." : err.message,
      trace_id: req.id,
    },
  });
}

export function buildServer(): Express {
  const app = express();
  app.disable("x-powered-by");
  // Trust exactly one proxy hop (the platform's reverse proxy) so req.ip is the
  // real client from X-Forwarded-For — WITHOUT trusting all proxies, which would
  // let a client spoof XFF to bypass IP rate limiting (express-rate-limit warns
  // on `true`). Direct LAN/dev connections fall back to the socket address.
  app.set("trust proxy", 1);

  // Structured request logging + request id (trace_id). Under test, autoLogging
  // is off and the level is silent, but req.log/req.id are still attached.
  // First, so every error, a malformed JSON body's included, is logged through
  // the redacting serializers rather than straight to the console.
  app.use(pinoHttp(httpLoggerOptions(Boolean(process.env.VITEST))));

  // Security headers. The API returns JSON (uploaded images set their own,
  // sandboxed policy), so nothing it serves may load anything or be framed.
  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );

  // CORS — an exact allow-list (config.corsOrigins; in development also any
  // localhost or private-LAN origin). Only those origins get CORS headers, and
  // with them credentials. Requests without an Origin need none.
  app.use(
    cors({
      origin(origin, cb) {
        cb(null, Boolean(origin && isAllowedOrigin(origin)));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    }),
  );

  // Cookies — HttpOnly session cookie (parsed before the auth guard reads it).
  app.use(cookieParser());

  // JSON body — 1 MB default, but let a few routes that accept large base64
  // payloads (product images, delivery PODs with signature/photos) install their
  // own larger parser; the global small limit would 413 them first.
  const jsonSmall = express.json({ limit: "1mb" });
  const largeBodyRoute = (p: string) => p.startsWith("/api/v1/uploads") || /^\/api\/v1\/deliveries\/[^/]+\/pod$/.test(p);
  app.use((req, res, next) => (largeBodyRoute(req.path) ? next() : jsonSmall(req, res, next)));

  // Rate limit — generous default; tighter per-route inside modules. (Relaxed
  // under test, where the whole suite shares one client IP.)
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: process.env.VITEST ? 10_000 : 200,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Card numbers never come in through a request (lib/pan-guard.ts). Routes
  // that parse their own large bodies run the same check after parsing.
  app.use(rejectCardNumbers);

  // ── Default-deny authentication ─────────────────────────────────
  // Every route below requires a valid session except the public allow-list in
  // lib/auth.ts (health, login, catalog GET, lead forms, RC webhook).
  app.use(authGuard);

  // Liveness — process is up.
  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "balm-api", env: config.NODE_ENV, ts: new Date().toISOString() });
  });

  // Prometheus-style metrics (non-sensitive process gauges) for scraping.
  app.get("/metrics", (_req, res) => {
    const m = process.memoryUsage();
    res.type("text/plain; version=0.0.4").send(
      [
        "# TYPE balm_uptime_seconds gauge",
        `balm_uptime_seconds ${process.uptime().toFixed(0)}`,
        "# TYPE balm_memory_rss_bytes gauge",
        `balm_memory_rss_bytes ${m.rss}`,
        "# TYPE balm_memory_heap_used_bytes gauge",
        `balm_memory_heap_used_bytes ${m.heapUsed}`,
        "# TYPE balm_store_info gauge",
        `balm_store_info{mode="${storeMode()}"} 1`,
      ].join("\n") + "\n",
    );
  });

  // Readiness — dependencies (DB) are reachable. 503 = don't route traffic here.
  app.get("/ready", async (_req, res) => {
    try {
      await ping();
    } catch {
      return res.status(503).send({ ready: false, store: storeMode(), db: "unreachable" });
    }
    // Job states are reported for monitoring; a failing job does not take the
    // API out of rotation.
    res.json({ ready: true, store: storeMode(), jobs: await jobs.health().catch(() => ({})) });
  });

  // API root
  app.get("/api/v1", (_req, res) => {
    res.json({ name: "BALM API", version: "v1", docs: "/api/v1/openapi.json" });
  });

  // ── Domain event subscribers (service-to-service comms) ──────────
  registerNotificationSubscribers();
  registerMessagingSubscribers((msg) => console.log(`💬 ${msg}`));
  registerWebsiteSync((msg) => console.log(`🔄 ${msg}`));

  // ── Module routes (modular services behind one gateway) ──────────
  app.use("/api/v1/leads", leadsRoutes);
  app.use("/api/v1/products", catalogRoutes);
  app.use("/api/v1/inventory", inventoryRoutes);
  app.use("/api/v1/vendors", vendorRoutes);
  app.use("/api/v1/purchase-orders", purchasingRoutes);
  app.use("/api/v1/sales", salesRoutes);
  app.use("/api/v1/reports", reportsRoutes);
  // Order matters: the token-gated ingest router shares the /fleet mount with
  // fleetRoutes, whose blanket guardWrites("dispatch") middleware would otherwise
  // 401 the public /telematics push. Registering it first lets it match and
  // respond before fleetRoutes' guard runs (Express router.use isn't per-router
  // encapsulated the way Fastify plugins were).
  app.use("/api/v1/fleet", telematicsIngestRoutes);
  app.use("/api/v1/fleet", fleetRoutes);
  app.use("/api/v1/uploads", uploadsRoutes);
  app.use("/api/v1/taxonomy", taxonomyRoutes);
  app.use("/api/v1/audit", auditRoutes);
  app.use("/api/v1/integration", integrationRoutes);
  app.use("/api/v1/sync", syncReceiverRoutes);
  app.use("/api/v1/deliveries", deliveriesRoutes);
  app.use("/api/v1/payments", paymentsRoutes);
  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/users", usersRoutes);
  app.use("/api/v1/timeclock", timeclockRoutes);
  app.use("/api/v1/settings", settingsRoutes);
  app.use("/api/v1/customers", customersRoutes);
  app.use("/api/v1/orders", ordersRoutes);
  app.use("/api/v1/terminal", terminalRoutes);
  app.use("/api/v1/stripe", terminalRoutes);
  app.use("/api/v1/register", registerRoutes);
  app.use("/api/v1/ai", aiRoutes);
  app.use("/api/v1/notifications", notificationRoutes);
  app.use("/api/v1/messaging", messagingRoutes);

  // 404 — unmatched routes return structured JSON, never HTML.
  app.use((req: Request, res: Response) => {
    res.status(404).send({ error: { code: "not_found", message: `Cannot ${req.method} ${req.path}`, trace_id: req.id } });
  });

  // Global error handler — structured JSON, never HTML.
  app.use(errorHandler);

  return app;
}

async function main() {
  initSentry(); // first, so HTTP instrumentation hooks in (no-op without SENTRY_DSN)
  // The DB must exist before buildServer() runs (subscribers query on register).
  if (isDbConfigured()) {
    try {
      await initDb();
    } catch (err) {
      console.error(`❌ Refusing to start: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  const app = buildServer();
  console.log(`🗄️  store: ${storeMode()}`);
  console.log(`🛰️  error tracking: ${isSentryEnabled() ? "sentry" : "off"}`);
  if (isDbConfigured()) {
    const n = await normalizeUserEmails();
    if (n) console.log(`👤 stored ${n} e-mail address(es) in lower case`);
  }
  // Sessions stored before tokens were hashed (and long-dead ones) can't be
  // used; clear them in the background so a big collection doesn't delay boot.
  void purgeStaleSessions()
    .then((n) => n && console.log(`🔐 removed ${n} expired or pre-hashing session(s)`))
    .catch((err) => console.warn("session cleanup failed", err));
  await seedData((msg) => console.log(`🌱 ${msg}`));
  startTelematics((msg) => console.log(`📡 ${msg}`));
  startWebsitePull((msg) => console.log(`🔄 ${msg}`));
  if (config.DISPLAY_SOCKET === "on") startDisplayServer(3001, (msg) => console.log(`🖥️  ${msg}`));
  startMessagingJobs((msg) => console.log(`💬 ${msg}`));
  console.log(`💬 RingCentral SMS mode: ${ringCentralMode()}`);
  // Create the inbound subscription now and renew it before its 7-day expiry, so
  // inbound SMS and delivery receipts keep flowing. A failed attempt is retried
  // within the hour rather than a week later.
  jobs.start({
    name: "ringcentral-subscription",
    everyMs: 6 * 24 * 60 * 60 * 1000,
    runAtStart: true,
    leaseMs: 10 * 60_000,
    run: async () => {
      const r = await ensureInboundSubscription();
      if (r.created) console.log("💬 RingCentral inbound SMS subscription created or renewed");
      else if (r.reason && r.reason !== "not_configured") throw new Error(`subscription not created — ${r.reason}`);
    },
  });

  // Loopback unless HOST says otherwise: only the reverse proxy should reach it.
  const server = app.listen(config.PORT, config.HOST, () => {
    console.log(`✅ BALM API listening on http://${config.HOST}:${config.PORT}`);
  });
  server.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`Received ${signal}, shutting down gracefully...`);
    try {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      // Hand back job leases so the next release picks the jobs up at once.
      await jobs.stop();
      await closeDb();
      process.exit(0);
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    console.error("unhandledRejection", reason);
    captureError(reason);
  });
  process.on("uncaughtException", (err) => {
    console.error("uncaughtException", err);
    captureError(err);
    process.exit(1);
  });
}

// Don't auto-start when imported by tests (they build the app via buildServer).
if (!process.env.VITEST) void main();
