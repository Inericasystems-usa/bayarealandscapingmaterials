import type { StockStatus } from "./types";

/**
 * Catalog helpers with no catalog data behind them, so client components can
 * import them without pulling the whole product list into the browser bundle.
 */

export function productPath(slug: string): `/products/${string}` {
  return `/products/${slug}`;
}

export function categoryPath(slug: string): `/products/category/${string}` {
  return `/products/category/${slug}`;
}

export function stockLabel(status: StockStatus): string {
  // Out of stock in the POS often means "not counted yet" for bulk material,
  // so the site asks the buyer to check rather than turning them away.
  return status === "instock" ? "In stock" : "Call for availability";
}

export interface DisplayImage {
  src: string;
  width: number;
  height: number;
  alt: string;
  /** True for the generic category image shown while a product has no photo. */
  isPlaceholder: boolean;
  /** "studio" render, "in-use" example scene, or (absent) a photo from the yard. */
  kind?: "studio" | "in-use";
}

/** The light, price-free shape the client-side grids receive. */
export interface CatalogCard {
  slug: string;
  sku: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  unit: string;
  soldBy: string;
  image: DisplayImage;
  /** "cover" fills the tile (loose material, renders); "contain" keeps a packaged product whole. */
  fill: "cover" | "contain";
  /** A second picture the card fades to on hover (the in-use scene when there is one). */
  hoverImage: DisplayImage | null;
  /** Everyday core material (demand tier from the asset manifest). */
  core: boolean;
  /** Demand rank, for the "Popular" sort; null when unranked. */
  rank: number | null;
  stockStatus: StockStatus;
  isService: boolean;
  search: string;
  /** Formatted base price, only when the storefront switch shows prices. */
  priceLabel: string | null;
  /** The same base price as a number, for sorting; null when not shown. */
  price: number | null;
}

/** /request-quote with the product, unit and quantity filled in. */
export function quotePath(slug: string, unit?: string, quantity?: number | string): string {
  const params = new URLSearchParams({ product: slug });
  if (unit) params.set("unit", unit);
  if (quantity !== undefined && quantity !== "") params.set("quantity", String(quantity));
  return `/request-quote?${params.toString()}`;
}
