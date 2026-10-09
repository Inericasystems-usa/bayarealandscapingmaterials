"use client";

import { useMemo, useRef, useState } from "react";
import type { CatalogCard } from "@/lib/catalog/shared";
import { ProductCard } from "./ProductCard";

const PAGE_SIZE = 24;

type Sort = "featured" | "name-asc" | "name-desc" | "stock";

const SORTS: { value: Sort; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "name-desc", label: "Name: Z to A" },
  { value: "stock", label: "In stock first" },
];

const selectClass =
  "rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]";

/**
 * A category's products with sorting, a unit-of-sale filter and pagination.
 * The first page is server-rendered; every product is also linked from
 * /products and listed in the sitemap, so later pages are still crawlable.
 */
export function CategoryGrid({ cards }: { cards: CatalogCard[] }) {
  const [sort, setSort] = useState<Sort>("featured");
  const [unit, setUnit] = useState("all");
  const [page, setPage] = useState(1);
  const top = useRef<HTMLDivElement>(null);
  const goTo = (n: number) => {
    setPage(n);
    top.current?.scrollIntoView({ block: "start" });
  };

  const units = useMemo(() => [...new Set(cards.map((c) => c.unit))].sort(), [cards]);

  const shown = useMemo(() => {
    const list = unit === "all" ? [...cards] : cards.filter((c) => c.unit === unit);
    if (sort === "name-asc") list.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
    if (sort === "name-desc") list.sort((a, b) => b.name.localeCompare(a.name, "en", { numeric: true }));
    if (sort === "stock") list.sort((a, b) => Number(b.stockStatus === "instock") - Number(a.stockStatus === "instock"));
    return list;
  }, [cards, sort, unit]);

  const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const slice = shown.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const first = shown.length ? (current - 1) * PAGE_SIZE + 1 : 0;

  return (
    <div ref={top} className="scroll-mt-24">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-5">
        <p className="text-sm text-[var(--color-text-secondary)]" aria-live="polite">
          Showing {first}&ndash;{first ? first + slice.length - 1 : 0} of {shown.length} product
          {shown.length !== 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap gap-3">
          {units.length > 1 ? (
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
              Unit
              <select
                value={unit}
                onChange={(e) => {
                  setUnit(e.target.value);
                  setPage(1);
                }}
                className={selectClass}
              >
                <option value="all">All units</option>
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]">
            Sort
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as Sort);
                setPage(1);
              }}
              className={selectClass}
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

      <ul className="grid grid-cols-2 gap-x-5 gap-y-10 lg:grid-cols-3 xl:grid-cols-4">
        {slice.map((card) => (
          <li key={card.slug}>
            <ProductCard card={card} headingLevel={2} />
          </li>
        ))}
      </ul>

      {pages > 1 ? (
        <nav aria-label="Pagination" className="mt-12 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={current === 1}
            onClick={() => goTo(current - 1)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Previous
          </button>
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              aria-current={n === current ? "page" : undefined}
              onClick={() => goTo(n)}
              className={`h-10 min-w-10 rounded-[var(--radius-md)] px-3 text-sm font-medium ${
                n === current
                  ? "bg-[var(--color-action)] text-[var(--color-action-fg)]"
                  : "border border-[var(--color-border-strong)] text-[var(--color-text-primary)]"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={current === pages}
            onClick={() => goTo(current + 1)}
            className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
