import Image, { type StaticImageData } from "next/image";
import type { ReactNode } from "react";
import { Container } from "@balm/ui";
import { HeroDecor } from "@/components/HeroDecor";

interface PageHeroProps {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: string;
  /** Background photo: a static import from lib/scenes, or a URL. */
  imageUrl?: string | StaticImageData;
  children?: ReactNode;
}

/**
 * Shared sub-page hero — used by Products, About, Service Area, etc.
 *
 * NOT used on the Home page (Home has its own bespoke hero).
 */
export function PageHero({ eyebrow, title, subtitle, imageUrl, children }: PageHeroProps) {
  return (
    <section className="relative isolate overflow-hidden tex-stone">
      {imageUrl ? (
        <>
          <div className="absolute inset-0 -z-10">
            <Image src={imageUrl} alt="" fill priority sizes="100vw" className="object-cover" />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-b from-[oklch(0.20_0.05_160/0.60)] via-[oklch(0.18_0.05_160/0.72)] to-[oklch(0.14_0.04_160/0.94)]"
            />
            <HeroDecor />
          </div>
          <Container className="relative py-16 md:py-24">
            <div className="max-w-3xl">
              {eyebrow ? (
                <p className="flex items-center gap-3 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-[var(--color-moss-300)]">
                  <span className="h-px w-8 bg-[color-mix(in_oklab,var(--color-moss-300)_60%,transparent)]" aria-hidden />
                  {eyebrow}
                </p>
              ) : null}
              <h1 className="mt-5 font-display text-[clamp(2.6rem,6.5vw,5.5rem)] font-light leading-[0.98] tracking-[-0.02em] text-[var(--color-stone-50)]">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-stone-100)] md:text-xl">
                  {subtitle}
                </p>
              ) : null}
              {children ? <div className="mt-8">{children}</div> : null}
            </div>
          </Container>
        </>
      ) : (
        <div className="border-b border-[var(--color-moss-100)] bg-gradient-to-b from-[var(--color-moss-100)] to-[var(--color-moss-50)]">
        <Container className="tex-stone py-14 md:py-20">
          <div className="max-w-3xl">
            {eyebrow ? (
              <p className="flex items-center gap-3 font-mono text-[0.72rem] uppercase tracking-[0.2em] text-[var(--color-text-brand)]">
                <span className="h-px w-8 bg-[color-mix(in_oklab,var(--color-text-brand)_50%,transparent)]" aria-hidden />
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-5 font-display text-[clamp(2.6rem,6vw,5rem)] font-light leading-[0.98] tracking-[-0.02em] text-[var(--color-text-primary)]">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-secondary)] md:text-xl">
                {subtitle}
              </p>
            ) : null}
            {children ? <div className="mt-8">{children}</div> : null}
          </div>
        </Container>
        </div>
      )}
    </section>
  );
}
