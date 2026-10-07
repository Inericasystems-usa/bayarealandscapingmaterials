import Script from "next/script";
import React from "react";
import { GTM_ID } from "@/lib/google-tags";

/**
 * Google Tag Manager — the ONE and ONLY tag loader on the site.
 *
 * Production architecture:
 *
 *   Consent Mode defaults
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
 * If NEXT_PUBLIC_GTM_ID is unset nothing renders (dev/preview). It does NOT
 * silently fall back to loading a tag directly: two ways to load a tag is how
 * duplicate-tag bugs get shipped.
 */

/** Consent Mode v2 defaults. MUST execute before the container loads. */
export function ConsentDefaults() {
  return (
    // The lint rule below targets the Pages Router; in the App Router the root
    // layout is exactly where a beforeInteractive script belongs, and consent
    // defaults MUST be dataLayer[0] — ahead of GTM.
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script id="consent-default" strategy="beforeInteractive">{`
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    ad_storage: 'granted',
    ad_user_data: 'granted',
    ad_personalization: 'granted',
    analytics_storage: 'granted',
    functionality_storage: 'granted',
    security_storage: 'granted',
    wait_for_update: 500
  });
  gtag('set', 'url_passthrough', true);
  gtag('set', 'ads_data_redaction', false);
`}</Script>
  );
}

/** The container loader. Place in <body>; never blocks first paint. */
export function GoogleTagManager() {
  if (!GTM_ID) return null;
  return (
    <Script id="gtm-loader" strategy="afterInteractive">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');
`}</Script>
  );
}

/** The <noscript> fallback. Must be the FIRST child of <body>. */
export function GoogleTagManagerNoScript() {
  if (!GTM_ID) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="Google Tag Manager"
      />
    </noscript>
  );
}
