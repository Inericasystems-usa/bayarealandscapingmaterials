"use client";

import { useId, useState } from "react";
import { Phone } from "lucide-react";
import { buttonVariants, cn } from "@balm/ui";
import { CONTACT_FOR_PRICING } from "@/lib/storefront";
import { PurchaseAction } from "./PurchaseAction";

export interface PanelVariation {
  sku: string;
  unit: string;
  unitPlural: string;
  /** Formatted price. Present only when the storefront switch shows prices. */
  priceLabel?: string;
}

/**
 * Unit of sale, quantity, price area and the primary action. Receives prices
 * only as already-formatted labels, and only when prices are on, so with the
 * switch off no figure ever reaches the browser.
 */
export function PurchasePanel({
  slug,
  variations,
  phone,
  phoneE164,
  isService,
}: {
  slug: string;
  variations: PanelVariation[];
  phone: string;
  phoneE164: string;
  isService: boolean;
}) {
  const id = useId();
  const [sku, setSku] = useState(variations[0]!.sku);
  const [quantity, setQuantity] = useState(1);
  const selected = variations.find((v) => v.sku === sku) ?? variations[0]!;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
      {variations.length > 1 ? (
        <fieldset>
          <legend className="mb-3 text-sm font-semibold text-[var(--color-text-primary)]">Unit of sale</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {variations.map((v) => (
              <label
                key={v.sku}
                className={`flex cursor-pointer flex-col rounded-[var(--radius-md)] border px-3 py-2.5 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-border-focus)] ${
                  v.sku === sku
                    ? "border-[var(--color-action)] bg-[var(--color-moss-50)] text-[var(--color-text-primary)]"
                    : "border-[var(--color-border-strong)] text-[var(--color-text-secondary)] hover:border-[var(--color-action)]"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-unit`}
                  value={v.sku}
                  checked={v.sku === sku}
                  onChange={() => setSku(v.sku)}
                  className="sr-only"
                />
                <span className="font-medium">{v.unit}</span>
                {v.priceLabel ? <span className="text-xs">{v.priceLabel}</span> : null}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Unit of sale: <span className="font-semibold text-[var(--color-text-primary)]">{selected.unit}</span>
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        {isService ? null : (
          <div>
            <label htmlFor={`${id}-qty`} className="mb-1.5 block text-sm font-semibold text-[var(--color-text-primary)]">
              Quantity
            </label>
            <div className="flex items-center gap-2">
              <input
                id={`${id}-qty`}
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                step={1}
                value={quantity}
                onChange={(e) => {
                  const n = Math.floor(Number(e.target.value));
                  setQuantity(Number.isFinite(n) ? Math.min(9999, Math.max(1, n)) : 1);
                }}
                className="h-11 w-24 rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-3 text-base text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                {selected.unit === "Each" ? "" : quantity === 1 ? selected.unit.toLowerCase() : selected.unitPlural}
              </span>
            </div>
          </div>
        )}
        <div className="text-right">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--color-text-muted)]">Price</p>
          <p className="font-display text-2xl font-medium text-[var(--color-text-primary)]">
            {selected.priceLabel ?? CONTACT_FOR_PRICING}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <PurchaseAction slug={slug} sku={selected.sku} unit={selected.unit} quantity={quantity} />
        <a
          href={`tel:${phoneE164}`}
          data-call-location="material_page"
          className={cn(buttonVariants({ size: "lg", variant: "secondary" }), "w-full rounded-full")}
        >
          <Phone className="h-5 w-5" aria-hidden />
          Call {phone}
        </a>
      </div>
    </div>
  );
}
