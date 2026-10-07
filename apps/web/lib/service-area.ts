import { COMPANY } from "@/lib/company";

/**
 * Delivery service area — the mileage tiers already published on
 * /service-area, lifted into a module so the store locator can answer
 * "which tier is this customer in?" from the same data the page renders.
 *
 * These are existing business policy. Do not invent tiers or fees here; edit
 * this list only when the yard actually changes its delivery policy.
 */
export interface Tier {
  label: string;
  rangeMi: string;
  feeNote: string;
  cities: readonly string[];
  tone: "near" | "mid" | "far";
  /** Inclusive lower / exclusive upper bound in miles, for distance lookup. */
  minMi: number;
  maxMi: number;
}

export const TIERS: readonly Tier[] = [
  {
    label: "Tier 1 — same-day window",
    rangeMi: "0 – 15 miles",
    feeNote: "Lowest delivery fee. Order by 11 AM, on-site that afternoon.",
    cities: [
      "Richmond", "El Cerrito", "Albany", "Berkeley", "Pinole",
      "Hercules", "San Pablo", "Kensington", "Emeryville", "Oakland",
    ],
    tone: "near",
    minMi: 0,
    maxMi: 15,
  },
  {
    label: "Tier 2 — next-day standard",
    rangeMi: "15 – 35 miles",
    feeNote: "Same-day if scheduled early. Otherwise next-day.",
    cities: [
      "Alameda", "San Leandro", "Castro Valley", "Walnut Creek", "Pleasant Hill",
      "Martinez", "Concord", "San Francisco", "Daly City", "Mill Valley",
      "San Rafael", "Larkspur", "Tiburon", "Sausalito", "Hayward",
      "Lafayette", "Orinda", "Pittsburg",
    ],
    tone: "mid",
    minMi: 15,
    maxMi: 35,
  },
  {
    label: "Tier 3 — quoted by mileage",
    rangeMi: "35 – 70 miles",
    feeNote: "Per-mile delivery fee. Quote turns around the same day.",
    cities: [
      "Antioch", "Brentwood", "Vallejo", "American Canyon", "Napa", "Fairfield",
      "Novato", "Petaluma", "San Mateo", "Burlingame", "Redwood City",
      "Palo Alto", "Mountain View", "Fremont", "Newark", "Union City",
      "Pleasanton", "Livermore", "Dublin", "San Ramon",
    ],
    tone: "far",
    minMi: 35,
    maxMi: 70,
  },
];

/** Outside every tier — /service-area already tells these customers to ask. */
export const OUT_OF_AREA = {
  label: `Outside our ${COMPANY.serviceRadiusMi}-mile range`,
  feeNote:
    "Send your details — for larger orders we quote further out, and may coordinate with a partner yard closer to your site.",
} as const;

/**
 * Which published tier a distance falls into. `null` means beyond the
 * service radius (the /service-area "Outside 70 miles?" case).
 */
export function tierForMiles(miles: number): Tier | null {
  return TIERS.find((t) => miles >= t.minMi && miles < t.maxMi) ?? null;
}
