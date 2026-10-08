/**
 * Single source of truth for company info displayed on the public site.
 * In Phase 2 this will be loaded from the CMS via the API, with this file
 * as the SSG fallback / build-time default.
 */
export const COMPANY = {
  legalName: "Bay Area Landscaping Materials",
  shortName: "Bay Area Landscaping Materials",
  tagline: "Bulk landscape materials, contractor accounts, delivered across the East Bay.",
  domain: "bayarealandscapingmaterials.com",

  address: {
    street: "400 W Gertrude Ave",
    city: "Richmond",
    state: "CA",
    postalCode: "94801",
    country: "US",
  },

  phone: "(510) 860-4461",
  phoneE164: "+15108604461",
  email: "info@bayarealandscapingmaterials.com",

  // `label` is the short form for lists; `fullLabel` reads in a sentence.
  hours: [
    { label: "Mon – Fri", fullLabel: "Monday–Friday", value: "7:00 AM – 5:00 PM" },
    { label: "Sat – Sun", fullLabel: "Saturday–Sunday", value: "9:00 AM – 3:30 PM" },
  ],

  /**
   * The same opening hours as machine-readable local times — the ONE source the
   * JSON-LD (openingHoursSpecification) and the "Open until 5:00 PM" indicator
   * both read, so the schema and the UI can never drift apart.
   *
   * `day` is 0 = Sunday … 6 = Saturday. Times are 24h local to `timezone`.
   */
  timezone: "America/Los_Angeles",
  hoursSpec: [
    { days: [1, 2, 3, 4, 5], opens: "07:00", closes: "17:00" },
    { days: [0, 6], opens: "09:00", closes: "15:30" },
  ],

  // Geo (yard center for service radius calculations)
  geo: { lat: 37.94, lng: -122.36 },

  // Service radius in miles. Anything beyond is custom-quote only.
  serviceRadiusMi: 70,

  social: {
    google: "https://g.page/bayarealandscapingmaterials",
    instagram: null as string | null,
    facebook: null as string | null,
  },
} as const;
