import * as Sentry from "@sentry/node";
import { config } from "../config.js";
import { redactPanDeep } from "./pan-guard.js";

const SECRET_HEADERS = new Set(["cookie", "authorization", "x-csrf-token", "x-inerica-token", "x-telematics-token", "verification-token"]);

/**
 * What an error report may carry: no cookies, credential headers or request
 * bodies (the SDK attaches bodies by default; sign-in and Employees bodies hold
 * passwords and PINs), and no card numbers (PCI DSS 3.3.1, 8.3.2).
 */
export function scrubEvent(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    const headers = event.request.headers ?? {};
    for (const k of Object.keys(headers)) if (SECRET_HEADERS.has(k.toLowerCase())) delete headers[k];
  }
  return redactPanDeep(event);
}

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
    // No cookies, credentials, client IPs or card numbers leave the API (PCI DSS 3.3.1, 8.3.2).
    sendDefaultPii: false,
    beforeSend: scrubEvent,
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
