import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { parseCsv } from "@/lib/csv";
import {
  CATEGORIES,
  PRODUCTS,
  categoryOf,
  cubicYardCoverage,
  displayImages,
  getProduct,
  getProductBySku,
  productsIn,
} from "./index";
import { resolveQuotePrefill } from "./quote";
import {
  breadcrumbJsonLd,
  productCrumbs,
  productDescription,
  productFaqs,
  productJsonLd,
  productMetadata,
  productTitle,
} from "./seo";

const WEB = join(__dirname, "..", "..");
const lock = JSON.parse(readFileSync(join(WEB, "data", "catalog-lock.json"), "utf8")) as {
  products: Record<string, { slug: string; sku: string }>;
};

describe("catalog data", () => {
  it("lists every published sheet row, with the duplicate merged", () => {
    const source = parseCsv(readFileSync(join(WEB, "data", "catalog-source.csv"), "utf8"));
    const names = new Set(source.map((r) => r.name!.replace(/\s+/g, " ").trim().toLowerCase()));
    expect(PRODUCTS.length).toBe(names.size);
    expect(PRODUCTS.length).toBeGreaterThan(150);
  });

  it("has clean, unique slugs and SKUs", () => {
    const slugs = PRODUCTS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) {
      expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s).not.toBe("category");
    }
    // A one-unit product's only variation shares its SKU; otherwise every
    // variation has its own.
    const skus = PRODUCTS.flatMap((p) => (p.variations.length > 1 ? [p.sku, ...p.variations.map((v) => v.sku)] : [p.sku]));
    expect(new Set(skus).size).toBe(skus.length);
    for (const p of PRODUCTS.filter((x) => x.variations.length === 1)) expect(p.variations[0]!.sku).toBe(p.sku);
  });

  it("keeps slugs and SKUs stable: every product matches its lock entry", () => {
    const locked = new Map(Object.values(lock.products).map((e) => [e.slug, e.sku]));
    for (const p of PRODUCTS) expect(locked.get(p.slug)).toBe(p.sku);
    // A few published URLs pinned explicitly, so a rule change can't move them.
    expect(getProduct("black-bark")?.sku).toBe("BALM-BRK-001");
    expect(getProduct("drain-rock-3-4-in")?.name).toBe('Drain Rock 3/4"');
    expect(getProductBySku("BALM-BRK-001-HALF")?.slug).toBe("black-bark");
  });

  it("puts every product in a known category, and every category has products", () => {
    for (const p of PRODUCTS) expect(categoryOf(p)).toBeTruthy();
    for (const c of CATEGORIES) {
      expect(c.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(productsIn(c.slug).length).toBeGreaterThan(0);
    }
  });

  it("serves every image from this site, and every file exists", () => {
    for (const p of PRODUCTS) {
      for (const img of [...p.images, ...displayImages(p)]) {
        expect(img.src).toMatch(/^\/catalog\//);
        expect(existsSync(join(WEB, "public", img.src))).toBe(true);
      }
      expect(existsSync(join(WEB, "public", p.placeholder))).toBe(true);
    }
    expect(JSON.stringify(PRODUCTS)).not.toMatch(/https?:\/\//);
  });

  it("marks only cubic-yard products for coverage, and the arithmetic is right", () => {
    expect(cubicYardCoverage(2)).toBe(162);
    expect(cubicYardCoverage(3)).toBe(108);
    for (const p of PRODUCTS) expect(p.soldByCubicYard).toBe(p.unit === "Cubic Yard");
  });
});

describe("product page metadata", () => {
  it("gives every product a unique title of at most 60 characters", () => {
    const titles = PRODUCTS.map(productTitle);
    expect(new Set(titles).size).toBe(titles.length);
    for (const t of titles) expect(t.length).toBeLessThanOrEqual(60);
  });

  it("gives every product a unique description of about 140-160 characters", () => {
    const descriptions = PRODUCTS.map(productDescription);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const d of descriptions) {
      expect(d.length).toBeLessThanOrEqual(160);
      expect(d.length).toBeGreaterThanOrEqual(110);
    }
  });

  it("has canonical, Open Graph, Twitter and keywords on every product", () => {
    for (const p of PRODUCTS) {
      const m = productMetadata(p);
      expect(m.alternates?.canonical).toBe(`/products/${p.slug}`);
      expect(m.keywords && (m.keywords as string[]).length).toBeGreaterThanOrEqual(4);
      expect(m.openGraph?.title).toBeTruthy();
      expect(m.openGraph?.description).toBeTruthy();
      expect(m.twitter).toBeTruthy();
      const og = m.openGraph as { images?: { url: string }[] };
      // The product photo, or the site's default card: never another host.
      expect(og.images?.[0]?.url).toBe(p.images.length ? p.images[0]!.src : "/opengraph-image");
    }
  });

  it("emits Product, BreadcrumbList and FAQPage data for every product", () => {
    for (const p of PRODUCTS) {
      const ld = productJsonLd(p, false);
      expect(ld["@type"]).toBe("Product");
      expect(ld.name).toBe(p.name);
      expect(ld.sku).toBe(p.sku);
      expect(ld.url).toBe(`https://bayarealandscapingmaterials.com/products/${p.slug}`);
      expect(ld.category).toContain(categoryOf(p).name);
      expect(ld.description.length).toBeGreaterThan(50);
      const crumbs = breadcrumbJsonLd(productCrumbs(p));
      expect(crumbs.itemListElement).toHaveLength(4);
      const faqs = productFaqs(p);
      expect(faqs.length).toBeGreaterThanOrEqual(2);
      // Prices off: no figure anywhere in the answers.
      for (const f of productFaqs(p, false)) expect(f.a).not.toMatch(/\$\s?\d/);
    }
  });
});

describe("sitemap", () => {
  it("lists every product and category page", () => {
    const urls = new Set(sitemap().map((e) => e.url));
    for (const p of PRODUCTS) expect(urls.has(`https://bayarealandscapingmaterials.com/products/${p.slug}`)).toBe(true);
    for (const c of CATEGORIES) {
      expect(urls.has(`https://bayarealandscapingmaterials.com/products/category/${c.slug}`)).toBe(true);
    }
  });
});

describe("request-quote prefill", () => {
  it("fills product, unit and quantity from a product page link", () => {
    expect(resolveQuotePrefill({ product: "black-bark", unit: "Half Cubic Yard", quantity: "2" })).toEqual({
      material: "Black Bark (Half Cubic Yard)",
      quantity: "2 half cubic yards",
      label: "Black Bark (Half Cubic Yard)",
    });
  });
  it("still honours calculator and SKU links", () => {
    expect(resolveQuotePrefill({ material: "black-bark", quantity: "4" })?.quantity).toBe("4 cubic yards");
    expect(resolveQuotePrefill({ sku: "BALM-BRK-001-QTR", yards: "1" })?.material).toBe("Black Bark (Quarter Cubic Yard)");
  });
  it("ignores unknown products, units and junk quantities", () => {
    expect(resolveQuotePrefill({ product: "nope" })).toBeNull();
    expect(resolveQuotePrefill({ product: "black-bark", unit: "Truckload" })?.material).toBe("Black Bark (Cubic Yard)");
    expect(resolveQuotePrefill({ product: "black-bark", quantity: "-3" })?.quantity).toBe("");
    expect(resolveQuotePrefill({ product: "black-bark", quantity: "1e9" })?.quantity).toBe("");
  });
});
