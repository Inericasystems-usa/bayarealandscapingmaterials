import { z } from "zod";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load local env files into process.env BEFORE validating. The dev/start
 * scripts don't pass --env-file, so without this `.env.local` is ignored and
 * every integration (Stripe, RingCentral) silently stays in simulated mode.
 * Precedence: real shell env is left untouched where already set is not
 * guaranteed by loadEnvFile, so we load `.env` first then `.env.local` (local
 * wins). In production the platform injects real env and these files are absent.
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
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),
  // Stripe Terminal — when set, payments go live; otherwise simulated mode.
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_TERMINAL_LOCATION: z.string().optional(),
  // Database — MongoDB connection string (the sole persistence backend). Defaults
  // to a local standalone mongod; the platform injects the real URL in production.
  MONGODB_URL: z.string().default("mongodb://localhost:27017/balm"),
  // Field encryption at rest — when set, sensitive fields (customer PII, the
  // website sync token) are AES-256-GCM encrypted; otherwise stored plaintext.
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
  RC_WEBHOOK_TOKEN: z.string().optional(), // shared secret to verify inbound webhooks
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
