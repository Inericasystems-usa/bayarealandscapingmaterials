"use client";

import type { AnchorHTMLAttributes } from "react";
import { trackDirectionsClick, type AnalyticsEventName } from "@/lib/analytics";

/**
 * Events this component owns. Phone and email links are handled by the global
 * delegated listener (components/TrackingListeners) instead — only outbound
 * links that carry no recognisable href pattern need an explicit handler.
 */
export type TrackedLinkEvent = Extract<AnalyticsEventName, "directions_click">;

type TrackedLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  /** Omit to render a plain anchor — lets callers map over mixed link lists. */
  conversion?: TrackedLinkEvent;
  /** Where on the page the link sits, e.g. "contact_cards". */
  linkLocation?: string;
};

/**
 * Anchor that pushes a dataLayer event when clicked. For outbound actions we
 * have no landing page of our own to fire from — "Get Directions" hands the user
 * off to Google Maps, so the click *is* the event. Links open in a new tab, so
 * the push isn't racing an unload.
 */
export function TrackedLink({ conversion, linkLocation, onClick, ...props }: TrackedLinkProps) {
  return (
    <a
      {...props}
      onClick={(event) => {
        if (conversion) trackDirectionsClick(linkLocation ?? "unknown");
        onClick?.(event);
      }}
    />
  );
}
