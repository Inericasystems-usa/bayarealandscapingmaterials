import { z } from "zod";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load local env files into process.env BEFORE validating. The dev/start
 * scripts don't pass --env-file, so without this `.env.local` is ignored and
 * every integration (Stripe, RingCentral) silently stays in simulated mode.
 * Precedence: loadEnvFile never overwrites a variable that is already set, so
 * the real environment (systemd, PM2, the shell) wins, then `.env`, then
 * `.env.local`. In production the platform injects real env.
 */
// Skip local env files under Vitest so tests are hermetic — otherwise .env.local
// (e.g. MONGODB_URL for the dev database) would override the in-memory MongoDB the
// tests spin up, and every run would read/write the live database.
if (!process.env.VITEST) {
  for (const file of [".env", ".env.local"]) {
    const p = path.resolve(process.cwd(), file);
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
      } catch {
        // Malformed or unreadable file — ignore and rely on real env.
      }
    }
  }
}

/**
 * Environment validation. Fail fast on boot if anything is missing.
 *
 * Phase 1 only requires the basics. As we add features (DB, Redis, RC, Gemini),
 * extend the schema here — and `npm run dev` will tell you exactly which env
 * var is missing.
 */
export const envSchema = z.object({
  // Unset means production: every safety control stays on unless a developer
  // explicitly says NODE_ENV=development (apps/api/.env.local).
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  // Interface the API and the customer-display socket listen on. Loopback by
  // default, so only the reverse proxy reaches them; a counter PC serving
  // tablets on the shop LAN sets HOST=0.0.0.0.
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  // Origins allowed besides the public site (see corsOrigins below), comma
  // separated, e.g. http://localhost:3000 on the counter PC.
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((s) => s.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean)),
  // Demo staff, vendors, fleet and sample orders. Only with SEED_DEMO=true, and
  // never in production (refused at boot, see startupProblems).
  SEED_DEMO: z.enum(["true", "false"]).optional(),
  // The customer-display relay on :3001. "off" where nothing can reach it (cloud).
  DISPLAY_SOCKET: z.enum(["on", "off"]).default("on"),
  // Stripe Terminal — when set, payments go live; otherwise simulated mode.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_TERMINAL_LOCATION: z.string().optional(),
  // Database — MongoDB connection string (the sole persistence backend). Defaults
  // to a local standalone mongod; the platform injects the real URL in production.
  MONGODB_URL: z.string().default("mongodb://localhost:27017/balm"),
  // Production refuses a standalone mongod (no transactions) unless this is
  // "true" (lib/db.ts). Development and tests run on one either way.
  MONGODB_ALLOW_STANDALONE: z.enum(["true", "false"]).optional(),
  // Field encryption at rest: sensitive fields (customer PII, the website sync
  // token) are AES-256-GCM encrypted. Required in production (startupProblems);
  // elsewhere, without it, they are stored as plaintext.
  DATA_ENCRYPTION_KEY: z.string().optional(),
  // Error tracking — when set, exceptions are reported to Sentry.
  SENTRY_DSN: z.string().optional(),
  // RingCentral (ADR-0004) — when all four are set, SMS goes live; else simulated.
  RC_SERVER_URL: z.string().optional(), // defaults to production platform
  RC_CLIENT_ID: z.string().optional(),
  RC_CLIENT_SECRET: z.string().optional(),
  RC_JWT: z.string().optional(), // server-to-server JWT credential
  RC_SMS_FROM: z.string().optional(), // SMS-enabled RingCentral number, E.164
  RC_WEBHOOK_URL: z.string().optional(), // public URL RC posts inbound SMS to
  // Shared secret RC echoes in a Verification-Token header on every webhook
  // call. Required outside development: without it inbound webhooks are refused.
  RC_WEBHOOK_TOKEN: z.string().optional(),
  // Owner phone (E.164) texted when a website contact/quote lead arrives, so a
  // new lead is never silently missed. No-op until set (and RC configured).
  LEAD_NOTIFY_SMS: z.string().optional(),

  // Telematics — when API_URL + API_KEY are set the ticker polls a live provider
  // (Samsara/Geotab/etc); otherwise it walks trucks for the demo. INGEST_TOKEN
  // gates the external push webhook (POST /fleet/telematics).
  TELEMATICS_API_URL: z.string().optional(),
  TELEMATICS_API_KEY: z.string().optional(),
  TELEMATICS_POLL_MS: z.coerce.number().optional(),
  TELEMATICS_INGEST_TOKEN: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export const isDev = config.NODE_ENV === "development";
export const isProd = config.NODE_ENV === "production";

/**
 * Whether this machine serves production, decided without NODE_ENV (a stray
 * `pnpm dev` or a bad unit file is exactly what gets NODE_ENV wrong). Servers
 * carry /etc/inerica/production (infra/pci/host/60-production-mode.sh);
 * INERICA_PRODUCTION=1 says the same where that file isn't visible.
 */
export const productionHost =
  process.env.INERICA_PRODUCTION === "1" || existsSync("/etc/inerica/production");

// `openssl rand -hex 32` gives 64 characters; anything this short is a placeholder.
export const MIN_ENCRYPTION_KEY_LENGTH = 32;

/** Settings the API refuses to start with. Empty when it is safe to run. */
export function startupProblems(
  c: { NODE_ENV: string; SEED_DEMO?: string },
  env: NodeJS.ProcessEnv,
  onProductionHost: boolean,
): string[] {
  const problems: string[] = [];
  // Every control that can be switched off keys off NODE_ENV, so on a
  // production host anything but "production" would switch them all off.
  if (onProductionHost && c.NODE_ENV !== "production")
    problems.push(`NODE_ENV is "${c.NODE_ENV}" on a production host; run with NODE_ENV=production (never tsx watch / pnpm dev)`);
  if (c.SEED_DEMO === "true" && (c.NODE_ENV === "production" || onProductionHost))
    problems.push("SEED_DEMO=true: demo logins and sample data are never seeded in production");
  if (env.ALLOW_PIN_LOGIN === "true" && onProductionHost)
    problems.push("ALLOW_PIN_LOGIN=true: PIN sign-in is for counter PCs, never for an internet-facing server");
  // The webhook refuses unsigned calls outside development, so without the
  // token inbound texts, STOP replies included, would silently stop arriving.
  // Without the key, customer PII would be written in plaintext.
  if (c.NODE_ENV === "production" && (env.DATA_ENCRYPTION_KEY?.trim().length ?? 0) < MIN_ENCRYPTION_KEY_LENGTH)
    problems.push(
      `DATA_ENCRYPTION_KEY is missing or shorter than ${MIN_ENCRYPTION_KEY_LENGTH} characters: generate one with \`openssl rand -hex 32\` (deploy/DEPLOY.md)`,
    );
  if (env.RC_WEBHOOK_URL && !env.RC_WEBHOOK_TOKEN && c.NODE_ENV !== "development")
    problems.push("RC_WEBHOOK_URL is set without RC_WEBHOOK_TOKEN: inbound SMS (and STOP opt-outs) would be refused");
  return problems;
}

// Tests may run on any machine, so the host marker is ignored under Vitest.
const problems = startupProblems(config, process.env, productionHost && !process.env.VITEST);
if (problems.length) {
  console.error(`❌ Refusing to start:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}

// Browsers that may call the API with credentials: the public site plus
// CORS_ORIGINS, matched exactly. In development only, any localhost or
// private-LAN origin too, so other devices on the shop network work unconfigured.
const SITE_ORIGINS = ["https://bayarealandscapingmaterials.com", "https://www.bayarealandscapingmaterials.com"];
export const corsOrigins = [...new Set([...SITE_ORIGINS, ...config.CORS_ORIGINS])];
const DEV_ORIGIN =
  /^https?:\/\/(?:localhost|127\.0\.0\.1|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})(?::\d+)?$/;

export function isAllowedOrigin(origin: string): boolean {
  return corsOrigins.includes(origin) || (isDev && DEV_ORIGIN.test(origin));
}
