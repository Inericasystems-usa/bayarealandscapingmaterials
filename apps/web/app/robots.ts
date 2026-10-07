import type { MetadataRoute } from "next";
import { COMPANY } from "@/lib/company";

export default function robots(): MetadataRoute.Robots {
  const base = `https://${COMPANY.domain}`;
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: ["/admin/", "/pos/", "/driver/", "/ceo/", "/portal/", "/api/"] },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
