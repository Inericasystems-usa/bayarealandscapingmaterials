"use client";

import Link from "next/link";
import type { Route } from "next";
import { FileText } from "lucide-react";
import { buttonVariants, cn } from "@balm/ui";
import { quotePath } from "@/lib/catalog/shared";

/**
 * The primary action on a product page.
 *
 * Today it is always "Request a quote", carrying the chosen unit and quantity
 * into the quote form. This is the single seam for online ordering: when a
 * hosted checkout is chosen (a separate, PCI-scoped decision), an "Add to cart"
 * branch goes here and hands { sku, quantity } to that provider's checkout.
 * Nothing on this site collects or handles card details.
 */
export function PurchaseAction({
  slug,
  unit,
  quantity,
  className,
}: {
  slug: string;
  sku: string;
  unit: string;
  quantity: number;
  className?: string;
}) {
  return (
    <Link
      href={quotePath(slug, unit, quantity) as Route}
      className={cn(buttonVariants({ size: "lg" }), "w-full rounded-full", className)}
    >
      <FileText className="h-5 w-5" aria-hidden />
      Request a quote
    </Link>
  );
}
