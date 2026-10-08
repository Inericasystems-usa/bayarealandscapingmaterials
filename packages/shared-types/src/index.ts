import { z } from "zod";

/**
 * Shared schemas — placeholder for Phase 2.
 *
 * Every API request/response body and every form will have a zod schema here.
 * Both the API (validation) and the web app (forms) import from this file so
 * there is exactly one source of truth.
 */

/** Money is always integer cents. */
export const moneyCents = z.number().int().nonnegative();

/** Common pagination query. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Standard error envelope returned by the API on failure. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional(),
    trace_id: z.string().optional(),
  }),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

/* ───────────────────────── Address (structured, geocoded) ───────────────────────── */

/**
 * One structured postal address, optionally geocoded.
 *
 * This is the single source of truth for structured addresses across the
 * platform: the web address selector fills it from a Google Places result, the
 * API validates it with this same schema, and both sides share the type.
 *
 * Every text field is optional-with-default so a partially-filled or
 * hand-typed address (a customer who edits the fields, or types an address
 * Google can't resolve) still validates — we never reject a lead over a
 * missing unit number. `latitude`/`longitude` are null when the address was
 * typed by hand rather than picked from a suggestion.
 *
 * NOTE: legacy free-text single-line addresses (POS `deliveryAddress`,
 * dispatch `address`) are deliberately left alone; `formatted` is the bridge
 * to them.
 */
export const structuredAddressSchema = z.object({
  streetAddress: z.string().trim().max(200).default(""),
  apartment: z.string().trim().max(100).default(""),
  city: z.string().trim().max(120).default(""),
  state: z.string().trim().max(80).default(""),
  postalCode: z.string().trim().max(20).default(""),
  country: z.string().trim().max(80).default(""),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  /** Google's one-line rendering — kept so legacy single-line fields stay usable. */
  formatted: z.string().trim().max(400).default(""),
  /** Google Place ID, when the address came from a suggestion. */
  placeId: z.string().trim().max(200).default(""),
});

export type StructuredAddress = z.infer<typeof structuredAddressSchema>;

/** An empty address — the initial state of the address selector. */
export const EMPTY_ADDRESS: StructuredAddress = {
  streetAddress: "",
  apartment: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  latitude: null,
  longitude: null,
  formatted: "",
  placeId: "",
};

/** True once there is enough of an address to be worth sending. */
export function hasAddressContent(a: StructuredAddress): boolean {
  return Boolean(a.streetAddress || a.city || a.postalCode || a.formatted);
}

/** Render a structured address as a single line (for SMS, legacy fields, PDFs). */
export function formatAddressLine(a: StructuredAddress): string {
  const street = [a.streetAddress, a.apartment].filter(Boolean).join(" ");
  const region = [a.state, a.postalCode].filter(Boolean).join(" ");
  const tail = [a.city, region].filter(Boolean).join(", ");
  const line = [street, tail].filter(Boolean).join(", ");
  return line || a.formatted;
}

/* ───────────────────────── Leads (public website forms) ───────────────────────── */

// Honeypot field — bots fill it; humans never see it.
const honeypot = z.string().max(0).optional();

/* ── SMS consent (A2P 10DLC / TCPA) ───────────────────────────────────
 * Consent is OPTIONAL and must never gate a submission: `sms_consent`
 * defaults to false, and both lead schemas parse fine without it.
 *
 * The disclosure is split into parts so the checkbox label can hyperlink
 * "Privacy Policy" while the stored audit record keeps the exact same
 * sentence. Render and record therefore cannot drift — proving *what* was
 * agreed to is the thing a carrier audit actually asks for.
 */
export const SMS_CONSENT_DISCLOSURE_PARTS = {
  before:
    "By checking this box, I optionally consent to receive text messages from " +
    "Bay Area Landscaping Materials LLC regarding account verification (2FA), " +
    "customer support, and delivery notifications. Message frequency varies. " +
    "Message and data rates may apply. Reply STOP to opt out. See our ",
  linkText: "Privacy Policy",
  linkHref: "/privacy-policy",
  after: " for details.",
} as const;

/** The disclosure exactly as presented to the visitor; stored on each consent record. */
export const SMS_CONSENT_DISCLOSURE =
  SMS_CONSENT_DISCLOSURE_PARTS.before +
  SMS_CONSENT_DISCLOSURE_PARTS.linkText +
  SMS_CONSENT_DISCLOSURE_PARTS.after;

/**
 * Optional SMS opt-in. Accepts a real JSON boolean (what our forms send) or the
 * "on"/absent pair a plain HTML checkbox POST produces. Anything unrecognised —
 * missing and null included — resolves to false, so consent fails closed and can
 * only ever be recorded from a deliberate check.
 *
 * The union is deliberately wide: this field must never be able to 422 a
 * submission, because consent cannot be a condition of service.
 */
const smsConsent = z
  .union([z.boolean(), z.string(), z.null()])
  .optional()
  .transform((v) => v === true || v === "on" || v === "true");

/* ── First-touch attribution ──────────────────────────────────────────
 * Kept client-side in localStorage under `balm_attr` (90-day TTL, first touch
 * wins), only while the visitor allows advertising, and posted alongside the
 * lead: the website and the API are different origins, and no cookie carries it.
 *
 * Carries no PII — click ids, UTMs, landing page and referrer only. Every field
 * is optional and bounded: a malformed/absent block must never 422 a lead.
 */
const attrField = z.string().trim().max(512).optional();

export const leadAttributionSchema = z.object({
  gclid: attrField,
  gbraid: attrField,
  wbraid: attrField,
  msclkid: attrField,
  fbclid: attrField,
  utm_source: attrField,
  utm_medium: attrField,
  utm_campaign: attrField,
  utm_term: attrField,
  utm_content: attrField,
  landing_page: z.string().trim().max(2048).optional(),
  referrer: z.string().trim().max(2048).optional(),
  captured_at: z.string().trim().max(64).optional(),
});

export type LeadAttribution = z.infer<typeof leadAttributionSchema>;

export const contactLeadSchema = z.object({
  name: z.string().trim().min(2, "Please tell us your name.").max(120),
  phone: z.string().trim().min(7, "We need a phone we can reach you at.").max(40),
  email: z.string().trim().email("Please enter a valid email address, or leave it blank.").optional().or(z.literal("")),
  message: z.string().trim().min(5, "What can we help with?").max(5000),
  sms_consent: smsConsent,
  attribution: leadAttributionSchema.optional(),
  hp: honeypot,
});

export type ContactLead = z.infer<typeof contactLeadSchema>;

export const quoteLeadSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  email: z.string().trim().email("Please enter a valid email address, or leave it blank.").optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  // Structured, geocoded delivery address from the Google Places selector.
  // Optional: the form still submits fine when a visitor types only a city/ZIP
  // or when Google Maps fails to load, so no lead is ever lost.
  deliveryAddress: structuredAddressSchema.optional(),
  material: z.string().trim().min(2, "What material are you looking for?").max(200),
  quantity: z.string().trim().max(200).optional().or(z.literal("")),
  notes: z.string().trim().max(5000).optional().or(z.literal("")),
  sms_consent: smsConsent,
  attribution: leadAttributionSchema.optional(),
  hp: honeypot,
});

export type QuoteLead = z.infer<typeof quoteLeadSchema>;
