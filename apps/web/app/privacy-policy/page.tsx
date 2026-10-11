import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn } from "@/components/AnimatedSection";
import { CookieSettingsButton } from "@/components/CookieSettingsButton";
import { COMPANY } from "@/lib/company";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Bay Area Landscaping Materials LLC collects, uses, and protects your information, including SMS/text messaging consent.",
  alternates: { canonical: "/privacy-policy" },
};

// NOTE: This is a practical, A2P-10DLC-aware template. Have it reviewed by your
// own attorney before relying on it. The SMS section (esp. the no-sharing
// clause) is required wording for carrier/campaign registration — do not remove it.

const EFFECTIVE = "October 2026";

export default function PrivacyPolicyPage() {
  return (
    <PageShell>
      <PageHero eyebrow="Legal" title="Privacy Policy" subtitle={`Effective ${EFFECTIVE}`} />

      <Section tone="moss" containerSize="narrow">
        <FadeIn>
          <Card variant="default" padding="lg">
            <div className="space-y-8 leading-relaxed text-[var(--color-text-secondary)]">
              <p>
                Bay Area Landscaping Materials LLC (&ldquo;{COMPANY.shortName},&rdquo; &ldquo;we,&rdquo;
                &ldquo;us,&rdquo; or &ldquo;our&rdquo;) respects your privacy. This Privacy Policy explains what
                information we collect, how we use it, and the choices you have. It applies to our website
                {" "}
                {COMPANY.domain}, our point-of-sale and customer accounts, and our text-messaging program.
              </p>

              <Block title="Information we collect">
                <ul className="list-disc space-y-1 pl-5">
                  <li>Contact details you provide: name, business name, phone number, email, and billing/delivery addresses.</li>
                  <li>Order and account information: purchases, quotes, deliveries, balances, and payment records.</li>
                  <li>Messages and communications you send us, including text messages and form submissions.</li>
                  <li>Limited technical data from our website (e.g., analytics, only if you allow it) to operate and improve the site.</li>
                </ul>
              </Block>

              <Block title="Cookies, analytics & advertising">
                <p>
                  With your permission, we use Google Analytics to see how the site is used and Google Ads to learn
                  which of our ads bring visitors. They set cookies only after you choose &ldquo;Accept all&rdquo; or
                  switch their category on in the cookie banner; until then they are off, and the site works fully
                  without them. If you allow advertising, we also keep the ad or campaign that first brought you here
                  in your browser&rsquo;s local storage for up to 90 days and include it with a quote or contact
                  request. Your answer is stored in your browser, not in a cookie. If your browser sends Global
                  Privacy Control, advertising stays off. You can change your choice at any time:{" "}
                  <CookieSettingsButton className="cursor-pointer text-[var(--color-text-brand)] hover:underline" />.
                </p>
              </Block>

              <Block title="How we use your information">
                <ul className="list-disc space-y-1 pl-5">
                  <li>To process orders, quotes, deliveries, payments, and customer accounts.</li>
                  <li>To send order, delivery, and account notifications, and to respond to your requests.</li>
                  <li>With your consent, to send marketing and promotional messages.</li>
                  <li>To operate, secure, and improve our business and website, and to comply with law.</li>
                </ul>
              </Block>

              <Block title="SMS / text messaging">
                <p>
                  If you opt in, we send text messages for delivery and order notifications, account updates, and
                  (where you agreed) marketing. Consent is collected verbally (e.g., at our counter or by phone),
                  through a web form, or by you texting us. Message frequency varies. Message and data rates may
                  apply. Reply <strong>STOP</strong> at any time to opt out, or <strong>HELP</strong> for help. You
                  may also contact us at {COMPANY.phone} or {COMPANY.email} to opt out.
                </p>
                <p className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-3">
                  <strong>No mobile opt-in or consent information will be shared with third parties or affiliates
                  for marketing or promotional purposes.</strong> Mobile/phone numbers collected for SMS are used
                  only to deliver the messages you requested and are not sold or shared with third parties for
                  their own marketing.
                </p>
              </Block>

              <Block title="How we share information">
                <p>
                  We share information only with service providers who help us operate (for example, payment
                  processing, our messaging provider RingCentral, and delivery/logistics), and only as needed to
                  provide those services. We may disclose information when required by law or to protect our rights.
                  We do not sell your personal information for money.
                </p>
                <p className="mt-3">
                  <strong>Advertising.</strong> Only if you allow advertising cookies, Google receives an identifier
                  for your browser and the pages you visit here, so that we can show our ads to people who visited
                  the site and measure which ads work. California law may treat this as &ldquo;sharing&rdquo;
                  personal information for cross-context behavioral advertising. It is off until you allow it, and
                  you can turn it off at any time (see Your Privacy Choices below).
                </p>
              </Block>

              <Block id="your-privacy-choices" title="Your Privacy Choices">
                <p>
                  To opt out of the sale or sharing of your personal information, open{" "}
                  <CookieSettingsButton
                    label="Your Privacy Choices"
                    className="cursor-pointer text-[var(--color-text-brand)] underline"
                  />{" "}
                  and turn advertising off (or choose &ldquo;Reject all&rdquo;). If your browser sends a Global
                  Privacy Control signal, we treat it as that opt-out automatically and advertising stays off. You
                  can also ask us by phone or e-mail using the details below. We will not treat you differently
                  for using these choices.
                </p>
              </Block>

              <Block title="Data retention & security">
                <p>
                  We keep information for as long as needed to provide our services, meet legal and accounting
                  obligations, and resolve disputes. We use reasonable administrative and technical safeguards to
                  protect your information, though no method of transmission or storage is 100% secure.
                </p>
              </Block>

              <Block title="Your choices & rights">
                <p>
                  You can opt out of marketing texts (reply STOP) and emails at any time, and request access to or
                  correction/deletion of your information, subject to legal limits. California residents have the
                  right to know what personal information we collect and how we use and share it, to access,
                  correct or delete it, to opt out of its sale or sharing (above), and to limit the use of sensitive
                  personal information (we do not use any for purposes that would require this). To make a request,
                  or to have an authorized agent make one for you, contact us using the details below; we will
                  verify the request before acting on it and answer within 45 days.
                </p>
              </Block>

              <Block title="Children's privacy">
                <p>Our services are not directed to children under 13, and we do not knowingly collect their information.</p>
              </Block>

              <Block title="Changes to this policy">
                <p>
                  We may update this policy from time to time. The &ldquo;Effective&rdquo; date above shows when it
                  was last revised.
                </p>
              </Block>

              <Block title="Contact us">
                <p>
                  {COMPANY.legalName} LLC
                  <br />
                  {COMPANY.address.street}, {COMPANY.address.city}, {COMPANY.address.state} {COMPANY.address.postalCode}
                  <br />
                  Phone: <a className="text-[var(--color-text-brand)] hover:underline" href={`tel:${COMPANY.phoneE164}`} data-call-location="unknown">{COMPANY.phone}</a>
                  <br />
                  Email: <a className="break-all text-[var(--color-text-brand)] hover:underline" href={`mailto:${COMPANY.email}`} data-email-location="unknown">{COMPANY.email}</a>
                </p>
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                  See also our{" "}
                  <Link href="/terms-of-service" className="text-[var(--color-text-brand)] hover:underline">
                    Terms of Service
                  </Link>
                  .
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
