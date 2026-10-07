import { config } from "../config.js";

/**
 * Telematics provider adapter (env-gated, mirrors lib/stripe + lib/ringcentral).
 * When TELEMATICS_API_URL + TELEMATICS_API_KEY are set, the ticker polls the
 * live provider for vehicle positions; otherwise the demo random-walk runs.
 *
 * The fetch below targets a generic "positions" endpoint returning a JSON array
 * (or { data: [...] }) of device positions. Adapt the field mapping to your
 * vendor (Samsara `/fleet/vehicles/locations`, Geotab `DeviceStatusInfo`,
 * Verizon Connect, etc.) — only this one function needs to change.
 */

export function isTelematicsConfigured(): boolean {
  return Boolean(config.TELEMATICS_API_URL && config.TELEMATICS_API_KEY);
}

export function telematicsMode(): "live" | "simulated" {
  return isTelematicsConfigured() ? "live" : "simulated";
}

export interface Position {
  deviceId: string;
  lat: number;
  lng: number;
  speed?: number;
  heading?: number;
  at?: string;
}

type Raw = Record<string, unknown>;
const asNum = (v: unknown): number | undefined => (v == null ? undefined : Number(v));
const asStr = (v: unknown): string | undefined => (v == null ? undefined : String(v));

export async function fetchFleetPositions(): Promise<Position[]> {
  if (!isTelematicsConfigured()) return [];
  const res = await fetch(config.TELEMATICS_API_URL as string, {
    headers: { authorization: `Bearer ${config.TELEMATICS_API_KEY}`, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`telematics provider responded ${res.status}`);
  const body: unknown = await res.json();
  const rows: Raw[] = Array.isArray(body)
    ? (body as Raw[])
    : Array.isArray((body as { data?: unknown }).data)
      ? ((body as { data: Raw[] }).data)
      : [];
  return rows
    .map((r): Position => ({
      deviceId: asStr(r.deviceId ?? r.id ?? r.vehicleId) ?? "",
      lat: Number(r.lat ?? r.latitude),
      lng: Number(r.lng ?? r.longitude),
      speed: asNum(r.speed),
      heading: asNum(r.heading ?? r.bearing),
      at: asStr(r.at ?? r.timestamp ?? r.time),
    }))
    .filter((p) => p.deviceId !== "" && Number.isFinite(p.lat) && Number.isFinite(p.lng));
}
