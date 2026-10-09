import { BULK_MATERIAL_LIST } from "@/lib/catalog/bulk.generated";

/**
 * Materials sold loose by the cubic yard: what the coverage calculator can
 * estimate yardage for, and what a /request-quote deep link can pre-select.
 *
 * Generated from the catalog by scripts/build-catalog.mjs (a test checks it
 * matches), and kept separate from the full catalog so the calculator, a
 * client page, does not ship every product to the browser.
 *
 * These carry NO price. The calculator reports yardage only and a real figure
 * comes from the yard on a quote.
 */
export interface BulkMaterial {
  /** Catalog product slug, also the `material` value in /request-quote links. */
  id: string;
  name: string;
  category: string;
}

export const BULK_MATERIALS: readonly BulkMaterial[] = BULK_MATERIAL_LIST;

export function findBulkMaterial(id: string | undefined | null): BulkMaterial | undefined {
  if (!id) return undefined;
  return BULK_MATERIALS.find((m) => m.id === id);
}
