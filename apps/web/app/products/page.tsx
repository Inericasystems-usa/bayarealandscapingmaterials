"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn, HoverCard } from "@/components/AnimatedSection";
import { products as STATIC_PRODUCTS, CONTACT_FOR_PRICING, type Product } from "@/lib/products";
import { api } from "@/lib/api-client";
import { trackPriceListView } from "@/lib/analytics";
import { HERO_IMAGES } from "@/lib/site-content";

export default function ProductsPage() {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // ?q= from the home page's catalog search pre-fills the filter.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setSearchQuery(q.slice(0, 80));
  }, []);

  // Live catalog from the API (the same source the POS edits). Falls back to
  // the bundled catalog if the API is unreachable, so the page always renders.
  const [items, setItems] = useState<Product[]>(STATIC_PRODUCTS);
  useEffect(() => {
    let alive = true;
    api
      .listProducts()
      .then((live) => {
        if (alive && live.length) setItems(live);
      })
      .catch(() => {
        /* keep static fallback */
      });
    return () => {
      alive = false;
    };
  }, []);

  // The published price list was viewed. Once per mount — filtering the grid is
  // not a second view of the list.
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackPriceListView(items.length);
  }, [items.length]);

  const categories = useMemo(() => [...new Set(items.map((p) => p.category))], [items]);

  const filteredProducts = useMemo(() => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return items.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q),
      );
    }
    if (selectedCategory) return items.filter((p) => p.category === selectedCategory);
    return items;
  }, [items, selectedCategory, searchQuery]);

  return (
    <PageShell>
      <PageHero
        eyebrow="Browse Our Catalog"
        title="Our Products"
        subtitle="Premium building materials and landscaping supplies for every project — priced by the cubic yard, ton, or bag, for pickup or delivery across the East Bay."
        imageUrl={HERO_IMAGES.main}
      />

      <Section density="default" containerSize="wide">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-4">
          {/* Sidebar */}
          <FadeIn direction="left" className="lg:col-span-1">
            <div className="lg:sticky lg:top-24">
              {/* Search */}
              <div className="mb-8">
                <label htmlFor="product-search" className="sr-only">
                  Search products
                </label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <input
                    id="product-search"
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setSelectedCategory(null);
                    }}
                    className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] py-2.5 pl-10 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2"
                  />
                </div>
              </div>

              {/* Categories */}
              <div>
                <h2 className="mb-4 font-display text-lg font-semibold text-[var(--color-text-primary)]">
                  Categories
                </h2>
                <div className="space-y-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCategory(null);
                      setSearchQuery("");
                    }}
                    className={`w-full rounded-[var(--radius-md)] px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                      selectedCategory === null && !searchQuery
                        ? "bg-[var(--color-action)] text-[var(--color-action-fg)]"
                        : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-brand)]"
                    }`}
                  >
                    All Products
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => {
                        setSelectedCategory(category);
                        setSearchQuery("");
                      }}
                      className={`w-full rounded-[var(--radius-md)] px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                        selectedCategory === category
                          ? "bg-[var(--color-action)] text-[var(--color-action-fg)]"
                          : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-brand)]"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Products grid */}
          <div className="lg:col-span-3">
            <div className="mb-6">
              <p className="text-[var(--color-text-secondary)]">
                Showing {filteredProducts.length} product
                {filteredProducts.length !== 1 ? "s" : ""}
                {selectedCategory ? (
                  <span className="font-semibold text-[var(--color-text-primary)]">
                    {" "}
                    in {selectedCategory}
                  </span>
                ) : null}
              </p>
            </div>

            {filteredProducts.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] py-16 text-center">
                <p className="text-lg text-[var(--color-text-secondary)]">
                  No products found. Try adjusting your search or filters.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => (
                  <HoverCard key={product.id} className="h-full">
                    <div className="group flex h-full flex-col">
                      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-xl)] bg-[var(--color-stone-100)]">
                        <Image
                          src={product.image}
                          alt={product.name}
                          fill
                          sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
                          className="object-cover transition-transform duration-[900ms] ease-out group-hover:scale-105"
                        />
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                        <Link
                          href="/request-quote"
                          className="absolute inset-x-4 bottom-4 translate-y-3 rounded-full bg-white/95 px-5 py-3 text-center text-sm font-semibold text-[var(--color-moss-950)] opacity-0 backdrop-blur transition-all duration-400 group-hover:translate-y-0 group-hover:opacity-100"
                        >
                          Request a quote →
                        </Link>
                      </div>
                      <div className="flex flex-1 flex-col pt-4">
                        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[var(--color-text-brand)]">
                          {product.subcategory}
                        </p>
                        <h3 className="mt-1.5 font-display text-xl font-normal leading-tight text-[var(--color-text-primary)]">
                          {product.name}
                        </h3>
                        <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                          {product.description}
                        </p>
                        <div className="mt-4 border-t border-[var(--color-border)] pt-3">
                          {/* Never `product.price`: these items come from the live
                              API catalog the POS edits, which holds real prices. */}
                          <div className="font-display text-lg font-medium text-[var(--color-text-primary)]">
                            {CONTACT_FOR_PRICING}
                          </div>
                        </div>
                      </div>
                    </div>
                  </HoverCard>
                ))}
              </div>
            )}
          </div>
        </div>
      </Section>

      <Section tone="brand" density="compact">
        <div className="grid items-center gap-8 md:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-3xl font-light tracking-tight text-white md:text-4xl">
              Not sure how much you need?
            </h2>
            <p className="mt-3 text-lg text-[var(--color-moss-100)]">
              Use the yardage calculator, or call the yard and we&apos;ll work it
              out with you.
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
