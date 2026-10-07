// Minimal service worker — presence + a fetch handler makes the POS installable
// as a standalone app. Network passthrough; no aggressive caching (avoids stale
// bundles). A richer offline cache can be layered in later.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  /* default network handling */
});
