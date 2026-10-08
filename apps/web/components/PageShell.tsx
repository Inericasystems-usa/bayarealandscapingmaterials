import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { StickyCallBar } from "./StickyCallBar";
import { SmsConsentModal } from "./SmsConsentModal";
import { ConsentBanner } from "./ConsentBanner";
import { GoogleTagManager } from "./GoogleTagManager";
import { AttributionCapture } from "./AttributionCapture";
import { TrackingListeners } from "./TrackingListeners";

/**
 * The standard public-page shell — Header + main + Footer.
 * Use this in every public route so the layout stays consistent.
 *
 * The SMS terms modal, the cookie banner and every marketing script (Tag
 * Manager, ad-click attribution, call/email tracking) are mounted HERE rather
 * than in the root layout: the root layout also wraps /pos and
 * /customer-display, and neither consumer notices nor third-party code belong
 * on a staff register. Every public route renders through this shell, so the
 * coverage is the same.
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
      {/* Analytics and advertising stay off until the visitor answers. */}
      <ConsentBanner />
      <GoogleTagManager />
      {/* useSearchParams — a Suspense boundary keeps the rest of the tree static. */}
      <Suspense fallback={null}>
        <AttributionCapture />
      </Suspense>
      <TrackingListeners />
    </div>
  );
}
