import { trucks } from "./fleet.js";
import { config } from "../config.js";
import { fetchFleetPositions, telematicsMode } from "../lib/telematics-provider.js";
import { jobs } from "../lib/jobs.js";

/**
 * Telematics ticker. In LIVE mode (TELEMATICS_API_URL + _API_KEY set) it polls
 * the provider for real vehicle positions and writes them onto the matching
 * trucks (by deviceId, falling back to truck id). In SIMULATED mode it walks
 * every on-route truck a few meters per tick so the demo map shows movement.
 * External devices/webhooks can also push positions to POST /fleet/telematics.
 */
const SIM_TICK_MS = 4000;
const LIVE_TICK_MS = 15000;
const STEP = 0.0009; // ~100m of jitter per simulated tick
const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

async function pollProvider(log: (msg: string) => void): Promise<void> {
  try {
    const positions = await fetchFleetPositions();
    if (positions.length === 0) return;
    for (const p of positions) {
      const truck = (await trucks.findOne({ deviceId: p.deviceId })) ?? (await trucks.find(p.deviceId));
      if (!truck) continue;
      await trucks.update(truck.id, {
        lat: p.lat,
        lng: p.lng,
        speed: p.speed ?? truck.speed ?? 0,
        heading: p.heading ?? truck.heading ?? 0,
        lastSeen: p.at ?? new Date().toISOString(),
      });
    }
  } catch (e) {
    log(`telematics poll failed: ${(e as Error).message}`);
  }
}

async function simulateWalk(): Promise<void> {
  const onRoute = await trucks.where({ status: "on_route" });
  for (const t of onRoute) {
    await trucks.update(t.id, {
      lat: round6(t.lat + (Math.random() - 0.5) * STEP),
      lng: round6(t.lng + (Math.random() - 0.5) * STEP),
      lastSeen: new Date().toISOString(),
    });
  }
}

export function startTelematics(log: (msg: string) => void): void {
  const live = telematicsMode() === "live";
  const tickMs = config.TELEMATICS_POLL_MS ?? (live ? LIVE_TICK_MS : SIM_TICK_MS);
  jobs.start({ name: "telematics", everyMs: tickMs, run: () => (live ? pollProvider(log) : simulateWalk()) });
  log(`telematics ${live ? "polling provider" : "simulating"} every ${tickMs / 1000}s`);
}
