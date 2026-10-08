import { Suspense, type ReactNode } from "react";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import { StickyCallBar } from "./StickyCallBar";
import { ConsentBanner } from "./ConsentBanner";
import { GoogleTagManager } from "./GoogleTagManager";
import { AttributionCapture } from "./AttributionCapture";
import { TrackingListeners } from "./TrackingListeners";

/**
 * The standard public-page shell — Header + main + Footer.
 * Use this in every public route so the layout stays consistent.
 *
 * The cookie banner and every marketing script (Tag Manager, ad-click
 * attribution, call/email tracking) are mounted HERE rather than in the root
 * layout: the root layout also wraps /pos and /customer-display, and neither
 * consumer notices nor third-party code belong on a staff register. Every
 * public route renders through this shell, so the coverage is the same.
 *
 * The SMS terms are disclosed where a number is collected (the unchecked
 * checkbox on the quote and contact forms, linking to the terms) and in the
 * footer, not in a timed pop-up over the page.
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
