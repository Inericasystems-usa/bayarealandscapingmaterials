import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, MapPin, Truck } from "lucide-react";
import { Button, Card, CardContent, CardDescription, CardTitle } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { StoreLocator } from "@/components/maps/StoreLocator";
import { TIERS } from "@/lib/service-area";

export const metadata: Metadata = {
  title: "Delivery service area",
  description:
    "Same-day delivery within 35 miles of Richmond, CA. Up to 70 miles across the East Bay, North Bay, Peninsula, and into the Delta. Mileage-tiered delivery fees.",
  alternates: { canonical: "/service-area" },
};

export default function ServiceAreaPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Delivery"
        title="We deliver across the Bay Area and beyond."
        subtitle="Up to 70 miles from our yard in Richmond, CA. Same-day windows within 35 miles, next-day for the rest. Mileage-tiered pricing means no surprises on the invoice."
      />

      <Section density="default">
        <StoreLocator />
      </Section>

      <Section tone="surface" density="default">
        <div className="grid gap-6">
          {TIERS.map((tier) => (
            <Card key={tier.label} padding="lg">
              <CardContent>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-brand)]">
                      {tier.rangeMi}
                    </p>
                    <CardTitle className="mt-1">{tier.label}</CardTitle>
                    <CardDescription className="mt-2 text-base">
                      {tier.feeNote}
                    </CardDescription>
                  </div>
                  <Link href="/request-quote">
                    <Button variant="secondary" size="md">
                      Quote my zip
                      <ArrowRight className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    </Button>
                  </Link>
                </div>
                <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-[var(--color-text-secondary)] sm:grid-cols-3 lg:grid-cols-4">
                  {tier.cities.map((city) => (
                    <li key={city} className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-1 w-1 shrink-0 rounded-full bg-[var(--color-action)]"
                      />
                      {city}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </Section>

      <Section tone="moss" density="default">
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardContent>
              <span
                aria-hidden
                className="inline-grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
              >
                <Truck className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <CardTitle className="mt-5">How delivery works</CardTitle>
              <CardDescription className="mt-2 text-base">
                We confirm a 2-hour window the morning of delivery. Drivers text on departure
                and on arrival. If you need a tighter window or off-hours drop, ask — we work
                with builders on tight schedules.
              </CardDescription>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <span
                aria-hidden
                className="inline-grid h-12 w-12 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
              >
                <MapPin className="h-6 w-6" strokeWidth={1.5} />
              </span>
              <CardTitle className="mt-5">Outside 70 miles?</CardTitle>
              <CardDescription className="mt-2 text-base">
                Send your details — for larger orders we'll quote even further out and may
                coordinate with a partner yard closer to your site.
              </CardDescription>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section tone="inverted" density="spacious">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-semibold tracking-tight text-[var(--color-stone-50)] md:text-5xl">
            Tell us your zip — we'll quote the delivery.
          </h2>
          <div className="mt-10 flex justify-center">
            <Link href="/request-quote">
              <Button size="xl">
                Get a delivery quote
                <ArrowRight className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </Button>
            </Link>
          </div>
        </div>
      </Section>
    </PageShell>
  );
}
