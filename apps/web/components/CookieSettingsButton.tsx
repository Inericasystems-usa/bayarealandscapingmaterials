"use client";

import { openConsentPreferences } from "@/lib/consent";

/** Reopens the cookie banner with the current answers. A button, not a link:
 *  it changes nothing in the URL. */
export function CookieSettingsButton({ className, label = "Cookie settings" }: { className?: string; label?: string }) {
  return (
    <button type="button" onClick={openConsentPreferences} className={className}>
      {label}
    </button>
  );
}
