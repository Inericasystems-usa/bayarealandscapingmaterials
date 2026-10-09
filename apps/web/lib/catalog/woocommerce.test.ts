import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csv";
import { PRODUCTS } from "./index";
import { RETAIL_PRICES } from "./prices.generated";

/**
 * data/woocommerce-products.csv, written by scripts/build-catalog.mjs, imports
 * the whole catalog into WooCommerce (Products > Import). These checks keep it
 * importable and safe: every product present, variations under the right
 * parent, no cost column, and images on our own host.
 */

const WEB = join(__dirname, "..", "..");
const raw = readFileSync(join(WEB, "data", "woocommerce-products.csv"), "utf8");
const header = raw.split(/\r?\n/)[0]!.split(",").map((h) => h.trim());
// parseCsv lower-cases the column names.
const rows = parseCsv(raw);
const col = (r: Record<string, string>, name: string) => r[name.toLowerCase()] ?? "";

describe("WooCommerce import CSV", () => {
  it("uses WooCommerce's standard column names and has no cost column", () => {
    for (const name of [
      "ID",
      "Type",
      "SKU",
      "Name",
      "Published",
      "Short description",
      "Description",
      "Regular price",
      "Categories",
      "Tags",
      "Images",
      "Parent",
      "Attribute 1 name",
      "Attribute 1 value(s)",
      "Attribute 1 visible",
      "Attribute 1 global",
      "In stock?",
    ]) {
      expect(header).toContain(name);
    }
    expect(header.map((h) => h.toLowerCase())).not.toContain("cost");
    expect(raw.toLowerCase()).not.toMatch(/(^|,)"?cost"?(,|$)/m);
  });

  it("has every published product exactly once as a simple or variable product", () => {
    const parents = rows.filter((r) => col(r, "Type") !== "variation");
    expect(parents).toHaveLength(PRODUCTS.length);
    const bySku = new Map(parents.map((r) => [col(r, "SKU"), r]));
    for (const p of PRODUCTS) {
      const r = bySku.get(p.sku);
      expect(r, p.sku).toBeTruthy();
      expect(col(r!, "Name")).toBe(p.name);
      expect(col(r!, "Type")).toBe(p.variations.length > 1 ? "variable" : "simple");
      expect(col(r!, "Meta: _balm_slug")).toBe(p.slug);
      expect(col(r!, "In stock?")).toBe(p.stockStatus === "instock" ? "1" : "0");
    }
  });

  it("parents every variation to a variable product, one per unit of sale", () => {
    const variable = new Map(rows.filter((r) => col(r, "Type") === "variable").map((r) => [col(r, "SKU"), r]));
    const variations = rows.filter((r) => col(r, "Type") === "variation");
    expect(variations.length).toBeGreaterThan(0);
    for (const v of variations) {
      const parent = variable.get(col(v, "Parent"));
      expect(parent, col(v, "SKU")).toBeTruthy();
      expect(col(parent!, "Attribute 1 value(s)").split(", ")).toContain(col(v, "Attribute 1 value(s)"));
    }
    for (const p of PRODUCTS.filter((x) => x.variations.length > 1)) {
      const mine = variations.filter((v) => col(v, "Parent") === p.sku);
      expect(mine.map((v) => col(v, "SKU"))).toEqual(p.variations.map((v) => v.sku));
    }
  });

  it("carries the retail price on simple products and variations only", () => {
    for (const r of rows) {
      const type = col(r, "Type");
      const price = col(r, "Regular price");
      if (type === "variable") expect(price).toBe("");
      else {
        const expected = RETAIL_PRICES[col(r, "SKU")];
        expect(price).toBe(expected === null || expected === undefined ? "" : String(expected));
      }
    }
  });

  it("points every image at a self-hosted copy on the live site", () => {
    for (const r of rows) {
      const images = col(r, "Images");
      if (!images) continue;
      for (const url of images.split(", ")) {
        expect(url).toMatch(/^https:\/\/bayarealandscapingmaterials\.com\/catalog\/[a-z0-9-]+\.(webp|jpg|png)$/);
        expect(existsSync(join(WEB, "public", new URL(url).pathname))).toBe(true);
      }
    }
  });
});
