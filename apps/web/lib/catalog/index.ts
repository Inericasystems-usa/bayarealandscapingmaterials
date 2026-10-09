import { CATEGORIES, PRODUCTS } from "./catalog.generated";
import { type CatalogCard, type DisplayImage } from "./shared";
import type { CatalogCategory, CatalogProduct } from "./types";

/**
 * The public product catalog: the products published to the storefront in the
 * Flint POS export, generated into catalog.generated.ts by
 * scripts/build-catalog.mjs. Every public page reads it from here; nothing on
 * the public site calls the POS API for products.
 *
 * Carries no prices (see pricing.ts and lib/storefront.ts).
 */

export { CATEGORIES, PRODUCTS };
export { productPath, categoryPath, quotePath, stockLabel, type CatalogCard, type DisplayImage } from "./shared";
export type { CatalogCategory, CatalogProduct, CatalogImage, CatalogVariation, StockStatus } from "./types";

const BY_SLUG = new Map(PRODUCTS.map((p) => [p.slug, p]));
const BY_SKU = new Map(PRODUCTS.flatMap((p) => [[p.sku, p] as const, ...p.variations.map((v) => [v.sku, p] as const)]));
const CATEGORY_BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function getProduct(slug: string | undefined | null): CatalogProduct | undefined {
  return slug ? BY_SLUG.get(slug) : undefined;
}

/** A product by its SKU or one of its variation SKUs. */
export function getProductBySku(sku: string | undefined | null): CatalogProduct | undefined {
  return sku ? BY_SKU.get(sku.trim().toUpperCase()) : undefined;
}

export function getCategory(slug: string | undefined | null): CatalogCategory | undefined {
  return slug ? CATEGORY_BY_SLUG.get(slug) : undefined;
}

/** The category a product belongs to. Every generated product has one. */
export function categoryOf(product: CatalogProduct): CatalogCategory {
  const c = CATEGORY_BY_SLUG.get(product.categorySlug);
  if (!c) throw new Error(`Unknown category ${product.categorySlug}`);
  return c;
}

export function productsIn(categorySlug: string): CatalogProduct[] {
  return PRODUCTS.filter((p) => p.categorySlug === categorySlug);
}

/** Other products from the same category, those with photos first. */
export function relatedProducts(product: CatalogProduct, count = 4): CatalogProduct[] {
  const same = productsIn(product.categorySlug).filter((p) => p.slug !== product.slug);
  const withPhoto = same.filter((p) => p.images.length);
  const without = same.filter((p) => !p.images.length);
  return [...withPhoto, ...without].slice(0, count);
}

/** The product's photos, or the generic category image when it has none. */
export function displayImages(product: CatalogProduct): DisplayImage[] {
  if (product.images.length) {
    return product.images.map(({ src, width, height, alt }) => ({ src, width, height, alt, isPlaceholder: false }));
  }
  const category = categoryOf(product);
  return [
    {
      src: product.placeholder,
      width: 1200,
      height: 1200,
      alt: `No photo of ${product.name} yet: generic ${category.name} image`,
      isPlaceholder: true,
    },
  ];
}

/**
 * Approximate area one cubic yard covers at a given depth. Pure arithmetic: a
 * cubic yard is 27 cubic feet, so at d inches it covers 27 x 12 / d square feet.
 */
export function cubicYardCoverage(depthInches: number): number {
  return Math.round((27 * 12) / depthInches);
}

export const COVERAGE_DEPTHS = [2, 3] as const;

/** "sold by the cubic yard", "sold individually", ... */
export function soldByPhrase(product: CatalogProduct): string {
  if (product.isService) return product.unit === "Ton" ? "charged by the ton" : "booked by calling the yard";
  if (product.unit === "Each") return "sold individually";
  return `sold by the ${product.unit.toLowerCase()}`;
}

/** Lower-cased text a search matches against. */
export function searchText(product: CatalogProduct): string {
  const category = categoryOf(product);
  return [product.name, product.sku, product.keyword, category.name, product.listingNote, product.shortDescription]
    .join(" ")
    .toLowerCase();
}

export function toCard(product: CatalogProduct, priceLabel: string | null = null): CatalogCard {
  const category = categoryOf(product);
  return {
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    categorySlug: product.categorySlug,
    categoryName: category.name,
    unit: product.unit,
    soldBy: soldByPhrase(product),
    image: displayImages(product)[0]!,
    stockStatus: product.stockStatus,
    isService: product.isService,
    search: searchText(product),
    priceLabel,
  };
}
