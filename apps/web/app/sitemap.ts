import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

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
  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1.0 : 0.7,
  }));
}
