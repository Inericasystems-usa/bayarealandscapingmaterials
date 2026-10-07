import { COMPANY } from "@/lib/company";

/**
 * Business locations (yards) shown in the store locator.
 *
 * Centralised on purpose: adding a second yard means appending one entry here
 * and nothing else — the locator, the map markers and the distance ranking all
 * read from this list.
 *
 * The single entry below is the yard already described by COMPANY.address in
 * lib/company.ts; street/city/state/zip are derived from it rather than
 * retyped so the two can never drift apart.
 */
export interface BusinessLocation {
  /** Stable key — used for React keys and for the "selected location" state. */
  id: string;
  title: string;
  address1: string;
  address2: string;
  coords: { lat: number; lng: number };
  /** Google Place ID — enables an exact "directions to this place" deep link. */
  placeId: string;
  phone: string;
  phoneE164: string;
  hours: readonly { label: string; value: string }[];
}

const addr = COMPANY.address;

export const LOCATIONS: readonly BusinessLocation[] = [
  {
    id: "richmond-yard",
    title: `${COMPANY.shortName} — ${addr.city}`,
    address1: addr.street,
    address2: `${addr.city}, ${addr.state} ${addr.postalCode}`,
    // Yard entrance, surveyed to the driveway rather than the parcel centroid.
    // COMPANY.geo stays the rounded value used for JSON-LD/areaServed.
    coords: { lat: 37.95450583735586, lng: -122.37417305108991 },
    placeId: "ChIJqS32cUGdhYARDvlPi1ZLmps",
    phone: COMPANY.phone,
    phoneE164: COMPANY.phoneE164,
    hours: COMPANY.hours,
  },
];

/** The locator hides its "choose a yard" list when there is only one. */
export const HAS_MULTIPLE_LOCATIONS = LOCATIONS.length > 1;

/** Google Maps directions deep link, precise when a Place ID is known. */
export function directionsUrl(loc: BusinessLocation, from?: string): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${loc.address1}, ${loc.address2}`,
  });
  if (loc.placeId) params.set("destination_place_id", loc.placeId);
  if (from) params.set("origin", from);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
