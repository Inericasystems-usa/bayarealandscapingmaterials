#!/usr/bin/env node
/**
 * Builds the public product catalog from the Flint POS product export.
 *
 *   node scripts/build-catalog.mjs                       rebuild from data/catalog-source.csv
 *   node scripts/build-catalog.mjs --from export.csv     import a new Flint export first
 *   node scripts/build-catalog.mjs --offline             skip photo downloads
 *
 * Run from apps/web. With --from, only rows that are Active and published to the
 * storefront are kept, and the Cost column is dropped before anything is
 * written: cost never enters the repository.
 *
 * Writes:
 *   data/catalog-source.csv          the published rows (no Cost)
 *   data/catalog-lock.json           slug and SKU per product, so URLs never move
 *   data/woocommerce-products.csv    WooCommerce product import (variable products + variations)
 *   data/photos-needed.csv           products without a photo, or with a small one
 *   lib/catalog/catalog.generated.ts the public catalog (no prices)
 *   lib/catalog/prices.generated.ts  retail prices per variation (server only, shown only
 *                                    when lib/storefront.ts turns prices on)
 *   public/catalog/<slug>.<ext>      each product photo, downloaded once and self-hosted
 *   public/catalog/placeholder/<category>.svg  generic "photo coming soon" images
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CATEGORIES,
  PRICE_FIXES,
  categoryForBlank,
  cleanName,
  cleanNote,
  kindFor,
  noteAddsInfo,
} from "./catalog-rules.mjs";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA = join(WEB, "data");
const PUBLIC_DIR = join(WEB, "public", "catalog");
const SITE = "https://bayarealandscapingmaterials.com";
const SMALL_PHOTO_PX = 600;

const args = process.argv.slice(2);
const fromIdx = args.indexOf("--from");
const fromPath = fromIdx >= 0 ? args[fromIdx + 1] : null;
const offline = args.includes("--offline");

// ── CSV ─────────────────────────────────────────────────────────────────

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0]);
  return { header, rows: body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""]))) };
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(header, rows) {
  return [header, ...rows.map((r) => header.map((h) => r[h]))].map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}

// ── 1. Import a new export (optional) ───────────────────────────────────

const SOURCE = join(DATA, "catalog-source.csv");
mkdirSync(DATA, { recursive: true });

if (fromPath) {
  const { header, rows } = parseCsv(readFileSync(fromPath, "utf8"));
  const keep = header.filter((h) => h.trim().toLowerCase() !== "cost");
  const published = rows.filter((r) => r.Active === "TRUE" && r["Publish to Flint Storefront"] === "TRUE");
  writeFileSync(SOURCE, toCsv(keep, published.map((r) => Object.fromEntries(keep.map((h) => [h, r[h]])))));
  console.log(`Imported ${published.length} published rows of ${rows.length} from ${fromPath} (Cost column dropped).`);
}

const { header: sourceHeader, rows: sourceRows } = parseCsv(readFileSync(SOURCE, "utf8"));
if (sourceHeader.some((h) => h.trim().toLowerCase() === "cost")) {
  throw new Error("data/catalog-source.csv has a Cost column. Re-import with --from so it is dropped.");
}
const published = sourceRows.filter((r) => r.Active === "TRUE" && r["Publish to Flint Storefront"] === "TRUE");

// ── 2. Merge duplicates ────────────────────────────────────────────────
// The same product entered twice in the POS appears once on the site. The row
// with a photo (then the most recently updated) wins.

const byKey = new Map();
const duplicates = [];
for (const r of published) {
  const key = r.Name.replace(/\s+/g, " ").trim().toLowerCase();
  const prev = byKey.get(key);
  if (!prev) {
    byKey.set(key, r);
    continue;
  }
  duplicates.push(r.Name.trim());
  const score = (x) => (x["Photo URL"] ? 2 : 0) + (Date.parse(x["Updated At"]) || 0) / 1e15;
  if (score(r) > score(prev)) byKey.set(key, r);
}
const rows = [...byKey.values()];

// ── 3. Normalise ───────────────────────────────────────────────────────

const CATEGORY_BY_SHEET = new Map(CATEGORIES.flatMap((c) => c.sheet.map((s) => [s, c])));
const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

function categoryOf(r, name) {
  const sheet = r.Category.trim();
  const c = sheet ? CATEGORY_BY_SHEET.get(sheet) : CATEGORY_BY_SLUG.get(categoryForBlank(name));
  if (!c) throw new Error(`No store category for "${r.Name}" (sheet category "${sheet}")`);
  return c;
}

const UNIT_LABELS = {
  each: "Each",
  ea: "Each",
  lb: "Pound",
  pound: "Pound",
  "cubic yard": "Cubic Yard",
  yard: "Cubic Yard",
  ton: "Ton",
  svc: "Service",
  "square feet": "Square Foot",
  "full pallet": "Full Pallet",
};
const UNIT_PLURAL = {
  Each: "each",
  Pound: "pounds",
  "Cubic Yard": "cubic yards",
  "Half Cubic Yard": "half cubic yards",
  "Quarter Cubic Yard": "quarter cubic yards",
  Ton: "tons",
  Service: "services",
  "Square Foot": "square feet",
  "Full Pallet": "full pallets",
};
const UNIT_SKU = {
  Each: "EA",
  Pound: "LB",
  "Cubic Yard": "CY",
  "Half Cubic Yard": "HALF",
  "Quarter Cubic Yard": "QTR",
  Ton: "TON",
  Service: "SVC",
  "Square Foot": "SQFT",
  "Full Pallet": "PLT",
};

function unitOf(r) {
  const label = UNIT_LABELS[r["Unit Label"].trim().toLowerCase()];
  const base = UNIT_LABELS[r["Base Unit"].trim().toLowerCase()];
  if (!label) throw new Error(`Unknown unit "${r["Unit Label"]}" on "${r.Name}"`);
  // The label says "Each" for turf, pavers and some wall block, but the base
  // unit (square foot, full pallet) is how they are actually sold.
  if (label === "Each" && (base === "Square Foot" || base === "Full Pallet")) return base;
  return label;
}

function money(v) {
  const n = Number(String(v).replace(/[$,]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

function alternatesOf(r) {
  if (!r["Alternate Units"].trim()) return [];
  return r["Alternate Units"].split("|").map((part) => {
    const [label, factor, price] = part.split(":").map((s) => s.trim());
    if (!UNIT_PLURAL[label]) throw new Error(`Unknown alternate unit "${label}" on "${r.Name}"`);
    return { unit: label, factor: Number(factor), price: money(price) };
  });
}

function onHand(r) {
  return r["Inventory By Location"]
    .split("|")
    .map((loc) => Number(loc.split(":")[1]))
    .filter(Number.isFinite)
    .reduce((a, b) => a + b, 0);
}

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/(\d)\.(\d)/g, "$1-$2")
    .replace(/(\d)\/(\d)/g, "$1-$2")
    .replace(/"/g, " in ")
    .replace(/'/g, " ft ")
    .replace(/#/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-(in|ft)-(?=x-)/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// ── 4. Slugs and SKUs (stable) ─────────────────────────────────────────
// The lock maps a sheet name to its slug and SKU the first time it is seen.
// Later runs reuse it, so a product's URL and SKU never change even if the
// name clean-up rules do. Delete an entry only to deliberately re-slug.

const LOCK_PATH = join(DATA, "catalog-lock.json");
const lock = existsSync(LOCK_PATH) ? JSON.parse(readFileSync(LOCK_PATH, "utf8")) : { products: {} };
const usedSlugs = new Set(Object.values(lock.products).map((p) => p.slug));
const usedSkus = new Set(Object.values(lock.products).map((p) => p.sku));

function lockFor(key, name, category) {
  if (lock.products[key]) return lock.products[key];
  let slug = slugify(name);
  for (let n = 2; usedSlugs.has(slug) || slug === "category"; n++) slug = `${slugify(name)}-${n}`;
  let seq = 1;
  let sku;
  do sku = `BALM-${category.sku}-${String(seq++).padStart(3, "0")}`;
  while (usedSkus.has(sku));
  usedSlugs.add(slug);
  usedSkus.add(sku);
  lock.products[key] = { slug, sku };
  return lock.products[key];
}

// ── 5. Photos ──────────────────────────────────────────────────────────

function imageSize(buf) {
  const ascii = (a, b) => buf.toString("latin1", a, b);
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") {
    const chunk = ascii(12, 16);
    if (chunk === "VP8 ") return { type: "webp", width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { type: "webp", width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { type: "webp", width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
  }
  if (buf.readUInt32BE(0) === 0x89504e47) return { type: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { type: "jpg", width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
  }
  throw new Error("Unrecognised image format");
}

async function fetchPhoto(url, baseName) {
  // Reuse a photo already downloaded on an earlier run: each one is fetched once.
  for (const ext of ["webp", "jpg", "png"]) {
    const file = join(PUBLIC_DIR, `${baseName}.${ext}`);
    if (existsSync(file)) {
      const buf = readFileSync(file);
      return { file: `${baseName}.${ext}`, bytes: statSync(file).size, ...imageSize(buf) };
    }
  }
  if (offline) return null;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn(`  ! ${res.status} for ${url}`);
    return null;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const size = imageSize(buf);
  const file = `${baseName}.${size.type}`;
  writeFileSync(join(PUBLIC_DIR, file), buf);
  return { file, bytes: buf.length, ...size };
}

function photoUrls(r) {
  const urls = [r["Photo URL"], r["Website Photo URL"], ...r["Gallery Photo URLs"].split(/[|,\s]+/)]
    .map((u) => u.trim())
    .filter((u) => /^https:\/\//.test(u));
  return [...new Set(urls)];
}

// Generic, clearly labelled images for products without a photo. Built from
// the site's own palette (packages/ui/src/tokens.css), never a stock photo.
function placeholderSvg(label) {
  const esc = label.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200" role="img" aria-label="${esc}: photo coming soon">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ebf3ee"/>
      <stop offset="1" stop-color="#d2e6da"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#g)"/>
  <g fill="#74af8e" opacity="0.28">
    <ellipse cx="300" cy="900" rx="170" ry="110"/>
    <ellipse cx="560" cy="960" rx="120" ry="80"/>
    <ellipse cx="820" cy="890" rx="190" ry="125"/>
    <ellipse cx="1020" cy="980" rx="110" ry="70"/>
    <ellipse cx="160" cy="1010" rx="90" ry="60"/>
  </g>
  <g fill="none" stroke="#1b4332" stroke-width="10" opacity="0.55" transform="translate(540 380)">
    <rect x="0" y="20" width="120" height="90" rx="14"/>
    <circle cx="60" cy="65" r="26"/>
    <path d="M38 20 l10 -18 h24 l10 18"/>
  </g>
  <text x="600" y="590" text-anchor="middle" font-family="Montserrat, Arial, sans-serif" font-size="56" font-weight="600" fill="#1b4332">${esc}</text>
  <text x="600" y="660" text-anchor="middle" font-family="Open Sans, Arial, sans-serif" font-size="34" fill="#2c6e4b">Photo coming soon</text>
</svg>
`;
}

// ── 6. Build ───────────────────────────────────────────────────────────

mkdirSync(join(PUBLIC_DIR, "placeholder"), { recursive: true });
for (const c of CATEGORIES) {
  writeFileSync(join(PUBLIC_DIR, "placeholder", `${c.slug}.svg`), placeholderSvg(c.name));
}

const products = [];
const prices = {};
const priceFixes = [];

for (const r of rows) {
  const key = r.Name.replace(/\s+/g, " ").trim();
  const name = cleanName(key);
  const category = categoryOf(r, name);
  const { slug, sku } = lockFor(key, name, category);
  const unit = unitOf(r);
  const alternates = alternatesOf(r);
  const kind = kindFor(name, category.slug);
  const isService = category.slug === "services";

  const variations = [{ unit, factor: 1, price: money(r["Retail Price"]) }, ...alternates].map((v) => {
    const fix = PRICE_FIXES[key]?.[v.unit];
    if (fix && v.price === fix.from) {
      priceFixes.push(`${name} (${v.unit}): ${fix.from} -> ${fix.to}`);
      return { ...v, price: fix.to };
    }
    return v;
  });
  const variationRows = variations.map((v) => ({
    sku: alternates.length ? `${sku}-${UNIT_SKU[v.unit]}` : sku,
    unit: v.unit,
    unitPlural: UNIT_PLURAL[v.unit],
    factor: v.factor,
  }));
  for (const [i, v] of variations.entries()) prices[variationRows[i].sku] = v.price;

  const images = [];
  const urls = photoUrls(r);
  for (const [i, url] of urls.entries()) {
    const photo = await fetchPhoto(url, i === 0 ? slug : `${slug}-${i + 1}`);
    if (photo) {
      images.push({
        src: `/catalog/${photo.file}`,
        width: photo.width,
        height: photo.height,
        bytes: photo.bytes,
        alt: i === 0 ? name : `${name}, photo ${i + 1}`,
      });
    }
  }

  const rawNote = cleanNote(r.Description);
  const listingNote = noteAddsInfo(rawNote, name) ? rawNote : "";
  const soldBy = unit === "Each" ? "sold individually" : unit === "Service" ? "booked as a service" : `sold by the ${unit.toLowerCase()}`;
  const alt = alternates.length ? `, with ${alternates.map((a) => a.unit.toLowerCase()).join(" and ")} options` : "";
  const shortDescription = kind.short
    ? kind.short
    : isService
    ? `${name}: ${kind.what}, from our yard in Richmond, CA.`
    : `${name} is ${kind.what}, ${soldBy}${alt}, for pickup at our Richmond, CA yard or delivery across the Bay Area.`;

  const description = [...kind.about, kind.sizeNote].filter(Boolean);

  const keywords = [
    name.toLowerCase().replace(/"/g, " in").replace(/\s+/g, " ").trim(),
    kind.keyword,
    `${kind.keyword} Richmond CA`,
    `${kind.keyword} Bay Area`,
    category.name.toLowerCase(),
    isService ? "landscape supply yard Richmond CA" : "landscape supply Richmond CA",
  ];

  products.push({
    sku,
    slug,
    name,
    categorySlug: category.slug,
    keyword: kind.keyword,
    what: kind.what,
    shortDescription,
    description,
    uses: kind.uses,
    listingNote,
    unit,
    unitPlural: UNIT_PLURAL[unit],
    variations: variationRows,
    soldByCubicYard: unit === "Cubic Yard",
    isService,
    stockStatus: isService || onHand(r) > 0 ? "instock" : "outofstock",
    purchasable: r["Allow Storefront Purchase"] === "TRUE",
    images,
    placeholder: `/catalog/placeholder/${category.slug}.svg`,
    keywords: [...new Set(keywords)],
    updatedAt: new Date(Date.parse(r["Updated At"]) || Date.now()).toISOString().slice(0, 10),
  });
}

const order = new Map(CATEGORIES.map((c, i) => [c.slug, i]));
products.sort((a, b) => order.get(a.categorySlug) - order.get(b.categorySlug) || a.name.localeCompare(b.name, "en", { numeric: true }));

writeFileSync(
  LOCK_PATH,
  JSON.stringify(
    {
      note: "Slug and SKU per sheet product name. Kept stable across runs so product URLs and SKUs never move. Generated by scripts/build-catalog.mjs.",
      products: Object.fromEntries(Object.entries(lock.products).sort(([a], [b]) => a.localeCompare(b))),
    },
    null,
    2,
  ) + "\n",
);

// ── 7. Typed modules ───────────────────────────────────────────────────

const banner = (what) =>
  `// Generated by scripts/build-catalog.mjs from data/catalog-source.csv. Do not edit by hand:\n// ${what}\n`;

const categoriesOut = CATEGORIES.filter((c) => products.some((p) => p.categorySlug === c.slug)).map((c) => ({
  slug: c.slug,
  name: c.name,
  group: c.group,
  keyword: c.keyword,
  intro: c.intro,
  about: c.about,
  placeholder: `/catalog/placeholder/${c.slug}.svg`,
}));

writeFileSync(
  join(WEB, "lib", "catalog", "catalog.generated.ts"),
  `${banner("edit the sheet export or scripts/catalog-rules.mjs, then run the script again.")}
import type { CatalogCategory, CatalogProduct } from "./types";

export const CATEGORIES: readonly CatalogCategory[] = ${JSON.stringify(categoriesOut, null, 2)};

export const PRODUCTS: readonly CatalogProduct[] = ${JSON.stringify(products, null, 2)};
`,
);

writeFileSync(
  join(WEB, "lib", "catalog", "prices.generated.ts"),
  `${banner("retail price per variation SKU, in US dollars.")}// Read only through lib/catalog/pricing.ts, which returns nothing while
// lib/storefront.ts keeps prices off. Never import this from a client component.

export const RETAIL_PRICES: Readonly<Record<string, number | null>> = ${JSON.stringify(prices, null, 2)};
`,
);

// The calculator's material list, small enough for a client bundle (the full
// catalog is not). lib/bulk-materials.ts reads it; a test checks it matches.
const bulk = products
  .filter((p) => p.soldByCubicYard)
  .map((p) => ({ id: p.slug, name: p.name, category: CATEGORY_BY_SLUG.get(p.categorySlug).name }))
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "en", { numeric: true }));
writeFileSync(
  join(WEB, "lib", "catalog", "bulk.generated.ts"),
  `${banner("the products sold by the cubic yard, for the coverage calculator.")}
export const BULK_MATERIAL_LIST: readonly { id: string; name: string; category: string }[] = ${JSON.stringify(bulk, null, 2)};
`,
);

// ── 8. WooCommerce import ──────────────────────────────────────────────
// Standard WooCommerce product CSV columns. A product with alternate units is
// a variable product with one variation per unit; the rest are simple
// products. Images point at the self-hosted copies on the live site.

const WOO_HEADER = [
  "ID",
  "Type",
  "SKU",
  "Name",
  "Published",
  "Is featured?",
  "Visibility in catalog",
  "Short description",
  "Description",
  "Tax status",
  "In stock?",
  "Backorders allowed?",
  "Sold individually?",
  "Allow customer reviews?",
  "Regular price",
  "Categories",
  "Tags",
  "Images",
  "Parent",
  "Attribute 1 name",
  "Attribute 1 value(s)",
  "Attribute 1 visible",
  "Attribute 1 global",
  "Attribute 1 default",
  "Meta: _balm_slug",
  "Meta: _balm_purchasable",
];

const html = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const wooRows = [];
for (const p of products) {
  const c = CATEGORY_BY_SLUG.get(p.categorySlug);
  const variable = p.variations.length > 1;
  const base = {
    ID: "",
    SKU: p.sku,
    Name: p.name,
    Published: 1,
    "Is featured?": 0,
    "Visibility in catalog": "visible",
    "Short description": html(p.shortDescription),
    Description: [
      ...p.description.map((d) => `<p>${html(d)}</p>`),
      p.listingNote ? `<p>${html(p.listingNote)}</p>` : "",
      p.uses.length ? `<h3>Common uses</h3><ul>${p.uses.map((u) => `<li>${html(u)}</li>`).join("")}</ul>` : "",
    ].join(""),
    "Tax status": "taxable",
    "In stock?": p.stockStatus === "instock" ? 1 : 0,
    "Backorders allowed?": 0,
    "Sold individually?": 0,
    "Allow customer reviews?": 0,
    Categories: c.group ? `${c.group} > ${c.name}` : c.name,
    Tags: p.keywords.join(", "),
    Images: p.images.map((i) => `${SITE}${i.src}`).join(", "),
    Parent: "",
    "Attribute 1 name": "Unit",
    "Attribute 1 value(s)": p.variations.map((v) => v.unit).join(", "),
    "Attribute 1 visible": 1,
    "Attribute 1 global": 0,
    "Attribute 1 default": variable ? p.unit : "",
    "Meta: _balm_slug": p.slug,
    "Meta: _balm_purchasable": p.purchasable ? 1 : 0,
  };
  if (!variable) {
    wooRows.push({ ...base, Type: "simple", "Regular price": prices[p.sku] ?? "" });
    continue;
  }
  wooRows.push({ ...base, Type: "variable", "Regular price": "" });
  for (const v of p.variations) {
    wooRows.push({
      ID: "",
      Type: "variation",
      SKU: v.sku,
      Name: `${p.name} - ${v.unit}`,
      Published: 1,
      "Is featured?": 0,
      "Visibility in catalog": "visible",
      "Short description": "",
      Description: "",
      "Tax status": "taxable",
      "In stock?": base["In stock?"],
      "Backorders allowed?": 0,
      "Sold individually?": 0,
      "Allow customer reviews?": 0,
      "Regular price": prices[v.sku] ?? "",
      Categories: "",
      Tags: "",
      Images: "",
      Parent: p.sku,
      "Attribute 1 name": "Unit",
      "Attribute 1 value(s)": v.unit,
      "Attribute 1 visible": "",
      "Attribute 1 global": 0,
      "Attribute 1 default": "",
      "Meta: _balm_slug": "",
      "Meta: _balm_purchasable": "",
    });
  }
}
writeFileSync(join(DATA, "woocommerce-products.csv"), toCsv(WOO_HEADER, wooRows));

// ── 9. Photo report for the owner ──────────────────────────────────────

const needed = products
  .filter((p) => !p.images.length || Math.max(p.images[0].width, p.images[0].height) < SMALL_PHOTO_PX)
  .map((p) => ({
    SKU: p.sku,
    Name: p.name,
    Category: CATEGORY_BY_SLUG.get(p.categorySlug).name,
    "Product page": `${SITE}/products/${p.slug}`,
    Issue: p.images.length ? `Photo is only ${p.images[0].width} x ${p.images[0].height} px` : "No photo",
  }));
writeFileSync(join(DATA, "photos-needed.csv"), toCsv(["SKU", "Name", "Category", "Product page", "Issue"], needed));

// ── Summary ────────────────────────────────────────────────────────────

const withPhoto = products.filter((p) => p.images.length);
const dims = withPhoto.map((p) => `${p.images[0].width}x${p.images[0].height}`);
const dimCounts = dims.reduce((m, d) => ((m[d] = (m[d] ?? 0) + 1), m), {});
const bytes = withPhoto.map((p) => p.images[0].bytes);
console.log(`Products: ${products.length} (from ${published.length} published rows; merged duplicates: ${duplicates.join("; ") || "none"})`);
console.log(`Categories: ${categoriesOut.length}`);
console.log(`Photos self-hosted: ${withPhoto.length}; without a photo: ${products.length - withPhoto.length}`);
console.log(`Photo sizes: ${JSON.stringify(dimCounts)}`);
if (bytes.length) {
  console.log(
    `Photo bytes: min ${Math.min(...bytes)}, max ${Math.max(...bytes)}, total ${bytes.reduce((a, b) => a + b, 0)}`,
  );
}
console.log(`Out of stock: ${products.filter((p) => p.stockStatus === "outofstock").map((p) => p.name).join("; ")}`);
console.log(`Price fixes: ${priceFixes.join("; ") || "none"}`);
console.log(`WooCommerce rows: ${wooRows.length}; photos-needed rows: ${needed.length}`);
