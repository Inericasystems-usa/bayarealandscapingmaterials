/**
 * Distance between a customer and a yard.
 *
 * Two sources, in order of preference:
 *
 *  1. Driving distance from the Google Routes API, fetched through our own
 *     /api/maps/distance route handler so the Routes key stays server-side.
 *  2. Straight-line (great-circle) distance, computed locally.
 *
 * The result always says which one it is, and the UI labels it accordingly —
 * a straight-line figure is never presented as a driving distance.
 */

export type DistanceKind = "driving" | "straight-line";

export interface DistanceResult {
  miles: number;
  kind: DistanceKind;
  /** Driving duration in seconds, when the Routes API supplied one. */
  durationSeconds?: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_MI = 3958.7613;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in miles. Always available, never wrong-but-plausible. */
export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_MI * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** "8.4 miles" / "0.6 miles" — one decimal reads honestly at every range. */
export function formatMiles(miles: number): string {
  const rounded = miles < 10 ? miles.toFixed(1) : Math.round(miles).toString();
  return `${rounded} ${miles < 1.05 && miles > 0.95 ? "mile" : "miles"}`;
}

/** "24 min" / "1 hr 8 min" */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} hr` : `${hours} hr ${minutes} min`;
}

interface RouteMatrixRow {
  destinationIndex?: number;
  distanceMeters?: number;
  durationSeconds?: number;
  error?: string;
}

const METERS_PER_MILE = 1609.344;

/**
 * Driving distances from origin to each destination, in the same order.
 *
 * Never throws: on any failure (route handler missing a server key, network
 * error, a destination Routes can't reach) the affected entries fall back to
 * the straight-line figure so the locator always shows a number.
 */
export async function drivingDistances(
  origin: LatLng,
  destinations: readonly LatLng[],
  signal?: AbortSignal,
): Promise<DistanceResult[]> {
  const fallback = (): DistanceResult[] =>
    destinations.map((d) => ({ miles: haversineMiles(origin, d), kind: "straight-line" }));

  if (destinations.length === 0) return [];

  try {
    const res = await fetch("/api/maps/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin, destinations }),
      signal,
    });
    if (!res.ok) return fallback();

    const body = (await res.json()) as { rows?: RouteMatrixRow[] };
    const rows = body.rows;
    if (!Array.isArray(rows)) return fallback();

    return destinations.map((dest, index) => {
      const row = rows.find((r) => r.destinationIndex === index);
      if (!row || row.error || typeof row.distanceMeters !== "number") {
        return { miles: haversineMiles(origin, dest), kind: "straight-line" as const };
      }
      const result: DistanceResult = {
        miles: row.distanceMeters / METERS_PER_MILE,
        kind: "driving",
      };
      if (typeof row.durationSeconds === "number") {
        result.durationSeconds = row.durationSeconds;
      }
      return result;
    });
  } catch {
    // Includes AbortError — the caller unmounted; fallback is harmless.
    return fallback();
  }
}
