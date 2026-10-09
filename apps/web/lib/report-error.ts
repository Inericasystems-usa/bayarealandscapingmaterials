/**
 * Send an error caught by an error boundary (app/error.tsx,
 * app/global-error.tsx) to the API, which forwards it to Sentry
 * (apps/api/src/modules/client-errors.ts).
 *
 * The site ships no error-tracking SDK on purpose: it would add weight and a
 * third-party script to every page. Three fields go instead: the message,
 * Next's digest (which matches the server log line for a server-side error)
 * and the page path without its query string, which can hold an e-mail or a
 * click id. The API scrubs the message again before it is logged or sent.
 *
 * Never throws, never retries, and sends at most a handful per page load, so a
 * boundary that re-renders in a loop cannot flood anything. Development builds
 * send nothing: the error is already on the developer's screen.
 */

export type ErrorBoundaryKind = "page" | "global";

const ENDPOINT = "/api/v1/client-errors";
const MAX_PER_PAGE = 5;

const sent = new Set<string>();

export function reportClientError(
  error: (Error & { digest?: string }) | null | undefined,
  boundary: ErrorBoundaryKind = "page",
): void {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "production") return;
  try {
    const message = String(error?.message ?? "").slice(0, 1000);
    const digest = typeof error?.digest === "string" && /^[\w-]{1,64}$/.test(error.digest) ? error.digest : undefined;
    const key = `${boundary}|${digest ?? ""}|${message}`;
    if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
    sent.add(key);

    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, digest, path: window.location.pathname.slice(0, 512), boundary }),
      // Still delivered if the visitor reloads or leaves straight away.
      keepalive: true,
      credentials: "omit",
    }).catch(() => {
      // Reporting is best-effort: a failed report must never become a second error.
    });
  } catch {
    // Same: nothing here may throw inside an error boundary.
  }
}
