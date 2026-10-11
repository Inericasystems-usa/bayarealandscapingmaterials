"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const pathname = usePathname();
  const toggle = useRef<HTMLButtonElement>(null);
  const isCurrent = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  // Close on navigation and on Escape (focus goes back to the menu button).
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggle.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

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
              aria-current={isCurrent(item.href) ? "page" : undefined}
              className="group relative px-3 py-2 text-[0.82rem] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] aria-[current=page]:text-[var(--color-text-brand)]"
            >
              {item.label}
              <span className="absolute inset-x-3 bottom-1 h-px origin-left scale-x-0 bg-[var(--color-text-brand)] transition-transform duration-300 group-hover:scale-x-100 group-aria-[current=page]:scale-x-100" aria-hidden />
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
            ref={toggle}
            variant="ghost"
            size="icon"
            className="xl:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
          </Button>
        </div>
      </Container>

      {/* Mobile menu: always in the DOM so it can animate open and closed;
          `inert` keeps the closed menu out of the tab order and screen readers. */}
      <div
        id="mobile-nav"
        inert={!open}
        className={cn(
          "grid border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)] transition-[grid-template-rows,opacity] duration-300 ease-[var(--ease-emphasized)] xl:hidden",
          open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] border-transparent opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <Container className="py-4">
            <nav className="grid grid-cols-2 gap-1" aria-label="Mobile">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  aria-current={isCurrent(item.href) ? "page" : undefined}
                  className="rounded-[var(--radius-md)] px-3 py-3 text-base font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-surface)] hover:text-[var(--color-text-primary)] aria-[current=page]:bg-[var(--color-moss-50)] aria-[current=page]:text-[var(--color-text-brand)]"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[var(--color-border)] pt-4">
              <a
                href={`tel:${COMPANY.phoneE164}`}
                data-call-location="header"
                onClick={() => setOpen(false)}
                className={buttonVariants({ size: "lg", variant: "secondary", className: "w-full" })}
              >
                <Phone className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                Call
              </a>
              <Link
                href="/request-quote"
                onClick={() => setOpen(false)}
                className={buttonVariants({ size: "lg", className: "w-full" })}
              >
                Request Quote
              </Link>
            </div>
          </Container>
        </div>
      </div>
    </header>
  );
}
