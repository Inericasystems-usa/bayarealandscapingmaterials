import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, MapPin, Shield, Star, Truck, Users } from "lucide-react";
import { Button } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import {
  AnimatedCounter,
  FadeIn,
  SlideIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/AnimatedSection";
import { COMPANY } from "@/lib/company";
import { STATS } from "@/lib/site-content";
import { SCENES } from "@/lib/scenes";
import { sceneShare } from "@/lib/scene-meta";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Bay Area Landscaping Materials has supplied premium landscaping and building materials to contractors, landscapers, and homeowners across the East Bay and Northern California.",
  alternates: { canonical: "/about" },
  ...sceneShare("contractor", "/about"),
};

const VALUES = [
  {
    icon: Award,
    title: "Premium Quality",
    desc: "We source only the finest materials from trusted suppliers to ensure your projects stand the test of time.",
  },
  {
    icon: Truck,
    title: "Reliable Delivery",
    desc: "Fast, dependable delivery throughout the Bay Area with our fleet of 25+ vehicles.",
  },
  {
    icon: Users,
    title: "Expert Team",
    desc: "Our knowledgeable staff provides personalized guidance for every project, big or small.",
  },
  {
    icon: Shield,
    title: "Competitive Pricing",
    desc: "We offer the best prices on premium materials without compromising on quality.",
  },
  {
    icon: Star,
    title: "Wide Selection",
    desc: "Over 150 products across landscaping, hardscaping, and construction materials.",
  },
  {
    icon: MapPin,
    title: "Local Expertise",
    desc: "Deep knowledge of Bay Area soil conditions, climate, and building requirements.",
  },
] as const;

export default function AboutPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Our Story"
        title={`About ${COMPANY.shortName}`}
        subtitle="Your trusted partner for premium landscaping and building materials."
        imageUrl={SCENES.contractor.wide}
      />

      <Section density="spacious">
        <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
          <SlideIn direction="left">
            <p className="flex items-center gap-3 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-[var(--color-text-brand)]">
              <span className="h-px w-8 bg-[color-mix(in_oklab,var(--color-text-brand)_50%,transparent)]" aria-hidden /> Who we are
            </p>
            <h2 className="mt-4 font-display text-[clamp(2rem,4vw,3.25rem)] font-light leading-[1.02] tracking-tight text-[var(--color-text-primary)]">
              Building the Bay Area, <span className="italic text-[var(--color-text-brand)]">one project at a time.</span>
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-[var(--color-text-secondary)]">
              {COMPANY.shortName} has been serving contractors, landscapers, and
              homeowners throughout the San Francisco Bay Area.
              Located in {COMPANY.address.city}, {COMPANY.address.state}, our
              expansive yard is stocked with a comprehensive selection of premium
              building materials.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-[var(--color-text-secondary)]">
              We pride ourselves on competitive pricing, expert guidance, and reliable
              delivery throughout the Bay Area and Northern California — including San
              Francisco, Oakland, Berkeley, San Jose, Fremont, Concord, Walnut Creek,
              Vallejo, Napa, Santa Rosa, Sacramento, Stockton, and Modesto. Whether
              you&apos;re working on a small garden project or a large commercial
              development, we have the materials and expertise to help you succeed.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/products">
                <Button size="lg">
                  Browse Products
                  <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </Link>
              <Link href="/contact">
                <Button size="lg" variant="secondary">
                  Contact Us
                </Button>
              </Link>
            </div>
          </SlideIn>
          <SlideIn direction="right" delay={0.2}>
            <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-stone-200)] shadow-[var(--shadow-lg)]">
              <Image
                src={SCENES.yard.square}
                alt={SCENES.yard.alt}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
          </SlideIn>
        </div>
      </Section>

      <Section tone="moss" density="default">
        <FadeIn>
          <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--color-border)] pb-8">
            <h2 className="font-display text-[clamp(2rem,4.5vw,3.5rem)] font-light leading-none tracking-tight text-[var(--color-text-primary)]">
              Why choose us
            </h2>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Six reasons</span>
          </div>
        </FadeIn>
        <StaggerContainer className="grid grid-cols-1 md:grid-cols-2" staggerDelay={0.08}>
          {VALUES.map(({ icon: Icon, title, desc }, i) => (
            <StaggerItem key={title}>
              <div className="group flex gap-6 border-b border-[var(--color-border)] py-8 md:px-4 md:[&:nth-child(odd)]:border-r">
                <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)] transition-colors group-hover:bg-[var(--color-moss-700)] group-hover:text-white">
                  <Icon className="h-5 w-5" strokeWidth={1.5} aria-hidden />
                </span>
                <div>
                  <div className="flex items-baseline gap-3">
                    <span className="font-mono text-xs text-[var(--color-text-muted)]">0{i + 1}</span>
                    <h3 className="font-display text-2xl font-normal text-[var(--color-text-primary)]">{title}</h3>
                  </div>
                  <p className="mt-2 max-w-md leading-relaxed text-[var(--color-text-secondary)]">{desc}</p>
                </div>
              </div>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </Section>

      <Section tone="inverted" density="default">
        <StaggerContainer className="grid grid-cols-2 gap-8 lg:grid-cols-4" staggerDelay={0.1}>
          {STATS.map((stat) => (
            <StaggerItem key={stat.label} className="text-center">
              <AnimatedCounter
                value={stat.value}
                className="block font-display text-4xl font-semibold tracking-tight text-[var(--color-stone-50)] md:text-5xl"
              />
              <p className="mt-2 text-sm uppercase tracking-wider text-[var(--color-stone-200)]">
                {stat.label}
              </p>
            </StaggerItem>
          ))}
        </StaggerContainer>
      </Section>

      <Section tone="inverted" density="spacious">
        <FadeIn className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-[clamp(2.2rem,5vw,4rem)] font-light leading-[1.0] tracking-tight text-[var(--color-stone-50)]">
            Ready to start <span className="italic text-[var(--color-moss-300)]">your project?</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--color-stone-200)]">
            Contact us today for a free quote or visit our yard at {COMPANY.address.street},{" "}
            {COMPANY.address.city}, {COMPANY.address.state}.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/request-quote">
              <Button size="lg" className="w-full sm:w-auto">
                Request Quote
              </Button>
            </Link>
            <Link href="/contact">
              <Button
                size="lg"
                variant="secondary"
                className="w-full border-[oklch(0.95_0.005_90/0.25)] bg-transparent text-[var(--color-stone-50)] hover:bg-[oklch(0.95_0.008_90/0.10)] sm:w-auto"
              >
                Visit Our Yard
              </Button>
            </Link>
          </div>
        </FadeIn>
      </Section>
    </PageShell>
  );
}
