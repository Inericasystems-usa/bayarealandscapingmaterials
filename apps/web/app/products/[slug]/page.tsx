import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowDown, ArrowRight, Calculator, CheckCircle2, Layers, MapPin, Package, Sparkles, Truck, Weight } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { Section } from "@/components/Section";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { JsonLd } from "@/components/catalog/JsonLd";
import { ProductCard, StockBadge } from "@/components/catalog/ProductCard";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { PurchasePanel, type PanelVariation } from "@/components/catalog/PurchasePanel";
import { ProductViewTracker } from "@/components/catalog/ProductViewTracker";
import { ProductCalculator } from "@/components/catalog/ProductCalculator";
import { planFor, type PriceInfo } from "@/lib/catalog/estimate";
import { COMPANY } from "@/lib/company";
import {
  COVERAGE_DEPTHS,
  PRODUCTS,
  categoryOf,
  categoryPath,
  cubicYardCoverage,
  displayImages,
  getProduct,
  quotePath,
  relatedProducts,
  soldByPhrase,
} from "@/lib/catalog";
import { basePriceLabel, unitPriceLabel, variationPrices, pricedCard } from "@/lib/catalog/pricing";
import {
  breadcrumbJsonLd,
  faqJsonLd,
  productCrumbs,
  productFaqs,
  productJsonLd,
  productMetadata,
} from "@/lib/catalog/seo";
import type { Route } from "next";

// One static page per published product; any other slug is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const product = getProduct((await params).slug);
  return product ? productMetadata(product) : {};
}

export default async function ProductPage({ params }: PageProps) {
  const product = getProduct((await params).slug);
  if (!product) notFound();

  const category = categoryOf(product);
  const images = displayImages(product);
  const faqs = productFaqs(product);
  const crumbs = productCrumbs(product);
  const related = relatedProducts(product, 4);

  // Prices reach the page only when lib/storefront.ts turns them on.
  const prices = variationPrices(product);
  const variations: PanelVariation[] = product.variations.map((v) => {
    const price = prices?.find((p) => p.sku === v.sku);
    return {
      sku: v.sku,
      unit: v.unit,
      unitPlural: v.unitPlural,
      ...(price ? { priceLabel: unitPriceLabel(price.price, v.unit) } : {}),
    };
  });

  const plan = planFor({
    name: product.name,
    categorySlug: product.categorySlug,
    unit: product.unit,
    isService: product.isService,
    variationUnits: product.variations.map((v) => v.unit),
  });
  const basePrice = prices?.find((p) => p.unit === product.unit) ?? null;
  const priceInfo: PriceInfo | null = basePrice
    ? { unit: product.unit, unitPlural: product.unitPlural, price: basePrice.price }
    : null;
  const headlinePrice = basePriceLabel(product);
  const core = product.tier === "core";

  // At-a-glance facts, only ones the site can state.
  const facts: { Icon: typeof Package; label: string; value: string }[] = [
    { Icon: Package, label: "Sold", value: soldByPhrase(product).replace(/^sold /, "") },
    ...(product.soldByCubicYard
      ? [
          { Icon: Layers, label: "1 yd³ covers", value: `~${cubicYardCoverage(3)} sq ft at 3″` },
          ...(plan && plan.kind === "volume"
            ? [{ Icon: Weight, label: "Weight", value: `~${plan.tonsPerYard} t per yd³` }]
            : []),
        ]
      : []),
    { Icon: Truck, label: "Delivery", value: `Up to ~${COMPANY.serviceRadiusMi} mi` },
  ];

  const otherUnits = product.variations.slice(1).map((v) => v.unit);
  const details: [string, string][] = [
    ["SKU", product.sku],
    ["Category", category.group ? `${category.group} › ${category.name}` : category.name],
    ["Unit of sale", product.unit],
    ...(otherUnits.length ? ([["Also sold by", otherUnits.join(", ")]] as [string, string][]) : []),
    ...(product.listingNote ? ([["From our yard listing", product.listingNote]] as [string, string][]) : []),
    ["Available at", `${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state}`],
  ];

  return (
    <PageShell>
      <JsonLd data={productJsonLd(product)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />
      <JsonLd data={faqJsonLd(faqs)} />
      <ProductViewTracker name={product.name} slug={product.slug} />

      <Section density="compact" containerSize="wide">
        <Breadcrumbs crumbs={crumbs} />

        <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
          <div className="lg:sticky lg:top-28 lg:self-start">
            <ProductGallery images={images} name={product.name} />
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={categoryPath(category.slug)}
                className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--color-text-brand)] hover:underline"
              >
                {category.name}
              </Link>
              {core ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-clay-500)]/10 px-2.5 py-0.5 text-xs font-semibold text-[var(--color-clay-500)]">
                  <Sparkles className="h-3 w-3" aria-hidden />
                  Core material
                </span>
              ) : null}
            </div>
            <h1 className="mt-3 font-display text-[clamp(2rem,4vw,3rem)] font-light leading-[1.05] tracking-tight text-[var(--color-text-primary)]">
              {product.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
              {headlinePrice ? (
                <span className="font-display text-2xl font-medium text-[var(--color-text-primary)]">{headlinePrice}</span>
              ) : null}
              {product.isService ? null : <StockBadge status={product.stockStatus} />}
              <span>
                SKU <span className="font-mono text-[var(--color-text-primary)]">{product.sku}</span>
              </span>
            </div>
            <p className="mt-5 text-lg leading-relaxed text-[var(--color-text-secondary)]">{product.shortDescription}</p>

            <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {facts.map(({ Icon, label, value }) => (
                <div
                  key={label}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 transition-colors hover:border-[var(--color-moss-300)]"
                >
                  <dt className="flex items-center gap-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                    <Icon className="h-3.5 w-3.5 text-[var(--color-text-brand)]" aria-hidden />
                    {label}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--color-text-primary)]">{value}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-7">
              <PurchasePanel
                slug={product.slug}
                variations={variations}
                phone={COMPANY.phone}
                phoneE164={COMPANY.phoneE164}
                isService={product.isService}
              />
            </div>

            {plan ? (
              <a
                href="#calculator"
                className="group mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-text-brand)] hover:text-[var(--color-action-hover)]"
              >
                <Calculator className="h-4 w-4" aria-hidden />
                Work out how much {product.name} you need
                <ArrowDown className="h-4 w-4 transition-transform group-hover:translate-y-0.5" aria-hidden />
              </a>
            ) : null}

            <ul className="mt-6 space-y-2.5 text-sm text-[var(--color-text-secondary)]">
              <li className="flex gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 flex-none text-[var(--color-text-brand)]" aria-hidden />
                Pickup at our yard, {COMPANY.address.street}, {COMPANY.address.city}, {COMPANY.address.state}
              </li>
              <li className="flex gap-2.5">
                <Truck className="mt-0.5 h-4 w-4 flex-none text-[var(--color-text-brand)]" aria-hidden />
                Delivery across the Bay Area, within about {COMPANY.serviceRadiusMi} miles of the yard
              </li>
            </ul>
          </div>
        </div>
      </Section>

      {plan ? (
        <Section tone="surface" density="compact" containerSize="wide" id="calculator">
          <ProductCalculator
            slug={product.slug}
            name={product.name}
            plan={plan}
            price={priceInfo}
            quoteUnit={product.unit}
          />
        </Section>
      ) : null}

      <Section density="compact" containerSize="wide">
        <div className="grid gap-12 lg:grid-cols-[3fr_2fr]">
          <div>
            <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)] md:text-3xl">
              About {product.name}
            </h2>
            <div className="mt-5 space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
              <p>
                {product.name} is {product.what}, {soldByPhrase(product)} at {COMPANY.legalName} in{" "}
                {COMPANY.address.city}, {COMPANY.address.state}.
              </p>
              {product.description.map((d) => (
                <p key={d}>{d}</p>
              ))}
              {/* The category's general copy only where the product has none of its own. */}
              {(product.description.length ? [] : category.about).map((d) => (
                <p key={d}>{d}</p>
              ))}
            </div>

            {product.uses.length ? (
              <>
                <h3 className="mt-8 font-display text-xl font-semibold text-[var(--color-text-primary)]">Common uses</h3>
                <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
                  {product.uses.map((u) => (
                    <li key={u} className="flex gap-2.5 text-[var(--color-text-secondary)]">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-[var(--color-text-brand)]" aria-hidden />
                      {u}
                    </li>
                  ))}
                </ul>
              </>
            ) : null}

            {product.soldByCubicYard ? (
              <>
                <h3 className="mt-10 font-display text-xl font-semibold text-[var(--color-text-primary)]">
                  How far a cubic yard goes
                </h3>
                <p className="mt-3 text-sm text-[var(--color-text-secondary)]">
                  A cubic yard is 27 cubic feet. Approximate coverage, before settling or compaction:
                </p>
                <table className="mt-4 w-full max-w-md overflow-hidden rounded-[var(--radius-md)] text-left text-sm">
                  <thead className="bg-[var(--color-moss-100)] text-[var(--color-moss-900)]">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-semibold">Depth</th>
                      <th scope="col" className="px-4 py-2.5 font-semibold">1 cubic yard covers</th>
                    </tr>
                  </thead>
                  <tbody className="bg-[var(--color-bg-elevated)]">
                    {COVERAGE_DEPTHS.map((d) => (
                      <tr key={d} className="border-t border-[var(--color-border)]">
                        <td className="px-4 py-2.5">{d} inches</td>
                        <td className="px-4 py-2.5">about {cubicYardCoverage(d)} sq ft</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-3 text-sm">
                  <a href="#calculator" className="font-semibold text-[var(--color-text-brand)] hover:underline">
                    Work out your exact yardage with the calculator above
                  </a>
                </p>
              </>
            ) : null}
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">Product details</h2>
            <dl className="mt-5 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              {details.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr] gap-3 px-4 py-3 text-sm">
                  <dt className="font-semibold text-[var(--color-text-primary)]">{k}</dt>
                  <dd className="text-[var(--color-text-secondary)]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </Section>

      <Section tone="surface" density="compact" containerSize="default">
        <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)] md:text-3xl">
          Questions about {product.name}
        </h2>
        <div className="mt-6 divide-y divide-[var(--color-border)] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          {faqs.map((f) => (
            <details key={f.q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-semibold text-[var(--color-text-primary)] [&::-webkit-details-marker]:hidden">
                <span className="flex items-center justify-between gap-4">
                  {f.q}
                  <span aria-hidden className="text-[var(--color-text-brand)] transition-transform group-open:rotate-45">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-3 text-[var(--color-text-secondary)]">{f.a}</p>
            </details>
          ))}
        </div>
      </Section>

      {related.length ? (
        <Section density="compact" containerSize="wide">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)] md:text-3xl">
              More {category.name}
            </h2>
            <Link
              href={categoryPath(category.slug)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-brand)] hover:text-[var(--color-action-hover)]"
            >
              View all {category.name}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-4">
            {related.map((p) => (
              <li key={p.slug}>
                <ProductCard card={pricedCard(p)} />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section tone="brand" density="compact">
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-3xl font-light tracking-tight text-white md:text-4xl">
              Ready to order {product.name}?
            </h2>
            <p className="mt-3 text-lg text-[var(--color-moss-100)]">
              Tell us the quantity and where it&apos;s going, and we&apos;ll come back with a price for pickup or delivery.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={quotePath(product.slug, product.unit) as Route}
              className="inline-flex items-center rounded-full bg-white px-7 py-3.5 font-semibold text-[var(--color-moss-950)] shadow-[var(--shadow-md)] transition-colors duration-200 hover:bg-[var(--color-moss-100)]"
            >
              Request a quote
            </Link>
            <a
              href={`tel:${COMPANY.phoneE164}`}
              data-call-location="material_page"
              className="inline-flex items-center rounded-full border border-white/40 px-7 py-3.5 font-semibold text-white transition-colors duration-200 hover:bg-white/10"
            >
              Call {COMPANY.phone}
            </a>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
