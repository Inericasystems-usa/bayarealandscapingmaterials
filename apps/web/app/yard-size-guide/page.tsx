"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, Ruler, Square, Layers } from "lucide-react";
import { Button } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/AnimatedSection";
import { HERO_IMAGES } from "@/lib/site-content";
import React from "react";

const YARD_SIZES = [
  { yards: 1, label: "1 Yard", subtitle: "Small project", color: { top: "#C8A96A", left: "#8B6914", right: "#A07820", ground: "#6B4F10" }, pileScale: 0.28, coverage: { depth2: "162 sq ft", depth3: "108 sq ft", depth4: "81 sq ft" }, useCases: ["Small garden bed", "Flower border", "Potted plant fill"], truckBeds: "½ pickup truck", weight: "~1.4 tons" },
  { yards: 2, label: "2 Yards", subtitle: "Raised bed or path", color: { top: "#B8956A", left: "#7A5A14", right: "#906820", ground: "#5A4010" }, pileScale: 0.42, coverage: { depth2: "324 sq ft", depth3: "216 sq ft", depth4: "162 sq ft" }, useCases: ["Raised garden bed", "Small walkway", "Patio base"], truckBeds: "1 pickup truck", weight: "~2.8 tons" },
  { yards: 3, label: "3 Yards", subtitle: "Most popular size", color: { top: "#D4A84B", left: "#9A7A20", right: "#B08C30", ground: "#7A5E18" }, pileScale: 0.56, coverage: { depth2: "486 sq ft", depth3: "324 sq ft", depth4: "243 sq ft" }, useCases: ["Driveway section", "Large garden bed", "Playground fill"], truckBeds: "1.5 pickup trucks", weight: "~4.2 tons", popular: true },
  { yards: 5, label: "5 Yards", subtitle: "Mid-size project", color: { top: "#A89060", left: "#6A5010", right: "#7C6018", ground: "#50380C" }, pileScale: 0.70, coverage: { depth2: "810 sq ft", depth3: "540 sq ft", depth4: "405 sq ft" }, useCases: ["Full driveway", "Backyard coverage", "Erosion control"], truckBeds: "2.5 pickup trucks", weight: "~7 tons" },
  { yards: 8, label: "8 Yards", subtitle: "Large project", color: { top: "#C09050", left: "#805A10", right: "#986C18", ground: "#604410" }, pileScale: 0.82, coverage: { depth2: "1,296 sq ft", depth3: "864 sq ft", depth4: "648 sq ft" }, useCases: ["Commercial lot", "Large driveway", "Slope stabilization"], truckBeds: "4 pickup trucks", weight: "~11 tons" },
  { yards: 10, label: "10 Yards", subtitle: "Contractor load", color: { top: "#E0B060", left: "#A07820", right: "#BC8C28", ground: "#806010" }, pileScale: 0.95, coverage: { depth2: "1,620 sq ft", depth3: "1,080 sq ft", depth4: "810 sq ft" }, useCases: ["Full property coverage", "Large commercial", "Bulk contractor"], truckBeds: "5 pickup trucks", weight: "~14 tons" },
];

type Size = (typeof YARD_SIZES)[number];

function IsometricPile({ scale, color }: { scale: number; color: Size["color"] }) {
  const W = 200, H = 160, cx = W / 2;
  const gRx = 80 * scale, gRy = 28 * scale, gCy = H * 0.78;
  const pileH = 95 * scale, pileW = 130 * scale;
  const apex = { x: cx, y: gCy - pileH };
  const leftBase = [{ x: cx - pileW / 2, y: gCy - gRy * 0.3 }, { x: cx, y: gCy + gRy * 0.5 }, { x: cx, y: apex.y + 4 }, { x: cx - pileW * 0.15, y: apex.y - 4 }];
  const rightBase = [{ x: cx + pileW / 2, y: gCy - gRy * 0.3 }, { x: cx, y: gCy + gRy * 0.5 }, { x: cx, y: apex.y + 4 }, { x: cx + pileW * 0.15, y: apex.y - 4 }];
  const topCap = [{ x: cx - pileW * 0.15, y: apex.y - 4 }, { x: cx, y: apex.y - 14 }, { x: cx + pileW * 0.15, y: apex.y - 4 }, { x: cx, y: apex.y + 4 }];
  const pts = (arr: { x: number; y: number }[]) => arr.map((p) => `${p.x},${p.y}`).join(" ");
  const particles = [
    { x: cx - 20 * scale, y: gCy - 18 * scale, r: 2.5 * scale },
    { x: cx + 25 * scale, y: gCy - 30 * scale, r: 2 * scale },
    { x: cx - 35 * scale, y: gCy - 8 * scale, r: 1.8 * scale },
    { x: cx + 10 * scale, y: gCy - 50 * scale, r: 1.5 * scale },
    { x: cx - 10 * scale, y: gCy - 60 * scale, r: 1.2 * scale },
    { x: cx + 40 * scale, y: gCy - 12 * scale, r: 2.2 * scale },
  ];
  const gid = `gnd-${scale}`, sid = `sh-${scale}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" style={{ overflow: "visible" }}>
      <defs>
        <radialGradient id={gid} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color.ground} stopOpacity="0.5" />
          <stop offset="100%" stopColor={color.ground} stopOpacity="0.1" />
        </radialGradient>
        <filter id={sid} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#00000040" />
        </filter>
      </defs>
      <ellipse cx={cx} cy={gCy + gRy * 0.3} rx={gRx * 1.2} ry={gRy * 0.8} fill={`url(#${gid})`} />
      <ellipse cx={cx} cy={gCy} rx={gRx} ry={gRy} fill={color.ground} opacity={0.6} />
      <g filter={`url(#${sid})`}>
        <polygon points={pts(leftBase)} fill={color.left} />
        <polygon points={pts(rightBase)} fill={color.right} />
        <polygon points={pts(topCap)} fill={color.top} />
      </g>
      {particles.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={p.r} fill={color.ground} opacity={0.5} />
      ))}
      <line x1={cx - 8 * scale} y1={apex.y - 2} x2={cx + 8 * scale} y2={apex.y - 8} stroke="white" strokeWidth={1.5 * scale} strokeOpacity={0.35} strokeLinecap="round" />
    </svg>
  );
}

function YardCard({ size }: { size: Size }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.div
      className="relative cursor-pointer overflow-hidden rounded-[var(--radius-xl)]"
      style={{
        background: "linear-gradient(145deg, #143427 0%, #081710 100%)",
        boxShadow: hovered ? "0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(116,175,142,0.5)" : "0 8px 32px rgba(0,0,0,0.35)",
      }}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      {size.popular && (
        <div className="absolute right-3 top-3 z-10 rounded-full bg-[var(--color-moss-500)] px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
          Most Popular
        </div>
      )}
      <div className="absolute left-4 top-4 z-10">
        <span className="text-3xl font-black leading-none text-white">{size.yards}</span>
        <span className="ml-1 text-sm font-bold text-[var(--color-moss-300)]">yd³</span>
        <div className="mt-0.5 text-xs text-[var(--color-moss-200)]">{size.subtitle}</div>
      </div>
      <div className="flex h-48 items-end justify-center px-4 pb-2 pt-10">
        <motion.div className="h-full w-full" animate={hovered ? { scale: 1.06, y: -4 } : { scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 250, damping: 18 }}>
          <IsometricPile scale={size.pileScale} color={size.color} />
        </motion.div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 px-4 pb-2 pt-2">
        {[
          { v: size.weight, l: "approx. weight" },
          { v: size.truckBeds, l: "truck equivalent" },
          { v: size.coverage.depth3, l: '@ 3" depth' },
        ].map((s, i) => (
          <div key={i} className="flex items-center">
            {i > 0 && <div className="mr-2 h-8 w-px bg-white/10" />}
            <div className="text-center">
              <div className="text-sm font-bold text-[var(--color-moss-300)]">{s.v}</div>
              <div className="text-xs text-[var(--color-moss-200)]/70">{s.l}</div>
            </div>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 flex flex-col justify-center bg-[var(--color-moss-950)]/96 px-5 py-4"
          >
            <div className="mb-1 text-2xl font-black text-[var(--color-moss-300)]">{size.label}</div>
            <div className="mb-4 text-sm text-[var(--color-stone-300)]">Coverage at different depths:</div>
            <div className="mb-4 space-y-2">
              {[
                { depth: '2"', area: size.coverage.depth2 },
                { depth: '3"', area: size.coverage.depth3 },
                { depth: '4"', area: size.coverage.depth4 },
              ].map((row) => (
                <div key={row.depth} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                  <span className="text-sm font-medium text-[var(--color-stone-300)]">{row.depth} deep</span>
                  <span className="text-sm font-bold text-white">{row.area}</span>
                </div>
              ))}
            </div>
            <div className="mb-3 text-xs text-[var(--color-stone-400)]">Common uses:</div>
            <div className="mb-4 flex flex-wrap gap-1">
              {size.useCases.map((u) => (
                <span key={u} className="rounded-full bg-[var(--color-moss-500)]/20 px-2 py-0.5 text-xs text-[var(--color-moss-200)]">{u}</span>
              ))}
            </div>
            <Link href="/request-quote">
              <motion.div className="flex items-center justify-center gap-2 rounded-lg bg-[var(--color-moss-600)] py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--color-moss-500)]" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                Order {size.label} <ArrowRight className="h-4 w-4" />
              </motion.div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CoverageScaleBar() {
  return (
    <FadeIn>
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] shadow-[var(--shadow-lg)]">
        <div className="bg-[var(--color-moss-950)] px-6 py-4">
          <h3 className="font-display text-lg font-light text-white">Coverage at a Glance</h3>
          <p className="text-sm text-[var(--color-moss-200)]">Square footage covered at 3-inch depth</p>
        </div>
        <div className="bg-[var(--color-bg-elevated)] p-6">
          <div className="space-y-3">
            {YARD_SIZES.map((size) => {
              const area = parseInt(size.coverage.depth3.replace(/,/g, ""));
              const pct = Math.min((area / 1080) * 100, 100);
              return (
                <div key={size.yards} className="flex items-center gap-4">
                  <div className="w-16 text-right text-sm font-bold text-[var(--color-text-secondary)]">{size.label}</div>
                  <div className="relative h-7 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-sunken)]">
                    <motion.div
                      className="flex h-full items-center justify-end rounded-full pr-3"
                      style={{ background: "linear-gradient(90deg, #143427, #22573b, #74af8e)", width: `${pct}%` }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: size.yards * 0.05, ease: "easeOut" }}
                    >
                      <span className="whitespace-nowrap text-xs font-bold text-white">{size.coverage.depth3}</span>
                    </motion.div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-center text-xs text-[var(--color-text-muted)]">
            All values at 3-inch depth. Actual coverage varies by material density.
          </p>
        </div>
      </div>
    </FadeIn>
  );
}

function DepthGuide() {
  const items = [
    { title: "Mulch & Bark", depth: '2–3"', desc: "Optimal weed suppression and moisture retention", icon: Layers, color: "bg-[var(--color-moss-100)] text-[var(--color-moss-700)]" },
    { title: "Decorative Gravel", depth: '2–4"', desc: "Depending on aesthetic preference and traffic", icon: Square, color: "bg-[var(--color-clay-500)]/15 text-[var(--color-clay-500)]" },
    { title: "Base Rock", depth: '4–6"', desc: "Proper foundation for structures and driveways", icon: Ruler, color: "bg-[var(--color-stone-200)] text-[var(--color-stone-700)]" },
    { title: "Play Sand", depth: '6–8"', desc: "Safe cushioning depth for playgrounds", icon: Square, color: "bg-[var(--color-sky-100)] text-[var(--color-sky-600)]" },
  ];
  return (
    <FadeIn>
      <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-moss-200)] bg-gradient-to-br from-[var(--color-moss-50)] to-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
        <div className="border-b border-[var(--color-moss-200)] px-6 py-5">
          <h3 className="font-display text-xl font-light text-[var(--color-text-primary)]">Recommended Depths by Material</h3>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Industry-standard guidelines for best results</p>
        </div>
        <div className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2">
          {items.map((item, i) => (
            <FadeIn key={i} delay={i * 0.1}>
              <div className="flex items-start gap-4">
                <div className={`grid h-14 w-14 flex-shrink-0 place-items-center rounded-[var(--radius-lg)] ${item.color}`}>
                  <span className="text-center text-sm font-black leading-tight">{item.depth}</span>
                </div>
                <div>
                  <div className="font-bold text-[var(--color-text-primary)]">{item.title}</div>
                  <div className="mt-0.5 text-sm text-[var(--color-text-muted)]">{item.desc}</div>
                </div>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </FadeIn>
  );
}

export default function YardSizeGuidePage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Visual Reference"
        title="Yard Size Guide"
        subtitle="Interactive 3D visualizations to help you estimate exactly how much material you need — hover each card for coverage details."
        imageUrl={HERO_IMAGES.main}
      />

      <section className="bg-[var(--color-bg-surface)] py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <FadeIn className="mb-10">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="mb-2 font-display text-3xl font-light text-[var(--color-text-primary)]">
                  How Much Material Do You Need?
                </h2>
                <p className="max-w-2xl text-lg text-[var(--color-text-secondary)]">
                  Each card below is a 3D visualization of the actual pile size. Hover to see coverage area, common uses, and order directly.
                </p>
              </div>
              <Link href="/calculator">
                <span className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-moss-300)] bg-[var(--color-moss-100)] px-4 py-2 text-sm font-semibold text-[var(--color-moss-700)] transition-colors hover:bg-[var(--color-moss-200)]">
                  Use the Calculator <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            </div>
          </FadeIn>

          <StaggerContainer className="mb-14 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3" staggerDelay={0.1}>
            {YARD_SIZES.map((size) => (
              <StaggerItem key={size.yards}>
                <YardCard size={size} />
              </StaggerItem>
            ))}
          </StaggerContainer>

          <div className="mb-10">
            <CoverageScaleBar />
          </div>

          <DepthGuide />

          <FadeIn className="mt-12">
            <div className="flex flex-col items-center justify-between gap-6 rounded-[var(--radius-xl)] bg-gradient-to-r from-[var(--color-moss-900)] to-[var(--color-moss-950)] p-8 md:flex-row">
              <div>
                <div className="mb-1 text-sm font-semibold uppercase tracking-widest text-[var(--color-moss-300)]">
                  Ready to order?
                </div>
                <h3 className="font-display text-2xl font-light text-white">Not sure how much you need?</h3>
                <p className="mt-1 text-[var(--color-moss-200)]">
                  Our team will help you estimate the right amount for your project.
                </p>
              </div>
              <div className="flex flex-shrink-0 gap-3">
                <Link href="/calculator">
                  <Button variant="secondary" size="lg" className="border-white/30 bg-transparent text-white hover:bg-white/10">
                    Calculator
                  </Button>
                </Link>
                <Link href="/request-quote">
                  <Button size="lg">
                    Request Quote <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                </Link>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>
    </PageShell>
  );
}
