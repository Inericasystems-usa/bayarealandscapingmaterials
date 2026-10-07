import Link from "next/link";
import { Phone, Mail, MapPin } from "lucide-react";
import { Container } from "@balm/ui";
import { Logo } from "@/components/Logo";
import { COMPANY } from "@/lib/company";

const COLUMNS = [
  {
    title: "Products",
    links: [
      { href: "/products", label: "All Products" },
      { href: "/products?category=aggregate", label: "Sand & Gravel" },
      { href: "/products?category=bark", label: "Mulch & Bark" },
      { href: "/products?category=sand", label: "Soil & Amendments" },
      { href: "/tools", label: "Tools & Accessories" },
    ],
  },
  {
    title: "Services",
    links: [
      { href: "/calculator", label: "Material Calculator" },
      { href: "/yard-size-guide", label: "Yard Size Guide" },
      { href: "/request-quote", label: "Request Quote" },
      { href: "/contact", label: "Contact Us" },
    ],
  },
  {
    title: "Information",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/delivery", label: "Delivery Policy" },
      { href: "/returns", label: "Return Policy" },
      { href: "/faq", label: "FAQ" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-[var(--color-moss-950)] text-[var(--color-stone-100)]">
      <Container className="py-16">
        <div className="mb-10 grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Company block */}
          <div>
            <Logo tone="inverted" height={44} className="mb-4" />
            <p className="mb-5 text-sm leading-relaxed text-[var(--color-moss-200)]">
              {COMPANY.tagline}
            </p>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-moss-300)]" aria-hidden />
                <span className="text-[var(--color-stone-200)]">
                  {COMPANY.address.street}, {COMPANY.address.city}, {COMPANY.address.state}{" "}
                  {COMPANY.address.postalCode}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-[var(--color-moss-300)]" aria-hidden />
                <a
                  href={`tel:${COMPANY.phoneE164}`}
                  data-call-location="footer"
                  className="text-[var(--color-stone-200)] transition-colors hover:text-[var(--color-moss-300)]"
                >
                  {COMPANY.phone}
                </a>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-[var(--color-moss-300)]" aria-hidden />
                <a
                  href={`mailto:${COMPANY.email}`}
                  data-email-location="footer"
                  className="break-all text-[var(--color-stone-200)] transition-colors hover:text-[var(--color-moss-300)]"
                >
                  {COMPANY.email}
                </a>
              </div>
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="mb-4 font-display font-bold text-white">{col.title}</h4>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[var(--color-moss-200)] transition-colors hover:text-[var(--color-moss-300)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-4 border-t border-[var(--color-moss-800)] pt-8 md:flex-row">
          <p className="text-sm text-[var(--color-moss-300)]">
            © {new Date().getFullYear()} {COMPANY.legalName} LLC. All rights reserved.
          </p>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <Link
              href="/privacy-policy"
              className="text-[var(--color-moss-300)] transition-colors hover:text-[var(--color-moss-200)]"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms-of-service"
              className="text-[var(--color-moss-300)] transition-colors hover:text-[var(--color-moss-200)]"
            >
              Terms of Service
            </Link>
          </nav>
        </div>
      </Container>

      <div className="border-t border-[var(--color-moss-800)] bg-black/30">
        <Container className="py-4">
          <p className="text-center text-xs text-[var(--color-moss-300)]">
            Developed and Managed by{" "}
            <a
              href="https://www.inericasystems.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--color-stone-200)] transition-colors hover:text-[var(--color-moss-300)]"
            >
              Inerica Systems
            </a>
          </p>
        </Container>
      </div>
    </footer>
  );
}
