import * as Sentry from "@sentry/node";
import { config } from "../config.js";

/**
 * Error tracking — env-gated like every other integration. Unset SENTRY_DSN =
 * no-op (dev default); set it = exceptions report to Sentry. Call initSentry()
 * as early as possible in boot so HTTP instrumentation hooks in.
 */
let enabled = false;

export function initSentry(): void {
  if (!config.SENTRY_DSN) return;
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    tracesSampleRate: 0, // errors only; turn up for performance tracing
  });
  enabled = true;
}

export function isSentryEnabled(): boolean {
  return enabled;
}

export function captureError(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}
