import type { Metadata } from "next";
import { Clock, Mail, MapPin, Phone, Navigation } from "lucide-react";
import { buttonVariants, Card, CardContent } from "@balm/ui";
import { PageShell } from "@/components/PageShell";
import { PageHero } from "@/components/PageHero";
import { Section } from "@/components/Section";
import { FadeIn, SlideIn, StaggerContainer, StaggerItem } from "@/components/AnimatedSection";
import { TrackedLink } from "@/components/TrackedLink";
import { COMPANY } from "@/lib/company";
import type { TrackedLinkEvent } from "@/components/TrackedLink";
import { HERO_IMAGES } from "@/lib/site-content";
import { ContactForm } from "./ContactForm";

export const metadata: Metadata = {
  title: "Contact",
  description: `Reach ${COMPANY.legalName} at ${COMPANY.phone} or ${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state}. We're here to help with your landscape material needs.`,
  alternates: { canonical: "/contact" },
};

const FULL_ADDRESS = `${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state} ${COMPANY.address.postalCode}`;
const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  FULL_ADDRESS,
)}`;
// `output=embed` is the only Google Maps form that allows framing (no API key
// needed). A copied address-bar /maps/place/... URL sends X-Frame-Options and
// renders as "This content is blocked".
const MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(
  FULL_ADDRESS,
)}&z=16&output=embed`;

const CONTACT_ITEMS: Array<{
  icon: typeof Phone;
  title: string;
  value: string;
  href: string | null;
  conversion?: TrackedLinkEvent;
  /** Forwarded to the delegated tel:/mailto: listener as the click location. */
  location?: string;
}> = [
  {
    icon: Phone,
    title: "Phone",
    value: COMPANY.phone,
    href: `tel:${COMPANY.phoneE164}`,
    location: "contact_page",
  },
  {
    icon: Mail,
    title: "Email",
    value: COMPANY.email,
    href: `mailto:${COMPANY.email}`,
    location: "contact_page",
  },
  {
    icon: MapPin,
    title: "Address",
    value: `${COMPANY.address.street}, ${COMPANY.address.city}, ${COMPANY.address.state} ${COMPANY.address.postalCode}`,
    href: DIRECTIONS_URL,
    conversion: "directions_click",
    location: "contact_page",
  },
  {
    icon: Clock,
    title: "Hours",
    // One line per row of COMPANY.hours.
    value: COMPANY.hours.map((h) => `${h.label}: ${h.value}`).join("\n"),
    href: null,
  },
];

const SERVICE_CITIES = [
  "Richmond", "Oakland", "Berkeley", "San Francisco", "Daly City",
  "San Jose", "Fremont", "Hayward", "Union City", "Newark",
  "Concord", "Walnut Creek", "Pleasanton", "Livermore", "Dublin",
  "Vallejo", "Napa", "Santa Rosa", "Petaluma", "Novato",
  "Sacramento", "Stockton", "Modesto", "Fairfield", "Vacaville",
];

export default function ContactPage() {
  return (
    <PageShell>
      <PageHero
        eyebrow="Get In Touch"
        title="Contact Us"
        subtitle="We're here to help with your building material needs."
        imageUrl={HERO_IMAGES.contact}
      />

      <Section tone="moss" density="default">
        {/* Contact info cards */}
        <StaggerContainer
          className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
          staggerDelay={0.1}
        >
          {CONTACT_ITEMS.map(({ icon: Icon, title, value, href, conversion, location }) => (
            <StaggerItem key={title}>
              <Card padding="lg" className="h-full text-center">
                <CardContent>
                  <span
                    aria-hidden
                    className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                  >
                    <Icon className="h-7 w-7" strokeWidth={1.5} />
                  </span>
                  <h3 className="font-display font-semibold text-[var(--color-text-primary)]">
                    {title}
                  </h3>
                  {href ? (
                    <TrackedLink
                      conversion={conversion}
                      linkLocation={location}
                      data-call-location={href.startsWith("tel:") ? location : undefined}
                      data-email-location={href.startsWith("mailto:") ? location : undefined}
                      href={href}
                      target={href.startsWith("http") ? "_blank" : undefined}
                      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="mt-2 block text-sm text-[var(--color-text-brand)] hover:underline"
                    >
                      {value}
                    </TrackedLink>
                  ) : (
                    <p className="mt-2 whitespace-pre-line text-sm text-[var(--color-text-secondary)]">
                      {value}
                    </p>
                  )}
                </CardContent>
              </Card>
            </StaggerItem>
          ))}
        </StaggerContainer>

        {/* Contact form + Map */}
        <div className="mt-16 grid grid-cols-1 gap-12 lg:grid-cols-2">
          <SlideIn direction="left">
            <Card padding="lg" className="h-full">
              <CardContent>
                <h2 className="font-display text-[clamp(1.6rem,3vw,2.25rem)] font-light tracking-tight text-[var(--color-text-primary)]">
                  Send us a message
                </h2>
                <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                  We respond within a few hours during business hours.
                </p>
                <div className="mt-6">
                  <ContactForm />
                </div>
              </CardContent>
            </Card>
          </SlideIn>

          <SlideIn direction="right" delay={0.2}>
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-[clamp(1.6rem,3vw,2.25rem)] font-light tracking-tight text-[var(--color-text-primary)]">
                  Find our yard
                </h2>
                <TrackedLink
                  conversion="directions_click"
                  linkLocation="contact_page"
                  href={DIRECTIONS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-brand)] transition-colors hover:underline"
                >
                  <Navigation className="h-4 w-4" strokeWidth={1.5} />
                  Get Directions
                </TrackedLink>
              </div>
              <div className="min-h-[380px] flex-1 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] shadow-[var(--shadow-sm)]">
                <iframe
                  title={`Map to ${COMPANY.legalName}`}
                  src={MAP_EMBED_URL}
                  loading="lazy"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-full min-h-[380px] w-full border-0"
                />
              </div>
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] p-4">
                <span
                  aria-hidden
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                >
                  <MapPin className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div>
                  <div className="text-sm font-medium text-[var(--color-text-primary)]">
                    {FULL_ADDRESS}
                  </div>
                  <div className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {COMPANY.hours.map((h) => `${h.label} ${h.value}`).join(" · ")}
                  </div>
                </div>
              </div>
            </div>
          </SlideIn>
        </div>
      </Section>

      {/* Yard hours + Cities we serve */}
      <Section tone="inverted" density="default">
        <FadeIn>
          <div className="grid gap-10 lg:grid-cols-[2fr_3fr]">
            {/* Hours */}
            <div>
              <div className="mb-6 flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                >
                  <Clock className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <h3 className="font-display text-xl font-semibold text-[var(--color-text-inverted)]">
                  Yard Hours
                </h3>
              </div>
              <ul className="space-y-2.5">
                {COMPANY.hours.map((h) => (
                  <li
                    key={h.label}
                    className="flex items-center justify-between border-b border-white/10 pb-2.5 last:border-0 last:pb-0"
                  >
                    <span className="text-[var(--color-stone-300)]">{h.label}</span>
                    <span className="font-medium text-[var(--color-text-inverted)]">{h.value}</span>
                  </li>
                ))}
              </ul>
              <a
                href={`tel:${COMPANY.phoneE164}`}
                className={buttonVariants({ size: "lg", className: "mt-8" })}
              >
                Call {COMPANY.phone}
              </a>
            </div>

            {/* Cities */}
            <div>
              <div className="mb-6 flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
                >
                  <Navigation className="h-5 w-5" strokeWidth={1.5} />
                </span>
                <div>
                  <h3 className="font-display text-xl font-semibold text-[var(--color-text-inverted)]">
                    Cities We Serve
                  </h3>
                  <p className="text-sm text-[var(--color-stone-300)]">
                    Delivering throughout the Bay Area and Northern California
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {SERVICE_CITIES.map((city) => (
                  <div
                    key={city}
                    className="flex items-center gap-2 rounded-[var(--radius-md)] bg-white/5 px-3 py-2 transition-colors hover:bg-white/10"
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-moss-300)]"
                    />
                    <span className="text-sm text-[var(--color-stone-300)]">{city}</span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--color-stone-400)]">
                Don't see your city? Call us — we likely deliver there too.
              </p>
            </div>
          </div>
        </FadeIn>
      </Section>
    </PageShell>
  );
}
