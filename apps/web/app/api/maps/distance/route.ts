import { NextResponse } from "next/server";
import { z } from "zod";
import { COMPANY } from "@/lib/company";

/**
 * Driving-distance proxy for the store locator.
 *
 * Exists so the Routes API key is never shipped to the browser: the client
 * posts coordinates here, we call Google server-side and return only distances.
 *
 * Uses GOOGLE_MAPS_SERVER_KEY only (server-only, IP-restricted, Routes API
 * only). The public browser key is never used here: making it work would mean
 * leaving it unrestricted. Without the server key we return 503 and the client
 * quietly falls back to straight-line distance.
 *
 * Every call is billed, so the route accepts only same-origin JSON of a bounded
 * size, and a modest number of calls per client per window.
 */

const ROUTES_ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

const MAX_BODY_BYTES = 4096;
const LIMIT = 30;
const WINDOW_MS = 10 * 60 * 1000;
const calls = new Map<string, { count: number; resetAt: number }>();

/** The client address nginx passes on (X-Real-IP, else the last X-Forwarded-For hop). */
function clientKey(request: Request): string {
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = request.headers.get("x-forwarded-for")?.split(",");
  return hops?.[hops.length - 1]?.trim() || "unknown";
}

function overLimit(key: string): boolean {
  const now = Date.now();
  if (calls.size > 10_000) {
    for (const [k, v] of calls) if (v.resetAt < now) calls.delete(k);
  }
  const entry = calls.get(key);
  if (!entry || entry.resetAt < now) {
    calls.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > LIMIT;
}

/** Browsers always send Origin on POST; it must be this site. */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  let host: string;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  const allowed = [
    request.headers.get("host"),
    request.headers.get("x-forwarded-host"),
    COMPANY.domain,
    `www.${COMPANY.domain}`,
  ];
  return allowed.includes(host);
}

const latLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const bodySchema = z.object({
  origin: latLng,
  // Bounded: the locator has a handful of yards, never an open-ended list.
  destinations: z.array(latLng).min(1).max(25),
});

interface GoogleMatrixElement {
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: string;
}

const waypoint = (p: { lat: number; lng: number }) => ({
  waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } },
});

/** Routes returns durations as a protobuf string like "1234s". */
function parseDuration(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const seconds = Number.parseFloat(value.replace(/s$/, ""));
  return Number.isFinite(seconds) ? seconds : undefined;
}

export async function POST(request: Request) {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) {
    return NextResponse.json({ error: "routes_not_configured" }, { status: 503 });
  }
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // A JSON content type also makes any cross-site browser call need a CORS
  // preflight, which this route never grants.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ error: "unsupported_media_type" }, { status: 415 });
  }
  if (overLimit(clientKey(request))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "Retry-After": "600" } });
  }

  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
    }
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { origin, destinations } = parsed.data;

  try {
    // Google rejects the call outright if a requested field isn't in the mask.
    const upstream = await fetch(ROUTES_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask":
          "originIndex,destinationIndex,distanceMeters,duration,condition",
      },
      body: JSON.stringify({
        origins: [waypoint(origin)],
        destinations: destinations.map(waypoint),
        travelMode: "DRIVE",
        // TRAFFIC_AWARE would price higher and change answers minute to minute;
        // a delivery-radius estimate does not need live traffic.
        routingPreference: "TRAFFIC_UNAWARE",
        units: "IMPERIAL",
      }),
      // Never let a slow upstream hold the visitor's request open.
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return NextResponse.json({ error: "routes_failed" }, { status: 502 });
    }

    const elements = (await upstream.json()) as GoogleMatrixElement[];
    if (!Array.isArray(elements)) {
      return NextResponse.json({ error: "routes_failed" }, { status: 502 });
    }

    const rows = elements.map((el) => {
      const unroutable = el.condition && el.condition !== "ROUTE_EXISTS";
      return {
        destinationIndex: el.destinationIndex ?? 0,
        ...(unroutable || typeof el.distanceMeters !== "number"
          ? { error: "no_route" }
          : { distanceMeters: el.distanceMeters }),
        ...(parseDuration(el.duration) !== undefined
          ? { durationSeconds: parseDuration(el.duration) }
          : {}),
      };
    });

    return NextResponse.json(
      { rows },
      // Same origin/destination pair yields the same answer all day.
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch {
    return NextResponse.json({ error: "routes_unreachable" }, { status: 502 });
  }
}
