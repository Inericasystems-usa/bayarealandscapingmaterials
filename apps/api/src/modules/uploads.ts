import express, { Router } from "express";
import { z } from "zod";
import { Collection, newId, type Entity } from "../lib/store.js";
import { guardWrites } from "../lib/auth.js";
import { uploadsBucket } from "../lib/db.js";
import type { mongo } from "mongoose";

/**
 * Image uploads. The product form posts a base64 data URL here; we store the
 * bytes and hand back a stable, same-origin relative URL (`/api/v1/uploads/:id`)
 * that renders everywhere (next/image included) without a CDN. Storefront reads
 * are public (allow-listed in lib/auth); writes need inventory access.
 *
 * The bytes live in the "uploads" GridFS bucket, under the upload's id, so no
 * document carries an image (a document is capped at 16 MB, and inline images
 * bloat every backup of the collection). The `uploads` row keeps the type and
 * size. Rows stored before then still hold `base64`: they are served as they
 * are and moved to GridFS on first read, or all at once with
 * `pnpm --filter @balm/api migrate:uploads` (src/scripts/migrate-uploads.ts).
 */
interface Upload extends Entity {
  contentType: string;
  length?: number;
  base64?: string; // rows stored before GridFS, until migrated
}
const uploads = new Collection<Upload>("uploads");

// A GridFS file's _id can be any value; ours is the upload's id. The driver's
// types only name ObjectId.
const fileId = (id: string) => id as unknown as mongo.ObjectId;
const notFoundError = (err: unknown) => /not ?found/i.test((err as Error).message ?? "");

async function readFile(id: string): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  try {
    for await (const chunk of uploadsBucket().openDownloadStream(fileId(id))) chunks.push(chunk as Buffer);
  } catch (err) {
    if (notFoundError(err)) return null;
    throw err;
  }
  return Buffer.concat(chunks);
}

async function fileExists(id: string): Promise<boolean> {
  return (await uploadsBucket().find({ _id: fileId(id) }).limit(1).toArray()).length > 0;
}

// The file's id is the upload's id. A second writer of the same id (two first
// reads of one legacy row) fails on the bucket's unique indexes; the file is
// there either way.
async function writeFile(id: string, bytes: Buffer, contentType: string): Promise<void> {
  if (await fileExists(id)) return;
  try {
    await new Promise<void>((resolve, reject) => {
      const stream = uploadsBucket().openUploadStreamWithId(fileId(id), id, { metadata: { contentType } });
      stream.once("finish", () => resolve());
      stream.once("error", reject);
      stream.end(bytes);
    });
  } catch (err) {
    if ((err as { code?: number }).code !== 11000 || !(await fileExists(id))) throw err;
  }
}

/** Move one legacy row's bytes into GridFS and drop them from the row. */
async function moveToGridFs(u: Upload & { base64: string }): Promise<void> {
  const bytes = Buffer.from(u.base64, "base64");
  await writeFile(u.id, bytes, u.contentType);
  await uploads.update(u.id, { length: bytes.length }, { unset: ["base64"] });
}

/**
 * Move every row that still holds base64 into GridFS. Idempotent: a moved row
 * no longer matches. With `dryRun` nothing is written; the counts say what would be.
 */
export async function migrateLegacyUploads(
  opts: { dryRun?: boolean; log?: (msg: string) => void } = {},
): Promise<{ legacy: number; moved: number; bytes: number }> {
  const legacy = (await uploads.where({ base64: { $type: "string" } })) as (Upload & { base64: string })[];
  let moved = 0;
  let bytes = 0;
  for (const u of legacy) {
    const size = Buffer.byteLength(u.base64, "base64");
    if (!opts.dryRun) await moveToGridFs(u);
    moved++;
    bytes += size;
    opts.log?.(`${opts.dryRun ? "would move" : "moved"} ${u.id} (${size} bytes)`);
  }
  return { legacy: legacy.length, moved: opts.dryRun ? 0 : moved, bytes };
}

/** Delete an upload: its row and its GridFS file. False when there was neither. */
export async function removeUpload(id: string): Promise<boolean> {
  const hadRow = await uploads.remove(id);
  let hadFile = false;
  try {
    await uploadsBucket().delete(fileId(id));
    hadFile = true;
  } catch (err) {
    if (!notFoundError(err)) throw err;
  }
  return hadRow || hadFile;
}

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

router.use(guardWrites("inventory")); // POST and DELETE need inventory write; GET is public

router.post("/", express.json({ limit: "12mb" }), async (req, res) => {
  const parsed = z.object({ data: z.string().max(11_000_000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: { code: "invalid", message: parsed.error.message } });
  const m = /^data:([^;]+);base64,(.+)$/s.exec(parsed.data.data);
  const bytes = m?.[2] ? Buffer.from(m[2], "base64") : null;
  const contentType = bytes && m?.[1]?.startsWith("image/") ? FORMATS.find((f) => f.matches(bytes))?.type : undefined;
  if (!bytes || !contentType)
    return res.status(400).json({ error: { code: "invalid", message: "Expected a PNG, JPEG, WebP or GIF image" } });
  // File first, then the row: a row never points at missing bytes.
  const id = newId("img");
  await writeFile(id, bytes, contentType);
  const created = await uploads.insert({ id, contentType, length: bytes.length });
  return res.status(201).json({ data: { url: `/api/v1/uploads/${created.id}` } });
});

router.get("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  const u = await uploads.find(id);
  const notFound = () => res.status(404).json({ error: { code: "not_found", message: "Image not found" } });
  if (!u || !servable(u.contentType)) return notFound();
  let bytes: Buffer | null;
  if (typeof u.base64 === "string") {
    bytes = Buffer.from(u.base64, "base64");
    // Served from the row this once; a failed move is retried on the next read.
    await moveToGridFs(u as Upload & { base64: string }).catch((err) =>
      req.log?.warn({ err, uploadId: id }, "could not move upload to GridFS"),
    );
  } else {
    bytes = await readFile(id);
  }
  if (!bytes) return notFound();
  return res
    .set("content-type", u.contentType)
    .set("x-content-type-options", "nosniff")
    .set("content-security-policy", IMAGE_CSP)
    .set("cache-control", "public, max-age=31536000, immutable")
    .send(bytes);
});

// Delete an image (inventory access, like uploading): the row and its bytes.
router.delete("/:id", async (req, res) => {
  const { id } = req.params as { id: string };
  if (!(await removeUpload(id))) return res.status(404).json({ error: { code: "not_found", message: "Image not found" } });
  return res.json({ data: { id, deleted: true } });
});

export default router;
