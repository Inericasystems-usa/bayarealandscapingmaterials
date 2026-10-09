#!/usr/bin/env node
/**
 * Web-sized logo and icon files from the brand masters in public/brand.
 *
 *   node scripts/build-brand.mjs
 *
 * The masters (BALM_Logo_*_8K.png, BALM_Clean_White_Reverse_*_8K.png and
 * BALM_Favicon_Exact_Artwork.ico) are 5–28 MB each and stay out of git and out
 * of the deploy (public/brand/.gitignore). What the site serves is generated
 * here and committed:
 *
 *   public/brand/logo-horizontal.webp   full-colour lockup, mark + wordmark side by side (header)
 *   public/brand/logo-primary.webp      full-colour stacked lockup (light backgrounds)
 *   public/brand/logo-white.webp        white line-art stacked lockup (dark backgrounds)
 *   public/brand/logo-mark-white.png    white mark without the wordmark (share cards)
 *   public/brand/icon-256.png           the favicon artwork, largest frame (app/icon.tsx)
 *   public/favicon.ico                  the supplied favicon, unchanged
 *   public/apple-touch-icon.png, icon-192.png, icon-512.png, icon-maskable-*.png
 *
 * Run it again whenever a master changes.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// sharp is Next's own image library; borrow it rather than adding a dependency.
const require = createRequire(createRequire(import.meta.url).resolve("next/package.json"));
const sharp = require("sharp");

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const BRAND = join(WEB, "public", "brand");
const PUBLIC = join(WEB, "public");

const MASTERS = {
  primary: join(BRAND, "BALM_Logo_Primary_8K.png"),
  horizontal: join(BRAND, "BALM_Logo_Horizontal_8K.png"),
  white: join(BRAND, "BALM_Clean_White_Reverse_Creative_v2_8K.png"),
  favicon: join(BRAND, "BALM_Favicon_Exact_Artwork.ico"),
};

for (const [name, file] of Object.entries(MASTERS)) {
  if (!existsSync(file)) {
    console.error(`Missing brand master (${name}): ${file}`);
    process.exit(1);
  }
}

// The favicon's own background, sampled from the supplied .ico.
const ICON_GREEN = { r: 3, g: 57, b: 16, alpha: 1 };

/** Trim the transparent margin the masters carry. */
async function trimmed(file) {
  return sharp(file).trim({ threshold: 10 }).toBuffer();
}

async function webp(input, height, out) {
  const info = await sharp(input).resize({ height }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(out);
  console.log(`${out.slice(WEB.length + 1)}  ${info.width}x${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}

/** The largest PNG frame inside an .ico (Windows icons hold PNG frames from Vista on). */
function largestIcoFrame(file) {
  const ico = readFileSync(file);
  let best = null;
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const o = 6 + i * 16;
    const size = ico[o] || 256;
    const frame = ico.subarray(ico.readUInt32LE(o + 12), ico.readUInt32LE(o + 12) + ico.readUInt32LE(o + 8));
    const isPng = frame.subarray(1, 4).toString() === "PNG";
    if (isPng && (!best || size > best.size)) best = { size, frame };
  }
  if (!best) throw new Error("the favicon has no PNG frame");
  return best;
}

/** The white mark on the favicon green, square, with `pad` of clear space each side. */
async function markIcon(mark, size, pad) {
  const inner = Math.round(size * (1 - pad * 2));
  const art = await sharp(mark).resize({ width: inner, height: inner, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: ICON_GREEN } })
    .composite([{ input: art, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const primary = await trimmed(MASTERS.primary);
const horizontal = await trimmed(MASTERS.horizontal);
const white = await trimmed(MASTERS.white);

// Header renders at 44–48 px tall; 3x covers high-density phones.
await webp(horizontal, 160, join(BRAND, "logo-horizontal.webp"));
await webp(primary, 480, join(BRAND, "logo-primary.webp"));
await webp(white, 480, join(BRAND, "logo-white.webp"));

// The mark is everything above the wordmark: the stacked lockup's ground line
// sits at 70% of its height (measured on the master).
const whiteMeta = await sharp(white).metadata();
const markHeight = Math.round(whiteMeta.height * 0.7);
const mark = await sharp(white).extract({ left: 0, top: 0, width: whiteMeta.width, height: markHeight }).trim({ threshold: 10 }).toBuffer();
const markInfo = await sharp(mark).resize({ height: 360 }).png({ compressionLevel: 9 }).toFile(join(BRAND, "logo-mark-white.png"));
console.log(`public/brand/logo-mark-white.png  ${markInfo.width}x${markInfo.height}`);

// Favicon: the supplied artwork exactly, as .ico and as the 256 px frame.
copyFileSync(MASTERS.favicon, join(PUBLIC, "favicon.ico"));
const fav = largestIcoFrame(MASTERS.favicon);
writeFileSync(join(BRAND, "icon-256.png"), fav.frame);
console.log(`public/favicon.ico + public/brand/icon-256.png (${fav.size}px frame)`);

// Home-screen icons: drawn from the 8K master so 512 px stays sharp. Maskable
// icons keep the mark inside the 80% safe zone Android crops to.
const icons = [
  ["apple-touch-icon.png", 180, 0.08],
  ["icon-192.png", 192, 0.08],
  ["icon-512.png", 512, 0.08],
  ["icon-maskable-192.png", 192, 0.16],
  ["icon-maskable-512.png", 512, 0.16],
];
for (const [name, size, pad] of icons) {
  writeFileSync(join(PUBLIC, name), await markIcon(mark, size, pad));
  console.log(`public/${name}  ${size}x${size}`);
}
