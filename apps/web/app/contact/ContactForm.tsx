"use client";

import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@balm/ui";
import { TextField, TextAreaField } from "@/components/forms/FormField";
import { SmsConsentCheckbox } from "@/components/forms/SmsConsentCheckbox";
import { trackContactFormSubmitted, buildUserData } from "@/lib/analytics";
import { readAttribution } from "@/lib/attribution";
import { postLead, LEADS_API } from "@/lib/leads-client";
import { COMPANY } from "@/lib/company";

type Status = "idle" | "submitting" | "ok" | "error";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  // Unchecked by default. Never seed this from anything else.
  const [smsConsent, setSmsConsent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setServerError(null);

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    // First-touch attribution (balm_attr cookie). The API is a different origin,
    // so the cookie can't ride along on its own — post it explicitly.
    const attribution = readAttribution();
    // FormData reports a checkbox as "on" / absent, which JSON.stringify would
    // send as a truthy string or nothing at all. Send the real boolean instead,
    // so the API records consent as an explicit true/false either way.
    const payload = { ...data, sms_consent: smsConsent, ...(attribution ? { attribution } : {}) };

    const result = await postLead("contact", payload);

    if (result.ok) {
      // Conversion fires ONLY here — the server confirmed the message row
      // exists. The lead id is the proof: a honeypot hit answers 200 WITHOUT
      // one, and must not convert.
      if (result.leadId) {
        trackContactFormSubmitted({
          leadId: result.leadId,
          // Normalized, UNHASHED — the Google tag hashes it for Enhanced
          // Conversions. Never logged, never stored, never put in a URL.
          userData: buildUserData({
            name: String(data.name ?? ""),
            email: String(data.email ?? ""),
            phone: String(data.phone ?? ""),
          }),
        });
      }
      setStatus("ok");
      form.reset();
      // form.reset() can't clear controlled state — clear it so a second
      // message never inherits the first one's opt-in.
      setSmsConsent(false);
      return;
    }

    setStatus("error");

    // 422 = the input needs fixing (not a system outage). Surface the actual
    // field messages so the visitor can correct and resend, instead of the
    // misleading "call us" fallback.
    if (result.status === 422) {
      setServerError(
        result.details?.length
          ? result.details.map((d) => d.message).join(" ")
          : "Please check the highlighted fields and try again.",
      );
      return;
    }

    // 429 = rate limited (too many submissions in a short window).
    if (result.status === 429) {
      setServerError("You've sent a few messages just now — please wait a minute and try again.");
      return;
    }

    // Genuine send failure (network / CORS / server unreachable, or a 5xx).
    // Log the real cause for diagnosis; show an honest fallback.
    // eslint-disable-next-line no-console
    console.error(
      `Contact form: request to ${LEADS_API}/api/v1/leads/contact failed — status ${result.status}`,
    );
    setServerError(
      `We couldn't send your message just now — please call us at ${COMPANY.phone}, or try again.`,
    );
  }

  if (status === "ok") {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-moss-200)] bg-[var(--color-moss-50)] p-8 text-center">
        <CheckCircle2
          className="mx-auto h-12 w-12 text-[var(--color-moss-700)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <h3 className="mt-4 font-display text-2xl font-semibold text-[var(--color-moss-900)]">
          Got it. We'll get back to you.
        </h3>
        <p className="mt-2 text-[var(--color-moss-800)]">
          We typically respond within a few hours during business hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="sr-only" />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id="name" name="name" label="Your name" required autoComplete="name" />
        <TextField
          id="phone"
          name="phone"
          label="Phone"
          type="tel"
          required
          autoComplete="tel"
          inputMode="tel"
          placeholder="(510) 555-0123"
        />
      </div>
      <TextField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        hint="Optional. We'll only use it for follow-up."
      />
      <TextAreaField
        id="message"
        name="message"
        label="How can we help?"
        required
        rows={5}
        placeholder="What's the project? Material, quantity, when you need it..."
      />

      {serverError ? (
        <p className="text-sm text-[var(--color-danger)]">{serverError}</p>
      ) : null}

      <SmsConsentCheckbox
        id="contact-sms-consent"
        checked={smsConsent}
        onChange={setSmsConsent}
        disabled={status === "submitting"}
      />

      <Button type="submit" size="lg" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending..." : "Send message"}
      </Button>

      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        We&apos;ll reply to your inquiry at the number or email you provided. Texts are optional and
        require the checkbox above — opting in is never a condition of purchase. See our{" "}
        <a href="/privacy-policy" className="underline hover:text-[var(--color-text-brand)]">
          Privacy Policy
        </a>{" "}
        and{" "}
        <a href="/terms-of-service" className="underline hover:text-[var(--color-text-brand)]">
          Terms
        </a>
        .
      </p>
    </form>
  );
}
