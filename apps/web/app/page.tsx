import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Calculator, MessagesSquare, Sprout, Tag, Truck, Zap } from "lucide-react";
import { Button } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { Hero } from "@/components/home/Hero";
import { MaterialShowcase } from "@/components/home/MaterialShowcase";
import { GoogleReviews } from "@/components/home/GoogleReviews";
import { PopularMaterials } from "@/components/home/PopularMaterials";
import { SERVICES } from "@/lib/site-content";
import { SCENES } from "@/lib/scenes";
import footer_img from "@/public/image/home_footer.png"
import React from "react";

// Self-referencing canonical. Set per route (never on the root layout) so a
// nested page can't inherit the home page's URL as its own canonical.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Re-render daily so the Google reviews band stays current.
export const revalidate = 86400;

const WHY_US = [
  { t: "Quarried & blended right", d: "Premium base rock, decomposed granite, and custom soil mixes from suppliers we've vetted for over a decade." },
  { t: "Delivered, not dumped", d: "Careful crews across SF, Oakland, San Jose, Sacramento and beyond — placed where you want it." },
  { t: "Priced by the yard", d: "Honest bulk pricing and same-day quotes. No mystery fees, no upsell." },
  { t: "We know dirt", d: "Talk to people who've spec'd retaining walls and garden paths for 10,000+ Bay Area projects." },
] as const;

const SERVICE_ICONS: Record<string, typeof Truck> = {
  "Bulk Delivery": Truck,
  "Custom Soil Blends": Sprout,
  "Material Calculator": Calculator,
  "Expert Consultation": MessagesSquare,
  "Competitive Pricing": Tag,
  "Same-Day Quotes": Zap,
};

const SCALE = [
  { value: "150+", label: "Products in stock" },
  { value: "10,000+", label: "Projects supplied" },
  { value: "25+", label: "Delivery trucks" },
] as const;

export default function HomePage() {
  return (
    <PageShell>
      {/* ── HERO — structured, trust-forward ─────────────────── */}
      <Hero />

      {/* ── SHOP BY MATERIAL — category grid ─────────────────── */}
      <MaterialShowcase />

      {/* ── CORE MATERIALS — real products, real prices ─────── */}
      <PopularMaterials />

      {/* ── WHY THE YARD — value props + scale ───────────────── */}
      <section className="bg-[var(--color-moss-50)] py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
            {/* image + badge */}
            <div className="relative self-start">
              <div className="overflow-hidden rounded-[var(--radius-2xl)] shadow-[var(--shadow-xl)]">
                <Image
                  src={SCENES.contractor.tall}
                  alt={SCENES.contractor.alt}
                  width={720}
                  height={840}
                  sizes="(min-width:1024px) 40vw, 100vw"
                  className="h-auto w-full object-cover"
                />
              </div>
              {/* <div className="absolute -right-3 -top-3 rounded-[var(--radius-lg)] bg-[var(--color-clay-500)] px-5 py-4 text-white shadow-[var(--shadow-xl)] sm:-right-5">
                <div className="font-display text-4xl font-semibold leading-none">Since</div>
                <div className="mt-1 text-xs uppercase tracking-widest opacity-90">2014</div>
              </div> */}
            </div>

            <div>
              <span className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--color-text-brand)]">
                Why the yard
              </span>
              <h2 className="mt-3 font-display text-[clamp(2rem,4vw,3.4rem)] font-light leading-[1.04] tracking-tight text-[var(--color-text-primary)]">
                Honest ground — quarried well,{" "}
                <span className="italic text-[var(--color-text-brand)]">priced fair, delivered right.</span>
              </h2>

              <div className="mt-8 grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
                {WHY_US.map((w, i) => (
                  <div key={w.t} className="flex gap-4">
                    <span className="font-mono text-sm text-[var(--color-text-muted)]">0{i + 1}</span>
                    <div>
                      <h3 className="font-display text-lg font-medium text-[var(--color-text-primary)]">{w.t}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">{w.d}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* scale numbers */}
              <div className="mt-10 grid grid-cols-3 gap-4 border-t border-[var(--color-border)] pt-8">
                {SCALE.map((s) => (
                  <div key={s.label}>
                    <div className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-semibold leading-none text-[var(--color-text-brand)]">
                      {s.value}
                    </div>
                    <div className="mt-1.5 text-xs leading-tight text-[var(--color-text-muted)]">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── COVERAGE — green calculator band ─────────────────── */}
      <section className="bg-[var(--color-moss-700)] py-16 md:py-20">
        <div className="mx-auto flex max-w-7xl flex-col items-start gap-8 px-4 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/15 text-white">
                <Calculator className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <h2 className="font-display text-[clamp(1.6rem,3vw,2.4rem)] font-light leading-tight tracking-tight text-white">
                Not sure how much you need?
              </h2>
            </div>
            <p className="mt-4 text-lg leading-relaxed text-[var(--color-moss-100)]">
              One cubic yard covers about 100 sq ft at 3 inches deep. Use the coverage calculator to
              get an exact figure for your project, or call the yard and we&apos;ll work it out with you.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link
              href="/calculator"
              className="inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 font-semibold text-[var(--color-moss-950)] shadow-[var(--shadow-md)] transition-colors duration-200 hover:bg-[var(--color-moss-100)]"
            >
              Open calculator
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <Link
              href="/request-quote"
              className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-transparent px-7 py-3.5 font-semibold text-white transition-colors duration-200 hover:bg-white/10"
            >
              Request a quote
            </Link>
          </div>
        </div>
      </section>

      {/* ── SERVICES — clean index ───────────────────────────── */}
      <section className="bg-[var(--color-bg-page)] py-20 md:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-border)] pb-6">
            <h2 className="font-display text-[clamp(1.9rem,4vw,3.25rem)] font-light leading-none tracking-tight text-[var(--color-text-primary)]">
              What we do
            </h2>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              From yard to jobsite
            </span>
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {SERVICES.map((s) => {
              const Icon = SERVICE_ICONS[s.title] ?? ArrowUpRight;
              return (
                <li key={s.title}>
                  <Link
                    href={s.href}
                    className="hover-lift group flex h-full flex-col rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 transition-colors hover:border-[var(--color-moss-300)] sm:p-6"
                  >
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-moss-50)] text-[var(--color-moss-700)] transition-colors duration-300 group-hover:bg-[var(--color-moss-700)] group-hover:text-white">
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <h3 className="mt-4 flex items-center gap-1.5 font-display text-base font-medium text-[var(--color-text-primary)] sm:text-xl">
                      {s.title}
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-[var(--color-text-brand)]"
                        aria-hidden
                      />
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">{s.description}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* ── TRUSTED LOCALLY — honest trust band (real reviews live on Google) ── */}
      <section className="bg-[var(--color-bg-surface)] py-20 md:py-28">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--color-text-brand)]">
            Trusted across the Bay Area
          </span>
          <h2 className="mt-6 font-display text-[clamp(1.7rem,3.6vw,2.8rem)] font-light leading-[1.15] tracking-tight text-[var(--color-text-primary)]">
            A family-owned yard that&apos;s supplied{" "}
            <span className="italic text-[var(--color-text-brand)]">10,000+ Bay Area projects</span>{" "}
            
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)]">
            Contractors and homeowners from San Francisco to Sacramento count on us for honest bulk
            pricing and material that shows up on time. Read what they say — in their own words — on
            Google.
          </p>
          <div className="mt-8">
            <a
              href="https://www.google.com/maps/search/Bay+Area+Landscaping+Materials+Richmond+CA"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-7 py-3.5 font-semibold text-[var(--color-text-brand)] shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-moss-50)]"
            >
              Read our reviews on Google Maps
              <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </a>
          </div>
        </div>
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <GoogleReviews />
        </div>
      </section>

      {/* ── FINAL CTA — full-bleed material ──────────────────── */}
      <section className="relative overflow-hidden bg-[var(--color-moss-950)] py-24 md:py-32">
        {/* Faint texture under a 90% wash: low quality is invisible here and saves bytes. */}
        <Image src={footer_img} alt="" fill sizes="100vw" quality={50} className="object-cover opacity-35" />
        {/* bold green wash — image reads as faint texture only */}
        <div className="absolute inset-0 bg-[color-mix(in_oklab,var(--color-moss-900)_90%,transparent)] mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-br from-[color-mix(in_oklab,var(--color-moss-800)_92%,transparent)] via-[color-mix(in_oklab,var(--color-moss-900)_95%,transparent)] to-[color-mix(in_oklab,var(--color-moss-950)_97%,transparent)]" />
        {/* vertical darkening behind the copy block */}
        <div className="absolute inset-0 bg-gradient-to-b from-[color-mix(in_oklab,var(--color-moss-950)_45%,transparent)] via-transparent to-[color-mix(in_oklab,var(--color-moss-950)_55%,transparent)]" />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] font-light leading-[1.0] tracking-tight text-white">
            Ready to break <span className="italic text-[var(--color-moss-300)]">ground?</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-[var(--color-stone-200)]">
            Free quote today — delivered across San Francisco, Oakland, San Jose, Sacramento, Santa
            Rosa, Stockton, and the rest of Northern California.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/request-quote"
              className="inline-flex items-center gap-2 rounded-full bg-white px-8 py-4 font-semibold text-[var(--color-moss-950)] transition-colors duration-200 hover:bg-[var(--color-moss-300)]"
            >
              Request a quote <ArrowRight className="h-5 w-5" strokeWidth={2} aria-hidden />
            </Link>
            <Link href="/contact">
              <Button
                size="xl"
                variant="secondary"
                className="w-full border-white/30 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 sm:w-auto"
              >
                Contact us
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
