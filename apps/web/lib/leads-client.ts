/**
 * Posting a public lead to the API.
 *
 * Extracted from the two forms so the outcome of a submission is one testable
 * value rather than control flow buried in a component. That matters because
 * the single most important rule in the measurement stack hangs off it:
 *
 *   A conversion event fires if and ONLY if `leadId` is non-null.
 *
 * `leadId` is non-null only when the server answered 2xx AND returned an id.
 * A 500, a 422, a network failure, and a honeypot hit (which answers 200
 * WITHOUT an id, to keep bots guessing) all yield null — so none of them can
 * produce a conversion. The tracking helpers require a `string` lead id, so the
 * type system enforces the rule too.
 */

// Same origin, always: the form posts to /api/v1/leads/... on whatever host
// served the page. nginx forwards /api/v1/ to the API in production, and
// next.config.ts rewrites the two lead paths to it everywhere else. So www
// against the apex, a missing or stale NEXT_PUBLIC_API_URL, or a CORS list
// that lags behind a new domain can never cost a lead: the browser never
// makes a cross-origin request here at all.
const API = "";

export interface FieldError {
  path: string;
  message: string;
}

export interface LeadResult {
  /** The server accepted the submission (2xx). */
  ok: boolean;
  /** HTTP status; 0 means the request never completed (network/CORS/down). */
  status: number;
  /**
   * Server-assigned lead id — the ONLY proof a record was created, and the
   * only thing that may trigger a conversion event.
   */
  leadId: string | null;
  /** Field-level messages from a 422, for the form to display. */
  details?: FieldError[];
}

export type LeadEndpoint = "quote" | "contact";

export async function postLead(
  endpoint: LeadEndpoint,
  payload: unknown,
): Promise<LeadResult> {
  let res: Response;
  try {
    res = await fetch(`${API}/api/v1/leads/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Never reached the server. Not a lead, not a conversion.
    return { ok: false, status: 0, leadId: null };
  }

  if (res.ok) {
    const body = (await res.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, status: res.status, leadId: body?.id ?? null };
  }

  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as {
      error?: { details?: FieldError[] };
    } | null;
    return {
      ok: false,
      status: 422,
      leadId: null,
      details: body?.error?.details ?? [],
    };
  }

  return { ok: false, status: res.status, leadId: null };
}

/** The API origin ("" = this site), exported so callers can log where a failure went. */
export const LEADS_API = API;
