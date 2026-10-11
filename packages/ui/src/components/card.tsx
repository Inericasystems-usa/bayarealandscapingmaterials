import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";

/**
 * BALM Card primitive — see docs/architecture/design-system.md §10.3
 */
const cardVariants = cva(
  ["rounded-[var(--radius-lg)] transition-shadow"],
  {
    variants: {
      variant: {
        default: [
          "bg-[var(--color-bg-elevated)]",
          "border border-[var(--color-border)]",
          "shadow-[var(--shadow-sm)]",
        ],
        inset: [
          "bg-[var(--color-bg-surface)]",
          "border border-transparent",
        ],
        inverted: [
          "bg-[var(--color-bg-inverted)] text-[var(--color-text-inverted)]",
          "border border-transparent",
        ],
        accent: [
          "bg-[var(--color-bg-elevated)]",
          "border-l-4 border-l-[var(--color-action)] border-y border-r border-[var(--color-border)]",
          "shadow-[var(--shadow-sm)]",
        ],
      },
      padding: {
        none: "",
        sm: "p-4",
        md: "p-6",
        lg: "p-8",
      },
    },
    defaultVariants: { variant: "default", padding: "md" },
  },
);

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, variant, padding, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ variant, padding }), className)}
      {...rest}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardHeader({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("mb-4 flex flex-col gap-1", className)} {...rest} />;
  },
);

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  HTMLAttributes<HTMLHeadingElement> & { as?: "h2" | "h3" | "h4" }
>(
  function CardTitle({ className, as: Tag = "h3", ...rest }, ref) {
    return (
      <Tag
        ref={ref}
        className={cn(
          "font-sans text-xl font-semibold tracking-tight text-[var(--color-text-primary)]",
          className,
        )}
        {...rest}
      />
    );
  },
);

export const CardDescription = forwardRef<HTMLParagraphElement, HTMLAttributes<HTMLParagraphElement>>(
  function CardDescription({ className, ...rest }, ref) {
    return (
      <p
        ref={ref}
        className={cn("text-sm text-[var(--color-text-secondary)] leading-relaxed", className)}
        {...rest}
      />
    );
  },
);

export const CardContent = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardContent({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("", className)} {...rest} />;
  },
);

export const CardFooter = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function CardFooter({ className, ...rest }, ref) {
    return <div ref={ref} className={cn("mt-6 flex items-center gap-3", className)} {...rest} />;
  },
);

export { cardVariants };
