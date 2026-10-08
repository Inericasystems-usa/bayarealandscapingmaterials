import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

// No Disallow lines: robots.txt is public, so listing private areas only
// advertises them. Staff screens and the API send X-Robots-Tag: noindex
// instead (next.config.ts).
export default function robots(): MetadataRoute.Robots {
  const base = `https://${COMPANY.domain}`;
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
