import type { CSSProperties, ReactNode } from "react";

/**
 * Entrance effects, CSS only (no client JavaScript).
 *
 * Content is ALWAYS visible by default. The reveal is a progressive
 * enhancement in globals.css: where the browser supports scroll-driven
 * animations (`animation-timeline: view()`) and the visitor has not asked
 * for reduced motion, a block rises a few pixels as it scrolls into view
 * (movement only: a scroll-linked fade would leave text at the screen's
 * bottom edge below contrast minimums). Anything already on screen at load is at the end of its
 * range, so nothing above the fold waits on an animation (this used to
 * hold product grids and hero text at opacity 0 until framer-motion
 * hydrated, which was most of the mobile LCP render delay).
 *
 * Motion is vertical only: the old horizontal slide-ins started 40–60 px
 * off to the side and made /request-quote and /contact scroll sideways
 * on phones.
 *
 * The component names and props are kept so existing pages need no edits;
 * `direction` and `delay` are accepted and ignored except for a small
 * per-item stagger.
 */

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: "up" | "down" | "left" | "right";
};

function Reveal({ children, className = "", delay = 0 }: RevealProps) {
  const style = delay ? ({ "--reveal-delay": `${Math.min(delay, 0.4)}s` } as CSSProperties) : undefined;
  return (
    <div className={`reveal ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function FadeIn(props: RevealProps) {
  return <Reveal {...props} />;
}

export function SlideIn(props: RevealProps) {
  return <Reveal {...props} />;
}

export function StaggerContainer({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  return <div className={className}>{children}</div>;
}

export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <Reveal className={className}>{children}</Reveal>;
}

/** Lift on hover/focus-within; disabled for reduced motion in globals.css. */
export function HoverCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`hover-lift ${className}`.trim()}>{children}</div>;
}

export function AnimatedCounter({ value, className = "" }: { value: string; className?: string }) {
  return <span className={className}>{value}</span>;
}
