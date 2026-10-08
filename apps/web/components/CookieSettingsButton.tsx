"use client";

import { openConsentPreferences } from "@/lib/consent";

/** Reopens the cookie banner with the current answers. A button, not a link:
 *  it changes nothing in the URL. */
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" onClick={openConsentPreferences} className={className}>
      Cookie settings
    </button>
  );
}
