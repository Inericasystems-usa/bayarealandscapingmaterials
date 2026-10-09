import type { Metadata } from "next";
import Link from "next/link";
import { Phone, Mail, MapPin, Clock, CheckCircle } from "lucide-react";
import { Card, CardContent, CardTitle } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn, SlideIn } from "@/components/AnimatedSection";
import { COMPANY } from "@/lib/company";
import { resolveQuotePrefill } from "@/lib/catalog/quote";
import { QuoteForm } from "./QuoteForm";

export const metadata: Metadata = {
  title: "Request a Quote",
  description:
    "Tell us about your project and we'll provide a competitive estimate. Most quotes come back the same day — free to ask, no obligation.",
  alternates: { canonical: "/request-quote" },
};

const EXPECTATIONS = [
  "Same-day response on most quotes",
  "Competitive pricing guaranteed",
  "Free delivery estimates",
  "Expert material recommendations",
] as const;

interface PageProps {
  // `product` + `unit` + `quantity` come from a product page, `material` +
  // `quantity` from the calculator, `sku` + `yards` from older links; all are
  // resolved against the catalog in lib/catalog/quote.ts.
  searchParams: Promise<{
    product?: string;
    unit?: string;
    material?: string;
    quantity?: string;
    sku?: string;
    yards?: string;
  }>;
}

export default async function RequestQuotePage({ searchParams }: PageProps) {
  const prefill = resolveQuotePrefill(await searchParams);

  const addr = COMPANY.address;
  const addressLine = `${addr.street}, ${addr.city}, ${addr.state} ${addr.postalCode}`;

  return (
    <PageShell>
      <PageHero
        eyebrow="Free Estimate"
        title="Request a Quote"
        subtitle="Tell us about your project and we'll provide a competitive estimate."
      />

      <Section tone="moss" density="default">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
          <SlideIn direction="left" className="lg:col-span-2">
            <Card padding="lg">
              <CardContent>
                <CardTitle className="font-display text-2xl text-[var(--color-text-primary)]">
                  Project Details
                </CardTitle>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  {prefill ? (
                    <>
                      Quoting <strong>{prefill.label}</strong>
                      {prefill.quantity ? <> · {prefill.quantity}</> : null}. Edit any field below.
                    </>
                  ) : (
                    "Or call the yard — sometimes faster."
                  )}
                </p>
                <div className="mt-6">
                  <QuoteForm
                    defaultMaterial={prefill?.material ?? ""}
                    defaultQuantity={prefill?.quantity ?? ""}
                  />
                </div>
              </CardContent>
            </Card>
          </SlideIn>

          <SlideIn direction="right" delay={0.2}>
            <div className="space-y-6">
              <Card>
                <CardContent>
                  <CardTitle className="font-display text-lg text-[var(--color-text-primary)]">
                    Contact Info
                  </CardTitle>
                  <div className="mt-4 space-y-4 text-sm">
                    <div className="flex items-center gap-3">
                      <Phone className="h-5 w-5 text-[var(--color-text-brand)]" />
                      <a
                        href={`tel:${COMPANY.phoneE164}`}
                        data-call-location="unknown"
                        className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-brand)]"
                      >
                        {COMPANY.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-[var(--color-text-brand)]" />
                      <a
                        href={`mailto:${COMPANY.email}`}
                        data-email-location="unknown"
                        className="break-all text-[var(--color-text-secondary)] hover:text-[var(--color-text-brand)]"
                      >
                        {COMPANY.email}
                      </a>
                    </div>
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-5 w-5 text-[var(--color-text-brand)]" />
                      <span className="text-[var(--color-text-secondary)]">
                        {addressLine}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Clock className="h-5 w-5 text-[var(--color-text-brand)]" />
                      <span className="text-[var(--color-text-secondary)]">
                        {COMPANY.hours.map((h) => (
                          <span key={h.label} className="block">
                            {h.label}: {h.value}
                          </span>
                        ))}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card variant="accent">
                <CardContent>
                  <CardTitle className="font-display text-lg text-[var(--color-text-primary)]">
                    What to Expect
                  </CardTitle>
                  <div className="mt-4 space-y-3">
                    {EXPECTATIONS.map((item, i) => (
                      <FadeIn key={item} delay={i * 0.1}>
                        <div className="flex items-center gap-3">
                          <CheckCircle className="h-5 w-5 flex-shrink-0 text-[var(--color-text-brand)]" />
                          <span className="text-sm text-[var(--color-text-secondary)]">
                            {item}
                          </span>
                        </div>
                      </FadeIn>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </SlideIn>
        </div>
      </Section>

      <Section tone="inverted" density="compact">
        <FadeIn className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-semibold text-[var(--color-text-inverted)]">
            Prefer to talk it through?
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-[var(--color-stone-100)]">
            Call the yard and we'll size the order and price delivery on the spot —
            usually faster than filling out the form.
          </p>
          <p className="mt-6">
            <Link
              href={`tel:${COMPANY.phoneE164}`}
              data-call-location="unknown"
              className="inline-flex items-center gap-2 font-display text-2xl font-semibold text-[var(--color-stone-50)] hover:underline"
            >
              <Phone className="h-6 w-6" />
              {COMPANY.phone}
            </Link>
          </p>
        </FadeIn>
      </Section>
    </PageShell>
  );
}
