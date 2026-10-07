"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Phone, Check } from "lucide-react";
import { Button, Container } from "@balm/ui";
import { COMPANY } from "@/lib/company";

// Brand assets from the current site CDN (bayarealandscapingmaterials.com).
const HERO_VIDEO =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663521319543/GbZEVBzVkRmts6C6tGgLns/hero-loop-seamless_7102ba48.mp4";
const HERO_POSTER =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663521319543/GbZEVBzVkRmts6C6tGgLns/keyframe-gravel-f9dPkNYaRswQNZgwbHXkKj.webp";

const CYCLE_WORDS = [
  "Sand & Gravel",
  "Flagstone",
  "Mulch & Bark",
  "Pavers",
  "Compost & Soil",
  "Decorative Rock",
];

const VALUE_PROPS = ["Fast Delivery", "Competitive Pricing", "Expert Support"];

export function HomeHero() {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setWordIndex((i) => (i + 1) % CYCLE_WORDS.length), 2500);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="relative flex min-h-[88vh] items-center overflow-hidden bg-[var(--color-moss-950)]">
      {/* Looping yard video */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={HERO_POSTER}
          className="h-full w-full object-cover"
        >
          <source src={HERO_VIDEO} type="video/mp4" />
        </video>
        {/* Forest-green brand wash for legibility */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-r from-[oklch(0.14_0.04_160/0.88)] via-[oklch(0.16_0.05_160/0.66)] to-[oklch(0.16_0.05_160/0.28)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[var(--color-moss-950)] via-transparent to-transparent"
        />
      </div>

      {/* Live yard badge */}
      <div className="absolute bottom-8 right-6 z-20 hidden sm:block">
        <span className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 backdrop-blur-sm">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--color-moss-300)]" />
          <span className="text-xs font-semibold tracking-wide text-white/80">LIVE YARD</span>
        </span>
      </div>

      <Container className="relative z-10 py-24">
        <div className="max-w-2xl">
          <div className="mb-6 flex items-center gap-3">
            <span className="h-px w-12 bg-[var(--color-moss-400)]" />
            <span className="text-sm font-semibold uppercase tracking-widest text-[var(--color-moss-300)]">
              Bay Area&apos;s Trusted Supplier
            </span>
          </div>

          <h1 className="font-display text-5xl font-extrabold leading-[1.05] text-white md:text-7xl">
            Premium
            <br />
            <span
              key={wordIndex}
              className="inline-block animate-[fadeUp_0.5s_ease-out] text-[var(--color-moss-300)]"
            >
              {CYCLE_WORDS[wordIndex]}
            </span>
            <br />
            for the Bay Area
          </h1>

          <p className="mt-6 max-w-xl text-lg text-[var(--color-stone-100)] leading-relaxed md:text-xl">
            Quality landscaping supplies — sand, gravel, mulch, soil, and stone. Serving
            contractors and homeowners with fast delivery and expert service.
          </p>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-white">
            {VALUE_PROPS.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-moss-500)]">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />
                </span>
                <span className="font-medium">{item}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row">
            <Link href="/request-quote">
              <Button size="xl" className="w-full sm:w-auto">
                Request a Quote
                <ArrowRight className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </Button>
            </Link>
            <a href={`tel:${COMPANY.phoneE164}`} data-call-location="unknown">
              <Button
                size="xl"
                variant="secondary"
                className="w-full border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 sm:w-auto"
              >
                <Phone className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                {COMPANY.phone}
              </Button>
            </a>
          </div>
        </div>
      </Container>
    </section>
  );
}
