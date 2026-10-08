"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttribution, clearAttribution } from "@/lib/attribution";
import { CONSENT_CHANGE_EVENT, adsAllowed } from "@/lib/consent";

/**
 * Captures first-touch attribution (lib/attribution.ts): stored in localStorage
 * once the visitor allows advertising, forgotten when they turn it off.
 *
 * Renders nothing. Uses useSearchParams, so the caller MUST wrap it in a
 * <Suspense> boundary — without one the whole tree opts out of static rendering.
 */
export function AttributionCapture() {
  const searchParams = useSearchParams();
  const pathname = usePathname();

  useEffect(() => {
    // captureAttribution is itself first-touch-safe, so re-running on a client
    // navigation is harmless: it only ever writes when there is nothing stored,
    // or when an organic record is being upgraded to a real marketing touch.
    captureAttribution(new URLSearchParams(searchParams.toString()));
  }, [searchParams, pathname]);

  useEffect(() => {
    const onConsent = () => {
      if (adsAllowed()) captureAttribution(new URLSearchParams(window.location.search));
      else clearAttribution();
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_CHANGE_EVENT, onConsent);
  }, []);

  return null;
}
