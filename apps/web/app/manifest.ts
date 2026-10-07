import type { MetadataRoute } from "next";

/**
 * Web App Manifest — makes the POS installable as a standalone desktop/tablet
 * app (Edge/Chrome "Install app"). The Electron wrapper (apps/desktop) produces
 * a native .exe for environments that need one.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Inerica POS",
    short_name: "Inerica POS",
    description: "Inerica POS — point of sale, dispatch, inventory, and operations.",
    start_url: "/pos",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#101010",
    theme_color: "#1B4332",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["business", "productivity"],
  };
}
