import { Router, json } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { trucks, drivers } from "./fleet.js";
import { bus } from "../lib/events.js";
import { guardWrites } from "../lib/auth.js";
import { rejectCardNumbers } from "../lib/pan-guard.js";

export type DeliveryStatus = "scheduled" | "loading" | "enroute" | "delivered" | "cancelled";

/** Fine-grained driver progress stages (the driver app advances through these). */
export type DeliveryStage =
  | "assigned"
  | "loading"
  | "loaded"
  | "to_customer"
  | "arrived"
  | "unloading"
  | "unloaded"
  | "returning"
  | "completed";

export const STAGE_ORDER: DeliveryStage[] = [
  "assigned",
  "loading",
  "loaded",
  "to_customer",
  "arrived",
  "unloading",
  "unloaded",
  "returning",
  "completed",
];

/** Map a fine-grained stage to the coarse board status. */
function stageToStatus(stage: DeliveryStage): DeliveryStatus {
  if (stage === "assigned") return "scheduled";
  if (stage === "loading" || stage === "loaded") return "loading";
  if (stage === "completed") return "delivered";
  return "enroute"; // to_customer, arrived, unloading, unloaded, returning
}

/** Proof of delivery captured at the drop site. Images are data URLs. */
export interface Pod {
  receivedBy: string;
  signature: string | null; // data URL (image/png) of the on-glass signature
  photos: string[]; // data URLs of drop-site photos
  notes: string;
  lat: number | null;
  lng: number | null;
  capturedAt: string;
}

export interface Delivery extends Entity {
  code: string;
  customer: string;
  address: string;
  window: string;
  items: string;
  phone: string;
  status: DeliveryStatus;
  stage: DeliveryStage;
  stageHistory: { stage: DeliveryStage; at: string }[];
  truckId: string | null;
  truckNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  pod: Pod | null;
}

export const deliveries = new Collection<Delivery>("deliveries");

const upsertSchema = z.object({
  customer: z.string().min(1),
  address: z.string().default(""),
  window: z.string().default(""),
  items: z.string().default(""),
  phone: z.string().default(""),
  status: z.enum(["scheduled", "loading", "enroute", "delivered", "cancelled"]).default("scheduled"),
});

/** Keep the assigned truck's status in step with the delivery lifecycle. */
async function syncTruckStatus(truckId: string | null, status: DeliveryStatus): Promise<void> {
  if (!truckId) return;
  if (status === "enroute") await trucks.update(truckId, { status: "on_route" });
  else if (status === "delivered" || status === "cancelled") await trucks.update(truckId, { status: "available" });
}

/**
 * Emit customer-communication triggers on status transitions. Fires once per
 * transition (guards against re-emitting when status is unchanged) — the
 * messaging module turns these into templated SMS via RingCentral.
 */
function emitDeliveryComms(prev: DeliveryStatus, next: Delivery): void {
  if (next.status === "enroute" && prev !== "enroute") {
    bus.emit("delivery.dispatched", {
      deliveryId: next.id,
      code: next.code,
      customer: next.customer,
      phone: next.phone,
      eta: next.window,
    });
  }
  if (next.status === "delivered" && prev !== "delivered") {
    bus.emit("delivery.delivered", {
      deliveryId: next.id,
      code: next.code,
      customer: next.customer,
      phone: next.phone,
    });
  }
}

const router = Router();
// Mutations require the "dispatch" permission (same as fleet). Without this,
// any authenticated session — a cashier — could create/reassign/cancel
// deliveries and post proof-of-delivery. GETs stay open to any operator.
router.use(guardWrites("dispatch"));

router.get("/", async (req, res) => {
  const { status, driverId } = req.query as { status?: string; driverId?: string };
  let list = await deliveries.all();
  if (status) list = list.filter((d) => d.status === status);
  if (driverId) list = list.filter((d) => d.driverId === driverId);
  return res.json({ data: list });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const d = await deliveries.find(id);
  if (!d) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });
  return res.json({ data: d });
});

router.post("/", async (req, res) => {
  const parsed = upsertSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const count = (await deliveries.count()) + 1044;
  const created = await deliveries.insert({
    id: newId("dlv"),
    code: `D-${count}`,
    ...parsed.data,
    stage: "assigned",
    stageHistory: [],
    truckId: null,
    truckNumber: null,
    driverId: null,
    driverName: null,
    pod: null,
  });
  return res.status(201).json({ data: created });
});

router.patch("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = upsertSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const updated = await deliveries.update(id, parsed.data);
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });
  return res.json({ data: updated });
});

router.delete("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const ok = await deliveries.remove(id);
  if (!ok) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });
  return res.json({ data: { id, deleted: true } });
});

// Assign a truck and/or driver to a delivery.
router.patch("/:id/assign", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z
    .object({ truckId: z.string().nullable().optional(), driverId: z.string().nullable().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });

  const patch: Partial<Delivery> = {};
  if (parsed.data.truckId !== undefined) {
    patch.truckId = parsed.data.truckId;
    patch.truckNumber = parsed.data.truckId ? (await trucks.find(parsed.data.truckId))?.number ?? null : null;
  }
  if (parsed.data.driverId !== undefined) {
    patch.driverId = parsed.data.driverId;
    patch.driverName = parsed.data.driverId ? (await drivers.find(parsed.data.driverId))?.name ?? null : null;
  }
  const updated = await deliveries.update(id, patch);
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });
  return res.json({ data: updated });
});

// Advance / set status — syncs the assigned truck's status.
router.patch("/:id/status", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z
    .object({ status: z.enum(["scheduled", "loading", "enroute", "delivered", "cancelled"]) })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const cur = await deliveries.find(id);
  if (!cur) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });
  const updated = await deliveries.update(id, { status: parsed.data.status });
  if (!updated) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });
  await syncTruckStatus(updated.truckId, parsed.data.status);
  emitDeliveryComms(cur.status, updated);
  return res.json({ data: updated });
});

// Capture proof of delivery (signature + photos) and, by default, mark delivered.
// Image data URLs make this payload large, so the route gets its own body limit.
// NOTE: images are stored inline in the document store; production should offload
// them to object storage (S3/GCS) and keep only URLs here.
router.post("/:id/pod", json({ limit: "8mb" }), rejectCardNumbers, async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z
    .object({
      receivedBy: z.string().default(""),
      signature: z.string().max(3_000_000).nullable().optional(),
      photos: z.array(z.string().max(3_000_000)).max(6).default([]),
      notes: z.string().default(""),
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      markDelivered: z.boolean().default(true),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const cur = await deliveries.find(id);
  if (!cur) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });

  const pod: Pod = {
    receivedBy: parsed.data.receivedBy,
    signature: parsed.data.signature ?? null,
    photos: parsed.data.photos,
    notes: parsed.data.notes,
    lat: parsed.data.lat ?? null,
    lng: parsed.data.lng ?? null,
    capturedAt: new Date().toISOString(),
  };
  const patch: Partial<Delivery> = { pod };
  if (parsed.data.markDelivered) {
    patch.status = "delivered";
    patch.stage = "completed";
    patch.stageHistory = [...cur.stageHistory, { stage: "completed", at: pod.capturedAt }];
  }
  const updated = await deliveries.update(id, patch);
  if (updated && parsed.data.markDelivered) {
    await syncTruckStatus(updated.truckId, "delivered");
    emitDeliveryComms(cur.status, updated);
  }
  return res.json({ data: updated });
});

// Driver advances the fine-grained delivery stage (live to the dispatch board).
router.patch("/:id/stage", async (req, res) => {
  const { id } = req.params as { id: string };
  const parsed = z.object({ stage: z.enum(STAGE_ORDER as [DeliveryStage, ...DeliveryStage[]]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const cur = await deliveries.find(id);
  if (!cur) return res.status(404).json({ error: { code: "not_found", message: "Delivery not found" } });
  const stage = parsed.data.stage;
  const status = stageToStatus(stage);
  const stageHistory = [...cur.stageHistory, { stage, at: new Date().toISOString() }];
  const updated = await deliveries.update(id, { stage, status, stageHistory });
  await syncTruckStatus(cur.truckId, status);
  if (updated) emitDeliveryComms(cur.status, updated);
  return res.json({ data: updated });
});

export default router;
