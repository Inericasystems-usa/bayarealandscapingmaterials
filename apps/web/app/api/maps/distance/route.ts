import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Driving-distance proxy for the store locator.
 *
 * Exists so the Routes API key is never shipped to the browser: the client
 * posts coordinates here, we call Google server-side and return only distances.
 *
 * Prefers GOOGLE_MAPS_SERVER_KEY (server-only, unrestricted-by-referrer).
 * Falls back to the public browser key so the feature still works on a
 * single-key setup — see .env.example. With neither set we return 503 and the
 * client quietly falls back to straight-line distance.
 */

const ROUTES_ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

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
  const key = process.env.GOOGLE_MAPS_SERVER_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;
  if (!key) {
    return NextResponse.json({ error: "routes_not_configured" }, { status: 503 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
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
