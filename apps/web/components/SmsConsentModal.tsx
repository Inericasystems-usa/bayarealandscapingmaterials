"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "@balm/ui";
import { useModalDismiss } from "@/lib/useModalDismiss";
import { hasSeen, markSeen } from "@/lib/local-flag";
import { SmsTermsBullets } from "@/components/SmsTermsContent";
import {
  MODAL_PROGRAM_TERMS,
  SMS_FREQUENCY,
  SMS_FREQUENCY_HEADING,
  SMS_MESSAGE_TYPES,
  SMS_MESSAGE_TYPES_HEADING,
  SMS_TERMS_HEADING,
  SMS_TERMS_INTRO,
} from "@/lib/sms-terms";

/**
 * Site-wide SMS Terms & Conditions disclosure, shown 4 seconds after arrival.
 *
 * WHAT THIS IS NOT — the compliance contract:
 *   • It does NOT opt anyone in to SMS. "I Agree" records only that the terms
 *     were read, in this browser's localStorage. No phone number is collected,
 *     nothing is sent to the server, no message is sent, no list is joined.
 *   • The ONLY SMS opt-in on this site remains the unchecked checkbox on the
 *     quote and contact forms (components/forms/SmsConsentCheckbox) — this is an
 *     additional disclosure layer, never a replacement for it.
 *   • It never blocks the site. Escape, the X, "Close" and a backdrop click all
 *     dismiss it, and dismissing costs the visitor nothing.
 *   • It fires no analytics events. Opening it is not a lead and agreeing is not
 *     a conversion.
 *
 * Content comes from lib/sms-terms, shared with /terms-of-service.
 */

/** Per-device flag. UI state only — never read by analytics. */
const SEEN_KEY = "balm_sms_terms_seen";

/** Spec: exactly 4 seconds after the visitor lands. */
const DELAY_MS = 4000;

export function SmsConsentModal() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Reading localStorage during render would desync server and client HTML,
    // so the check happens here, after mount. The modal therefore starts closed
    // on every render path and there is nothing to hydrate-mismatch.
    if (hasSeen(SEEN_KEY)) return;

    const timer = setTimeout(() => setOpen(true), DELAY_MS);
    // One timer, cleared on unmount — a client navigation can never stack a
    // second one, and a visitor who leaves within 4s is never interrupted.
    return () => clearTimeout(timer);
  }, []);

  function close() {
    // Dismissing counts as seen: re-showing this on every page view would be
    // hostile, and the terms stay permanently available at /terms-of-service.
    markSeen(SEEN_KEY);
    setOpen(false);
  }

  // Esc to close, Tab trapped inside while open, focus moved into the dialog on
  // open and restored to the previously focused element on close. Same hook the
  // POS modals use.
  useModalDismiss(open, close, panelRef);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      // Clicking the backdrop dismisses — the modal must never feel like a trap.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-terms-title"
        aria-describedby="sms-terms-intro"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl sm:max-h-[90vh] sm:rounded-[var(--radius-lg)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] px-5 py-4">
          <h2
            id="sms-terms-title"
            className="font-display text-lg font-semibold text-[var(--color-text-primary)]"
          >
            {SMS_TERMS_HEADING}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close SMS terms"
            className="-m-1 shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Scrolls independently, so long compliance copy never pushes the
            buttons off a short viewport. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
          <p id="sms-terms-intro">{SMS_TERMS_INTRO}</p>

          <h3 className="mt-5 font-display text-base font-semibold text-[var(--color-text-primary)]">
            {SMS_MESSAGE_TYPES_HEADING}
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {SMS_MESSAGE_TYPES.map((type) => (
              <li key={type}>{type}</li>
            ))}
          </ul>

          <h3 className="mt-5 font-display text-base font-semibold text-[var(--color-text-primary)]">
            {SMS_FREQUENCY_HEADING}
          </h3>
          <p className="mt-2">{SMS_FREQUENCY}</p>

          <SmsTermsBullets bullets={MODAL_PROGRAM_TERMS} className="mt-5 list-disc space-y-1 pl-5" />

          <p className="mt-5 text-xs text-[var(--color-text-muted)]">
            Reading this does not sign you up for texts. To receive them, tick the optional SMS box
            when you{" "}
            <Link href="/request-quote" className="underline hover:text-[var(--color-text-brand)]">
              request a quote
            </Link>{" "}
            or{" "}
            <Link href="/contact" className="underline hover:text-[var(--color-text-brand)]">
              contact us
            </Link>
            . Full terms:{" "}
            <Link
              href="/terms-of-service"
              className="underline hover:text-[var(--color-text-brand)]"
            >
              Terms of Service
            </Link>
            .
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] px-5 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="secondary" onClick={close}>
            Close
          </Button>
          {/* Acknowledgement only — see the compliance contract above. It is
              deliberately identical to Close in effect. */}
          <Button type="button" variant="primary" onClick={close}>
            I Agree
          </Button>
        </div>
      </div>
    </div>
  );
}
