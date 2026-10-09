import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { CatalogBrowser } from "@/components/catalog/CatalogBrowser";
import { JsonLd } from "@/components/catalog/JsonLd";
import { CATEGORIES, PRODUCTS, categoryPath, productsIn, toCard } from "@/lib/catalog";
import { basePriceLabel } from "@/lib/catalog/pricing";
import { breadcrumbJsonLd, collectionJsonLd } from "@/lib/catalog/seo";

const TITLE = "Landscape Supplies & Materials Catalog | Richmond, CA";
const DESCRIPTION = `Browse ${PRODUCTS.length} landscape products: bark, decorative rock, flagstone, pavers, wall block, turf, sealers and tools. Pickup in Richmond, CA or Bay Area delivery.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  keywords: [
    "landscape supply Richmond CA",
    "landscaping materials Bay Area",
    "bulk bark and rock East Bay",
    "flagstone and pavers Richmond",
    "landscape supply yard",
  ],
  alternates: { canonical: "/products" },
  openGraph: { title: TITLE, description: DESCRIPTION, url: "/products" },
};

export default function ProductsPage() {
  const cards = PRODUCTS.map((p) => toCard(p, basePriceLabel(p)));
  const categories = CATEGORIES.map((c) => ({ slug: c.slug, name: c.name, count: productsIn(c.slug).length }));

  return (
    <PageShell>
      <JsonLd data={collectionJsonLd("Product catalog", "/products", DESCRIPTION, PRODUCTS)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Home", path: "/" },
          { name: "Products", path: "/products" },
        ])}
      />
      <PageHero
        eyebrow="Browse Our Catalog"
        title="Our Products"
        subtitle="Bulk landscape materials, stone, hardscape and supplies, by the cubic yard, pound, pallet or piece, for pickup or delivery across the Bay Area."
      >
        <nav aria-label="Product categories">
          <ul className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <li key={c.slug}>
                <Link
                  href={categoryPath(c.slug)}
                  className="inline-flex rounded-full border border-[var(--color-moss-300)] bg-[var(--color-bg-elevated)] px-3.5 py-1.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:border-[var(--color-action)] hover:text-[var(--color-text-brand)]"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </PageHero>

      <Section density="default" containerSize="wide">
        <CatalogBrowser cards={cards} categories={categories} />
      </Section>

      <Section tone="brand" density="compact">
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-3xl font-light tracking-tight text-white md:text-4xl">
              Not sure how much you need?
            </h2>
            <p className="mt-3 text-lg text-[var(--color-moss-100)]">
              Use the yardage calculator, or call the yard and we&apos;ll work it out with you.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/calculator"
              className="inline-flex items-center rounded-full bg-white px-7 py-3.5 font-semibold text-[var(--color-moss-950)] shadow-[var(--shadow-md)] transition-colors duration-200 hover:bg-[var(--color-moss-100)]"
            >
              Open calculator
            </Link>
            <Link
              href="/request-quote"
              className="inline-flex items-center rounded-full border border-white/40 px-7 py-3.5 font-semibold text-white transition-colors duration-200 hover:bg-white/10"
            >
              Request Quote
            </Link>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
