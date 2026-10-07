import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Button, Card } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn } from "@/components/AnimatedSection";

export const metadata: Metadata = {
  title: "Return Policy",
  description:
    "Return and refund guidelines for bagged products and bulk material at Bay Area Landscaping Materials.",
  alternates: { canonical: "/returns" },
};

export default function ReturnsPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Our Policies"
        title="Return Policy"
        subtitle="Your satisfaction is our priority"
      />

      <Section tone="moss" containerSize="narrow">
        <FadeIn>
          <Card variant="default" padding="lg" className="mb-8">
              <h2 className="font-display text-2xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-6">
                Return &amp; Refund Guidelines
              </h2>
              <div className="space-y-6 text-[var(--color-text-secondary)] leading-relaxed">
                <div>
                  <h3 className="font-display font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                      <CheckCircle className="h-5 w-5" />
                    </span>
                    Eligible Returns
                  </h3>
                  <ul className="list-disc list-inside space-y-1 ml-11">
                    <li>Unused, unopened bagged products within 30 days of purchase</li>
                    <li>Defective or damaged materials reported within 48 hours of delivery</li>
                    <li>Incorrect items delivered (we&apos;ll arrange pickup and replacement)</li>
                    <li>Overstock from your project (subject to restocking fee)</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                      <XCircle className="h-5 w-5" />
                    </span>
                    Non-Returnable Items
                  </h3>
                  <ul className="list-disc list-inside space-y-1 ml-11">
                    <li>Bulk materials once delivered and dumped (sand, gravel, soil, mulch)</li>
                    <li>Custom-cut or special-order materials</li>
                    <li>Products that have been used, installed, or altered</li>
                    <li>Items without original receipt or proof of purchase</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-display font-semibold text-[var(--color-text-primary)] mb-2 flex items-center gap-2">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                      <AlertTriangle className="h-5 w-5" />
                    </span>
                    Important Notes
                  </h3>
                  <ul className="list-disc list-inside space-y-1 ml-11">
                    <li>A 15% restocking fee may apply to eligible returns</li>
                    <li>Return shipping/pickup fees are the customer&apos;s responsibility unless the error was ours</li>
                    <li>Refunds are processed within 5-7 business days</li>
                    <li>Original delivery fees are non-refundable</li>
                  </ul>
                </div>
              </div>
            </Card>
          </FadeIn>

          <FadeIn delay={0.2}>
            <Card variant="inset" padding="lg" className="text-center">
              <h3 className="font-display text-xl font-semibold tracking-tight text-[var(--color-text-primary)] mb-3">
                Questions About Returns?
              </h3>
              <p className="text-[var(--color-text-secondary)] mb-6">
                Contact us and we&apos;ll help resolve any issues with your order.
              </p>
              <Link href="/contact" className="inline-block">
                <Button size="lg">
                  Contact Us
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </Card>
          </FadeIn>
      </Section>
    </PageShell>
  );
}
