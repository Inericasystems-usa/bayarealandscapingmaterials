import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * BALM Button primitive — see docs/architecture/design-system.md §10.1
 *
 * Variants follow semantic tokens, never raw palette.
 *
 * Sizes:  sm=32px, md=40px (default), lg=48px (CTAs), xl=56px (hero), icon (square)
 */
const buttonVariants = cva(
  // Base — applies to every variant
  [
    "inline-flex items-center justify-center gap-2",
    "font-medium whitespace-nowrap",
    "rounded-[var(--radius-md)]",
    "transition-[background,color,box-shadow,transform]",
    "duration-[var(--duration-instant)] ease-[var(--ease-standard)]",
    "focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2",
    "disabled:opacity-50 disabled:pointer-events-none",
    "active:translate-y-px",
  ],
  {
    variants: {
      variant: {
        primary: [
          "bg-[var(--color-action)] text-[var(--color-action-fg)]",
          "hover:bg-[var(--color-action-hover)]",
          "active:bg-[var(--color-action-press)]",
          "shadow-[var(--shadow-sm)]",
        ],
        secondary: [
          "bg-transparent text-[var(--color-text-primary)]",
          "border border-[var(--color-border-strong)]",
          "hover:bg-[var(--color-bg-surface)]",
        ],
        ghost: [
          "bg-transparent text-[var(--color-text-primary)]",
          "hover:bg-[var(--color-bg-surface)]",
        ],
        destructive: [
          "bg-[var(--color-danger)] text-[var(--color-stone-50)]",
          "hover:opacity-90",
        ],
        link: [
          "bg-transparent text-[var(--color-text-brand)] underline-offset-4",
          "hover:underline",
          "h-auto px-0",
        ],
      },
      size: {
        sm: "h-8 px-3 text-sm",
        md: "h-10 px-4 text-sm",
        lg: "h-12 px-6 text-base",
        xl: "h-14 px-8 text-lg",
        icon: "h-10 w-10 p-0",
      },
    },
    compoundVariants: [
      { variant: "link", size: ["sm", "md", "lg", "xl"], class: "h-auto px-0" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, type = "button", children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...rest}
    >
      {children}
    </button>
  );
});

export { buttonVariants };
