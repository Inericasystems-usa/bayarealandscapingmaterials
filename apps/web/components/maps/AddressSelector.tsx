"use client";

import { useCallback, useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";
import type { StructuredAddress } from "@balm/shared-types";
import { TextField } from "@/components/forms/FormField";
import { MapCanvas, type MapMarker } from "@/components/maps/MapCanvas";
import { AddressAutocomplete } from "@/components/maps/AddressAutocomplete";
import { addressFromPlace, hasCoords, PLACE_FIELDS } from "@/lib/maps/address";
import { isMapsConfigured } from "@/lib/maps/loader";
import { LOCATIONS } from "@/lib/locations";

interface AddressSelectorProps {
  value: StructuredAddress;
  onChange: (next: StructuredAddress) => void;
  /** Prefix for input ids/names so two selectors can coexist on a page. */
  idPrefix?: string;
  label?: string;
  hint?: string;
}

/** Bias predictions to the delivery region so local addresses rank first. */
const YARD = LOCATIONS[0]?.coords ?? { lat: 37.95, lng: -122.37 };
const BIAS_RADIUS_METERS = 120_000; // ~75 miles — covers the whole service area.

/**
 * Google-powered delivery-address picker.
 *
 * Search → suggestion → fields fill themselves → pin drops on the map. Every
 * field stays editable afterwards (Google rarely knows the unit number, and
 * job sites are often "the lot behind number 12"), and editing one clears the
 * stored Place ID while keeping the coordinates, because the pin is still the
 * best guess at where the truck should go.
 *
 * The autocomplete IS the address UI. The full field set stays collapsed until
 * it is actually needed — the visitor asks for it, or Google can't help (no API
 * key / Maps failed to load), in which case it opens automatically. Three
 * questions beat nine for completion rate, and a picked address is already
 * correct.
 *
 * No country field: every delivery this yard quotes is domestic, so it is
 * defaulted rather than asked for.
 *
 * Degrades all the way down: with no API key, or if Maps fails to load, the
 * manual fields are the form and it still submits. Collecting the address
 * always wins over showing a map.
 */
export function AddressSelector({
  value,
  onChange,
  idPrefix = "address",
  label = "Delivery address",
  hint,
}: AddressSelectorProps) {
  const [query, setQuery] = useState(value.formatted);
  const [picked, setPicked] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const configured = isMapsConfigured();

  // Manual fields show when Google can't help at all, or the visitor asked for
  // them. A successful pick keeps them closed — the address is already right.
  const showManual = !configured || manualOpen;

  const set = useCallback(
    <K extends keyof StructuredAddress>(key: K, fieldValue: StructuredAddress[K]) => {
      onChange({
        ...value,
        [key]: fieldValue,
        // A hand-edited address is no longer verbatim from Google.
        ...(key === "apartment" ? {} : { placeId: "" }),
      });
    },
    [onChange, value],
  );

  const onPlaceSelected = useCallback(
    (place: google.maps.places.Place) => {
      const next = addressFromPlace(place);
      // Google never returns the unit — keep whatever the customer already typed.
      onChange({ ...next, apartment: value.apartment || next.apartment });
      setQuery(next.formatted);
      setPicked(true);
    },
    [onChange, value.apartment],
  );

  const markers = useMemo<MapMarker[]>(
    () =>
      hasCoords(value)
        ? [
            {
              id: "delivery",
              position: { lat: value.latitude, lng: value.longitude },
              title: value.formatted || "Delivery address",
              emphasis: true,
            },
          ]
        : [],
    [value],
  );

  const center = useMemo(
    () => (hasCoords(value) ? { lat: value.latitude, lng: value.longitude } : undefined),
    [value],
  );

  const locationBias = useMemo(
    () => ({ center: YARD, radius: BIAS_RADIUS_METERS }),
    [],
  );

  return (
    <div className="space-y-5">
      {configured ? (
        <AddressAutocomplete
          id={`${idPrefix}-search`}
          label={label}
          value={query}
          onValueChange={(next) => {
            setQuery(next);
            if (picked) setPicked(false);
          }}
          onPlaceSelected={onPlaceSelected}
          fields={PLACE_FIELDS}
          includedPrimaryTypes={["street_address", "premise", "subpremise"]}
          locationBias={locationBias}
          placeholder="Start typing the delivery address…"
          hint={hint ?? "Pick a suggestion to fill the fields below — you can edit them after."}
        />
      ) : (
        <TextField
          id={`${idPrefix}-street`}
          name={`${idPrefix}-street`}
          label={label}
          value={value.streetAddress}
          onChange={(e) => set("streetAddress", e.target.value)}
          placeholder="Street address"
          hint={hint}
          autoComplete="address-line1"
        />
      )}

      {picked ? (
        <p className="flex items-center gap-2 text-sm text-[var(--color-text-brand)]">
          <Check className="h-4 w-4" strokeWidth={2} aria-hidden />
          Address found.
        </p>
      ) : null}

      {/* Google never returns the unit number, and job sites often need one —
          so this one field stays visible even when the rest are collapsed. */}
      {configured && picked && !manualOpen ? (
        <TextField
          id={`${idPrefix}-apartment`}
          name={`${idPrefix}-apartment`}
          label="Apt, suite, unit"
          value={value.apartment}
          onChange={(e) => set("apartment", e.target.value)}
          hint="Optional"
          autoComplete="address-line2"
        />
      ) : null}

      {configured && !manualOpen ? (
        <button
          type="button"
          onClick={() => setManualOpen(true)}
          className="text-sm font-medium text-[var(--color-text-brand)] underline underline-offset-2 hover:no-underline"
        >
          {picked ? "Edit address details" : "Enter the address manually instead"}
        </button>
      ) : null}

      {hasCoords(value) ? (
        <MapCanvas
          markers={markers}
          center={center}
          zoom={16}
          label="Map of the selected delivery address"
          className="h-56 border border-[var(--color-border)] sm:h-64"
        />
      ) : null}

      {showManual ? (
      <div className="space-y-5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-text-secondary)]">
          <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
          Address details — edit anything that isn&apos;t right
        </p>

        {configured ? (
          <TextField
            id={`${idPrefix}-street`}
            name={`${idPrefix}-street`}
            label="Street address"
            value={value.streetAddress}
            onChange={(e) => set("streetAddress", e.target.value)}
            placeholder="400 W Gertrude Ave"
            autoComplete="address-line1"
          />
        ) : null}

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={`${idPrefix}-apartment`}
            name={`${idPrefix}-apartment`}
            label="Apt, suite, unit"
            value={value.apartment}
            onChange={(e) => set("apartment", e.target.value)}
            hint="Optional"
            autoComplete="address-line2"
          />
          <TextField
            id={`${idPrefix}-city`}
            name={`${idPrefix}-city`}
            label="City"
            value={value.city}
            onChange={(e) => set("city", e.target.value)}
            autoComplete="address-level2"
          />
        </div>

        {/* No country field — domestic deliveries only; QuoteForm defaults it. */}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            id={`${idPrefix}-state`}
            name={`${idPrefix}-state`}
            label="State"
            value={value.state}
            onChange={(e) => set("state", e.target.value)}
            placeholder="CA"
            autoComplete="address-level1"
          />
          <TextField
            id={`${idPrefix}-postal`}
            name={`${idPrefix}-postal`}
            label="ZIP code"
            value={value.postalCode}
            onChange={(e) => set("postalCode", e.target.value)}
            placeholder="94801"
            inputMode="numeric"
            autoComplete="postal-code"
          />
        </div>
      </div>
      ) : null}
    </div>
  );
}
