"use client";

import { useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@balm/ui";
import {
  EMPTY_ADDRESS,
  formatAddressLine,
  hasAddressContent,
  type StructuredAddress,
} from "@balm/shared-types";
import { TextField, TextAreaField } from "@/components/forms/FormField";
import { SmsConsentCheckbox } from "@/components/forms/SmsConsentCheckbox";
import { AddressSelector } from "@/components/maps/AddressSelector";
import { trackQuoteFormStarted, trackQuoteFormSubmitted, buildUserData } from "@/lib/analytics";
import { readAttribution } from "@/lib/attribution";
import { postLead } from "@/lib/leads-client";
import { COMPANY } from "@/lib/company";

const FORM_LOCATION = "request_quote_page";

type Status = "idle" | "submitting" | "ok" | "error";

interface QuoteFormProps {
  defaultMaterial?: string;
  defaultYards?: string;
}

export function QuoteForm({ defaultMaterial = "", defaultYards = "" }: QuoteFormProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [address, setAddress] = useState<StructuredAddress>(EMPTY_ADDRESS);
  // Unchecked by default. Never seed this from anything else.
  const [smsConsent, setSmsConsent] = useState(false);
  // `quote_form_started` is engagement, not a conversion — fire it once, on the
  // first genuine edit, never on mount (a page view is not a form start).
  const started = useRef(false);

  function onFirstInput() {
    if (started.current) return;
    started.current = true;
    trackQuoteFormStarted(FORM_LOCATION);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setServerError(null);

    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());

    // The address selector is controlled React state, not form inputs, so merge
    // it in explicitly. `city` stays populated for every existing consumer (the
    // owner SMS, the leads list) — the structured object is additive.
    const filled = hasAddressContent(address);
    const attribution = readAttribution();
    const payload = {
      ...data,
      // FormData reports a checkbox as "on" / absent, which JSON.stringify would
      // send as a truthy string or nothing at all. Send the real boolean instead,
      // so the API records consent as an explicit true/false either way.
      sms_consent: smsConsent,
      // First-touch attribution (lib/attribution.ts), posted explicitly. Null
      // unless the visitor allows advertising.
      ...(attribution ? { attribution } : {}),
      ...(filled
        ? {
            // The country field is no longer shown; every delivery we quote is
            // domestic, so default it rather than sending a blank downstream.
            deliveryAddress: { ...address, country: address.country || "US" },
            city: address.city || address.postalCode || formatAddressLine(address),
          }
        : {}),
    };

    const result = await postLead("quote", payload);

    if (!result.ok) {
      // Be honest: never fake success or silently drop a quote request. No lead
      // id means no record was created, so no conversion event fires either.
      setStatus("error");
      setServerError(
        result.status === 422 && result.details?.length
          ? result.details.map((d) => d.message).join(" ")
          : result.status === 429
            ? "You've sent a few requests just now — please wait a minute and try again."
            : `We couldn't send your request just now — please call us at ${COMPANY.phone}, or try again.`,
      );
      return;
    }

    // The server confirmed the lead row exists. The id is the proof: a honeypot
    // hit answers 200 WITHOUT one, and must not convert.
    if (result.leadId) {
      trackQuoteFormSubmitted({
        leadId: result.leadId,
        material: String(data.material ?? ""),
        quantity: String(data.quantity ?? "") || null,
        city: (filled ? address.city : String(data.city ?? "")) || null,
        formLocation: FORM_LOCATION,
        // Normalized, UNHASHED — the Google tag hashes it. Built here and handed
        // straight to the dataLayer: never logged, never stored, never in a URL.
        userData: buildUserData({
          name: String(data.name ?? ""),
          email: String(data.email ?? ""),
          phone: String(data.phone ?? ""),
          street: filled ? address.streetAddress : undefined,
          city: filled ? address.city : String(data.city ?? ""),
          region: filled ? address.state : undefined,
          postalCode: filled ? address.postalCode : undefined,
        }),
      });
    }

    setStatus("ok");
    form.reset();
    setAddress(EMPTY_ADDRESS);
    // form.reset() can't clear controlled state — clear it so a second
    // request never inherits the first one's opt-in.
    setSmsConsent(false);
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
          Quote request received.
        </h3>
        <p className="mt-2 text-[var(--color-moss-800)]">
          We'll text or call within a few hours during business hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} onInput={onFirstInput} noValidate className="space-y-5">
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
        hint="Optional"
      />

      <AddressSelector
        value={address}
        onChange={setAddress}
        label="Delivery address"
        hint="Start typing and pick your address — we use it to price the delivery. City or ZIP alone is fine too."
      />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField
          id="material"
          name="material"
          label="Material"
          placeholder="Black Bark, DG, Mason Sand..."
          defaultValue={defaultMaterial}
          required
        />
        <TextField
          id="quantity"
          name="quantity"
          label="Approx. quantity"
          placeholder="e.g. 4 cubic yards"
          defaultValue={defaultYards ? `${defaultYards} cubic yards` : ""}
        />
      </div>
      <TextAreaField
        id="notes"
        name="notes"
        label="Project notes"
        rows={4}
        placeholder="Site access, when you need it by, any special instructions..."
      />

      {serverError ? (
        <p className="text-sm text-[var(--color-danger)]">{serverError}</p>
      ) : null}

      <SmsConsentCheckbox
        id="quote-sms-consent"
        checked={smsConsent}
        onChange={setSmsConsent}
        disabled={status === "submitting"}
      />

      <Button type="submit" size="lg" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending..." : "Request quote"}
      </Button>

      <p className="text-sm font-medium text-[var(--color-text-secondary)]">
        We reply within one business hour, 7 AM–5 PM.
      </p>

      <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
        We&apos;ll reply to your request at the number or email you provided. Texts are optional and
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
