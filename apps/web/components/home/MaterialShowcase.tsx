import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowUpRight, Search } from "lucide-react";
import { categoryPath, productsIn } from "@/lib/catalog";
import { SCENES, categoryScene } from "@/lib/scenes";

/**
 * "Shop by material" — a calm, responsive category grid.
 *
 * Static server component. The only motion is hover feedback (image zoom +
 * arrow), which is a UX affordance, not decoration. Each tile links to its
 * catalog category page. Its image is the category's scene photo (lib/scenes),
 * else the largest product photo we hold for that category.
 */

const GROUPS: { slug: string; label: string; blurb: string }[] = [
  { slug: "bark-mulch", label: "Bark & Mulch", blurb: "Ground cover that lasts" },
  { slug: "decorative-rock", label: "Decorative Rock", blurb: "Beds, borders & DG paths" },
  { slug: "premium-decorative-rock", label: "Beach Pebbles", blurb: "Accent stone by the pound" },
  { slug: "construction-aggregates", label: "Base & Drain Rock", blurb: "The foundation layer" },
  { slug: "flagstone-slate", label: "Flagstone & Slate", blurb: "Patios & walkways" },
  { slug: "boulders", label: "Boulders & Moss Rock", blurb: "Natural accents" },
  { slug: "sealers", label: "Sealers & Binders", blurb: "Protect & finish" },
  { slug: "tools-accessories", label: "Tools & Accessories", blurb: "Everything to finish the job" },
];

// The bark tile shows mulch in a planted bed; the category page leads with the
// colour range, so the two don't repeat the same photo.
const TILE_SCENES: Partial<Record<string, StaticImageData>> = { "bark-mulch": SCENES.bark.tall };

function imageFor(slug: string): StaticImageData | string | null {
  const scene = TILE_SCENES[slug] ?? categoryScene(slug)?.tall;
  if (scene) return scene;
  const photos = productsIn(slug)
    .map((p) => p.images[0])
    .filter((i): i is NonNullable<typeof i> => Boolean(i))
    .sort((a, b) => b.width * b.height - a.width * a.height);
  return photos[0]?.src ?? null;
}

const TILES = GROUPS.map((g) => ({ ...g, image: imageFor(g.slug) })).filter(
  (g): g is (typeof GROUPS)[number] & { image: StaticImageData | string } => Boolean(g.image),
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
          <div className="flex flex-wrap items-center gap-4">
            {/* Catalog search: a plain GET form, so it works before scripts load. */}
            <form action="/products" method="get" role="search" className="relative">
              <label htmlFor="home-catalog-search" className="sr-only">
                Search materials
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
                aria-hidden
              />
              <input
                id="home-catalog-search"
                name="q"
                type="search"
                maxLength={80}
                placeholder="Search materials, e.g. decomposed granite"
                className="w-72 max-w-full rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] py-2.5 pl-9 pr-4 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
              />
            </form>
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
        </div>

        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-5 lg:grid-cols-4">
          {TILES.map((tile) => (
            <Link
              key={tile.label}
              href={categoryPath(tile.slug)}
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
