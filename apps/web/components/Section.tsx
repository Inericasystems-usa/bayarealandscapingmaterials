import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn, Container } from "@balm/ui";

type Tone = "page" | "surface" | "moss" | "brand" | "inverted";
type Density = "default" | "compact" | "spacious";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  tone?: Tone;
  density?: Density;
  containerSize?: "narrow" | "default" | "wide" | "fluid";
  children?: ReactNode;
  as?: ElementType;
}

const toneClasses: Record<Tone, string> = {
  page: "bg-[var(--color-bg-page)] text-[var(--color-text-primary)]",
  surface: "bg-[var(--color-bg-surface)] text-[var(--color-text-primary)]",
  // soft green wash — light background, keeps default dark text
  moss: "bg-[var(--color-moss-50)] text-[var(--color-text-primary)]",
  // strong forest-green band — light text; content should use white/moss-100
  brand: "bg-[var(--color-moss-700)] text-white tex-stone",
  inverted:
    "bg-[var(--color-bg-inverted)] text-[var(--color-text-inverted)] tex-stone",
};

const densityClasses: Record<Density, string> = {
  compact: "py-12 md:py-16",
  default: "py-16 md:py-24",
  spacious: "py-24 md:py-32",
};

/**
 * Vertical rhythm wrapper. Use instead of hand-rolling padding on every section.
 */
export function Section({
  tone = "page",
  density = "default",
  containerSize = "default",
  className,
  children,
  as: Tag = "section",
  ...rest
}: SectionProps) {
  return (
    <Tag
      className={cn("relative", toneClasses[tone], densityClasses[density], className)}
      {...rest}
    >
      <Container size={containerSize}>{children}</Container>
    </Tag>
  );
}
