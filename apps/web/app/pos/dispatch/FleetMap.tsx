"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Navigation } from "lucide-react";
import type { Truck } from "@/lib/api-client";

// Real map tiles. Defaults to OpenStreetMap (keyless); override with a provider
// (Mapbox/Stadia/etc) via NEXT_PUBLIC_MAP_TILE_URL.
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL ?? "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const YARD: [number, number] = [37.94, -122.36];

const STATUS: Record<Truck["status"], { color: string; label: string }> = {
  available: { color: "#16a34a", label: "Available" },
  on_route: { color: "#2563eb", label: "On route" },
  maintenance: { color: "#d97706", label: "Maintenance" },
};

// Leaflet renders popup content as HTML; truck and driver names are typed by staff.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function popupHtml(t: Truck): string {
  const seen = t.lastSeen ? `<br><span style="opacity:.65">seen ${new Date(t.lastSeen).toLocaleTimeString()}</span>` : "";
  const speed = t.speed ? `<br>${Math.round(t.speed)} mph` : "";
  const driver = t.driverName ? `<br>${escapeHtml(t.driverName)}` : "";
  return `<strong>${escapeHtml(String(t.number))}</strong><br>${STATUS[t.status].label}${driver}${speed}${seen}`;
}

export function FleetMap({ trucks }: { trucks: Truck[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<globalThis.Map<string, L.CircleMarker>>(new globalThis.Map());
  const fittedRef = useRef(false);

  // Initialise the map once.
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;
    const map = L.map(containerRef.current, { center: YARD, zoom: 12 });
    L.tileLayer(TILE_URL, {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    L.circleMarker(YARD, { radius: 6, color: "#3f6212", fillColor: "#84cc16", fillOpacity: 1, weight: 2 })
      .addTo(map)
      .bindTooltip("Yard", { permanent: true, direction: "top", offset: [0, -6] });
    mapRef.current = map;
    const markers = markersRef.current;
    return () => {
      map.remove();
      mapRef.current = null;
      markers.clear();
      fittedRef.current = false;
    };
  }, []);

  // Sync truck markers on every poll (move existing, add new, drop removed).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const seen = new Set<string>();
    for (const t of trucks) {
      if (!Number.isFinite(t.lat) || !Number.isFinite(t.lng)) continue;
      seen.add(t.id);
      const ll: [number, number] = [t.lat, t.lng];
      const color = STATUS[t.status].color;
      const existing = markersRef.current.get(t.id);
      if (existing) {
        existing.setLatLng(ll);
        existing.setStyle({ color, fillColor: color });
        existing.getPopup()?.setContent(popupHtml(t));
      } else {
        const m = L.circleMarker(ll, { radius: 7, color, fillColor: color, fillOpacity: 0.9, weight: 2 })
          .addTo(map)
          .bindPopup(popupHtml(t))
          .bindTooltip(t.number, { permanent: true, direction: "top", offset: [0, -8] });
        markersRef.current.set(t.id, m);
      }
    }
    for (const [id, m] of markersRef.current) {
      if (!seen.has(id)) {
        m.remove();
        markersRef.current.delete(id);
      }
    }
    // Frame the fleet once, on first data.
    if (!fittedRef.current) {
      const pts = trucks
        .filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng))
        .map((t) => [t.lat, t.lng] as [number, number]);
      if (pts.length) {
        map.fitBounds(L.latLngBounds([...pts, YARD]).pad(0.25));
        fittedRef.current = true;
      }
    }
  }, [trucks]);

  return (
    <div className="mb-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
          <Navigation className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          Live Map
        </h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-secondary)]">
          {(Object.keys(STATUS) as Truck["status"][]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: STATUS[s].color }} aria-hidden />
              {STATUS[s].label}
            </span>
          ))}
        </div>
      </div>
      <div
        ref={containerRef}
        className="h-72 w-full overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)]"
      />
    </div>
  );
}
