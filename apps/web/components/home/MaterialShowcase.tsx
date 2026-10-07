import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { products } from "@/lib/products";

/**
 * "Shop by material" — a calm, responsive category grid.
 *
 * Static server component. The only motion is hover feedback (image zoom +
 * arrow), which is a UX affordance, not decoration. Each tile links into the
 * live /products catalog. Images are pulled from real catalog items.
 */

// Curated storefront categories → the catalog category names they map to.
const GROUPS: { label: string; blurb: string; match: string[] }[] = [
  { label: "Soil & Compost", blurb: "Custom blends & amendments", match: ["Soil Mix", "Compost, Soil & Amendments", "Compost"] },
  { label: "Mulch & Bark", blurb: "Ground cover that lasts", match: ["Bark and Mulches", "Mulch", "Bark"] },
  { label: "Gravel & Aggregates", blurb: "Drainage, paths & base", match: ["Sand, Gravel & Decorative Aggregates", "Gravel"] },
  { label: "Decorative Pebbles", blurb: "Finish with character", match: ["Decorative Pebbles", "Pebbles", "Decorative Aggregates"] },
  { label: "Sand", blurb: "Play, mason & polymeric", match: ["Sand", "Polymeric Sands"] },
  { label: "Flagstone & Pavers", blurb: "Patios & walkways", match: ["Flagstone", "Flagstones", "Pavers", "Pavers & Stepping Stones"] },
  { label: "Base & Drain Rock", blurb: "The foundation layer", match: ["Base Rock", "Drain Rock"] },
  { label: "Tools & Accessories", blurb: "Everything to finish the job", match: ["Tools & Accessories", "Gardening Tools"] },
];

function imageFor(match: string[]): string | null {
  for (const cat of match) {
    const p = products.find((x) => x.category === cat || x.subcategory === cat);
    if (p) return p.image;
  }
  return null;
}

const TILES = GROUPS.map((g) => ({ ...g, image: imageFor(g.match) })).filter(
  (g): g is (typeof GROUPS)[number] & { image: string } => Boolean(g.image),
);

export function MaterialShowcase() {
  return (
    <section className="bg-[var(--color-bg-surface)] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-brand)]">
              The yard
            </span>
            <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.25rem)] font-light leading-[1.02] tracking-tight text-[var(--color-text-primary)]">
              Shop by material
            </h2>
          </div>
          <Link
            href="/products"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-text-brand)] transition-colors hover:text-[var(--color-action-hover)]"
          >
            View full catalog
            <ArrowUpRight
              className="h-4 w-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              aria-hidden
            />
          </Link>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {TILES.map((tile) => (
            <Link
              key={tile.label}
              href="/products"
              className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-[var(--radius-lg)] shadow-[var(--shadow-sm)] transition-shadow duration-300 hover:shadow-[var(--shadow-lg)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
            >
              <Image
                src={tile.image}
                // Decorative: the tile's <h3> and blurb are inside this link, so
                // the label is already in its accessible name. A duplicate alt
                // would make a screen reader announce the category twice.
                alt=""
                fill
                sizes="(min-width:1024px) 24vw, 50vw"
                className="object-cover transition-transform duration-[800ms] ease-out group-hover:scale-105"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent"
              />
              <div className="relative p-4 sm:p-5">
                <h3 className="font-display text-lg font-medium leading-tight text-white sm:text-xl">
                  {tile.label}
                </h3>
                <p className="mt-0.5 text-xs text-[var(--color-stone-200)] sm:text-sm">{tile.blurb}</p>
              </div>
              <span
                aria-hidden
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-[var(--color-moss-950)] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              >
                <ArrowUpRight className="h-4 w-4" />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
