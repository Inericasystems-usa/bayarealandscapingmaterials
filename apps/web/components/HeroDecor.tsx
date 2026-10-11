"use client";

import { motion } from "framer-motion";

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

/** Subtle animated glow + floating motes for hero sections. Decorative only. */
export function HeroDecor() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.18, 0.4, 0.18] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background:
            "radial-gradient(ellipse 55% 50% at 18% 60%, rgba(116,175,142,0.30) 0%, transparent 70%)",
        }}
      />
      {MOTES.map((m, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-[color-mix(in_oklab,var(--color-moss-300)_30%,transparent)]"
          style={{ left: `${m.x}%`, top: `${m.y}%`, width: m.s, height: m.s }}
          animate={{ y: [0, -26, 0], opacity: [0.2, 0.6, 0.2], scale: [1, 1.3, 1] }}
          transition={{ duration: m.t, delay: m.d, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
