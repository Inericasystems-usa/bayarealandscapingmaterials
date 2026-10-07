import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "../lib/cn";

type ContainerSize = "prose" | "narrow" | "default" | "wide" | "fluid";

const sizes: Record<ContainerSize, string> = {
  prose: "max-w-[65ch]",
  narrow: "max-w-3xl",
  default: "max-w-7xl",
  wide: "max-w-[1536px]",
  fluid: "max-w-none",
};

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: ContainerSize;
}

/**
 * Page width constraint — see docs/architecture/design-system.md §5.2
 */
export const Container = forwardRef<HTMLDivElement, ContainerProps>(function Container(
  { className, size = "default", ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn("mx-auto w-full px-6 md:px-8", sizes[size], className)}
      {...rest}
    />
  );
});
