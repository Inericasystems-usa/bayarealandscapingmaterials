"use client";

import { SMS_CONSENT_DISCLOSURE_PARTS } from "@balm/shared-types";

interface SmsConsentCheckboxProps {
  /** Controlled value. Always start false — never pre-check (A2P 10DLC). */
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Unique per form, so two forms on one page keep distinct label targets. */
  id?: string;
  disabled?: boolean;
}

/**
 * Optional SMS opt-in for the public forms.
 *
 * Compliance contract — do not "simplify" any of these away:
 *   1. Unchecked by default and never auto-checked.
 *   2. No `required` attribute: the form submits with it blank. Consent is not
 *      a condition of service, so nothing may block on it.
 *   3. The disclosure comes from SMS_CONSENT_DISCLOSURE_PARTS, the same constant
 *      the API stores on the consent record — so the audit trail proves the
 *      exact wording shown.
 *   4. "Privacy Policy" is a real link, new tab, rel="noopener noreferrer".
 */
export function SmsConsentCheckbox({
  checked,
  onChange,
  id = "sms_consent",
  disabled,
}: SmsConsentCheckboxProps) {
  const { before, linkText, linkHref, after } = SMS_CONSENT_DISCLOSURE_PARTS;

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-sunken)] p-4">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          id={id}
          name="sms_consent"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          // Not required, by design — see the compliance contract above.
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-moss-700)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2"
        />
        <label
          htmlFor={id}
          className="cursor-pointer text-sm leading-relaxed text-[var(--color-text-secondary)]"
        >
          {before}
          <a
            href={linkHref}
            target="_blank"
            rel="noopener noreferrer"
            // The anchor sits inside the <label>, so a click would both open the
            // tab and toggle the box — an accidental opt-in. Stop it here so
            // reading the policy never records consent.
            onClick={(e) => e.stopPropagation()}
            className="font-medium underline underline-offset-2 hover:text-[var(--color-text-brand)]"
          >
            {linkText}
          </a>
          {after}
        </label>
      </div>
    </div>
  );
}
