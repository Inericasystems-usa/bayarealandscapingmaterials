import express, { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { guardWrites } from "../lib/auth.js";

/**
 * Image uploads. The product form posts a base64 data URL here; we store the
 * bytes and hand back a stable, same-origin relative URL (`/api/v1/uploads/:id`)
 * that renders everywhere (next/image included) without a CDN. Storefront reads
 * are public (allow-listed in lib/auth); writes need inventory access.
 *
 * NOTE: images live inline in the document store — fine for this app; a high-
 * volume deployment would offload to object storage (R2/S3) and keep only keys.
 */
interface Upload extends Entity {
  contentType: string;
  base64: string;
}
const uploads = new Collection<Upload>("uploads");

const router = Router();

router.use(guardWrites("inventory")); // POST gated to inventory write; GET is public

router.post("/", express.json({ limit: "12mb" }), async (req, res) => {
  const parsed = z.object({ data: z.string().max(11_000_000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const m = /^data:([^;]+);base64,(.+)$/s.exec(parsed.data.data);
  const contentType = m?.[1];
  const base64 = m?.[2];
  if (!contentType || !base64 || !contentType.startsWith("image/"))
    return res.status(400).json({ error: { code: "invalid", message: "Expected a base64 image data URL" } });
  const created = await uploads.insert({ id: newId("img"), contentType, base64 });
  return res.status(201).json({ data: { url: `/api/v1/uploads/${created.id}` } });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const u = await uploads.find(id);
  if (!u) return res.status(404).json({ error: { code: "not_found", message: "Image not found" } });
  return res
    .set("content-type", u.contentType)
    .set("cache-control", "public, max-age=31536000, immutable")
    .send(Buffer.from(u.base64, "base64"));
});

export default router;
