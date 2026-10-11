import { COMPANY } from "@/lib/company";
import {
  CATEGORIES,
  COVERAGE_DEPTHS,
  categoryPath,
  cubicYardCoverage,
  productPath,
  productsIn,
  soldByPhrase,
  stockLabel,
} from "@/lib/catalog";
import { unitPriceLabel, variationPrices } from "@/lib/catalog/pricing";

const BASE = `https://${COMPANY.domain}`;

/**
 * The long-form companion to /llms.txt (llmstxt.org): every published
 * product with its units, retail prices, stock, coverage and uses, so an AI
 * assistant can answer "how much is a yard of black bark in Richmond?" or
 * "how much DG for a 200 sq ft path?" from the source and cite the page.
 * Built from the same catalog as the product pages; never includes cost.
 */
export const dynamic = "force-static";

export function GET() {
  const coverage = COVERAGE_DEPTHS.map((d) => `${d} in deep ≈ ${cubicYardCoverage(d)} sq ft`).join(", ");
  const sections = CATEGORIES.map((c) => {
    const products = productsIn(c.slug)
      .map((p) => {
        const prices = variationPrices(p);
        const lines = [
          `### ${p.name}`,
          "",
          `- URL: ${BASE}${productPath(p.slug)}`,
          `- SKU: ${p.sku}`,
          `- Sold: ${soldByPhrase(p).replace(/^sold /, "")}${p.variations.length > 1 ? ` (also ${p.variations.slice(1).map((v) => v.unit.toLowerCase()).join(", ")})` : ""}`,
          ...(prices ? [`- Price: ${prices.map((x) => unitPriceLabel(x.price, x.unit)).join("; ")} (before tax and delivery)`] : []),
          ...(p.isService ? [] : [`- Availability: ${stockLabel(p.stockStatus)}`]),
          ...(p.soldByCubicYard ? [`- Coverage per cubic yard: ${coverage}`] : []),
          ...(p.uses.length ? [`- Common uses: ${p.uses.join("; ")}`] : []),
          "",
          p.shortDescription,
          ...p.description.map((d) => `\n${d}`),
        ];
        return lines.join("\n");
      })
      .join("\n\n");
    return `## ${c.name}\n\n${BASE}${categoryPath(c.slug)}\n\n${c.intro}\n\n${c.about.join("\n\n")}\n\n${products}`;
  }).join("\n\n");

  const hours = COMPANY.hours.map((h) => `${h.label}: ${h.value}`).join(" · ");
  const body = `# ${COMPANY.legalName} — full product catalog

> ${COMPANY.tagline}

Yard: ${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state} ${COMPANY.address.postalCode} · ${COMPANY.phone} · ${hours}
Delivery: across the Bay Area within about ${COMPANY.serviceRadiusMi} miles; bulk delivery minimum 1 cubic yard; smaller amounts can be picked up.
Ordering: request a quote at ${BASE}/request-quote or call. Prices below are retail, before sales tax and delivery.
Half and quarter cubic yards, where offered, are priced as listed per product.

Coverage rule for bulk material: one cubic yard is 27 cubic feet; ${coverage}.

${sections}
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
