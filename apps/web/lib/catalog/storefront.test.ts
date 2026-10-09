import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { SHOW_PRICES } from "@/lib/storefront";
import { CATEGORIES, PRODUCTS, toCard } from "./index";
import { basePriceLabel, variationPrices } from "./pricing";
import { RETAIL_PRICES } from "./prices.generated";
import { productJsonLd, productMetadata } from "./seo";

const WEB = join(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const pricesOf = (sku: string) =>
  PRODUCTS.find((p) => p.sku === sku)!.variations.map((v) => RETAIL_PRICES[v.sku]).filter((n): n is number => typeof n === "number");

describe("storefront switch", () => {
  it("defaults to prices off", () => {
    expect(SHOW_PRICES).toBe(false);
  });

  it("OFF: no price, offer or figure in any public data", () => {
    for (const p of PRODUCTS) {
      expect(variationPrices(p, false)).toBeNull();
      expect(basePriceLabel(p, false)).toBeNull();
      const ld = JSON.stringify(productJsonLd(p, false));
      expect(ld).not.toContain("offers");
      expect(ld).not.toContain("priceCurrency");
      const publicText = JSON.stringify([p, toCard(p, basePriceLabel(p, false)), productMetadata(p), ld]);
      expect(publicText).not.toMatch(/\$\s?\d/);
      // None of this product's own retail prices appears anywhere in its public data.
      for (const price of pricesOf(p.sku)) expect(publicText).not.toContain(price.toFixed(2));
    }
    expect(JSON.stringify(CATEGORIES)).not.toMatch(/\$\s?\d/);
  });

  it("ON: offers per unit of sale, in USD, with availability and unit", () => {
    const bark = PRODUCTS.find((p) => p.slug === "black-bark")!;
    const ld = productJsonLd(bark, true) as unknown as { offers: Record<string, unknown>[] };
    expect(ld.offers).toHaveLength(bark.variations.length);
    for (const [i, offer] of ld.offers.entries()) {
      expect(offer.priceCurrency).toBe("USD");
      expect(Number(offer.price)).toBeGreaterThan(0);
      expect(offer.availability).toMatch(/^https:\/\/schema\.org\/(InStock|OutOfStock)$/);
      expect((offer.priceSpecification as { unitText: string }).unitText).toBe(bark.variations[i]!.unit);
    }
    expect(basePriceLabel(bark, true)).toMatch(/^\$\d+\.\d{2} \/ cubic yard$/);
  });

  it("keeps retail prices out of every client component", () => {
    const clientFiles = walk(join(WEB, "components"))
      .concat(walk(join(WEB, "app")))
      .filter((f) => /\.tsx?$/.test(f) && !/[\\/](pos|customer-display)[\\/]/.test(f))
      .filter((f) => /^\s*["']use client["']/.test(readFileSync(f, "utf8")));
    for (const f of clientFiles) {
      const src = readFileSync(f, "utf8");
      // Client code may use only the data-free helpers (lib/catalog/shared).
      expect(src, relative(WEB, f)).not.toMatch(/@\/lib\/catalog["']|lib\/catalog\/(pricing|prices\.generated|index|seo|catalog\.generated)/);
    }
  });

  it("no cost figure is ever written into the repository's catalog data", () => {
    const header = readFileSync(join(WEB, "data", "catalog-source.csv"), "utf8").split(/\r?\n/)[0]!.toLowerCase();
    expect(header.split(",")).not.toContain("cost");
  });
});

/**
 * The production build, when one exists: the rendered product pages and the
 * browser bundles must carry no price while the switch is off. Skipped before
 * the first `next build`.
 */
const built = join(WEB, ".next", "server", "app", "products");
describe.skipIf(!existsSync(join(built, "black-bark.html")) || SHOW_PRICES)("built output with prices off", () => {
  it("has no price or offer in any product, category or catalog page", () => {
    const pages = walk(built).filter((f) => f.endsWith(".html"));
    expect(pages.length).toBeGreaterThan(PRODUCTS.length);
    for (const f of pages) {
      const html = readFileSync(f, "utf8");
      expect(html, f).not.toMatch(/\$\s?\d+\.\d{2}/);
      expect(html, f).not.toContain("priceCurrency");
      expect(html, f).not.toContain('"offers"');
    }
  });

  it("ships no price table to the browser", () => {
    const chunks = walk(join(WEB, ".next", "static")).filter((f) => f.endsWith(".js"));
    const someVariationSku = PRODUCTS.find((p) => p.variations.length > 1)!.variations[1]!.sku;
    for (const f of chunks) expect(readFileSync(f, "utf8"), f).not.toContain(`"${someVariationSku}":`);
  });
});
