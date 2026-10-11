"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cookie, ShieldCheck } from "lucide-react";
import { Button } from "@balm/ui";
import {
  AD_SIGNALS,
  CONSENT_CATEGORIES,
  DENIED,
  GRANTED,
  OPEN_CONSENT_EVENT,
  applyConsent,
  hasGPC,
  readConsent,
  type ConsentSignal,
  type ConsentState,
} from "@/lib/consent";

/**
 * The cookie banner. Mounted in PageShell, so it appears on public pages only,
 * never on the POS.
 *
 * Reject all and Accept all are the same size, weight and colour, side by
 * side: declining must take no more effort than agreeing, or the consent is not
 * valid. There is no close button, because closing is not an answer; "Let me
 * choose" opens the categories instead. It never blocks the page.
 *
 * It renders open in the page HTML so a first-time visitor sees it with the
 * first paint. A visitor who already answered never does: the boot script in
 * lib/consent.ts marks <html> before paint, CSS hides the pending banner, and
 * the effect below unmounts it.
 */
export function ConsentBanner() {
  const [open, setOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [detailed, setDetailed] = useState(false);
  const [gpc, setGpc] = useState(false);
  const [draft, setDraft] = useState<ConsentState>(DENIED);

  useEffect(() => {
    const saved = readConsent();
    setGpc(hasGPC());
    setMounted(true);
    if (saved) {
      setDraft(saved.state);
      setOpen(false);
    }
  }, []);

  // "Cookie settings" in the footer: reopen with the answers in force.
  useEffect(() => {
    const reopen = () => {
      const saved = readConsent();
      setDraft(saved?.state ?? DENIED);
      setDetailed(Boolean(saved));
      setOpen(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  const commit = useCallback((state: ConsentState) => {
    applyConsent(state);
    setDraft(state);
    setOpen(false);
    setDetailed(false);
  }, []);

  if (!open) return null;

  const toggle = (signal: ConsentSignal) => setDraft((d) => ({ ...d, [signal]: !d[signal] }));

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="consent-title"
      aria-describedby="consent-body"
      // Above the mobile sticky call bar (z-40, ~5.5rem tall), below modals (z-50).
      className={`consent-banner fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-[45] px-3 md:bottom-0 md:p-4 ${mounted ? "" : "consent-banner--pending"}`}
    >
      <div className="mx-auto max-h-[70vh] max-w-3xl overflow-y-auto rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-xl)] sm:p-5">
        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]"
          >
            <Cookie className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="consent-title" className="font-display text-base font-semibold text-[var(--color-text-primary)]">
              Cookies on this site
            </h2>
            <p id="consent-body" className="mt-1 text-xs leading-relaxed sm:text-sm text-[var(--color-text-secondary)]">
              We use Google Analytics and Google Ads cookies to see how the site is used and which ads
              work, but only if you allow them. Nothing optional is on until you choose, and you can
              change your answer any time from &ldquo;Cookie settings&rdquo; at the bottom of the page.{" "}
              <Link href="/privacy-policy" className="underline hover:text-[var(--color-text-brand)]">
                Privacy Policy
              </Link>
            </p>
            {gpc && (
              // GPC is acted on; saying so explains why the advertising switches are off.
              <p className="mt-2 inline-flex items-start gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-2.5 py-1.5 text-xs text-[var(--color-text-secondary)]">
                <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-[var(--color-text-brand)]" aria-hidden />
                <span>Your browser sends Global Privacy Control, so advertising stays off whatever you choose here.</span>
              </p>
            )}
          </div>
        </div>

        {detailed && (
          <ul className="mt-4 space-y-2 border-t border-[var(--color-border)] pt-4">
            <li className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Strictly necessary</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">
                  Keeps the site working and remembers this choice, in your browser only.
                </p>
              </div>
              <span className="mt-0.5 shrink-0 text-xs font-semibold text-[var(--color-text-muted)]">Always on</span>
            </li>
            {CONSENT_CATEGORIES.map((c) => {
              const forced = gpc && AD_SIGNALS.includes(c.signal);
              const on = forced ? false : draft[c.signal];
              return (
                <li
                  key={c.signal}
                  className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] bg-[var(--color-bg-surface)] px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">{c.name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-[var(--color-text-secondary)]">{c.what}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={on}
                    aria-label={c.name}
                    disabled={forced}
                    onClick={() => toggle(c.signal)}
                    className={`mt-0.5 h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-border-focus)] disabled:cursor-not-allowed disabled:opacity-50 ${
                      on ? "bg-[var(--color-action)]" : "bg-[var(--color-border-strong)]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`block h-5 w-5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform ${on ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
          <Button type="button" variant="primary" onClick={() => commit(DENIED)} className="sm:min-w-36">
            Reject all
          </Button>
          {detailed ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => commit(draft)}
              className="order-last col-span-2 sm:order-none sm:col-auto"
            >
              Save my choices
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDetailed(true)}
              className="order-last col-span-2 sm:order-none sm:col-auto"
            >
              Let me choose
            </Button>
          )}
          <Button type="button" variant="primary" onClick={() => commit(GRANTED)} className="sm:min-w-36">
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
