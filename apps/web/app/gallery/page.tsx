"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { FadeIn } from "@/components/AnimatedSection";
import { CDN, HERO_IMAGES } from "@/lib/site-content";

type Category =
  | "All"
  | "Driveways"
  | "Gardens"
  | "Patios & Paths"
  | "Erosion Control"
  | "Commercial"
  | "Specialty";

interface Project {
  id: number;
  title: string;
  location: string;
  category: Exclude<Category, "All">;
  material: string;
  before: string;
  after: string;
}

const PROJECTS: Project[] = [
  { id: 1, title: "Decomposed Granite Driveway", location: "Oakland, CA", category: "Driveways", material: "Decomposed Granite", before: `${CDN}/gallery-driveway-before-8MrPTaRebYR4pRAsgUxALG.webp`, after: `${CDN}/gallery-driveway-after-XMh7L7C2NeUeTDc7nWXqfJ.webp` },
  { id: 2, title: "Backyard Garden Mulch", location: "Berkeley, CA", category: "Gardens", material: "Wood Chip Mulch", before: `${CDN}/gallery-garden-before-CQHuSZLJgv4Y6KtSteBBsz.webp`, after: `${CDN}/gallery-garden-after-oTVB2ozwG2ysmBBD9JUFUg.webp` },
  { id: 3, title: "Flagstone Patio", location: "Walnut Creek, CA", category: "Patios & Paths", material: "Flagstone & Decomposed Granite", before: `${CDN}/gallery-patio-before-AW2r5P3PN3CdkwwfyxKccn.webp`, after: `${CDN}/gallery-patio-after-de4czK5Mq3yAUV2bNuCG3m.webp` },
  { id: 4, title: "Garden Stepping Stone Path", location: "San Jose, CA", category: "Patios & Paths", material: "Stepping Stones & Pea Gravel", before: `${CDN}/gallery-pathway-before-9rug6hRMfbzbfEAWPHHT5E.webp`, after: `${CDN}/gallery-pathway-after-YrW5XMS7pZ54rNggvSLJfv.webp` },
  { id: 5, title: "Hillside Erosion Control", location: "Fremont, CA", category: "Erosion Control", material: "River Rock & Boulders", before: `${CDN}/gallery-erosion-before-k3owwFTjP5GFj95SrpDTWW.webp`, after: `${CDN}/gallery-erosion-after-YQTv8tmTjCX88zNe7ZUsYp.webp` },
  { id: 6, title: "Boulder Retaining Wall", location: "Concord, CA", category: "Erosion Control", material: "Granite Boulders & Topsoil", before: `${CDN}/gallery-retwall-before-HewkfVW8QMCxanvF3QJ9Kd.webp`, after: `${CDN}/gallery-retwall-after-6CNmUSFPx6j7u7dhWWDwUe.webp` },
  { id: 7, title: "Children's Play Area", location: "Pleasanton, CA", category: "Specialty", material: "Play Sand & Wood Chip Mulch", before: `${CDN}/gallery-playground-before-cFttpc6jPWbzRCaN5Ynp7a.webp`, after: `${CDN}/gallery-playground-after-fuLWx8tucneJ9TEYda8wgp.webp` },
  { id: 8, title: "Drought-Tolerant Front Yard", location: "Richmond, CA", category: "Gardens", material: "Decomposed Granite & River Rock", before: `${CDN}/gallery-frontyard-before-NfgXyp5cKRuHCF9zJBuiU9.webp`, after: `${CDN}/gallery-frontyard-after-iQhkKk22pUJtK9rhk7M6y8.webp` },
  { id: 9, title: "Raised Vegetable Beds", location: "Napa, CA", category: "Gardens", material: "Compost & Topsoil Blend", before: `${CDN}/gallery-raisedbeds-before-Zc2n4R29mduqRVjVuwthwr.webp`, after: `${CDN}/gallery-raisedbeds-after-hgEKWnJUSy4ZzE27KkAJ2S.webp` },
  { id: 10, title: "Pool Area Decking", location: "San Francisco, CA", category: "Patios & Paths", material: "Pea Gravel & Flagstone", before: `${CDN}/gallery-poolarea-before-ZifBo8AXXw26J6MgEu3Mx9.webp`, after: `${CDN}/gallery-poolarea-after-Vrf7kHhd6w88nPTW7SxgJn.webp` },
  { id: 11, title: "Fire Pit Lounge Area", location: "Hayward, CA", category: "Patios & Paths", material: "Decomposed Granite & Stone", before: `${CDN}/gallery-firepit-before-Em87iQSSfrTLqN2tAGqfPn.webp`, after: `${CDN}/gallery-firepit-after-eNmyDUY7Si5bJFbwPGwPPN.webp` },
  { id: 12, title: "Side Yard Dog Run", location: "Vallejo, CA", category: "Specialty", material: "Pea Gravel & River Rock", before: `${CDN}/gallery-dogrun-before-EKoZUYm6k8FdBYXtYoo5Hz.webp`, after: `${CDN}/gallery-dogrun-after-BdP4AXLVkfwJgBmjDLrGdV.webp` },
  { id: 13, title: "Commercial Gravel Parking Lot", location: "Sacramento, CA", category: "Commercial", material: "Crushed Gravel Base Rock", before: `${CDN}/gallery-commercial-before-7KR8EyHBRa6bvSETmsXP4H.webp`, after: `${CDN}/gallery-commercial-after-bVNcs2mKwdUiXunQteJGHK.webp` },
  { id: 14, title: "Japanese Zen Garden", location: "Walnut Creek, CA", category: "Specialty", material: "White Pea Gravel & River Rock", before: `${CDN}/gallery-zengarden-before-TUHKLCNvqvkYLhNShAJbHp.webp`, after: `${CDN}/gallery-zengarden-after-CK7Da8btZfHzyR6Gyt6BUB.webp` },
  { id: 15, title: "Backyard Drainage Solution", location: "Stockton, CA", category: "Erosion Control", material: "River Rock & Drain Rock", before: `${CDN}/gallery-drainage-before-MiF9a2LX5t8dS9iPVzahXL.webp`, after: `${CDN}/gallery-drainage-after-DojqTQywvJH6m6k44LGtVE.webp` },
];

const CATEGORIES: Category[] = ["All", "Driveways", "Gardens", "Patios & Paths", "Erosion Control", "Commercial", "Specialty"];

function BeforeAfterSlider({ before, after, title }: { before: string; after: string; title: string }) {
  const [sliderPos, setSliderPos] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateSlider = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, []);

  useEffect(() => {
    const move = (e: MouseEvent) => isDragging && updateSlider(e.clientX);
    const touch = (e: TouchEvent) => {
      if (isDragging && e.touches[0]) updateSlider(e.touches[0].clientX);
    };
    const up = () => setIsDragging(false);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    window.addEventListener("touchmove", touch);
    window.addEventListener("touchend", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      window.removeEventListener("touchmove", touch);
      window.removeEventListener("touchend", up);
    };
  }, [isDragging, updateSlider]);

  return (
    <div
      ref={containerRef}
      className="relative w-full cursor-col-resize select-none overflow-hidden rounded-[var(--radius-lg)]"
      style={{ aspectRatio: "4/3" }}
      onMouseDown={(e) => { setIsDragging(true); updateSlider(e.clientX); }}
      onTouchStart={(e) => { const t = e.touches[0]; if (t) { setIsDragging(true); updateSlider(t.clientX); } }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={after} alt={`${title} after`} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute inset-0 overflow-hidden" style={{ width: `${sliderPos}%` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={before} alt={`${title} before`} className="absolute inset-0 h-full w-full object-cover" style={{ width: `${10000 / sliderPos}%`, maxWidth: "none" }} draggable={false} />
      </div>
      <div className="absolute bottom-0 top-0 w-0.5 bg-white shadow-[0_0_8px_rgba(0,0,0,0.6)]" style={{ left: `${sliderPos}%`, transform: "translateX(-50%)" }}>
        <div className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full bg-white shadow-lg">
          <ChevronLeft className="h-3 w-3 text-[var(--color-moss-800)]" />
          <ChevronRight className="h-3 w-3 text-[var(--color-moss-800)]" />
        </div>
      </div>
      <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2 py-1 text-xs font-bold text-white backdrop-blur-sm">BEFORE</div>
      <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-[var(--color-moss-600)]/90 px-2 py-1 text-xs font-bold text-white backdrop-blur-sm">AFTER</div>
    </div>
  );
}

export default function GalleryPage() {
  const [active, setActive] = useState<Category>("All");
  const filtered = active === "All" ? PROJECTS : PROJECTS.filter((p) => p.category === active);

  return (
    <PageShell>
      <PageHero
        eyebrow="Customer Projects"
        title="Project Gallery"
        subtitle="Real before & after transformations from customers across the Bay Area — drag the slider to reveal the difference our materials make."
        imageUrl={HERO_IMAGES.main}
      />

      {/* Category filter */}
      <section className="sticky top-16 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] md:top-20">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActive(cat)}
                className={`flex-shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                  active === cat
                    ? "bg-[var(--color-action)] text-[var(--color-action-fg)] shadow-[var(--shadow-sm)]"
                    : "bg-[var(--color-bg-surface)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-sunken)]"
                }`}
              >
                {cat}
                {cat !== "All" && (
                  <span className={`ml-1.5 text-xs ${active === cat ? "text-white/80" : "text-[var(--color-text-muted)]"}`}>
                    ({PROJECTS.filter((p) => p.category === cat).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery grid */}
      <section className="bg-[var(--color-bg-surface)] py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-6 flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-muted)]">
              Showing <span className="font-semibold text-[var(--color-text-primary)]">{filtered.length}</span> projects
              {active !== "All" && <span> in <span className="font-semibold text-[var(--color-text-brand)]">{active}</span></span>}
            </p>
            <p className="hidden text-xs text-[var(--color-text-muted)] sm:block">
              Drag the slider on each card to compare before &amp; after
            </p>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
            >
              {filtered.map((project, idx) => (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.05 }}
                  className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-md)] transition-shadow hover:shadow-[var(--shadow-xl)]"
                >
                  <BeforeAfterSlider before={project.before} after={project.after} title={project.title} />
                  <div className="p-4">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h3 className="text-base font-bold leading-tight text-[var(--color-text-primary)]">{project.title}</h3>
                      <span className="flex-shrink-0 rounded-full bg-[var(--color-moss-100)] px-2 py-0.5 text-xs font-semibold text-[var(--color-moss-700)]">{project.category}</span>
                    </div>
                    <p className="mb-2 text-xs text-[var(--color-text-muted)]">{project.location}</p>
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-moss-500)]" />
                      <span className="text-xs text-[var(--color-text-secondary)]">{project.material}</span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>

          <FadeIn className="mt-14 text-center">
            <div className="inline-block max-w-xl rounded-[var(--radius-xl)] bg-gradient-to-br from-[var(--color-moss-900)] to-[var(--color-moss-950)] px-10 py-8">
              <h3 className="mb-2 font-display text-2xl font-light text-white">Ready to Transform Your Space?</h3>
              <p className="mb-6 text-sm text-[var(--color-moss-200)]">
                Get a free quote for your project — we deliver throughout the Bay Area.
              </p>
              <Link href="/request-quote">
                <Button size="lg">
                  Request a Free Quote
                  <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </Button>
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>
    </PageShell>
  );
}
