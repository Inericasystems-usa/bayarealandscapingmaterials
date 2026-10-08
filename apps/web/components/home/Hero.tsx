import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, Leaf, Phone, Sprout, Truck } from "lucide-react";
import { HERO_IMAGES } from "@/lib/site-content";
import { COMPANY } from "@/lib/company";

/**
 * Structured, trust-forward hero — compact enough to fit the first screen
 * with no scrolling, at every breakpoint.
 *
 * Height is pinned to the viewport minus the sticky header (4rem mobile /
 * 5rem desktop). The content is vertically centered on desktop and top-aligned
 * on phones: on a slow connection the HTML arrives in pieces, and a centered
 * hero that is still missing its photo jumps when the rest lands (layout
 * shift); top-aligned, the late parts simply appear below. Server component; the
 * only motion is a single subtle CSS entrance, disabled under
 * prefers-reduced-motion. No parallax / word-cycle / scroll cue.
 */

const TRUST = [
  { icon: Leaf, label: "Family-owned", sub: "Richmond, CA" },
  { icon: Sprout, label: "10,000+ projects", sub: "supplied to date" },
  { icon: Truck, label: "70-mile radius", sub: "Bay Area delivery" },
  { icon: Clock, label: "Same-day quotes", sub: "online or by phone" },
] as const;

const rise = "animate-[fadeUp_0.7s_cubic-bezier(0.2,0,0,1)_both] motion-reduce:animate-none";
// Headline and photo: visible from the first frame (they are the LCP candidates).
const lift = "animate-[liftUp_0.7s_cubic-bezier(0.2,0,0,1)_both] motion-reduce:animate-none";

export function Hero() {
  return (
    <section className="tex-stone relative flex min-h-[calc(100svh-4rem)] items-start overflow-hidden lg:items-center bg-gradient-to-b from-[var(--color-moss-100)] via-[var(--color-moss-50)] to-[var(--color-bg-page)] md:min-h-[calc(100svh-5rem)]">
      {/* green ambient wash behind the image side */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-[-6rem] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle,var(--color-moss-200),transparent_70%)] opacity-70"
      />

      <div className="relative mx-auto grid w-full max-w-7xl grid-cols-1 items-center gap-4 px-4 py-4 sm:px-6 sm:py-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:py-10 xl:px-8">
        {/* ── Copy ─────────────────────────────────────────────── */}
        <div className="max-w-xl">
          <span
            className={`${rise} inline-flex items-center gap-2 rounded-full border border-[var(--color-moss-200)] bg-[var(--color-bg-elevated)] px-4 py-1.5 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--color-text-brand)] shadow-[var(--shadow-sm)]`}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-moss-500)]" aria-hidden />
            Richmond, CA · Open 7 days
          </span>

          <h1
            className={`${lift} mt-4 font-display text-[clamp(2rem,4.4vw,3.7rem)] font-light leading-[1.03] tracking-[-0.02em] text-[var(--color-text-primary)]`}
            style={{ animationDelay: "80ms" }}
          >
            Premium soil, mulch, gravel &amp; stone —{" "}
            <span className="italic text-[var(--color-text-brand)]">delivered by the yard.</span>
          </h1>

          <p
            className={`${rise} mt-3 max-w-lg text-base leading-snug text-[var(--color-text-secondary)] sm:leading-relaxed lg:text-lg`}
            style={{ animationDelay: "160ms" }}
          >
            Bulk landscape material — quarried, blended, and hauled across the Bay Area from our
            Richmond yard. Honest pricing by the cubic yard, loaded and on the road fast.
          </p>

          <div
            className={`${rise} mt-5 flex flex-wrap items-center gap-3`}
            style={{ animationDelay: "240ms" }}
          >
            <Link
              href="/products"
              className="group inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[var(--color-action)] px-4 py-3.5 text-[0.95rem] font-semibold text-[var(--color-action-fg)] shadow-[var(--shadow-md)] transition-colors duration-200 hover:bg-[var(--color-action-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] sm:flex-none sm:px-6 sm:text-base"
            >
              Shop materials
              <ArrowRight
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                strokeWidth={2}
                aria-hidden
              />
            </Link>
            <Link
              href="/request-quote"
              className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[var(--color-moss-300)] bg-[var(--color-bg-elevated)] px-4 py-3.5 text-[0.95rem] font-semibold text-[var(--color-text-brand)] transition-colors duration-200 hover:border-[var(--color-moss-500)] hover:bg-[var(--color-moss-50)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] sm:flex-none sm:px-6 sm:text-base"
            >
              Request a quote
            </Link>
            <a
              href={`tel:${COMPANY.phoneE164}`}
              data-call-location="unknown"
              className="inline-flex w-full items-center justify-center gap-2 py-1 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-brand)] sm:w-auto sm:justify-start sm:px-1"
            >
              <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              {COMPANY.phone}
            </a>
          </div>

          {/* trust strip */}
          <ul
            className={`${rise} mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-[var(--color-moss-200)] pt-4 sm:mt-6 sm:pt-5 sm:grid-cols-4`}
            style={{ animationDelay: "320ms" }}
          >
            {TRUST.map(({ icon: Icon, label, sub }) => (
              <li key={label} className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[var(--color-text-brand)]">
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                  <span className="font-display text-sm font-semibold text-[var(--color-text-primary)]">
                    {label}
                  </span>
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">{sub}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── Image ────────────────────────────────────────────── */}
        <div className={`${lift} relative`} style={{ animationDelay: "140ms" }}>
          <div className="relative h-[19vh] min-h-[150px] w-full overflow-hidden rounded-[var(--radius-2xl)] shadow-[var(--shadow-xl)] sm:h-[40vh] lg:h-[clamp(380px,66vh,600px)]">
            <Image
              src={HERO_IMAGES.main}
              alt="The Bay Area Landscaping Materials yard in Richmond, stocked with bulk soil, gravel, and stone"
              fill
              priority
              sizes="(min-width:1024px) 46vw, 100vw"
              className="object-cover"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"
            />
          </div>

          {/* single grounded info card. The backing is a literal rgba (moss-950 at
              85%): an opacity modifier on a CSS-variable colour compiles to
              color-mix(), which Firefox and WebKit rendered almost transparent. */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center gap-3 rounded-[var(--radius-lg)] border border-white/15 bg-[rgba(8,23,16,0.85)] px-4 py-2.5 text-white sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-xs">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15">
              <Truck className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <span className="text-sm leading-snug">
              <span className="block font-semibold">Local delivery, six days a week</span>
              <span className="text-[var(--color-stone-300)]">Mon–Sat · by phone or online</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
