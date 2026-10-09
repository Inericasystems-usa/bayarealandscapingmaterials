import { findBulkMaterial } from "@/lib/bulk-materials";
import { getProduct, getProductBySku } from "./index";

/**
 * Turns /request-quote query parameters into the quote form's prefill.
 *
 *   ?product=<slug>&unit=<unit>&quantity=<n>   a product page's "Request a quote"
 *   ?material=<slug>&quantity=<yards>          the coverage calculator
 *   ?sku=<SKU>&yards=<n>                       older links, by SKU
 *
 * Unknown products, units or junk quantities fall through to an empty field
 * rather than echoing raw input into the form.
 */

export interface QuotePrefill {
  material: string;
  quantity: string;
  /** "Black Bark" or "Black Bark (Half Cubic Yard)", for the form's intro line. */
  label: string;
}

function cleanQuantity(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return null;
  return Math.round(n * 100) / 100;
}

function quantityText(n: number | null, unit: string, unitPlural: string): string {
  if (n === null) return "";
  if (unit === "Each") return String(n);
  return `${n} ${n === 1 ? unit.toLowerCase() : unitPlural}`;
}

export function resolveQuotePrefill(params: {
  product?: string;
  unit?: string;
  quantity?: string;
  material?: string;
  sku?: string;
  yards?: string;
}): QuotePrefill | null {
  const qty = cleanQuantity(params.quantity ?? params.yards);

  const product = getProduct(params.product);
  if (product) {
    const variation = product.variations.find((v) => v.unit === params.unit) ?? product.variations[0]!;
    const label = product.variations.length > 1 ? `${product.name} (${variation.unit})` : product.name;
    return { material: label, quantity: quantityText(qty, variation.unit, variation.unitPlural), label };
  }

  const bulk = findBulkMaterial(params.material);
  if (bulk) {
    return { material: bulk.name, quantity: quantityText(qty, "Cubic Yard", "cubic yards"), label: bulk.name };
  }

  const bySku = getProductBySku(params.sku);
  if (bySku) {
    const variation = bySku.variations.find((v) => v.sku === params.sku?.trim().toUpperCase()) ?? bySku.variations[0]!;
    const label = bySku.variations.length > 1 ? `${bySku.name} (${variation.unit})` : bySku.name;
    return { material: label, quantity: quantityText(qty, variation.unit, variation.unitPlural), label };
  }

  return null;
}
