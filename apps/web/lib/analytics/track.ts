/**
 * The ONLY place in the application that touches window.dataLayer.
 *
 * Everything else calls the typed helpers below. That keeps the event contract
 * (types.ts) enforceable, keeps GTM the single consumer, and makes "who fires
 * this conversion?" answerable by grepping one file.
 *
 * THE RULE: a conversion event means the SERVER created the record. Never fire
 * on click, on validation passing, before the request, or after a failure.
 */

import type { AnalyticsEvent, CallLocation, UserData } from "./types";

declare global {
  interface Window {
    /** Created by the consent-default script in app/layout.tsx, before GTM. */
    dataLayer: Record<string, unknown>[];
  }
}

/**
 * Push a typed event. Safe anywhere: no-ops during SSR, and creates the queue
 * if the consent script hasn't run yet (ad blocker, hard refresh mid-hydration)
 * so a genuine conversion is never lost to a missing global.
 */
export function track(event: AnalyticsEvent): void {
  if (typeof window === "undefined") return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ ...event });
}

/** Current path, or "" on the server. */
export function pagePath(): string {
  return typeof window === "undefined" ? "" : window.location.pathname;
}

/* ── Conversions — success branch only ───────────────────────────────── */

export function trackQuoteFormSubmitted(p: {
  leadId: string;
  material: string;
  quantity?: string | null;
  city?: string | null;
  formLocation: string;
  userData: UserData;
}): void {
  track({
    event: "quote_form_submitted",
    lead_id: p.leadId,
    material: p.material,
    quantity: p.quantity ?? null,
    city: p.city ?? null,
    form_location: p.formLocation,
    user_data: p.userData,
  });
}

export function trackContactFormSubmitted(p: {
  leadId: string;
  userData: UserData;
}): void {
  track({ event: "contact_form_submitted", lead_id: p.leadId, user_data: p.userData });
}

/* ── Engagement ──────────────────────────────────────────────────────── */

/** First genuine interaction with the quote form — engagement, not a conversion. */
export function trackQuoteFormStarted(formLocation: string): void {
  track({ event: "quote_form_started", form_location: formLocation });
}

export function trackPhoneClick(p: {
  phoneNumber: string;
  location: CallLocation;
}): void {
  track({
    event: "phone_click",
    phone_number: p.phoneNumber,
    location: p.location,
    page_path: pagePath(),
  });
}

export function trackEmailClick(location: CallLocation): void {
  track({ event: "email_click", location, page_path: pagePath() });
}

export function trackDirectionsClick(location: string): void {
  track({ event: "directions_click", location, page_path: pagePath() });
}

/**
 * A completed yardage calculation for a named material.
 *
 * Only fired once a material is selected — a dimensions-only calculation isn't
 * a material event. It carries NO `estimated_value`: the site publishes no
 * prices (every product reads "Contact for pricing"), so there is no honest
 * dollar figure to report, and an invented one would land in GA4 and Ads.
 */
export function trackCalculatorCompleted(p: {
  material: string;
  cubicYards: number;
}): void {
  track({
    event: "calculator_completed",
    material: p.material,
    quantity: p.cubicYards,
  });
}

/** The published price list (/products) was viewed. */
export function trackPriceListView(itemCount: number): void {
  track({ event: "price_list_view", page_path: pagePath(), item_count: itemCount });
}

/**
 * A single material's page was viewed.
 *
 * Currently UNUSED: the site has no per-material route (`/materials/[slug]`) —
 * /products is one combined catalog page, reported as `price_list_view`.
 */
export function trackMaterialPageView(p: { material: string; slug: string }): void {
  track({
    event: "material_page_view",
    material: p.material,
    slug: p.slug,
    page_path: pagePath(),
  });
}
