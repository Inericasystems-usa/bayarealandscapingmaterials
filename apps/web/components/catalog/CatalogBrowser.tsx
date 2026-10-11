"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search, SlidersHorizontal, X } from "lucide-react";
import { trackPriceListView } from "@/lib/analytics";
import { categoryPath, type CatalogCard } from "@/lib/catalog/shared";
import { ProductCard } from "./ProductCard";

interface CategoryOption {
  slug: string;
  name: string;
  count: number;
}

type SortKey = "popular" | "name" | "price-asc" | "price-desc";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "popular", label: "Most popular" },
  { value: "name", label: "Name, A–Z" },
  { value: "price-asc", label: "Price, low to high" },
  { value: "price-desc", label: "Price, high to low" },
];

/**
 * The full catalog with search, category, in-stock and sort controls.
 * Server-rendered with every product visible (crawlers see the whole list);
 * the controls only narrow and reorder it in the browser, and the state is
 * mirrored into the URL (?q, ?category, ?sort, ?stock) so a filtered view can
 * be shared or reloaded. On phones the categories are a swipeable chip row
 * instead of a tall list above the products.
 */
export function CatalogBrowser({ cards, categories }: { cards: CatalogCard[]; categories: CategoryOption[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("popular");
  const [inStockOnly, setInStockOnly] = useState(false);
  const hydrated = useRef(false);

  // Read the URL once, then keep it in step with the controls.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) setQuery(q.slice(0, 80));
    const c = params.get("category");
    if (c && categories.some((x) => x.slug === c)) setCategory(c);
    const s = params.get("sort") as SortKey | null;
    if (s && SORTS.some((x) => x.value === s)) setSort(s);
    if (params.get("stock") === "1") setInStockOnly(true);
    hydrated.current = true;
  }, [categories]);

  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (category) params.set("category", category);
    if (sort !== "popular") params.set("sort", sort);
    if (inStockOnly) params.set("stock", "1");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, category, sort, inStockOnly]);

  // The catalog was viewed. Once per mount: filtering is not a second view.
  const viewed = useRef(false);
  useEffect(() => {
    if (viewed.current) return;
    viewed.current = true;
    trackPriceListView(cards.length);
  }, [cards.length]);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const list = cards.filter(
      (c) =>
        (!category || c.categorySlug === category) &&
        (!inStockOnly || c.isService || c.stockStatus === "instock") &&
        words.every((w) => c.search.includes(w)),
    );
    const byPrice = (dir: 1 | -1) => (a: CatalogCard, b: CatalogCard) =>
      a.price === null ? 1 : b.price === null ? -1 : (a.price - b.price) * dir;
    if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "price-asc") return [...list].sort(byPrice(1));
    if (sort === "price-desc") return [...list].sort(byPrice(-1));
    return list; // server order is already by demand rank
  }, [cards, category, query, sort, inStockOnly]);

  const selected = categories.find((c) => c.slug === category);
  const filtering = Boolean(query.trim() || category || inStockOnly);
  const clearAll = () => {
    setQuery("");
    setCategory(null);
    setInStockOnly(false);
  };

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
      active
        ? "border-[var(--color-action)] bg-[var(--color-action)] text-[var(--color-action-fg)] shadow-[var(--shadow-sm)]"
        : "border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:border-[var(--color-moss-400)] hover:text-[var(--color-text-primary)]"
    }`;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-4 lg:gap-10">
      {/* ── Controls ── */}
      <div className="lg:col-span-1">
        <div className="space-y-6 lg:sticky lg:top-28">
          <div role="search">
            <label htmlFor="product-search" className="sr-only">
              Search products
            </label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-text-muted)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <input
                id="product-search"
                type="search"
                placeholder="Search bark, rock, pavers…"
                value={query}
                maxLength={80}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                onChange={(e) => setQuery(e.target.value)}
                className="h-12 w-full rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] pl-11 pr-4 text-base text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] transition-colors placeholder:text-[var(--color-text-muted)] hover:border-[var(--color-moss-400)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
              />
            </div>
          </div>

          <div>
            <h2 className="mb-3 font-display text-base font-semibold text-[var(--color-text-primary)]">Categories</h2>
            {/* Phones: one swipeable row. Desktop: a list. */}
            <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
              <li className="snap-start">
                <button type="button" aria-pressed={!category} onClick={() => setCategory(null)} className={`${chip(!category)} lg:w-full lg:rounded-[var(--radius-md)] lg:text-left`}>
                  All <span>({cards.length})</span>
                </button>
              </li>
              {categories.map((c) => (
                <li key={c.slug} className="snap-start">
                  <button
                    type="button"
                    aria-pressed={category === c.slug}
                    onClick={() => setCategory(category === c.slug ? null : c.slug)}
                    className={`${chip(category === c.slug)} lg:flex lg:w-full lg:justify-between lg:rounded-[var(--radius-md)] lg:border-transparent lg:text-left`}
                  >
                    {c.name} <span>({c.count})</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-[var(--color-text-secondary)]">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="h-5 w-5 accent-[var(--color-action)]"
            />
            In stock only
          </label>
        </div>
      </div>

      {/* ── Results ── */}
      <div className="lg:col-span-3">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
          <p className="text-[var(--color-text-secondary)]" aria-live="polite">
            <span className="font-semibold text-[var(--color-text-primary)]">{filtered.length}</span> product
            {filtered.length !== 1 ? "s" : ""}
            {selected ? <> in {selected.name}</> : null}
            {query.trim() ? <> matching “{query.trim()}”</> : null}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {filtering ? (
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium text-[var(--color-text-brand)] transition-colors hover:bg-[var(--color-moss-50)]"
              >
                <X className="h-4 w-4" aria-hidden />
                Clear filters
              </button>
            ) : null}
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-10 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {selected ? (
          <Link
            href={categoryPath(selected.slug)}
            className="group mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-brand)] hover:text-[var(--color-action-hover)]"
          >
            About {selected.name}: guide, coverage and uses
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : null}

        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-xl)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-surface)] px-6 py-16 text-center">
            <p className="text-lg font-medium text-[var(--color-text-primary)]">No products match.</p>
            <p className="mt-2 text-[var(--color-text-secondary)]">
              Try a shorter search, or{" "}
              <button type="button" onClick={clearAll} className="font-semibold text-[var(--color-text-brand)] underline">
                show everything
              </button>
              . We stock more than is listed — call the yard if you don&apos;t see it.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 xl:grid-cols-3">
            {filtered.map((card) => (
              <li key={card.slug} className="[contain-intrinsic-size:auto_440px] [content-visibility:auto]">
                <ProductCard card={card} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
