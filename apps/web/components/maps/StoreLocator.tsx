"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, MapPin, Navigation, Phone, Truck } from "lucide-react";
import { Button, cn } from "@balm/ui";
import { MapCanvas, type MapMarker } from "@/components/maps/MapCanvas";
import { AddressAutocomplete } from "@/components/maps/AddressAutocomplete";
import { isMapsConfigured } from "@/lib/maps/loader";
import {
  drivingDistances,
  formatDuration,
  formatMiles,
  type DistanceResult,
} from "@/lib/maps/distance";
import { directionsUrl, HAS_MULTIPLE_LOCATIONS, LOCATIONS } from "@/lib/locations";
import { OUT_OF_AREA, tierForMiles } from "@/lib/service-area";

/** Where the customer said they are. */
interface Origin {
  label: string;
  coords: google.maps.LatLngLiteral;
}

/** A yard plus how far it is from the customer. */
interface RankedLocation {
  location: (typeof LOCATIONS)[number];
  distance: DistanceResult | null;
}

const LOCATOR_FIELDS = ["location", "formattedAddress", "id"] as const;

const YARD = LOCATIONS[0]?.coords ?? { lat: 37.95, lng: -122.37 };
const BIAS_RADIUS_METERS = 120_000;

/**
 * Store locator: the customer searches their address, we rank our yards by
 * driving distance and tell them which published delivery tier they fall into.
 *
 * Distance comes from the Routes API through our own server route, falling back
 * to straight-line when routing is unavailable — and the label always says which,
 * so a straight-line number is never passed off as a drive.
 *
 * Layout is a two-column split on desktop (panel left, map right) and a single
 * stacked column on mobile, with the map last.
 */
export function StoreLocator() {
  const [query, setQuery] = useState("");
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [ranked, setRanked] = useState<RankedLocation[]>(
    LOCATIONS.map((location) => ({ location, distance: null })),
  );
  const [selectedId, setSelectedId] = useState<string>(LOCATIONS[0]?.id ?? "");
  const [measuring, setMeasuring] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const configured = isMapsConfigured();

  // Cancel an in-flight distance lookup when the component goes away.
  useEffect(() => () => abortRef.current?.abort(), []);

  const onPlaceSelected = useCallback((place: google.maps.places.Place) => {
    const location = place.location;
    if (!location) return;
    const label = place.formattedAddress ?? "";
    setQuery(label);
    setOrigin({ label, coords: { lat: location.lat(), lng: location.lng() } });
  }, []);

  // Measure whenever the customer's origin changes.
  useEffect(() => {
    if (!origin) {
      setRanked(LOCATIONS.map((location) => ({ location, distance: null })));
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setMeasuring(true);

    void (async () => {
      const results = await drivingDistances(
        origin.coords,
        LOCATIONS.map((l) => l.coords),
        controller.signal,
      );
      if (controller.signal.aborted) return;

      const next = LOCATIONS.map((location, index) => ({
        location,
        distance: results[index] ?? null,
      })).sort((a, b) => (a.distance?.miles ?? Infinity) - (b.distance?.miles ?? Infinity));

      setRanked(next);
      const nearest = next[0];
      if (nearest) setSelectedId(nearest.location.id);
      setMeasuring(false);
    })();

    return () => controller.abort();
  }, [origin]);

  const markers = useMemo<MapMarker[]>(() => {
    const pins: MapMarker[] = LOCATIONS.map((l) => ({
      id: l.id,
      position: l.coords,
      title: `${l.title} — ${l.address1}`,
    }));
    if (origin) {
      pins.push({
        id: "customer",
        position: origin.coords,
        title: origin.label || "Your location",
        emphasis: true,
      });
    }
    return pins;
  }, [origin]);

  // Before a search, sit on the yard; after one, let the map frame both pins.
  const center = origin ? undefined : YARD;

  const locationBias = useMemo(() => ({ center: YARD, radius: BIAS_RADIUS_METERS }), []);
  const nearest = ranked[0];
  const selected = ranked.find((r) => r.location.id === selectedId) ?? nearest;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-5">
      {/* Panel — first on mobile, left column on desktop */}
      <div className="min-w-0 space-y-6 lg:col-span-2">
        <div>
          <h3 className="font-display text-xl font-semibold text-[var(--color-text-primary)]">
            Search your location
          </h3>
          <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
            Enter your delivery address and we&apos;ll show the distance from our yard and which
            delivery tier you fall in.
          </p>
        </div>

        {configured ? (
          <AddressAutocomplete
            id="locator-search"
            label="Your address"
            value={query}
            onValueChange={setQuery}
            onPlaceSelected={onPlaceSelected}
            fields={LOCATOR_FIELDS}
            includedPrimaryTypes={["geocode"]}
            locationBias={locationBias}
            placeholder="Address, city or ZIP…"
          />
        ) : (
          <p className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm text-[var(--color-text-secondary)]">
            Address search isn&apos;t configured on this site yet. Our yard details are below, or
            call us and we&apos;ll price the delivery over the phone.
          </p>
        )}

        {origin ? (
          <DistanceSummary result={selected?.distance ?? null} measuring={measuring} />
        ) : null}

        <div className="space-y-3">
          <h4 className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
            {origin && HAS_MULTIPLE_LOCATIONS
              ? "Nearest location"
              : HAS_MULTIPLE_LOCATIONS
                ? "Our locations"
                : "Our yard"}
          </h4>

          {ranked.map(({ location, distance }) => {
            const isSelected = location.id === selectedId;
            return (
              <div
                key={location.id}
                className={cn(
                  "rounded-[var(--radius-lg)] border p-5 transition-colors",
                  isSelected
                    ? "border-[var(--color-moss-300)] bg-[var(--color-moss-50)]"
                    : "border-[var(--color-border)] bg-[var(--color-bg-elevated)]",
                )}
              >
                {HAS_MULTIPLE_LOCATIONS ? (
                  <button
                    type="button"
                    onClick={() => setSelectedId(location.id)}
                    aria-pressed={isSelected}
                    className="mb-2 text-start font-display text-base font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-text-brand)]"
                  >
                    {location.title}
                  </button>
                ) : (
                  <p className="mb-2 font-display text-base font-semibold text-[var(--color-text-primary)]">
                    {location.title}
                  </p>
                )}

                <p className="flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-brand)]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span>
                    {location.address1}
                    <br />
                    {location.address2}
                  </span>
                </p>

                {distance ? (
                  <p className="mt-3 flex items-center gap-2.5 text-sm font-medium text-[var(--color-text-primary)]">
                    <Truck
                      className="h-4 w-4 shrink-0 text-[var(--color-text-brand)]"
                      strokeWidth={1.5}
                      aria-hidden
                    />
                    {formatMiles(distance.miles)}
                    <span className="font-normal text-[var(--color-text-muted)]">
                      {distance.kind === "driving"
                        ? distance.durationSeconds !== undefined
                          ? `driving · about ${formatDuration(distance.durationSeconds)}`
                          : "driving"
                        : "straight line"}
                    </span>
                  </p>
                ) : null}

                <p className="mt-3 flex items-center gap-2.5 text-sm text-[var(--color-text-secondary)]">
                  <Phone
                    className="h-4 w-4 shrink-0 text-[var(--color-text-brand)]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <a
                    href={`tel:${location.phoneE164}`}
                    data-call-location="unknown"
                    className="hover:text-[var(--color-text-brand)]"
                  >
                    {location.phone}
                  </a>
                </p>
                <p className="mt-2 flex items-start gap-2.5 text-sm text-[var(--color-text-secondary)]">
                  <Clock
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-brand)]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span>
                    {location.hours.map((h) => (
                      <span key={h.label} className="block">
                        {h.label}: {h.value}
                      </span>
                    ))}
                  </span>
                </p>

                <a
                  href={directionsUrl(location, origin?.label)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-block"
                >
                  <Button variant="secondary" size="sm" type="button">
                    <Navigation className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                    Directions
                  </Button>
                </a>
              </div>
            );
          })}
        </div>
      </div>

      {/* Map — second on mobile, right column on desktop */}
      <MapCanvas
        markers={markers}
        center={center}
        zoom={11}
        label="Map of our yard and your location"
        className="h-[22rem] border border-[var(--color-border)] lg:col-span-3 lg:h-full lg:min-h-[34rem]"
        onMarkerClick={(id) => {
          if (id !== "customer") setSelectedId(id);
        }}
      />
    </div>
  );
}

/**
 * Turns a raw distance into the answer the customer actually wants: which of
 * the yard's published delivery tiers they are in. Tiers come from
 * lib/service-area.ts — the same data /service-area renders.
 */
function DistanceSummary({
  result,
  measuring,
}: {
  result: DistanceResult | null;
  measuring: boolean;
}) {
  if (measuring && !result) {
    return (
      <p className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 text-sm text-[var(--color-text-secondary)]">
        Measuring the distance…
      </p>
    );
  }
  if (!result) return null;

  const tier = tierForMiles(result.miles);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-moss-200)] bg-[var(--color-moss-50)] p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-brand)]">
        {tier ? tier.rangeMi : `Beyond ${OUT_OF_AREA.label.toLowerCase()}`}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold text-[var(--color-moss-900)]">
        {formatMiles(result.miles)} from the yard
      </p>
      <p className="mt-2 text-sm text-[var(--color-moss-800)]">
        {tier ? `${tier.label}. ${tier.feeNote}` : OUT_OF_AREA.feeNote}
      </p>
      {result.kind === "straight-line" ? (
        <p className="mt-3 text-xs text-[var(--color-text-muted)]">
          Straight-line estimate — the driving route will be a little longer. We confirm the exact
          delivery fee on your quote.
        </p>
      ) : null}
    </div>
  );
}
