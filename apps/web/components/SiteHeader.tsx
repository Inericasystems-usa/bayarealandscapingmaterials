"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, Phone, X } from "lucide-react";
import { Button, buttonVariants, cn, Container } from "@balm/ui";
import { Logo } from "@/components/Logo";
import { COMPANY } from "@/lib/company";

const NAV = [
  { href: "/", label: "Home" },
  { href: "/products", label: "Products" },
  { href: "/tools", label: "Tools & Accessories" },
  { href: "/calculator", label: "Calculator" },
  { href: "/yard-size-guide", label: "Yard Size Guide" },
  { href: "/gallery", label: "Gallery" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
] as const;

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b transition-shadow",
        scrolled
          ? "border-[var(--color-border)] bg-[color-mix(in_oklab,var(--color-bg-elevated)_92%,transparent)] shadow-[var(--shadow-md)] backdrop-blur-md"
          : "border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]",
      )}
    >
      <Container className="flex h-16 items-center justify-between md:h-20">
        {/* Brand */}
        <Link href="/" className="group flex items-center" aria-label={COMPANY.legalName}>
          <Logo height={48} priority className="transition-transform group-hover:scale-[1.03]" />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="group relative px-3 py-2 text-[0.82rem] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              {item.label}
              <span className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-[var(--color-text-brand)] transition-transform duration-300 group-hover:scale-x-100" aria-hidden />
            </Link>
          ))}
        </nav>

        {/* CTA + phone */}
        <div className="flex items-center gap-2">
          <a
            href={`tel:${COMPANY.phoneE164}`}
            data-call-location="header"
            className="hidden items-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)] md:inline-flex"
            aria-label={`Call ${COMPANY.phone}`}
          >
            <Phone className="h-4 w-4" strokeWidth={1.5} aria-hidden />
            <span>{COMPANY.phone}</span>
          </a>

          {/* The link itself is the button (a <button> inside <a> is invalid, and
              hiding only the inner button left an empty link on phones). */}
          <Link href="/request-quote" className={buttonVariants({ size: "md", className: "hidden sm:inline-flex" })}>
            Request Quote
          </Link>

          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </Container>

      {/* Mobile drawer */}
      {open && (
        <div
          id="mobile-nav"
          className="border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] xl:hidden"
        >
          <Container className="py-4">
            <nav className="flex flex-col" aria-label="Mobile">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-[var(--radius-md)] px-3 py-3 text-base font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)]"
                >
                  {item.label}
                </Link>
              ))}
              <a
                href={`tel:${COMPANY.phoneE164}`}
                data-call-location="header"
                onClick={() => setOpen(false)}
                className="mt-2 flex items-center gap-2 rounded-[var(--radius-md)] px-3 py-3 text-base text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-surface)]"
              >
                <Phone className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                {COMPANY.phone}
              </a>
              <Link
                href="/request-quote"
                onClick={() => setOpen(false)}
                className={buttonVariants({ size: "lg", className: "mt-3 w-full" })}
              >
                Request Quote
              </Link>
            </nav>
          </Container>
        </div>
      )}
    </header>
  );
}
