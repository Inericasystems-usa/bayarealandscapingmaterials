import { SHOW_PRICES } from "@/lib/storefront";
import { RETAIL_PRICES } from "./prices.generated";
import { toCard } from "./index";
import type { CatalogCard } from "./shared";
import type { CatalogProduct } from "./types";

/**
 * The only reader of the retail prices. Server code only: a client component
 * must receive the formatted result as a prop, and only when prices are on.
 *
 * Every function takes `showPrices` (defaulting to the storefront switch) so
 * tests can check both states; with prices off nothing here returns a figure.
 */

export interface VariationPrice {
  sku: string;
  unit: string;
  price: number;
}

/** Retail price per unit of sale, or null while prices are off or unknown. */
export function variationPrices(
  product: CatalogProduct,
  showPrices: boolean = SHOW_PRICES,
): VariationPrice[] | null {
  if (!showPrices) return null;
  const out: VariationPrice[] = [];
  for (const v of product.variations) {
    const price = RETAIL_PRICES[v.sku];
    if (typeof price === "number" && price > 0) out.push({ sku: v.sku, unit: v.unit, price });
  }
  return out.length ? out : null;
}

export function formatPrice(price: number): string {
  return `$${price.toFixed(2)}`;
}

/** "$41.99 / cubic yard" */
export function unitPriceLabel(price: number, unit: string): string {
  return `${formatPrice(price)} / ${unit.toLowerCase()}`;
}

/** Card label for the base unit, or null while prices are off. */
export function basePriceLabel(product: CatalogProduct, showPrices: boolean = SHOW_PRICES): string | null {
  const prices = variationPrices(product, showPrices);
  const base = prices?.find((p) => p.unit === product.unit) ?? prices?.[0];
  return base ? unitPriceLabel(base.price, base.unit) : null;
}

/** A grid card with its base price (label and number) when prices are shown. */
export function pricedCard(product: CatalogProduct, showPrices: boolean = SHOW_PRICES): CatalogCard {
  const prices = variationPrices(product, showPrices);
  const base = prices?.find((p) => p.unit === product.unit) ?? prices?.[0];
  return toCard(product, base ? unitPriceLabel(base.price, base.unit) : null, base?.price ?? null);
}
