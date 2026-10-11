import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ProductCard } from "@/components/catalog/ProductCard";
import { PRODUCTS } from "@/lib/catalog";
import { pricedCard } from "@/lib/catalog/pricing";

/**
 * The yard's everyday core materials, in demand order, with real prices.
 * A swipeable row on phones, a grid from tablet up. Server-rendered: no
 * client JavaScript.
 */
export function PopularMaterials() {
  const picks = PRODUCTS.filter((p) => p.tier === "core" && p.images.length).slice(0, 8);
  if (!picks.length) return null;
  return (
    <section className="bg-[var(--color-bg-page)] py-16 md:py-24" aria-labelledby="popular-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--color-text-brand)]">
              Core materials
            </span>
            <h2
              id="popular-heading"
              className="mt-3 font-display text-[clamp(1.9rem,4vw,3rem)] font-light leading-none tracking-tight text-[var(--color-text-primary)]"
            >
              Most requested, priced by the yard
            </h2>
          </div>
          <Link
            href="/products"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-brand)] hover:text-[var(--color-action-hover)]"
          >
            See all products
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        </div>
        <ul className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-4 [scrollbar-width:thin] sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-x-5 sm:gap-y-10 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4">
          {picks.map((p) => (
            <li key={p.slug} className="w-[68vw] flex-none snap-start sm:w-auto">
              <ProductCard card={pricedCard(p)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
