"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttribution } from "@/lib/attribution";

/**
 * Captures first-touch attribution into the `balm_attr` cookie.
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

  return null;
}
