import { existsSync } from "node:fs";
import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import { COMPANY } from "./lib/company";

/**
 * A host that serves production carries /etc/inerica/production (or runs with
 * INERICA_PRODUCTION=1). `next dev` there publishes source code and server file
 * paths to every visitor and loosens the CSP, so it refuses to start.
 */
function isProductionHost(): boolean {
  return process.env.INERICA_PRODUCTION === "1" || existsSync("/etc/inerica/production");
}

/** Origin of a URL from the environment, or null when unset or malformed. */
function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Origin of a tile URL template; a leading {s} subdomain becomes a wildcard. */
function tileOrigin(template: string | undefined): string | null {
  const m = template?.match(/^(https?):\/\/([^/?#]+)/);
  return m ? `${m[1]}://${m[2]!.replace(/^\{[a-z]+\}\./i, "*.")}` : null;
}

// ── Content-Security-Policy ─────────────────────────────────────────────
// Two policies. Public pages allow the Google tag and Maps; the staff screens
// (/pos, /customer-display) allow no third-party script at all, only the API,
// the counter-PC bridge, the display socket, map tiles and the receipt QR.
// 'unsafe-inline' stays for scripts: Next's prerendered pages carry inline
// bootstrap scripts without nonces.

const CDN = "https://d2xsxph8kpxj0f.cloudfront.net";

// Builds that set NEXT_PUBLIC_API_URL (every internet-facing one) allow exactly
// that origin. Without it the browser calls port 4000 on whatever host served
// the page (lib/api-client.ts), which is how the offline LAN edition runs, and
// the policy mirrors that fallback.
const API = originOf(process.env.NEXT_PUBLIC_API_URL);
const API_SOURCES = API ? [API] : ["http://*:4000", "https://*:4000"];
// Customer-display socket: port 3001 on the API host (lib/useCustomerDisplay.ts).
const DISPLAY_HOST = API ? new URL(API).hostname : "localhost";
const DISPLAY_SOURCES = [`ws://${DISPLAY_HOST}:3001`, `wss://${DISPLAY_HOST}:3001`];
// Cash drawer, printer and card terminal bridge on the counter PC (lib/hardware.ts).
const BRIDGE = originOf(process.env.NEXT_PUBLIC_BRIDGE_URL) ?? "http://localhost:9110";
// Fleet map (app/pos/dispatch/FleetMap.tsx).
const TILES = tileOrigin(process.env.NEXT_PUBLIC_MAP_TILE_URL) ?? "https://*.tile.openstreetmap.org";

// GTM -> Google tag -> GA4 + Google Ads (lib/google-tags.ts), per Google's CSP
// guide for the tag platform. Regional google.<tld> hosts cannot be wildcarded;
// remarketing hits to them are simply dropped.
const GOOGLE_TAG = {
  script: [
    "https://www.googletagmanager.com",
    "https://www.googleadservices.com",
    "https://googleads.g.doubleclick.net",
    "https://www.google.com",
  ],
  img: [
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.g.doubleclick.net",
    "https://*.google.com",
    "https://www.googleadservices.com",
    "https://pagead2.googlesyndication.com",
  ],
  connect: [
    "https://www.googletagmanager.com",
    "https://*.google-analytics.com",
    "https://*.g.doubleclick.net",
    "https://ad.doubleclick.net",
    "https://*.google.com",
    "https://www.googleadservices.com",
    "https://pagead2.googlesyndication.com",
  ],
  frame: ["https://www.googletagmanager.com", "https://td.doubleclick.net"],
};

// Maps JavaScript API and Places (lib/maps/loader.ts) on /request-quote and
// /service-area, plus the embedded map on /contact.
const GOOGLE_MAPS = {
  script: ["https://maps.googleapis.com"],
  img: [
    "https://*.googleapis.com",
    "https://*.gstatic.com",
    "https://*.google.com",
    "https://*.ggpht.com",
    "https://*.googleusercontent.com",
  ],
  connect: ["https://*.googleapis.com", "https://*.gstatic.com", "https://*.google.com"],
  frame: ["https://www.google.com", "https://maps.google.com"],
};

type Directives = Record<string, string[]>;

function serialize(directives: Directives): string {
  return Object.entries(directives)
    .map(([name, sources]) => [name, ...new Set(sources)].join(" "))
    .join("; ");
}

const FIXED: Directives = {
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
};

const SITE_POLICY: Directives = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'", ...GOOGLE_TAG.script, ...GOOGLE_MAPS.script],
  // Maps injects its control stylesheet from fonts.googleapis.com.
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "img-src": ["'self'", "data:", "blob:", CDN, ...GOOGLE_TAG.img, ...GOOGLE_MAPS.img],
  // The home hero video streams from the CDN.
  "media-src": ["'self'", "blob:", CDN],
  "font-src": ["'self'", "data:", "https://fonts.gstatic.com"],
  "connect-src": [
    "'self'",
    ...API_SOURCES,
    ...GOOGLE_TAG.connect,
    ...GOOGLE_MAPS.connect,
    "data:",
    "blob:",
  ],
  "worker-src": ["'self'", "blob:"],
  "frame-src": ["'self'", ...GOOGLE_MAPS.frame, ...GOOGLE_TAG.frame],
  ...FIXED,
};

const STAFF_POLICY: Directives = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "'unsafe-inline'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  // The receipt window (lib/receipt.ts) inherits this policy: QR code + logo.
  "img-src": ["'self'", "data:", "blob:", CDN, TILES, "https://api.qrserver.com", ...API_SOURCES],
  "media-src": ["'self'"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", ...API_SOURCES, ...DISPLAY_SOURCES, BRIDGE],
  "worker-src": ["'self'", "blob:"],
  "frame-src": ["'self'"],
  ...FIXED,
};

/**
 * The dev server needs 'unsafe-eval' (HMR, React refresh, eval source maps)
 * and reaches the API and sockets on arbitrary local hosts. Only `next dev`
 * with NODE_ENV=development gets that; every build gets the strict policies.
 */
function csp(policy: Directives, devServer: boolean): string {
  if (!devServer) return serialize(policy);
  return serialize({
    ...policy,
    "script-src": [...policy["script-src"]!, "'unsafe-eval'", "blob:"],
    "connect-src": ["'self'", "https:", "http:", "ws:", "wss:"],
  });
}

// Staff screens are never indexed. robots.txt stays free of private paths;
// the header does the job instead.
const STAFF_PATHS = ["/pos", "/pos/:path*", "/customer-display", "/customer-display/:path*"];
const NOINDEX = { key: "X-Robots-Tag", value: "noindex, nofollow" };

function buildConfig(devServer: boolean): NextConfig {
  return {
    reactStrictMode: true,
    poweredByHeader: false,
    // Never publish source maps of the client bundle.
    productionBrowserSourceMaps: false,
    // Self-contained server bundle for Docker. Gated to the Docker build (Linux) —
    // standalone tracing uses symlinks that Windows dev boxes often can't create.
    output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
    // Workspace packages compile through Next
    transpilePackages: ["@balm/ui", "@balm/lib-domain", "@balm/shared-types"],

    // Typed <Link> hrefs (moved out of `experimental` in Next 15).
    typedRoutes: true,

    images: {
      formats: ["image/avif", "image/webp"],
      // Only BALM's own media on the CDN. Photos uploaded through the POS are
      // same-origin (/api/v1/uploads/:id, rewritten to the API below).
      remotePatterns: [{ protocol: "https", hostname: "d2xsxph8kpxj0f.cloudfront.net", pathname: "/310519663521319543/**" }],
    },

    async redirects() {
      return [
        // /terms is the short URL carriers and SMS disclosures reference; the page
        // itself lives at /terms-of-service. Permanent so the canonical stays single.
        { source: "/terms", destination: "/terms-of-service", permanent: true },
        // One canonical host (lib/company.ts). On www the API is cross-origin and
        // its CORS list does not include www, so forms there cannot submit.
        {
          source: "/:path((?!\\.well-known/).*)",
          has: [{ type: "host", value: `www\\.${COMPANY.domain.replace(/\./g, "\\.")}` }],
          destination: `https://${COMPANY.domain}/:path`,
          permanent: true,
        },
      ];
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
            { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
            {
              key: "Permissions-Policy",
              value: "camera=(), microphone=(), geolocation=(self)",
            },
          ],
        },
        {
          source: "/((?!pos(?:/|$)|customer-display(?:/|$)).*)",
          headers: [{ key: "Content-Security-Policy", value: csp(SITE_POLICY, devServer) }],
        },
        ...STAFF_PATHS.map((source) => ({
          source,
          headers: [{ key: "Content-Security-Policy", value: csp(STAFF_POLICY, devServer) }, NOINDEX],
        })),
        ...["/download", "/api/:path*"].map((source) => ({ source, headers: [NOINDEX] })),
      ];
    },
  };
}

export default function nextConfig(phase: string): NextConfig {
  const devServer = phase === PHASE_DEVELOPMENT_SERVER;
  if (devServer && isProductionHost()) {
    throw new Error(
      "Refusing to start `next dev`: this host is marked as production " +
        "(/etc/inerica/production or INERICA_PRODUCTION=1). The development server " +
        "publishes source code and file paths. Build and run the production server " +
        "instead: `pnpm --filter @balm/web build`, then `next start` (systemctl restart balm-web).",
    );
  }
  return buildConfig(devServer && process.env.NODE_ENV === "development");
}
