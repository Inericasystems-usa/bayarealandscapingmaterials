import Script from "next/script";
import React from "react";
import { GTM_ID } from "@/lib/google-tags";

/**
 * Google Tag Manager — the ONE and ONLY tag loader on the site.
 *
 * Production architecture:
 *
 *   Consent Mode defaults, all denied (lib/consent.ts, inline in <head>)
 *         ↓
 *   GTM (GTM-5MXCJBSJ)
 *         ↓
 *   Google tag (GT-NGWMLXJL)   ← configured INSIDE the container
 *         ↓
 *   GA4 (G-TFS1BJ34XN) + Google Ads (AW-18242325959)
 *
 * There is deliberately NO gtag.js loader and no `gtag('config', …)` anywhere in
 * this codebase. The container already loads the Google tag, and that tag fans
 * out to both destinations server-side — so a second loader here would double
 * every pageview and every conversion. See lib/google-tags.ts.
 *
 * Mounted in PageShell, so it runs on public pages only — never on the POS or
 * the customer display. If NEXT_PUBLIC_GTM_ID is unset nothing renders
 * (dev/preview). It does NOT silently fall back to loading a tag directly: two
 * ways to load a tag is how duplicate-tag bugs get shipped.
 *
 * There is no <noscript> iframe: without JavaScript there is no way to ask for
 * consent, so there are no tags either.
 */

/** The container loader. Never blocks first paint. */
export function GoogleTagManager() {
  if (!GTM_ID) return null;
  // gtag() exists only once the consent defaults are set; without them the
  // container would run unconfigured, so it does not load at all.
  // lazyOnload: the container (~0.5 MB with its Google libraries) loads after
  // the page has finished loading, off the critical path. Consent defaults and
  // any queued dataLayer events are already in place, so nothing is lost.
  return (
    <Script id="gtm-loader" strategy="lazyOnload">{`
(function(w,d,s,l,i){if(typeof w.gtag!=='function')return;
w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');
`}</Script>
  );
}
