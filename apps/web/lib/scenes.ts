import type { StaticImageData } from "next/image";
import { CATEGORY_SCENES, SCENE_META, type SceneName } from "./scene-meta";

import topsoilWide from "@/public/image/BALM_IMG-01_TOPSOIL_CLEAN_191x1.webp";
import topsoilSquare from "@/public/image/BALM_IMG-01_TOPSOIL_CLEAN_1x1.webp";
import topsoilTall from "@/public/image/BALM_IMG-01_TOPSOIL_CLEAN_4x5.webp";
import raisedBedWide from "@/public/image/BALM_IMG-02_RAISEDBED_CLEAN_191x1.webp";
import raisedBedSquare from "@/public/image/BALM_IMG-02_RAISEDBED_CLEAN_1x1.webp";
import raisedBedTall from "@/public/image/BALM_IMG-02_RAISEDBED_CLEAN_4x5.webp";
import compostWide from "@/public/image/BALM_IMG-03_COMPOST_CLEAN_191x1.webp";
import compostSquare from "@/public/image/BALM_IMG-03_COMPOST_CLEAN_1x1.webp";
import compostTall from "@/public/image/BALM_IMG-03_COMPOST_CLEAN_4x5.webp";
import mulchWide from "@/public/image/BALM_IMG-04_MULCH_CLEAN_191x1.webp";
import mulchSquare from "@/public/image/BALM_IMG-04_MULCH_CLEAN_1x1.webp";
import mulchTall from "@/public/image/BALM_IMG-04_MULCH_CLEAN_4x5.webp";
import barkWide from "@/public/image/BALM_IMG-05_BARK_CLEAN_191x1.webp";
import barkSquare from "@/public/image/BALM_IMG-05_BARK_CLEAN_1x1.webp";
import barkTall from "@/public/image/BALM_IMG-05_BARK_CLEAN_4x5.webp";
import peaGravelWide from "@/public/image/BALM_IMG-06_PEAGRAVEL_CLEAN_191x1.webp";
import peaGravelSquare from "@/public/image/BALM_IMG-06_PEAGRAVEL_CLEAN_1x1.webp";
import peaGravelTall from "@/public/image/BALM_IMG-06_PEAGRAVEL_CLEAN_4x5.webp";
import decoRockWide from "@/public/image/BALM_IMG-07_DECOROCK_CLEAN_191x1.webp";
import decoRockSquare from "@/public/image/BALM_IMG-07_DECOROCK_CLEAN_1x1.webp";
import decoRockTall from "@/public/image/BALM_IMG-07_DECOROCK_CLEAN_4x5.webp";
import baseRockWide from "@/public/image/BALM_IMG-08_BASEROCK_CLEAN_191x1.webp";
import baseRockSquare from "@/public/image/BALM_IMG-08_BASEROCK_CLEAN_1x1.webp";
import baseRockTall from "@/public/image/BALM_IMG-08_BASEROCK_CLEAN_4x5.webp";
import drainRockWide from "@/public/image/BALM_IMG-09_DRAINROCK_CLEAN_191x1.webp";
import drainRockSquare from "@/public/image/BALM_IMG-09_DRAINROCK_CLEAN_1x1.webp";
import drainRockTall from "@/public/image/BALM_IMG-09_DRAINROCK_CLEAN_4x5.webp";
import sandWide from "@/public/image/BALM_IMG-10_SAND_CLEAN_191x1.webp";
import sandSquare from "@/public/image/BALM_IMG-10_SAND_CLEAN_1x1.webp";
import sandTall from "@/public/image/BALM_IMG-10_SAND_CLEAN_4x5.webp";
import flagstoneWide from "@/public/image/BALM_IMG-11_FLAGSTONE_CLEAN_191x1.webp";
import flagstoneSquare from "@/public/image/BALM_IMG-11_FLAGSTONE_CLEAN_1x1.webp";
import flagstoneTall from "@/public/image/BALM_IMG-11_FLAGSTONE_CLEAN_4x5.webp";
import paversWide from "@/public/image/BALM_IMG-12_PAVERS_CLEAN_191x1.webp";
import paversSquare from "@/public/image/BALM_IMG-12_PAVERS_CLEAN_1x1.webp";
import paversTall from "@/public/image/BALM_IMG-12_PAVERS_CLEAN_4x5.webp";
import deliveryWide from "@/public/image/BALM_IMG-13_DELIVERY_CLEAN_191x1.webp";
import deliverySquare from "@/public/image/BALM_IMG-13_DELIVERY_CLEAN_1x1.webp";
import deliveryTall from "@/public/image/BALM_IMG-13_DELIVERY_CLEAN_4x5.webp";
import yardWide from "@/public/image/BALM_IMG-14_YARD_CLEAN_191x1.webp";
import yardSquare from "@/public/image/BALM_IMG-14_YARD_CLEAN_1x1.webp";
import yardTall from "@/public/image/BALM_IMG-14_YARD_CLEAN_4x5.webp";
import calcWide from "@/public/image/BALM_IMG-15_CALC_CLEAN_191x1.webp";
import calcSquare from "@/public/image/BALM_IMG-15_CALC_CLEAN_1x1.webp";
import calcTall from "@/public/image/BALM_IMG-15_CALC_CLEAN_4x5.webp";
import contractorWide from "@/public/image/BALM_IMG-16_CONTRACTOR_CLEAN_191x1.webp";
import contractorSquare from "@/public/image/BALM_IMG-16_CONTRACTOR_CLEAN_1x1.webp";
import contractorTall from "@/public/image/BALM_IMG-16_CONTRACTOR_CLEAN_4x5.webp";
import beforeAfterWide from "@/public/image/BALM_IMG-17_BEFOREAFTER_CLEAN_191x1.webp";
import beforeAfterSquare from "@/public/image/BALM_IMG-17_BEFOREAFTER_CLEAN_1x1.webp";
import beforeAfterTall from "@/public/image/BALM_IMG-17_BEFOREAFTER_CLEAN_4x5.webp";
import reviewsWide from "@/public/image/BALM_IMG-18_REVIEWS_CLEAN_191x1.webp";
import reviewsSquare from "@/public/image/BALM_IMG-18_REVIEWS_CLEAN_1x1.webp";
import reviewsTall from "@/public/image/BALM_IMG-18_REVIEWS_CLEAN_4x5.webp";

/**
 * The site's photography: 18 scenes in public/image, each cut three ways —
 * wide (1.91:1, 1200×628), square (1200×1200) and tall (4:5, 960×1200). Pages
 * pick a scene and a cut from here instead of naming files, so the alt text
 * travels with the photo. next/image serves each cut as AVIF or WebP at the
 * size the layout needs. Names, alt text and share cards: lib/scene-meta.ts.
 */
export interface Scene {
  wide: StaticImageData;
  square: StaticImageData;
  tall: StaticImageData;
  alt: string;
}

function scene(name: SceneName, wide: StaticImageData, square: StaticImageData, tall: StaticImageData): Scene {
  return { wide, square, tall, alt: SCENE_META[name].alt };
}

export const SCENES = {
  topsoil: scene("topsoil", topsoilWide, topsoilSquare, topsoilTall),
  raisedBed: scene("raisedBed", raisedBedWide, raisedBedSquare, raisedBedTall),
  compost: scene("compost", compostWide, compostSquare, compostTall),
  mulch: scene("mulch", mulchWide, mulchSquare, mulchTall),
  bark: scene("bark", barkWide, barkSquare, barkTall),
  peaGravel: scene("peaGravel", peaGravelWide, peaGravelSquare, peaGravelTall),
  decoRock: scene("decoRock", decoRockWide, decoRockSquare, decoRockTall),
  baseRock: scene("baseRock", baseRockWide, baseRockSquare, baseRockTall),
  drainRock: scene("drainRock", drainRockWide, drainRockSquare, drainRockTall),
  sand: scene("sand", sandWide, sandSquare, sandTall),
  flagstone: scene("flagstone", flagstoneWide, flagstoneSquare, flagstoneTall),
  pavers: scene("pavers", paversWide, paversSquare, paversTall),
  delivery: scene("delivery", deliveryWide, deliverySquare, deliveryTall),
  yard: scene("yard", yardWide, yardSquare, yardTall),
  calculator: scene("calculator", calcWide, calcSquare, calcTall),
  contractor: scene("contractor", contractorWide, contractorSquare, contractorTall),
  beforeAfter: scene("beforeAfter", beforeAfterWide, beforeAfterSquare, beforeAfterTall),
  reviews: scene("reviews", reviewsWide, reviewsSquare, reviewsTall),
} as const satisfies Record<SceneName, Scene>;

export function categoryScene(slug: string): Scene | null {
  const name = CATEGORY_SCENES[slug];
  return name ? SCENES[name] : null;
}
