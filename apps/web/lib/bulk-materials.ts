import { products } from "@/lib/products";

/**
 * Materials sold loose by the cubic yard — what the coverage calculator can
 * estimate yardage for, and what a /request-quote deep link can pre-select.
 *
 * Derived from the catalog (lib/products.ts) rather than duplicated, so the
 * calculator always offers exactly what the yard sells. The catalog is the
 * source of truth and this is a read of it, never a second copy.
 *
 * These carry NO price. Pricing is not published anywhere on the site — every
 * product reads "Contact for pricing" — so the calculator reports yardage only
 * and a real figure comes from the yard on a quote. Nothing here may grow a
 * dollar field again without the catalog publishing one first: an invented
 * number would land in front of a customer AND in what we report to Google.
 */
export interface BulkMaterial {
  /** Catalog product id — also the `material` slug in /request-quote links. */
  id: string;
  name: string;
  category: string;
}

export const BULK_MATERIALS: readonly BulkMaterial[] = products
  .filter((p) => p.soldByCubicYard === true)
  .map((p) => ({ id: p.id, name: p.name, category: p.category }))
  .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

export function findBulkMaterial(id: string | undefined | null): BulkMaterial | undefined {
  if (!id) return undefined;
  return BULK_MATERIALS.find((m) => m.id === id);
}
