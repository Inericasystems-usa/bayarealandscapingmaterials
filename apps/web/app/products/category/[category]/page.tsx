import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { categoryScene } from "@/lib/scenes";
import { Section } from "@/components/Section";
import { Breadcrumbs } from "@/components/catalog/Breadcrumbs";
import { CategoryGrid } from "@/components/catalog/CategoryGrid";
import { JsonLd } from "@/components/catalog/JsonLd";
import { CATEGORIES, categoryPath, getCategory, productsIn } from "@/lib/catalog";
import { pricedCard } from "@/lib/catalog/pricing";
import { breadcrumbJsonLd, categoryDescription, categoryMetadata, collectionJsonLd, type Crumb } from "@/lib/catalog/seo";

// One static page per category; any other slug is a real 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

interface PageProps {
  params: Promise<{ category: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const category = getCategory((await params).category);
  return category ? categoryMetadata(category, productsIn(category.slug)) : {};
}

export default async function CategoryPage({ params }: PageProps) {
  const category = getCategory((await params).category);
  if (!category) notFound();

  const products = productsIn(category.slug);
  const cards = products.map((p) => pricedCard(p));
  const crumbs: Crumb[] = [
    { name: "Home", path: "/" },
    { name: "Products", path: "/products" },
    { name: category.name, path: categoryPath(category.slug) },
  ];

  return (
    <PageShell>
      <JsonLd data={collectionJsonLd(category.name, categoryPath(category.slug), categoryDescription(category), products)} />
      <JsonLd data={breadcrumbJsonLd(crumbs)} />

      <PageHero
        eyebrow={category.group || "Products"}
        title={category.name}
        subtitle={category.intro}
        imageUrl={categoryScene(category.slug)?.wide}
      />

      <Section density="default" containerSize="wide">
        <Breadcrumbs crumbs={crumbs} />
        <div className="mt-8 grid gap-10 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="Product categories" className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-3 font-display text-lg font-semibold text-[var(--color-text-primary)]">Categories</p>
            <ul className="flex flex-wrap gap-2 lg:block lg:space-y-1">
              <li>
                <Link
                  href="/products"
                  className="block rounded-[var(--radius-md)] px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-brand)]"
                >
                  All products
                </Link>
              </li>
              {CATEGORIES.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={categoryPath(c.slug)}
                    aria-current={c.slug === category.slug ? "page" : undefined}
                    className={`block rounded-[var(--radius-md)] px-3 py-2 text-sm ${
                      c.slug === category.slug
                        ? "bg-[var(--color-action)] font-semibold text-[var(--color-action-fg)]"
                        : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-brand)]"
                    }`}
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <CategoryGrid cards={cards} />
        </div>
      </Section>

      <Section tone="surface" density="compact" containerSize="default">
        <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)] md:text-3xl">
          About our {category.name.toLowerCase()}
        </h2>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-[var(--color-text-secondary)]">
          {category.about.map((p) => (
            <p key={p}>{p}</p>
          ))}
          <p>
            Every item here can be picked up at our Richmond, CA yard or delivered across the Bay Area.{" "}
            <Link href="/request-quote" className="font-semibold text-[var(--color-text-brand)] hover:underline">
              Request a quote
            </Link>{" "}
            and we&apos;ll confirm price and availability.
          </p>
        </div>
      </Section>
    </PageShell>
  );
}
