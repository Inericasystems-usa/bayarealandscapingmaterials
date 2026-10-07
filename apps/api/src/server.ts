import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { pinoHttp } from "pino-http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { config, isDev } from "./config.js";
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
import { authRoutes, usersRoutes } from "./modules/users.js";
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
import { startTelematics } from "./modules/telematics.js";
import { startDisplayServer } from "./lib/display.js";
import { seedData } from "./seed.js";

export function buildServer(): Express {
  const app = express();
  app.disable("x-powered-by");
  // Trust exactly one proxy hop (the platform's reverse proxy) so req.ip is the
  // real client from X-Forwarded-For — WITHOUT trusting all proxies, which would
  // let a client spoof XFF to bypass IP rate limiting (express-rate-limit warns
  // on `true`). Direct LAN/dev connections fall back to the socket address.
  app.set("trust proxy", 1);

  // Security headers (CSP configured per-route where needed).
  app.use(helmet({ contentSecurityPolicy: false }));

  // CORS — strict allow-list from config, plus (in dev only) any localhost or
  // private-LAN origin so other devices on the network can use the POS without
  // per-IP configuration. Production stays locked to CORS_ORIGINS.
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin) return cb(null, true); // curl / same-origin / native apps
        if (config.CORS_ORIGINS.includes(origin)) return cb(null, true);
        if (isDev && /^https?:\/\/(localhost|127\.0\.0\.1|(?:\d{1,3}\.){3}\d{1,3})(?::\d+)?$/.test(origin))
          return cb(null, true);
        return cb(null, false);
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

  // Structured request logging + request id (trace_id). Under test, autoLogging
  // is off and the level is silent, but req.log/req.id are still attached.
  const underTest = Boolean(process.env.VITEST);
  app.use(
    pinoHttp({
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const existing = (req.headers["x-request-id"] as string) || randomUUID();
        res.setHeader("x-request-id", existing);
        return existing;
      },
      autoLogging: !underTest,
      transport: isDev && !underTest ? { target: "pino-pretty", options: { colorize: true } } : undefined,
      level: underTest ? "silent" : "info",
    }),
  );

  // Rate limit — generous default; tighter per-route inside modules.
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

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
    res.json({ ready: true, store: storeMode() });
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
  app.use((err: Error & { statusCode?: number; status?: number; code?: string }, req: Request, res: Response, _next: NextFunction) => {
    const status = err.statusCode ?? err.status ?? 500;
    (req.log ?? console).error({ err, route: req.originalUrl }, "request failed");
    if (status >= 500) captureError(err, { route: req.originalUrl, trace_id: req.id });
    if (res.headersSent) return;
    res.status(status).send({
      error: {
        code: err.code ?? "internal_error",
        message: status >= 500 && !isDev ? "Something went wrong." : err.message,
        trace_id: req.id,
      },
    });
  });

  return app;
}

async function main() {
  initSentry(); // first, so HTTP instrumentation hooks in (no-op without SENTRY_DSN)
  // The DB must exist before buildServer() runs (subscribers query on register).
  if (isDbConfigured()) await initDb();
  const app = buildServer();
  console.log(`🗄️  store: ${storeMode()}`);
  console.log(`🛰️  error tracking: ${isSentryEnabled() ? "sentry" : "off"}`);
  await seedData((msg) => console.log(`🌱 ${msg}`));
  startTelematics((msg) => console.log(`📡 ${msg}`));
  startWebsitePull((msg) => console.log(`🔄 ${msg}`));
  startDisplayServer(3001, (msg) => console.log(`🖥️  ${msg}`));
  startMessagingJobs((msg) => console.log(`💬 ${msg}`));
  console.log(`💬 RingCentral SMS mode: ${ringCentralMode()}`);
  void ensureInboundSubscription()
    .then((r) => {
      if (r.created) console.log("💬 RingCentral inbound SMS subscription created");
      else if (r.reason && r.reason !== "not_configured")
        console.warn(`💬 RingCentral subscription not created — ${r.reason}`);
    })
    .catch((err) => console.warn("RingCentral subscription failed", err));
  // Renew before the 7-day expiry so inbound SMS + delivery receipts keep flowing.
  const rcRenew = setInterval(
    () => {
      void ensureInboundSubscription()
        .then((r) => r.created && console.log("💬 RingCentral subscription renewed"))
        .catch((err) => console.warn("RingCentral renewal failed", err));
    },
    6 * 24 * 60 * 60 * 1000,
  );
  if (rcRenew.unref) rcRenew.unref();

  const server = app.listen(config.PORT, "0.0.0.0", () => {
    console.log(`✅ BALM API listening on http://localhost:${config.PORT}`);
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
