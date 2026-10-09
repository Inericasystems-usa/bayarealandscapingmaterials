import { COMPANY } from "./company";

/**
 * Names, files and alt text of the site's 18 scene photos, plus the catalog
 * category each one illustrates. Kept free of image imports so server-only code
 * and tests (share-card metadata, lib/catalog/seo.ts) can use it; the image
 * data itself is in lib/scenes.ts.
 *
 * The scenes are illustrative: alt text describes what is shown and never
 * claims it is the Richmond yard or a particular customer's project.
 */
export const SCENE_META = {
  topsoil: { file: "BALM_IMG-01_TOPSOIL_CLEAN", alt: "A pile of dark screened topsoil with a shovel, delivered on a driveway" },
  raisedBed: { file: "BALM_IMG-02_RAISEDBED_CLEAN", alt: "Cedar raised garden beds filled with planting soil on a sunny lawn" },
  compost: { file: "BALM_IMG-03_COMPOST_CLEAN", alt: "A gloved hand holding a scoop of rich, dark compost" },
  mulch: { file: "BALM_IMG-04_MULCH_CLEAN", alt: "Black, brown and red bark mulch laid side by side with a rake" },
  bark: { file: "BALM_IMG-05_BARK_CLEAN", alt: "Red bark mulch around ornamental grasses and lavender beside a lawn" },
  peaGravel: { file: "BALM_IMG-06_PEAGRAVEL_CLEAN", alt: "A pea gravel garden path with stepping stones, river rock edging and succulents" },
  decoRock: { file: "BALM_IMG-07_DECOROCK_CLEAN", alt: "Nine decorative rock samples, from gold gravel and red lava rock to black river pebbles" },
  baseRock: { file: "BALM_IMG-08_BASEROCK_CLEAN", alt: "A compacted base rock pad inside wooden forms, with a plate compactor and survey level" },
  drainRock: { file: "BALM_IMG-09_DRAINROCK_CLEAN", alt: "Drain rock around a perforated drain pipe in a trench lined with landscape fabric" },
  sand: { file: "BALM_IMG-10_SAND_CLEAN", alt: "A wooden sandbox filled with clean play sand, with a bag and hand trowel" },
  flagstone: { file: "BALM_IMG-11_FLAGSTONE_CLEAN", alt: "A flagstone patio with a bench and olive tree, overlooking the bay" },
  pavers: { file: "BALM_IMG-12_PAVERS_CLEAN", alt: "A cutaway of a paver patio: pavers over a sand bed over compacted gravel base" },
  delivery: { file: "BALM_IMG-13_DELIVERY_CLEAN", alt: "A dump truck tipping a load of bark mulch onto a tarp on a home driveway" },
  yard: { file: "BALM_IMG-14_YARD_CLEAN", alt: "A landscape materials yard with bays of rock, soil and mulch, a loader and pallets of stone and pavers" },
  calculator: { file: "BALM_IMG-15_CALC_CLEAN", alt: "A new garden bed outlined in chalk on a lawn, with a tape measure and phone for working out quantities" },
  contractor: { file: "BALM_IMG-16_CONTRACTOR_CLEAN", alt: "A loader pouring gravel into a contractor's pickup at sunrise" },
  beforeAfter: { file: "BALM_IMG-17_BEFOREAFTER_CLEAN", alt: "The same yard before and after: bare dirt, then a stone path, mulched beds and new plants" },
  reviews: { file: "BALM_IMG-18_REVIEWS_CLEAN", alt: "A yard team member handing a customer a ticket beside a loaded pickup" },
} as const;

export type SceneName = keyof typeof SCENE_META;

/**
 * The photo for each catalog category that has one. Categories not listed keep
 * their product photos (and the generic placeholder for products without one).
 */
export const CATEGORY_SCENES: Partial<Record<string, SceneName>> = {
  soil: "topsoil",
  "bagged-products": "compost",
  "bark-mulch": "mulch",
  "premium-decorative-rock": "peaGravel",
  "decorative-rock": "decoRock",
  "construction-aggregates": "baseRock",
  "landscape-fabric": "drainRock",
  sand: "sand",
  "flagstone-slate": "flagstone",
  pavers: "pavers",
  services: "delivery",
};

/**
 * og:image / twitter:image entry for a scene: the 1200×628 PNG of its wide
 * cut. PNG rather than WebP, because not every network reads WebP.
 */
export function shareImage(name: SceneName) {
  const { file, alt } = SCENE_META[name];
  return { url: `/image/${file}_191x1.png`, width: 1200, height: 628, alt };
}

/**
 * The share-card part of a page's metadata, with the scene the page shows.
 * Next fills og:title and og:description from the page's own title and
 * description, so only the card itself is set here.
 */
export function sceneShare(name: SceneName, path: string) {
  const image = shareImage(name);
  return {
    openGraph: { type: "website" as const, locale: "en_US", siteName: COMPANY.shortName, url: path, images: [image] },
    twitter: { card: "summary_large_image" as const, images: [image.url] },
  };
}
