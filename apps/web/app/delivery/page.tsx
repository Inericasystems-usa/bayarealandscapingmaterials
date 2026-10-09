import type { Metadata } from "next";
import Link from "next/link";
import { Truck, Clock, MapPin, AlertCircle, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button, Card } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/AnimatedSection";
import { SCENES } from "@/lib/scenes";
import { sceneShare } from "@/lib/scene-meta";

export const metadata: Metadata = {
  title: "Delivery Policy",
  description:
    "Fast, reliable delivery throughout the Bay Area and Northern California — fleet, service area, scheduling, fees, site access, and the cities we serve.",
  alternates: { canonical: "/delivery" },
  ...sceneShare("delivery", "/delivery"),
};

const SERVICE_CITIES = [
  // Bay Area — East Bay
  { city: "Richmond", region: "East Bay" },
  { city: "Oakland", region: "East Bay" },
  { city: "Berkeley", region: "East Bay" },
  { city: "Fremont", region: "East Bay" },
  { city: "Hayward", region: "East Bay" },
  { city: "Concord", region: "East Bay" },
  { city: "Walnut Creek", region: "East Bay" },
  { city: "Antioch", region: "East Bay" },
  { city: "Pittsburg", region: "East Bay" },
  { city: "Livermore", region: "East Bay" },
  { city: "Pleasanton", region: "East Bay" },
  { city: "Dublin", region: "East Bay" },
  // Bay Area — SF & Peninsula
  { city: "San Francisco", region: "SF & Peninsula" },
  { city: "Daly City", region: "SF & Peninsula" },
  { city: "South San Francisco", region: "SF & Peninsula" },
  { city: "San Mateo", region: "SF & Peninsula" },
  { city: "Redwood City", region: "SF & Peninsula" },
  { city: "Palo Alto", region: "SF & Peninsula" },
  // Bay Area — South Bay
  { city: "San Jose", region: "South Bay" },
  { city: "Santa Clara", region: "South Bay" },
  { city: "Sunnyvale", region: "South Bay" },
  { city: "Mountain View", region: "South Bay" },
  { city: "Milpitas", region: "South Bay" },
  { city: "Morgan Hill", region: "South Bay" },
  // Bay Area — North Bay
  { city: "Vallejo", region: "North Bay" },
  { city: "Napa", region: "North Bay" },
  { city: "Santa Rosa", region: "North Bay" },
  { city: "Petaluma", region: "North Bay" },
  { city: "Novato", region: "North Bay" },
  { city: "San Rafael", region: "North Bay" },
  // Northern California
  { city: "Sacramento", region: "Northern CA" },
  { city: "Elk Grove", region: "Northern CA" },
  { city: "Roseville", region: "Northern CA" },
  { city: "Stockton", region: "Northern CA" },
  { city: "Modesto", region: "Northern CA" },
  { city: "Tracy", region: "Northern CA" },
];

const REGIONS = ["East Bay", "SF & Peninsula", "South Bay", "North Bay", "Northern CA"];

const HIGHLIGHTS = [
  {
    icon: Truck,
    title: "Delivery Fleet",
    desc: "25+ vehicles including flatbeds, dump trucks, and small delivery trucks for any order size.",
  },
  {
    icon: MapPin,
    title: "Service Area",
    desc: "We deliver throughout the Bay Area and Northern California, including San Francisco, Oakland, Berkeley, San Jose, Fremont, Concord, Walnut Creek, Vallejo, Napa, Santa Rosa, Sacramento, Stockton, Modesto, and surrounding cities.",
  },
  {
    icon: Clock,
    title: "Scheduling",
    desc: "Same-day and next-day delivery available. Schedule your delivery when you place your order.",
  },
  {
    icon: AlertCircle,
    title: "Minimum Order",
    desc: "Minimum delivery order is 1 cubic yard for bulk materials. Smaller quantities available for pickup.",
  },
] as const;

const DETAILS = [
  {
    h: "Delivery Fees",
    p: "Delivery fees are based on distance from our Richmond location and order size. Contact us for a delivery quote. Orders over certain thresholds may qualify for free delivery within select zones.",
  },
  {
    h: "Delivery Windows",
    p: "We offer morning (8AM–12PM) and afternoon (12PM–5PM) delivery windows Monday through Friday. Saturday deliveries available with advance scheduling. We'll call 30 minutes before arrival.",
  },
  {
    h: "Site Access Requirements",
    p: "Please ensure delivery trucks can access your site. Clear driveways and pathways of vehicles and obstacles. Inform us of any low-hanging wires, narrow streets, or steep grades. Our drivers will place materials as close to your project area as safely possible.",
  },
  {
    h: "Weather Delays",
    p: "In case of severe weather, deliveries may be rescheduled for safety. We'll contact you to arrange a new delivery time at no additional charge.",
  },
] as const;

export default function DeliveryPolicyPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Shipping & Logistics"
        title="Delivery Policy"
        subtitle="Fast, reliable delivery throughout the Bay Area and Northern California"
        imageUrl={SCENES.delivery.wide}
      />

      <Section tone="moss" density="default" containerSize="narrow">
        <StaggerContainer
          className="grid grid-cols-1 gap-6 md:grid-cols-2"
          staggerDelay={0.1}
        >
          {HIGHLIGHTS.map((item) => (
            <StaggerItem key={item.title}>
              <Card padding="lg" className="h-full">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                  <item.icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-display text-lg font-semibold text-[var(--color-text-primary)]">
                  {item.title}
                </h3>
                <p className="text-[var(--color-text-secondary)]">{item.desc}</p>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        <FadeIn className="mt-12">
          <Card padding="lg">
            <h2 className="mb-6 font-display text-2xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              Delivery Details
            </h2>
            <div className="space-y-6 leading-relaxed text-[var(--color-text-secondary)]">
              {DETAILS.map((d) => (
                <div key={d.h}>
                  <h3 className="mb-2 font-semibold text-[var(--color-text-primary)]">
                    {d.h}
                  </h3>
                  <p>{d.p}</p>
                </div>
              ))}
            </div>
          </Card>
        </FadeIn>

        {/* ─── Cities We Serve ─── */}
        <FadeIn delay={0.1} className="mt-12">
          <div className="mb-8 text-center">
            <span className="mb-2 block text-sm font-semibold uppercase tracking-widest text-[var(--color-text-brand)]">
              Coverage
            </span>
            <h2 className="mb-3 font-display text-3xl font-semibold tracking-tight text-[var(--color-text-primary)]">
              Cities We Serve
            </h2>
            <p className="mx-auto max-w-2xl text-[var(--color-text-secondary)]">
              We proudly deliver building materials to communities across the Bay Area and
              Northern California. Don&apos;t see your city?{" "}
              <Link
                href="/contact"
                className="font-semibold text-[var(--color-text-brand)] hover:underline"
              >
                Contact us
              </Link>{" "}
              — we likely deliver there too.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {REGIONS.map((region) => {
              const cities = SERVICE_CITIES.filter((c) => c.region === region);
              return (
                <Card key={region} padding="md" className="h-full">
                  <div className="mb-4 flex items-center gap-2 border-b border-[var(--color-border)] pb-3">
                    <div className="h-2 w-2 flex-shrink-0 rounded-full bg-[var(--color-moss-700)]" />
                    <h3 className="font-display text-sm font-semibold uppercase tracking-wider text-[var(--color-text-primary)]">
                      {region}
                    </h3>
                  </div>
                  <ul className="space-y-2">
                    {cities.map((c) => (
                      <li
                        key={c.city}
                        className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)]"
                      >
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[var(--color-text-brand)]" />
                        {c.city}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>

          <p className="mt-5 text-center text-sm italic text-[var(--color-text-secondary)]">
            + many more surrounding communities throughout Northern California
          </p>
        </FadeIn>

        <FadeIn delay={0.2} className="mt-12">
          <Card variant="inverted" padding="lg" className="text-center">
            <h3 className="mb-3 font-display text-2xl font-semibold">
              Need a Delivery Quote?
            </h3>
            <p className="mb-6 text-[var(--color-text-inverted)]/80">
              Contact us with your address and order details for a delivery estimate.
            </p>
            <Link href="/request-quote">
              <Button size="lg">
                Request Quote <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </Card>
        </FadeIn>
      </Section>
    </PageShell>
  );
}
