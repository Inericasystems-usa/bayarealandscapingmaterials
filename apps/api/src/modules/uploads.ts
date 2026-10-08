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

// Raster formats only, recognised by their first bytes rather than the type the
// client declares. An SVG (or HTML) served from this origin could run script
// with the POS session (PCI DSS 6.2.4).
const FORMATS: { type: string; matches: (b: Buffer) => boolean }[] = [
  { type: "image/png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/gif", matches: (b) => /^GIF8[79]a/.test(b.subarray(0, 6).toString("latin1")) },
  { type: "image/webp", matches: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
];
// Rows stored before this rule may hold other image types. They are still
// served (as images, never sniffed), except SVG/XML, which can carry script.
const servable = (type: string) => type.startsWith("image/") && !/svg|xml/i.test(type);
// Opened on its own, an image renders in a sandbox that can't run or load anything.
const IMAGE_CSP = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox";

const router = Router();

router.use(guardWrites("inventory")); // POST gated to inventory write; GET is public

router.post("/", express.json({ limit: "12mb" }), async (req, res) => {
  const parsed = z.object({ data: z.string().max(11_000_000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const m = /^data:([^;]+);base64,(.+)$/s.exec(parsed.data.data);
  const bytes = m?.[2] ? Buffer.from(m[2], "base64") : null;
  const contentType = bytes && m?.[1]?.startsWith("image/") ? FORMATS.find((f) => f.matches(bytes))?.type : undefined;
  if (!bytes || !contentType)
    return res.status(400).json({ error: { code: "invalid", message: "Expected a PNG, JPEG, WebP or GIF image" } });
  const created = await uploads.insert({ id: newId("img"), contentType, base64: bytes.toString("base64") });
  return res.status(201).json({ data: { url: `/api/v1/uploads/${created.id}` } });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const u = await uploads.find(id);
  if (!u || !servable(u.contentType)) return res.status(404).json({ error: { code: "not_found", message: "Image not found" } });
  return res
    .set("content-type", u.contentType)
    .set("x-content-type-options", "nosniff")
    .set("content-security-policy", IMAGE_CSP)
    .set("cache-control", "public, max-age=31536000, immutable")
    .send(Buffer.from(u.base64, "base64"));
});

export default router;
