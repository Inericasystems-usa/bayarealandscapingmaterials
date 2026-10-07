"use client";

import { useEffect } from "react";
import { trackEmailClick, trackPhoneClick, type CallLocation } from "@/lib/analytics";

/**
 * ONE delegated click listener for every phone and email link on the site.
 *
 * Delegation rather than per-link handlers: `tel:` links live in the header, the
 * footer, three hero variants and half a dozen page bodies, and links rendered
 * later (accordions, modals, client-fetched content) are covered for free. It is
 * mounted once in the root layout, so a route change cannot stack duplicates —
 * the effect has no dependencies and its cleanup removes the listener.
 *
 * Every `tel:` anchor carries `data-call-location` (header / footer / sticky_bar
 * / material_page / …) so Ads and GA4 can tell which placement earned the call.
 */

/** Internal surfaces that share the root layout but are not marketing traffic. */
const INTERNAL_PREFIXES = ["/pos", "/customer-display"];

const CALL_LOCATIONS: readonly CallLocation[] = [
  "header",
  "footer",
  "sticky_bar",
  "material_page",
  "contact_page",
  "unknown",
];

/** Only emit locations GTM knows about; anything unexpected reports "unknown". */
function asCallLocation(value: string | undefined): CallLocation {
  return CALL_LOCATIONS.includes(value as CallLocation) ? (value as CallLocation) : "unknown";
}

export function TrackingListeners() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target;
      if (!(target instanceof Element)) return;
      // Staff calling a customer from the driver app is not a lead.
      if (INTERNAL_PREFIXES.some((p) => window.location.pathname.startsWith(p))) return;

      const tel = target.closest<HTMLAnchorElement>('a[href^="tel:"]');
      if (tel) {
        trackPhoneClick({
          phoneNumber: (tel.getAttribute("href") ?? "").replace("tel:", ""),
          location: asCallLocation(tel.dataset.callLocation),
        });
        return;
      }

      const mail = target.closest<HTMLAnchorElement>('a[href^="mailto:"]');
      if (mail) {
        trackEmailClick(asCallLocation(mail.dataset.emailLocation));
      }
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
