import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button, Card } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn } from "@/components/AnimatedSection";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers to common questions about delivery areas, minimum orders, pickup, payment, bulk pricing, and choosing the right landscape materials at Bay Area Landscaping Materials.",
  alternates: { canonical: "/faq" },
};

const weekdayHours =
  COMPANY.hours.find((h) => h.label === "Mon – Fri")?.value ?? "";
const saturdayHours =
  COMPANY.hours.find((h) => h.label === "Saturday")?.value ?? "";
const yardAddress = `${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state} ${COMPANY.address.postalCode}`;

const faqs = [
  {
    q: "What areas do you deliver to?",
    a: "We deliver throughout the Bay Area and Northern California, including San Francisco, Oakland, Berkeley, San Jose, Fremont, Hayward, Concord, Walnut Creek, Vallejo, Napa, Santa Rosa, Sacramento, Stockton, Modesto, and surrounding cities. Delivery fees vary by distance. Contact us for a delivery quote to your specific location.",
  },
  {
    q: "What is the minimum order for delivery?",
    a: "The minimum delivery order is 1 cubic yard for bulk materials. For smaller quantities, we offer convenient yard pickup during business hours. Bagged products can be picked up in any quantity.",
  },
  {
    q: "How do I know how much material I need?",
    a: "Use our Material Calculator to estimate quantities based on your project dimensions. You can also visit our Yard Size Guide for visual references. Our team is always available to help with estimates — just call or request a quote.",
  },
  {
    q: "Do you offer same-day delivery?",
    a: "Yes! Same-day delivery is available for orders placed before 10 AM, subject to availability and scheduling. Next-day delivery is available for most orders. Contact us to check availability for your area.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept cash, all major credit cards (Visa, MasterCard, American Express, Discover), checks, and offer net-30 terms for qualified contractors. Contact us to set up a business account.",
  },
  {
    q: "Can I pick up materials from your yard?",
    a: `Absolutely! Our yard at ${yardAddress} is open Monday-Friday ${weekdayHours} and Saturday ${saturdayHours}. We can load materials directly into your truck or trailer.`,
  },
  {
    q: "Do you offer bulk pricing discounts?",
    a: "Yes, we offer competitive bulk pricing for large orders and contractor accounts. The more you order, the better the price. Contact us for a custom quote on your bulk material needs.",
  },
  {
    q: "What if I receive damaged or incorrect materials?",
    a: "Please inspect your delivery upon arrival and report any issues within 48 hours. We'll arrange for replacement or pickup of incorrect/damaged materials at no additional charge. See our Return Policy for full details.",
  },
  {
    q: "Do you carry organic/sustainable products?",
    a: "Yes! We offer a range of organic composts, recycled aggregates, and sustainably sourced materials. Ask our team about eco-friendly options for your project.",
  },
  {
    q: "Can you help me choose the right material?",
    a: "Absolutely! Our experienced staff can recommend the best materials for your specific project, soil conditions, and budget. Call us, visit our yard, or submit a quote request with your project details.",
  },
] as const;

export default function FAQPage() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <PageShell>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PageHero
        eyebrow="Common Questions"
        title="Frequently Asked Questions"
        subtitle="Find answers to common questions about our products and services."
      />

      <Section tone="moss" density="default" containerSize="narrow">
        <FadeIn>
          <Card padding="lg" className="px-2 sm:px-8">
            {faqs.map((faq) => (
              <details
                key={faq.q}
                className="group border-b border-[var(--color-border)] last:border-0"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left [&::-webkit-details-marker]:hidden">
                  <span className="font-display text-lg font-semibold text-[var(--color-text-primary)] transition-colors group-hover:text-[var(--color-text-brand)]">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className="h-5 w-5 shrink-0 text-[var(--color-text-secondary)] transition-transform group-open:rotate-180"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                </summary>
                <p className="pb-5 leading-relaxed text-[var(--color-text-secondary)]">
                  {faq.a}
                </p>
              </details>
            ))}
          </Card>
        </FadeIn>

        <FadeIn delay={0.2} className="mt-12">
          <div className="rounded-[var(--radius-lg)] bg-[var(--color-bg-page)] p-8 text-center">
            <h3 className="font-display text-2xl font-light text-[var(--color-text-primary)]">
              Still Have Questions?
            </h3>
            <p className="mt-3 text-[var(--color-text-secondary)]">
              Our team is ready to help. Contact us for personalized assistance.
            </p>
            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <Link href="/contact">
                <Button size="lg" className="w-full sm:w-auto">
                  Contact Us
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </Button>
              </Link>
              <a href={`tel:${COMPANY.phoneE164}`} data-call-location="unknown">
                <Button size="lg" variant="secondary" className="w-full sm:w-auto">
                  Call {COMPANY.phone}
                </Button>
              </a>
            </div>
          </div>
        </FadeIn>
      </Section>
    </PageShell>
  );
}
