"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker in production. In development it does the
 * opposite — tears down any SW + caches left over from a prior `next start`
 * (production) run. A stale SW serving cached bundles is the classic cause of a
 * blank site / dead POS after switching from a production build back to dev, so
 * dev now self-heals on the next load instead of needing a manual unregister.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
      return;
    }
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => void r.unregister()))
      .catch(() => {});
    if (typeof caches !== "undefined") {
      caches
        .keys()
        .then((keys) => keys.forEach((k) => void caches.delete(k)))
        .catch(() => {});
    }
  }, []);
  return null;
}
