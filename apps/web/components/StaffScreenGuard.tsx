"use client";

import { useEffect } from "react";

/**
 * Staff screens (/pos, /customer-display) run with no third-party code and
 * under their own Content-Security-Policy (next.config.ts). Both arrive with a
 * full page load only: a client-side navigation from a public page keeps that
 * page's document, so Tag Manager and the public policy would stay in force.
 *
 * The consent boot script (lib/consent.ts) defines gtag() on public pages only,
 * so finding it here means the screen was reached that way. Load it again.
 */
export function StaffScreenGuard() {
  useEffect(() => {
    if (typeof window.gtag === "function") window.location.reload();
  }, []);
  return null;
}
