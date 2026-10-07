import { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { guardWrites } from "../lib/auth.js";
import { config } from "../config.js";

export type TruckStatus = "available" | "on_route" | "maintenance";
export type DriverStatus = "active" | "off";

export interface Driver extends Entity {
  name: string;
  phone: string;
  license: string;
  status: DriverStatus;
  notes: string;
}

export interface Truck extends Entity {
  number: string;
  type: string;
  capacityCyd: number;
  plate: string;
  status: TruckStatus;
  driverId: string | null;
  driverName: string | null;
  lat: number;
  lng: number;
  speed?: number; // mph, from telematics
  heading?: number; // degrees, from telematics
  deviceId?: string | null; // maps a telematics device/vehicle to this truck
  lastSeen: string | null;
  notes: string;
}

export const trucks = new Collection<Truck>("trucks");
export const drivers = new Collection<Driver>("drivers");

const truckSchema = z.object({
  number: z.string().min(1),
  type: z.string().default("Dump Truck"),
  capacityCyd: z.number().min(0).default(10),
  plate: z.string().default(""),
  status: z.enum(["available", "on_route", "maintenance"]).default("available"),
  lat: z.number().default(37.94),
  lng: z.number().default(-122.36),
  deviceId: z.string().nullable().optional(),
  notes: z.string().default(""),
});

const driverSchema = z.object({
  name: z.string().min(1),
  phone: z.string().default(""),
  license: z.string().default(""),
  status: z.enum(["active", "off"]).default("active"),
  notes: z.string().default(""),
});

const router = Router();
router.use(guardWrites("dispatch"));
// ── Trucks ─────────────────────────────────────────────────────────
router.get("/trucks", async (_req, res) => res.json({ data: await trucks.all() }));

router.post("/trucks", async (req, res) => {
  const parsed = truckSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const created = await trucks.insert({
    id: newId("truck"),
    ...parsed.data,
    deviceId: parsed.data.deviceId ?? null,
    driverId: null,
    driverName: null,
    lastSeen: new Date().toISOString(),
  });
  return res.status(201).json({ data: created });
});

router.patch("/trucks/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = truckSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const updated = await trucks.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Truck not found" } });
  return res.json({ data: updated });
});

router.delete("/trucks/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await trucks.remove(id);
  if (!ok) return res.status(404).json({ error: { code: "not_found", message: "Truck not found" } });
  return res.json({ data: { id, deleted: true } });
});

// Assign / unassign a driver to a truck
router.patch("/trucks/:id/assign", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ driverId: z.string().nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  let driverName: string | null = null;
  if (parsed.data.driverId) {
    const driver = await drivers.find(parsed.data.driverId);
    if (!driver) return res.status(400).json({ error: { code: "invalid", message: "Unknown driver" } });
    driverName = driver.name;
  }
  const updated = await trucks.update(id, { driverId: parsed.data.driverId, driverName });
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Truck not found" } });
  return res.json({ data: updated });
});

// Update GPS position (a telematics device would POST this in production)
router.patch("/trucks/:id/location", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ lat: z.number(), lng: z.number() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const updated = await trucks.update(id, { ...parsed.data, lastSeen: new Date().toISOString() });
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Truck not found" } });
  return res.json({ data: updated });
});

// ── Drivers ────────────────────────────────────────────────────────
router.get("/drivers", async (_req, res) => res.json({ data: await drivers.all() }));

router.post("/drivers", async (req, res) => {
  const parsed = driverSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const created = await drivers.insert({ id: newId("drv"), ...parsed.data });
  return res.status(201).json({ data: created });
});

router.patch("/drivers/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = driverSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const updated = await drivers.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Driver not found" } });
  return res.json({ data: updated });
});

router.delete("/drivers/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await drivers.remove(id);
  if (!ok) return res.status(404).json({ error: { code: "not_found", message: "Driver not found" } });
  return res.json({ data: { id, deleted: true } });
});

export default router;

/**
 * Telematics ingest — a separate plugin so it is NOT behind `guardWrites`. The
 * caller is an external telematics platform / device gateway authenticating with
 * a shared token (no session), so this path is also on the public allow-list in
 * lib/auth. Accepts a batch of position reports and writes them onto matching
 * trucks (by truckId, else deviceId).
 */
export const telematicsIngestRoutes = Router();
telematicsIngestRoutes.post("/telematics", async (req, res) => {
  const token = req.headers["x-telematics-token"];
  if (!config.TELEMATICS_INGEST_TOKEN || token !== config.TELEMATICS_INGEST_TOKEN)
    return res.status(401).json({ error: { code: "unauthorized", message: "Bad telematics token" } });

  const parsed = z
    .object({
      reports: z
        .array(
          z.object({
            truckId: z.string().optional(),
            deviceId: z.string().optional(),
            lat: z.number(),
            lng: z.number(),
            speed: z.number().optional(),
            heading: z.number().optional(),
            at: z.string().optional(),
          }),
        )
        .min(1)
        .max(500),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });

  const all = await trucks.all();
  let updated = 0;
  for (const r of parsed.data.reports) {
    let truck = r.truckId ? all.find((t) => t.id === r.truckId) : undefined;
    if (!truck && r.deviceId) truck = all.find((t) => t.deviceId === r.deviceId);
    if (!truck) continue;
    await trucks.update(truck.id, {
      lat: r.lat,
      lng: r.lng,
      speed: r.speed ?? 0,
      heading: r.heading ?? 0,
      lastSeen: r.at ?? new Date().toISOString(),
    });
    updated++;
  }
  return res.json({ data: { received: parsed.data.reports.length, updated } });
});
