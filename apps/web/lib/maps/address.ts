import { EMPTY_ADDRESS, type StructuredAddress } from "@balm/shared-types";

/**
 * Google Place → our StructuredAddress.
 *
 * Google returns address components as an unordered list tagged by type. These
 * helpers pick the right one for each of our fields, preferring the short form
 * ("CA", not "California") where a form field expects it.
 */

/** Component types we want abbreviated in the form. */
const SHORT_FORM = new Set(["administrative_area_level_1", "country"]);

type Component = google.maps.places.AddressComponent;

function pick(components: readonly Component[], type: string): string {
  const hit = components.find((c) => c.types.includes(type));
  if (!hit) return "";
  const value = SHORT_FORM.has(type) ? hit.shortText : hit.longText;
  return value ?? "";
}

/**
 * Build our address shape from a fetched Place.
 *
 * Falls back gracefully at every step: a rural address with no street_number,
 * a PO box with no route, or a place Google returned without a location all
 * produce a partially-filled address rather than throwing. The customer can
 * always fix the gaps by hand.
 */
export function addressFromPlace(place: google.maps.places.Place): StructuredAddress {
  const components = place.addressComponents ?? [];

  const streetNumber = pick(components, "street_number");
  const route = pick(components, "route");
  const street = [streetNumber, route].filter(Boolean).join(" ");

  // Google reports the unit as `subpremise` when the customer typed one.
  const apartment = pick(components, "subpremise");

  // `locality` is the usual city, but many Bay Area addresses (unincorporated
  // areas, some postal cities) only carry a sublocality or a postal town.
  const city =
    pick(components, "locality") ||
    pick(components, "postal_town") ||
    pick(components, "sublocality_level_1") ||
    pick(components, "sublocality") ||
    pick(components, "administrative_area_level_2");

  const location = place.location;

  return {
    streetAddress: street,
    apartment,
    city,
    state: pick(components, "administrative_area_level_1"),
    postalCode: pick(components, "postal_code"),
    country: pick(components, "country"),
    latitude: location ? location.lat() : null,
    longitude: location ? location.lng() : null,
    formatted: place.formattedAddress ?? "",
    placeId: place.id ?? "",
  };
}

/** The Place fields the address selector needs — kept minimal to limit billing. */
export const PLACE_FIELDS = ["addressComponents", "location", "formattedAddress", "id"] as const;

/** A blank address, for resetting the selector. */
export function emptyAddress(): StructuredAddress {
  return { ...EMPTY_ADDRESS };
}

/** Coordinates present and finite — i.e. this address can be mapped. */
export function hasCoords(
  a: StructuredAddress,
): a is StructuredAddress & { latitude: number; longitude: number } {
  return (
    typeof a.latitude === "number" &&
    Number.isFinite(a.latitude) &&
    typeof a.longitude === "number" &&
    Number.isFinite(a.longitude)
  );
}
