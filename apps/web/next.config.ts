import type { NextConfig } from "next";

// Content-Security-Policy. Strict on the dangerous directives (script/object/
// frame) to blunt XSS + clickjacking; lenient on connect-src so the POS can reach
// the cross-origin API, the :3001 customer-display socket, and the local bridge.
//
// IMPORTANT: Next.js dev mode (HMR, React refresh, eval'd source maps) requires
// 'unsafe-eval' — without it ALL client JS is blocked and client-rendered pages
// (the whole POS) render blank. We add it in development only; production builds
// don't use eval, so prod stays strict.
const isDev = process.env.NODE_ENV !== "production";
const CSP = [
  "default-src 'self'",
  // maps.googleapis.com: the Maps JS API bootstrap + the library chunks it
  // pulls in (places, marker). Without it the address selector and the store
  // locator are blocked outright.
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval' blob:" : ""} https://www.googletagmanager.com https://www.google-analytics.com https://www.googleadservices.com https://googleads.g.doubleclick.net https://www.google.com https://maps.googleapis.com`,
  // Maps injects its control stylesheet from fonts.googleapis.com.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  // Hero/product media is served from the CloudFront CDN; without media-src it
  // falls back to default-src 'self' and the hero video is blocked.
  "media-src 'self' https: data: blob:",
  // Google Maps pulls Roboto for its own map labels/controls from gstatic.
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https: http: ws: wss:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  // The contact page embeds a Google Maps iframe; googletagmanager.com is the
  // GTM <noscript> fallback. Without frame-src it falls back to default-src
  // 'self' and the browser blocks them ("This content is blocked").
  "frame-src 'self' https://www.google.com https://maps.google.com https://www.googletagmanager.com",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained server bundle for Docker. Gated to the Docker build (Linux) —
  // standalone tracing uses symlinks that Windows dev boxes often can't create.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Workspace packages compile through Next
  transpilePackages: ["@balm/ui", "@balm/lib-domain", "@balm/shared-types"],

  // Typed <Link> hrefs (moved out of `experimental` in Next 15).
  typedRoutes: true,

  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      // Until we move uploads to R2:
      { protocol: "https", hostname: "**.cloudfront.net" },
      { protocol: "https", hostname: "**.r2.cloudflarestorage.com" },
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },

  // /terms is the short URL carriers and SMS disclosures reference; the page
  // itself lives at /terms-of-service. Permanent so the canonical stays single.
  async redirects() {
    return [{ source: "/terms", destination: "/terms-of-service", permanent: true }];
  },

  // Serve uploaded product images from the same origin as the site so they work
  // with next/image and from any device — the Next server proxies to the API.
  async rewrites() {
    const api = process.env.API_INTERNAL_URL ?? "http://localhost:4000";
    return [{ source: "/api/v1/uploads/:id", destination: `${api}/api/v1/uploads/:id` }];
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: CSP },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
        ],
      },
    ];
  },
};

export default config;
