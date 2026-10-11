import type { CSSProperties } from "react";

// Deterministic positions (no Math.random — SSR-safe).
const MOTES = [
  { x: 12, y: 30, s: 8, d: 0, t: 6 },
  { x: 28, y: 68, s: 5, d: 1.2, t: 7 },
  { x: 46, y: 22, s: 10, d: 0.6, t: 5.5 },
  { x: 63, y: 55, s: 6, d: 2.1, t: 6.5 },
  { x: 78, y: 34, s: 7, d: 0.3, t: 7.5 },
  { x: 88, y: 64, s: 5, d: 1.6, t: 6 },
  { x: 36, y: 44, s: 4, d: 2.4, t: 8 },
  { x: 70, y: 78, s: 6, d: 0.9, t: 5 },
];

/**
 * Subtle breathing glow + floating motes for page heroes. Decorative only,
 * CSS animations (opacity/transform, composited) with no client JavaScript,
 * still when the visitor prefers reduced motion (globals.css).
 */
export function HeroDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="hero-glow absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 55% 50% at 18% 60%, rgba(116,175,142,0.30) 0%, transparent 70%)",
        }}
      />
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="hero-mote absolute rounded-full bg-[color-mix(in_oklab,var(--color-moss-300)_30%,transparent)]"
          style={
            {
              left: `${m.x}%`,
              top: `${m.y}%`,
              width: m.s,
              height: m.s,
              animationDuration: `${m.t}s`,
              animationDelay: `${m.d}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
