#!/usr/bin/env node
/**
 * Brings the catalog asset pack (POS asset manifest + studio / in-use product
 * renders) into the public site, safely.
 *
 *   node scripts/import-catalog-assets.mjs                 from apps/web/assets-src
 *   node scripts/import-catalog-assets.mjs --from <dir>    from another folder
 *
 * Reads (never served, git-ignored):
 *   <dir>/POS_Asset_System/POS_Asset_Inventory_224.json   the manifest
 *   <dir>/Product_Images/<group>/<file>.png               1254 px renders
 *
 * Writes:
 *   data/catalog-merch.json             per slug: demand rank, score, tier, tags
 *                                        (cost, URLs and internal notes dropped)
 *   public/catalog/<slug>--studio.webp  studio render, 1200 px, ~100-200 KB
 *   public/catalog/<slug>--in-use.webp  in-use render, 1200 px
 *   lib/catalog/merch.generated.ts      the two above, typed, for lib/catalog
 *
 * The manifest carries each item's Current Cost. It must never be published:
 * this script reads it from outside public/ and copies only the fields the
 * site shows. Keep the asset pack itself out of apps/web/public.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const SRC = fromIdx >= 0 ? args[fromIdx + 1] : join(WEB, "assets-src");
const OUT_IMG = join(WEB, "public", "catalog");
const MAX_PX = 1200;

const norm = (s) => s.trim().replace(/\s+/g, " ").toLowerCase();

// ── Manifest → merch data (rank, tier, tags) ────────────────────────────
const lock = JSON.parse(readFileSync(join(WEB, "data", "catalog-lock.json"), "utf8")).products;
const slugByName = new Map(Object.entries(lock).map(([name, v]) => [norm(name), v.slug]));
const manifestPath = join(SRC, "POS_Asset_System", "POS_Asset_Inventory_224.json");
if (!existsSync(manifestPath)) {
  console.error(`No manifest at ${manifestPath}`);
  process.exit(1);
}
const { records } = JSON.parse(readFileSync(manifestPath, "utf8"));

const TIERS = { Core: "core", Standard: "standard", Select: "select" };
const merch = {};
for (const r of records) {
  const slug = slugByName.get(norm(r["Product Name"] ?? ""));
  if (!slug || merch[slug]) continue; // not on the storefront, or a duplicate row
  const tier = TIERS[r["Demand Tier"]];
  if (!tier) continue; // services and fees
  merch[slug] = {
    rank: Number(r["Sales Priority Rank"]),
    demandScore: Number(r["Demand Score"]),
    tier,
    tags: String(r["SEO / POS Tags"] ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => t && !/^bay area landscaping materials$/i.test(t) && !/^(landscape materials|bay area)$/i.test(t)),
  };
}
writeFileSync(join(WEB, "data", "catalog-merch.json"), JSON.stringify(merch, null, 2) + "\n");

// ── Renders → optimised WebP ────────────────────────────────────────────
// File name (without role suffix) → catalog slug. The pack names files by
// hand, so the mapping is explicit rather than guessed.
const RENDER_SLUGS = {
  "BALM_core-material-black-bark": "black-bark",
  "BALM_core-material_topsoil-supreme": "topsoil-supreme",
  "black_lava_3-4in": "black-lava-3-4-in",
  lodi_3_4in: "lodi-3-4-in",
  "lodi_3-4in": "lodi-3-4-in",
  "red_lava_3-4in": "red-lava-3-4-in",
  concrete_paver_sand: "concrete-paver-sand",
  road_base_class_ii_3_4_minus: "road-base-class-ii-base-rock-3-4-minus",
  shredded_redwood_bark: "shredded-redwood-gorilla-hair",
};
const ROLE = /[_-](hero|in[_-]use)_v\d+$/i;

const renders = {};
const imgRoot = join(SRC, "Product_Images");
const files = existsSync(imgRoot)
  ? readdirSync(imgRoot).flatMap((d) =>
      statSync(join(imgRoot, d)).isDirectory() ? readdirSync(join(imgRoot, d)).map((f) => join(imgRoot, d, f)) : [],
    )
  : [];
mkdirSync(OUT_IMG, { recursive: true });
for (const file of files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f)).sort()) {
  const stem = basename(file).replace(/\.[^.]+$/, "");
  const m = stem.match(ROLE);
  if (!m) continue;
  const key = stem.slice(0, m.index);
  const slug = RENDER_SLUGS[key];
  if (!slug) {
    console.warn(`  skipped ${basename(file)}: no slug mapping for "${key}"`);
    continue;
  }
  const role = /hero/i.test(m[1]) ? "studio" : "in-use";
  const outName = `${slug}--${role}.webp`;
  const out = join(OUT_IMG, outName);
  const info = await sharp(file)
    .resize({ width: MAX_PX, height: MAX_PX, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80, effort: 6 })
    .toFile(out);
  (renders[slug] ??= {})[role] = { src: `/catalog/${outName}`, width: info.width, height: info.height, bytes: info.size };
  console.log(`  ${outName}  ${info.width}x${info.height}  ${Math.round(info.size / 1024)} KB`);
}

// ── Typed module ────────────────────────────────────────────────────────
const header = `// Generated by scripts/import-catalog-assets.mjs. Do not edit by hand.
// Demand rank and tier are a Bay Area market-demand proxy from the POS asset
// manifest, not recorded sales: they order the catalog and mark core
// materials, and are never shown as sales figures.

export interface CatalogMerch {
  rank: number;
  demandScore: number;
  tier: "core" | "standard" | "select";
  tags: string[];
}

export interface RenderImage {
  src: string;
  width: number;
  height: number;
  bytes: number;
}

`;
writeFileSync(
  join(WEB, "lib", "catalog", "merch.generated.ts"),
  header +
    `export const MERCH: Readonly<Record<string, CatalogMerch>> = ${JSON.stringify(merch, null, 2)};\n\n` +
    `export const RENDERS: Readonly<Record<string, { studio?: RenderImage; "in-use"?: RenderImage }>> = ${JSON.stringify(renders, null, 2)};\n`,
);
console.log(`merch for ${Object.keys(merch).length} products, renders for ${Object.keys(renders).length}`);
