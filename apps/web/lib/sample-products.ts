/**
 * Sample product data for Phase 1 visual restyle.
 * Images use the real product photography from the current site CDN.
 * In Phase 2 this is replaced by `/api/v1/products` from the backend
 * (real data migrated from Flint POS — see system-design.md §13).
 */

const CDN =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663521319543/GbZEVBzVkRmts6C6tGgLns";

export interface SampleProduct {
  sku: string;
  name: string;
  category: string;
  unit: string;
  pricePerUnit: number; // dollars
  imageUrl: string;
  blurb: string;
  altUoms?: { label: string; price: number }[];
}

export const SAMPLE_PRODUCTS: SampleProduct[] = [
  {
    sku: "MUL-001",
    name: "Brown Mulch",
    category: "Bark & Mulch",
    unit: "Cubic Yard",
    pricePerUnit: 41.99,
    imageUrl: `${CDN}/Brown_Mulch_c67db579.jpg`,
    blurb: "Rich, dark mulch. Holds color through summer and suppresses weeds.",
    altUoms: [
      { label: "Half Cubic Yard", price: 28.0 },
      { label: "Quarter Cubic Yard", price: 17.5 },
    ],
  },
  {
    sku: "CON-001",
    name: "Decomposed Granite",
    category: "Construction Aggregate",
    unit: "Cubic Yard",
    pricePerUnit: 71.99,
    imageUrl: `${CDN}/Temescal_Fines_04aaf161.jpg`,
    blurb: "Compacts to a hard pathway surface. Drains well, easy to install.",
    altUoms: [
      { label: "Half Cubic Yard", price: 41.0 },
      { label: "Quarter Cubic Yard", price: 22.0 },
    ],
  },
  {
    sku: "DEC-003",
    name: 'Pea Gravel 3/8"',
    category: "Decorative Rock",
    unit: "Cubic Yard",
    pricePerUnit: 89.0,
    imageUrl: `${CDN}/Pea_Gravel_2_6675cde5.jpg`,
    blurb: "Smooth rounded gravel. Great for paths, drainage, and defining beds.",
    altUoms: [
      { label: "Half Cubic Yard", price: 47.0 },
      { label: "Quarter Cubic Yard", price: 25.0 },
    ],
  },
  {
    sku: "FLA-001",
    name: "Arizona Buff Flagstone (Patio)",
    category: "Flagstone & Slate",
    unit: "Pound",
    pricePerUnit: 0.18,
    imageUrl: `${CDN}/ARIZONA_b95a1eea.jpg`,
    blurb: 'Warm sandstone in tan and rust. 1–1.5" thick. Sold by the pound.',
  },
  {
    sku: "BAG-001",
    name: "GatorClean Polymeric Sealer",
    category: "Bagged Products",
    unit: "Each",
    pricePerUnit: 34.99,
    imageUrl: `${CDN}/GatorClean_RPT_USA_01QT_2bf85851.jpg`,
    blurb: "Cleaner and sealer for paver installations and joint sand.",
  },
  {
    sku: "SND-001",
    name: "Felton Sand",
    category: "Sand",
    unit: "Cubic Yard",
    pricePerUnit: 65.0,
    imageUrl: `${CDN}/Felton_Sand_13be18f1.jpg`,
    blurb: "Fine, clean sand for mortar and paver leveling.",
    altUoms: [
      { label: "Half Cubic Yard", price: 36.0 },
      { label: "Quarter Cubic Yard", price: 20.0 },
    ],
  },
];

export const FEATURED_PRODUCTS = SAMPLE_PRODUCTS.slice(0, 4);
