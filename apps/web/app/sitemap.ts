import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";
import { CATEGORIES, PRODUCTS, categoryPath, productPath } from "@/lib/catalog";

const PUBLIC_PATHS = [
  "/",
  "/products",
  "/gallery",
  "/calculator",
  "/yard-size-guide",
  "/tools",
  "/service-area",
  "/faq",
  "/delivery",
  "/returns",
  "/about",
  "/contact",
  "/request-quote",
  "/terms-of-service",
  "/privacy-policy",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = `https://${COMPANY.domain}`;
  const now = new Date();
  const pages: MetadataRoute.Sitemap = PUBLIC_PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1.0 : 0.7,
  }));
  const categories: MetadataRoute.Sitemap = CATEGORIES.map((c) => ({
    url: `${base}${categoryPath(c.slug)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.7,
  }));
  // Each product page, dated by its last change in the POS export.
  const products: MetadataRoute.Sitemap = PRODUCTS.map((p) => ({
    url: `${base}${productPath(p.slug)}`,
    lastModified: new Date(`${p.updatedAt}T00:00:00Z`),
    changeFrequency: "monthly",
    priority: 0.6,
    ...(p.images.length ? { images: p.images.map((i) => `${base}${i.src}`) } : {}),
  }));
  return [...pages, ...categories, ...products];
}
