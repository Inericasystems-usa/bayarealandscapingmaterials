"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, TriangleAlert } from "lucide-react";
import { cn } from "@balm/ui";
import { loadMapsLibrary, describeMapsError, MAP_ID } from "@/lib/maps/loader";

export interface MapMarker {
  id: string;
  position: google.maps.LatLngLiteral;
  title: string;
  /** Draws this marker in the accent colour — used for the customer's own pin. */
  emphasis?: boolean;
}

interface MapCanvasProps {
  markers: readonly MapMarker[];
  /** Falls back to fitting all markers when omitted. */
  center?: google.maps.LatLngLiteral | undefined;
  zoom?: number;
  className?: string;
  /** Accessible name for the map region. */
  label: string;
  onMarkerClick?: (id: string) => void;
}

/**
 * The only component in the app that instantiates a `google.maps.Map`.
 *
 * Creates exactly one map per mount, then reconciles markers on every render
 * (move existing, add new, drop removed) rather than tearing the map down —
 * the same approach the POS fleet map uses for Leaflet.
 *
 * Renders a styled, informative fallback instead of a blank grey box whenever
 * Maps can't load, so a missing key or an offline visitor never sees a broken UI.
 */
export function MapCanvas({
  markers,
  center,
  zoom = 11,
  className,
  label,
  onMarkerClick,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef(new Map<string, google.maps.marker.AdvancedMarkerElement>());
  const clickRef = useRef(onMarkerClick);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Keep the latest handler without re-running marker reconciliation.
  useEffect(() => {
    clickRef.current = onMarkerClick;
  }, [onMarkerClick]);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { Map } = await loadMapsLibrary<google.maps.MapsLibrary>("maps");
        if (cancelled || !containerRef.current || mapRef.current) return;

        mapRef.current = new Map(containerRef.current, {
          center: center ?? { lat: 37.95, lng: -122.37 },
          zoom,
          mapId: MAP_ID,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          maxZoom: 20,
          clickableIcons: false,
        });
        setReady(true);
      } catch (err) {
        if (!cancelled) setError(describeMapsError(err));
      }
    })();

    // Bind the ref's value now: by cleanup time markersRef.current could point
    // at a different Map instance.
    const liveMarkers = markersRef.current;
    return () => {
      cancelled = true;
      for (const marker of liveMarkers.values()) marker.map = null;
      liveMarkers.clear();
      mapRef.current = null;
    };
    // Initial centre/zoom only — later changes are handled by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reconcile markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    let cancelled = false;

    void (async () => {
      const { AdvancedMarkerElement, PinElement } =
        await loadMapsLibrary<google.maps.MarkerLibrary>("marker");
      if (cancelled || !mapRef.current) return;

      const live = markersRef.current;
      const seen = new Set<string>();

      for (const m of markers) {
        seen.add(m.id);
        const existing = live.get(m.id);
        if (existing) {
          existing.position = m.position;
          existing.title = m.title;
          continue;
        }

        // Palette pulled from the design tokens so pins match the site.
        const pin = new PinElement(
          m.emphasis
            ? { background: "#a2d2ff", borderColor: "#2a6fb8", glyphColor: "#0e241b", scale: 1.1 }
            : { background: "#2f6b4f", borderColor: "#0e241b", glyphColor: "#ffffff", scale: 1.1 },
        );

        const marker = new AdvancedMarkerElement({
          map: mapRef.current,
          position: m.position,
          title: m.title,
          content: pin.element,
          gmpClickable: true,
        });
        marker.addListener("gmp-click", () => clickRef.current?.(m.id));
        live.set(m.id, marker);
      }

      for (const [id, marker] of live) {
        if (seen.has(id)) continue;
        marker.map = null;
        live.delete(id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [markers, ready]);

  // Follow the requested centre, or frame every marker when none is given.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    if (center) {
      map.panTo(center);
      if (map.getZoom() !== undefined && map.getZoom()! < zoom) map.setZoom(zoom);
      return;
    }

    if (markers.length === 1 && markers[0]) {
      map.panTo(markers[0].position);
      return;
    }
    if (markers.length > 1) {
      const bounds = new google.maps.LatLngBounds();
      for (const m of markers) bounds.extend(m.position);
      map.fitBounds(bounds, 64);
    }
  }, [center, zoom, markers, ready]);

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-8 text-center",
          className,
        )}
      >
        <TriangleAlert
          className="h-8 w-8 text-[var(--color-text-muted)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          The map couldn&apos;t load.
        </p>
        <p className="max-w-xs text-sm text-[var(--color-text-secondary)]">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden rounded-[var(--radius-lg)]", className)}>
      <div
        ref={containerRef}
        role="region"
        aria-label={label}
        className="h-full w-full bg-[var(--color-bg-surface)]"
      />
      {!ready ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-[var(--color-text-muted)]">
          <MapPin className="h-4 w-4 animate-pulse" strokeWidth={1.5} aria-hidden />
          Loading map…
        </div>
      ) : null}
    </div>
  );
}
