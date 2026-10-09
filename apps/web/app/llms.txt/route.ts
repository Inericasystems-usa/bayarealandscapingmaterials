import { COMPANY } from "@/lib/company";
import { CATEGORIES, categoryPath, productPath, productsIn, soldByPhrase } from "@/lib/catalog";

const BASE = `https://${COMPANY.domain}`;

// llmstxt.org GEO brief: concise business facts AI search engines (ChatGPT,
// Perplexity, Claude, Google AI) read to answer questions about Bay Area
// Landscaping Materials and cite it. Works because the site is server-rendered.
export const dynamic = "force-static";

export function GET() {
  const hours = COMPANY.hours.map((h) => `${h.label}: ${h.value}`).join(" · ");
  const catalog = CATEGORIES.map((c) => {
    const items = productsIn(c.slug)
      .map((p) => `  - [${p.name}](${BASE}${productPath(p.slug)}): ${soldByPhrase(p)}`)
      .join("\n");
    return `### [${c.name}](${BASE}${categoryPath(c.slug)})\n\n${c.intro}\n\n${items}`;
  }).join("\n\n");

  const body = `# ${COMPANY.legalName}

> ${COMPANY.tagline}

## About

${COMPANY.legalName} is a landscape-materials supplier in ${COMPANY.address.city}, ${COMPANY.address.state},
serving contractors and homeowners across the East Bay and greater San Francisco
Bay Area. Bulk materials are sold by the cubic yard (with half and quarter yards
for many), stone by the pound, and hardscape, turf and supplies by the piece,
pallet or square foot, with pickup or delivery. Prices are quoted on request.

- Phone: ${COMPANY.phone}
- Email: ${COMPANY.email}
- Address: ${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state} ${COMPANY.address.postalCode}
- Hours: ${hours}
- Delivery radius: about ${COMPANY.serviceRadiusMi} miles (beyond is custom-quote)

## How it works

Use the online coverage calculator to estimate how much bulk material you need
(one cubic yard covers about 162 sq ft at 2 inches deep, 108 sq ft at 3 inches),
then request a quote, pick up at the yard or schedule delivery. Contractor
accounts are available.

## Key pages

- [Products](${BASE}/products) — the full catalog, with a page for every product
- [Coverage Calculator](${BASE}/calculator) — how much material you need
- [Yard Size Guide](${BASE}/yard-size-guide)
- [Delivery](${BASE}/delivery) — areas, fees, scheduling
- [Service Area](${BASE}/service-area)
- [Request a Quote](${BASE}/request-quote)
- [Contact](${BASE}/contact)

## Product catalog

${catalog}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
