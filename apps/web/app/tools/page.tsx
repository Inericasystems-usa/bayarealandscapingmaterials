import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button, Card } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn, StaggerContainer, StaggerItem, HoverCard } from "@/components/AnimatedSection";
import { CONTACT_FOR_PRICING } from "@/lib/storefront";
import { categoryPath, displayImages, getCategory, productPath, productsIn, quotePath } from "@/lib/catalog";
import { basePriceLabel } from "@/lib/catalog/pricing";
import type { Route } from "next";
import hero from "@/public/image/tool_hero.png";
import React from "react";

export const metadata: Metadata = {
  title: "Tools & Accessories",
  description:
    "Tools and supplies for landscaping and hardscape projects: trowels, tampers and shovels, turf install supplies, landscape fabric, sealers, cleaners, adhesives and bagged products.",
  alternates: { canonical: "/tools" },
};

// The catalog's supply categories, in the order this page shows them.
const SUPPLY_CATEGORIES = [
  "tools-accessories",
  "landscape-fabric",
  "adhesives",
  "sealers",
  "cleaners",
  "bagged-products",
] as const;

export default function ToolsPage() {
  const groups = SUPPLY_CATEGORIES.map((slug) => ({ category: getCategory(slug), items: productsIn(slug) })).filter(
    (g): g is { category: NonNullable<typeof g.category>; items: typeof g.items } => Boolean(g.category && g.items.length),
  );

  return (
    <PageShell>
      <PageHero
        eyebrow="Professional Equipment"
        title="Tools & Accessories"
        subtitle="Professional equipment and supplies for your landscaping and construction projects."
        imageUrl={hero.src}
      />

      <Section density="default" containerSize="wide">
        <FadeIn className="mb-12 max-w-2xl">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] md:text-4xl">
            Our Selection
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[var(--color-text-secondary)]">
            From trowels and tampers to turf tape, landscape fabric, sealers and polymeric sand,
            everything to finish the job, at the same yard as your materials.
          </p>
        </FadeIn>

        <div className="space-y-16">
          {groups.map(({ category, items }) => {
            return (
              <div key={category.slug}>
                <FadeIn className="mb-6 flex items-center gap-3">
                  <Link
                    href={categoryPath(category.slug)}
                    className="inline-flex items-center rounded-full bg-[var(--color-moss-100)] px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[var(--color-moss-700)] hover:underline"
                  >
                    {category.name}
                  </Link>
                  <span className="h-px flex-1 bg-[var(--color-border)]" />
                </FadeIn>

                <StaggerContainer
                  className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
                  staggerDelay={0.08}
                >
                  {items.map((product) => {
                    const image = displayImages(product)[0]!;
                    return (
                    <StaggerItem key={product.slug}>
                      <HoverCard className="h-full">
                        <Card padding="none" className="group flex h-full flex-col overflow-hidden">
                          <div className="relative aspect-video overflow-hidden bg-[var(--color-stone-100)]">
                            <Image
                              src={image.src}
                              alt={image.isPlaceholder ? "" : image.alt}
                              fill
                              unoptimized={image.isPlaceholder}
                              sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                              className={`${image.isPlaceholder ? "object-cover" : "object-contain"} transition-transform duration-[var(--duration-deliberate)] ease-[var(--ease-standard)] group-hover:scale-105`}
                            />
                          </div>
                          <div className="flex flex-1 flex-col p-6">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-brand)]">
                              {category.name}
                            </p>
                            <h3 className="mb-2 font-sans text-lg font-semibold text-[var(--color-text-primary)]">
                              <Link href={productPath(product.slug)} className="hover:text-[var(--color-text-brand)] hover:underline">
                                {product.name}
                              </Link>
                            </h3>
                            <p className="mb-4 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                              {product.shortDescription}
                            </p>
                            <div className="mb-4 font-display text-lg font-semibold text-[var(--color-text-primary)]">
                              {basePriceLabel(product) ?? CONTACT_FOR_PRICING}
                            </div>
                            <Link href={quotePath(product.slug, product.unit) as Route} className="mt-auto block">
                              <Button size="md" className="group/btn w-full">
                                Get Quote
                                <ArrowRight
                                  className="h-4 w-4 transition-transform group-hover/btn:translate-x-1"
                                  strokeWidth={1.5}
                                  aria-hidden
                                />
                              </Button>
                            </Link>
                          </div>
                        </Card>
                      </HoverCard>
                    </StaggerItem>
                    );
                  })}
                </StaggerContainer>
              </div>
            );
          })}
        </div>
      </Section>

      <Section tone="moss" density="compact">
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-text-primary)] md:text-4xl">
              Need it for the job site?
            </h2>
            <p className="mt-3 text-lg text-[var(--color-text-secondary)]">
              Call the yard and we&apos;ll confirm pricing and stock, or special-order what you need.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact">
              <Button size="lg" variant="secondary">
                Contact
              </Button>
            </Link>
            <Link href="/request-quote">
              <Button size="lg">Request Quote</Button>
            </Link>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
