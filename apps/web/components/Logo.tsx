import Image from "next/image";
import { cn } from "@balm/ui";
import { COMPANY } from "@/lib/company";

/**
 * BALM brand logo. Uses the official brand artwork (sprout + bridge + truck
 * lockup with wordmark) supplied in /public/brand:
 *   - tone="brand"    → full-color logo, for light backgrounds
 *   - tone="inverted" → white line-art logo, for dark backgrounds
 *
 * Optimized webp derivatives are generated from the source PNGs (see
 * docs/brand-assets.md). The wordmark is baked into the artwork.
 */

type LogoProps = {
  tone?: "brand" | "inverted";
  /** rendered height in px (width scales by intrinsic aspect ratio) */
  height?: number;
  priority?: boolean;
  className?: string;
};

const ART = {
  brand: { src: "/brand/logo-primary.webp", w: 640, h: 439 },
  inverted: { src: "/brand/logo-white.webp", w: 720, h: 540 },
} as const;

export function Logo({
  tone = "brand",
  height = 56,
  priority = false,
  className,
}: LogoProps) {
  const art = ART[tone];
  const width = Math.round((art.w / art.h) * height);

  return (
    <Image
      src={art.src}
      alt={COMPANY.legalName}
      width={width}
      height={height}
      priority={priority}
      sizes={`${width}px`}
      className={cn("h-auto w-auto object-contain", className)}
      style={{ height, width: "auto" }}
    />
  );
}
