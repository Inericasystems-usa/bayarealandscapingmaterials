import type { ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { StickyCallBar } from "./StickyCallBar";
import { SmsConsentModal } from "./SmsConsentModal";

/**
 * The standard public-page shell — Header + main + Footer.
 * Use this in every public route so the layout stays consistent.
 *
 * The SMS terms modal is mounted HERE rather than in the root layout: the root
 * layout also wraps /pos and /customer-display, and popping a consumer SMS
 * disclosure over a staff register mid-transaction would be wrong. Every public
 * route renders through this shell, so the coverage is the same.
 */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="page-shell pb-[5.5rem] md:pb-0">
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      {/* Mobile-only; the pb-* below reserves the space it occupies so it never
          covers the end of the footer. */}
      <StickyCallBar />
      {/* Appears 4s after arrival, once per device. Informational only — it
          opts nobody in, and never blocks the page. */}
      <SmsConsentModal />
    </div>
  );
}
