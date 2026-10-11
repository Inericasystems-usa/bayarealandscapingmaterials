import Image from "next/image";
import Link from "next/link";
import { CONTACT_FOR_PRICING } from "@/lib/storefront";
import { productPath, stockLabel, type CatalogCard } from "@/lib/catalog/shared";
import type { StockStatus } from "@/lib/catalog/types";

/**
 * One product in a catalog grid. Presentational only (no hooks), so both the
 * server-rendered pages and the client-side filters can use it.
 */

export function StockBadge({ status, className = "" }: { status: StockStatus; className?: string }) {
  const inStock = status === "instock";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        inStock
          ? "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
          : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)]"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${inStock ? "bg-[var(--color-moss-500)]" : "bg-[var(--color-text-muted)]"}`}
      />
      {stockLabel(status)}
    </span>
  );
}

export function ProductCard({ card, headingLevel = 3 }: { card: CatalogCard; headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Link
      href={productPath(card.slug)}
      className="product-card group flex h-full flex-col rounded-[var(--radius-xl)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--color-border-focus)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white transition-shadow duration-300 group-hover:shadow-[var(--shadow-xl)]">
        <Image
          src={card.image.src}
          alt={card.image.isPlaceholder ? "" : card.image.alt}
          fill
          unoptimized={card.image.isPlaceholder}
          sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
          // Renders and the generic placeholder fill the tile; tool photos shot
          // on white keep the whole product in frame.
          className={`${card.image.isPlaceholder || card.fill === "cover" ? "object-cover" : "object-contain p-3"} transition-transform duration-[900ms] ease-out group-hover:scale-105`}
        />
        {card.hoverImage ? (
          // The in-use scene (or second photo) fades in on hover; lazy, so it
          // costs nothing until a pointer reaches the card.
          <Image
            src={card.hoverImage.src}
            alt=""
            fill
            loading="lazy"
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
            className="object-cover opacity-0 transition-opacity duration-500 ease-out group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        ) : null}
        {card.core ? (
          <span className="absolute right-3 top-3 rounded-full bg-[rgb(14_36_27/0.82)] px-2.5 py-0.5 text-[0.68rem] font-semibold text-white backdrop-blur-sm">
            Core material
          </span>
        ) : null}
        {card.image.isPlaceholder ? (
          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[0.68rem] font-semibold text-[var(--color-moss-900)]">
            Photo coming soon
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col pt-4">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-[var(--color-text-brand)]">
          {card.categoryName}
        </p>
        <Heading className="mt-1.5 font-display text-lg font-medium leading-snug text-[var(--color-text-primary)] group-hover:text-[var(--color-text-brand)]">
          {card.name}
        </Heading>
        <p className="mb-4 mt-1 text-sm text-[var(--color-text-secondary)]">
          {card.soldBy.charAt(0).toUpperCase() + card.soldBy.slice(1)}
        </p>
        <div className="mt-auto border-t border-[var(--color-border)] pt-3">
          <p className="font-display text-base font-medium text-[var(--color-text-primary)]">
            {card.priceLabel ?? CONTACT_FOR_PRICING}
          </p>
          {card.isService ? null : (
            <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${card.stockStatus === "instock" ? "bg-[var(--color-moss-500)]" : "bg-[var(--color-text-muted)]"}`}
              />
              {stockLabel(card.stockStatus)}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
