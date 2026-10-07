import { COMPANY } from "@/lib/company";
import { products } from "@/lib/products";

const BASE = `https://${COMPANY.domain}`;

// llmstxt.org GEO brief: concise business facts AI search engines (ChatGPT,
// Perplexity, Claude, Google AI) read to answer questions about Bay Area
// Landscaping Materials and cite it. Works because the site is server-rendered.
export const dynamic = "force-static";

export function GET() {
  const categories = Array.from(new Set(products.map((p) => p.category)));
  const catList = categories.map((c) => `- ${c}`).join("\n");
  const hours = COMPANY.hours.map((h) => `${h.label}: ${h.value}`).join(" · ");

  const body = `# ${COMPANY.legalName}

> ${COMPANY.tagline}

## About

${COMPANY.legalName} is a bulk landscape-materials supplier in ${COMPANY.address.city}, ${COMPANY.address.state},
serving contractors and homeowners across the East Bay and greater San Francisco
Bay Area. We sell by the cubic yard with pickup or delivery, and offer contractor
accounts.

- Phone: ${COMPANY.phone}
- Email: ${COMPANY.email}
- Address: ${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state} ${COMPANY.address.postalCode}
- Hours: ${hours}
- Delivery radius: about ${COMPANY.serviceRadiusMi} miles (beyond is custom-quote)

## Product categories

${catList}

## How it works

Materials are sold in bulk by volume (cubic yards). Use the online coverage
calculator to estimate how much you need, then pick up at the yard or schedule
delivery. Contractor accounts get account pricing and terms.

## Key pages

- [Products](${BASE}/products) — full material catalog and pricing
- [Coverage Calculator](${BASE}/calculator) — how much material you need
- [Yard Size Guide](${BASE}/yard-size-guide)
- [Delivery](${BASE}/delivery) — areas, fees, scheduling
- [Service Area](${BASE}/service-area)
- [Request a Quote](${BASE}/request-quote)
- [Contact](${BASE}/contact)
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
