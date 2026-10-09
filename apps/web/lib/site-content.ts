/**
 * Shared content from the original site. Photography now lives in public/image
 * (lib/scenes.ts); CDN is kept only for the gallery's before-and-after project
 * photos, which have no local copies yet.
 */
export const CDN =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663521319543/GbZEVBzVkRmts6C6tGgLns";


export const STATS = [
  { label: "Mile Delivery Radius", value: "70" },
  { label: "Products Available", value: "150+" },
  { label: "Satisfied Customers", value: "10,000+" },
  { label: "Delivery Fleet", value: "25+ Vehicles" },
] as const;

export const SERVICES = [
  { title: "Bulk Delivery", description: "Fast, reliable delivery of bulk materials throughout the Bay Area" },
  { title: "Custom Soil Blends", description: "Specialized soil mixes tailored to your project needs" },
  { title: "Material Calculator", description: "Precise quantity estimates for your landscaping projects" },
  { title: "Expert Consultation", description: "Professional guidance from experienced landscaping specialists" },
  { title: "Competitive Pricing", description: "Best prices on premium building materials in the Bay Area" },
  { title: "Same-Day Quotes", description: "Quick turnaround on material quotes and project estimates" },
] as const;
