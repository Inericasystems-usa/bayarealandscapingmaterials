"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { trackPriceListView } from "@/lib/analytics";
import { categoryPath, type CatalogCard } from "@/lib/catalog/shared";
import { ProductCard } from "./ProductCard";

interface CategoryOption {
  slug: string;
  name: string;
  count: number;
}

/**
 * The full catalog with search and a category filter. Server-rendered with
 * every product visible, so the whole list is in the HTML for crawlers; the
 * filters only narrow it in the browser. `?q=` (from the home page's catalog
 * search) pre-fills the search box.
 */
export function CatalogBrowser({ cards, categories }: { cards: CatalogCard[]; categories: CategoryOption[] }) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setSearchQuery(q.slice(0, 80));
    const category = params.get("category");
    if (!q && category && categories.some((c) => c.slug === category)) setSelectedCategory(category);
  }, [categories]);

  // The catalog was viewed. Once per mount: filtering is not a second view.
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackPriceListView(cards.length);
  }, [cards.length]);

  const filtered = useMemo(() => {
    if (searchQuery.trim()) {
      const words = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
      return cards.filter((c) => words.every((w) => c.search.includes(w)));
    }
    if (selectedCategory) return cards.filter((c) => c.categorySlug === selectedCategory);
    return cards;
  }, [cards, selectedCategory, searchQuery]);

  const selected = categories.find((c) => c.slug === selectedCategory);

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <div className="lg:sticky lg:top-24">
          <div className="mb-8" role="search">
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
                type="search"
                placeholder="Search products..."
                value={searchQuery}
                maxLength={80}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedCategory(null);
                }}
                className="w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] py-2.5 pl-10 pr-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2"
              />
            </div>
          </div>

          <h2 className="mb-4 font-display text-lg font-semibold text-[var(--color-text-primary)]">Categories</h2>
          <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[calc(100vh-14rem)]">
            <button
              type="button"
              aria-pressed={selectedCategory === null && !searchQuery}
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
              All Products <span className="opacity-70">({cards.length})</span>
            </button>
            {categories.map((category) => (
              <button
                key={category.slug}
                type="button"
                aria-pressed={selectedCategory === category.slug}
                onClick={() => {
                  setSelectedCategory(category.slug);
                  setSearchQuery("");
                }}
                className={`w-full rounded-[var(--radius-md)] px-4 py-2.5 text-left text-sm font-medium transition-colors ${
                  selectedCategory === category.slug
                    ? "bg-[var(--color-action)] text-[var(--color-action-fg)]"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-brand)]"
                }`}
              >
                {category.name} <span className="opacity-70">({category.count})</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lg:col-span-3">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[var(--color-text-secondary)]" aria-live="polite">
            Showing {filtered.length} product{filtered.length !== 1 ? "s" : ""}
            {selected ? (
              <span className="font-semibold text-[var(--color-text-primary)]"> in {selected.name}</span>
            ) : null}
          </p>
          {selected ? (
            <Link
              href={categoryPath(selected.slug)}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-brand)] hover:text-[var(--color-action-hover)]"
            >
              Open the {selected.name} page
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] py-16 text-center">
            <p className="text-lg text-[var(--color-text-secondary)]">
              No products found. Try adjusting your search or filters.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-5 gap-y-10 xl:grid-cols-3">
            {filtered.map((card) => (
              <li key={card.slug}>
                <ProductCard card={card} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
