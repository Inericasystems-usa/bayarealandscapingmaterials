import type { Metadata } from "next";
import { Card } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn } from "@/components/AnimatedSection";
import { COMPANY } from "@/lib/company";
import { SmsTermsBullets } from "@/components/SmsTermsContent";
import {
  PROGRAM_TERMS,
  SMS_MESSAGE_TYPES,
  SMS_MESSAGE_TYPES_HEADING,
  SMS_TERMS_HEADING,
} from "@/lib/sms-terms";
import React from "react";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The terms governing use of Bay Area Landscaping Materials LLC services and our SMS/text messaging program.",
  alternates: { canonical: "/terms-of-service" },
};

// NOTE: Practical template — have your attorney review before relying on it.
// The "SMS Terms & Conditions" section carries the A2P-10DLC-required
// disclosures; its wording comes from lib/sms-terms, shared with the opt-in
// checkbox, so the two can never drift. The footer links here (#sms-terms).

const EFFECTIVE = "June 2026";

export default function TermsOfServicePage() {
  return (
    <PageShell>
      <PageHero eyebrow="Legal" title="Terms of Service" subtitle={`Effective ${EFFECTIVE}`} />

      <Section tone="moss" containerSize="narrow">
        <FadeIn>
          <Card variant="default" padding="lg">
            <div className="space-y-8 leading-relaxed text-[var(--color-text-secondary)]">
              <p>
                These Terms of Service (&ldquo;Terms&rdquo;) govern your use of the website, services, products,
                and text-messaging program of Bay Area Landscaping Materials LLC (&ldquo;{COMPANY.shortName},&rdquo;
                &ldquo;we,&rdquo; &ldquo;us&rdquo;). By using our services or opting in to our texts, you agree to
                these Terms.
              </p>

              <Block title="Orders, pricing & payment">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Prices, availability, and product specifications may change without notice.</li>
                  <li>Quotes are estimates and are valid for the period stated; final pricing is confirmed at sale.</li>
                  <li>Payment is due per your account terms. Account balances unpaid past terms may incur fees.</li>
                  <li>Sales tax applies as required by the delivery or point-of-sale jurisdiction.</li>
                </ul>
              </Block>

              <Block title="Delivery & pickup">
                <p>
                  Delivery windows are estimates and may be affected by weather, traffic, and site conditions. You
                  are responsible for safe, legal access to the delivery site. Title and risk pass on delivery or
                  pickup. See our delivery and return policies for details.
                </p>
              </Block>

              <Block title="Acceptable use">
                <p>
                  You agree not to misuse our website or services, interfere with their operation, or use them for
                  unlawful purposes. We may suspend access for violations of these Terms.
                </p>
              </Block>

              <Block title="Warranties & limitation of liability">
                <p>
                  Except as required by law, our services and products are provided &ldquo;as is.&rdquo; To the
                  fullest extent permitted by law, {COMPANY.shortName} is not liable for indirect, incidental, or
                  consequential damages. Nothing in these Terms limits liability that cannot be limited under law.
                </p>
              </Block>

              <Block title="Governing law">
                <p>
                  These Terms are governed by the laws of the State of California, without regard to conflict-of-law
                  rules. Venue for any dispute lies in the state or federal courts located in Contra Costa County,
                  California.
                </p>
              </Block>

              <Block title="Changes">
                <p>
                  We may update these Terms; the &ldquo;Effective&rdquo; date shows the latest revision. Continued
                  use after changes constitutes acceptance.
                </p>
              </Block>

              <Block id="sms-terms" title={SMS_TERMS_HEADING}>
                <p>
                  By opting in, you agree to receive recurring marketing and delivery/order-notification text
                  messages from {COMPANY.shortName} at the mobile number you provide. Consent is not a condition of
                  purchase.
                </p>

                <h3 className="mt-4 font-display text-base font-semibold text-[var(--color-text-primary)]">
                  {SMS_MESSAGE_TYPES_HEADING}
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {SMS_MESSAGE_TYPES.map((type) => (
                    <li key={type}>{type}</li>
                  ))}
                </ul>

                <SmsTermsBullets bullets={PROGRAM_TERMS} className="mt-4 list-disc space-y-1 pl-5" />
              </Block>

              <Block title="Contact us">
                <p>
                  {COMPANY.legalName} LLC
                  <br />
                  {COMPANY.address.street}, {COMPANY.address.city}, {COMPANY.address.state} {COMPANY.address.postalCode}
                  <br />
                  Phone: <a className="text-[var(--color-text-brand)] hover:underline" href={`tel:${COMPANY.phoneE164}`} data-call-location="unknown">{COMPANY.phone}</a>
                  <br />
                  Email: <a className="text-[var(--color-text-brand)] hover:underline" href={`mailto:${COMPANY.email}`} data-email-location="unknown">{COMPANY.email}</a>
                </p>
              </Block>
            </div>
          </Card>
        </FadeIn>
      </Section>
    </PageShell>
  );
}

function Block({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-28">
      <h2 className="mb-2 font-display text-xl font-semibold tracking-tight text-[var(--color-text-primary)]">
        {title}
      </h2>
      {children}
    </div>
  );
}
