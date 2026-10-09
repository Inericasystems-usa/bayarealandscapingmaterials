/**
 * The Google measurement account — the single source of truth for every ID.
 *
 * These are not secrets (all of them ship in the page source), and they are not
 * environment-specific, so they live in code rather than env: there is exactly
 * one BALM Google account, and a typo in an env file would silently send the
 * site's conversions nowhere.
 *
 * HOW THE FAN-OUT WORKS — read before adding anything here
 * --------------------------------------------------------
 * `tagId` (GT-NGWMLXJL) is the ONE tag, and it is loaded BY THE GTM CONTAINER —
 * never by this codebase. Google fans it out server-side to both destinations
 * below. That is why there must NEVER be:
 *   • a separate gtag('config', 'G-TFS1BJ34XN')   → duplicate GA4 pageviews
 *   • a separate gtag('config', 'AW-18242325959') → duplicate Ads conversions
 *   • a Conversion Linker tag in GTM              → the Google tag does this
 * Every ID below is recorded here as the authoritative reference for whoever
 * configures the GTM container and the Google Ads conversion actions. With GTM
 * live, the container is what consumes them: this app's job is to push clean,
 * typed events onto the dataLayer and nothing else. No component anywhere calls
 * gtag() directly.
 */
/**
 * Label of the "Contact form lead" conversion action, from the owner's Google
 * Ads account (Goals → Conversions → the action → Tag setup → "Use Google Tag
 * Manager"). Read from NEXT_PUBLIC_ADS_CONTACT_LABEL because the action does
 * not exist yet: the owner creates it, sets the value in web.env and deploys,
 * with no code change (deploy/DEPLOY.md, "Google Ads"). Unset or malformed →
 * null, and the contact event simply carries no label.
 */
const rawContactLabel = (process.env.NEXT_PUBLIC_ADS_CONTACT_LABEL ?? "").trim();
const contactLabel = /^[A-Za-z0-9_-]{6,64}$/.test(rawContactLabel) ? rawContactLabel : null;

export const GOOGLE = {
  /** The single Google tag. Loaded by the GTM container — never by this app. */
  tagId: "GT-NGWMLXJL",

  /** GA4 destination. Fed BY the tag above; never configured on its own. */
  ga4MeasurementId: "G-TFS1BJ34XN",
  /** GA4 web stream, for Admin → Data Streams. Reference only, no runtime use. */
  ga4StreamId: "15381239603",

  /** Google Ads destination. `send_to` = `${adsConversionId}/${label}` in GTM. */
  adsConversionId: "AW-18242325959",

  /**
   * Conversion action labels from each action's tag setup in Google Ads.
   * Consumed by the GTM tags that listen for our dataLayer events — recorded
   * here so the mapping between an event and its Ads action is discoverable
   * from the codebase rather than only from the GTM UI.
   */
  conversionLabels: {
    quoteFormLead: "wqpMCO6BquEcEMebz_pD",
    phoneClick: "WcBoCJijtPQcEMebz_pD",
    /**
     * Null until NEXT_PUBLIC_ADS_CONTACT_LABEL is set (above). When set, the
     * contact_form_submitted event carries it as `ads_conversion_label`, for a
     * GTM Google Ads conversion tag to read.
     */
    contactFormLead: contactLabel,
  },

  /** GTM account/container this site is measured by. */
  container: {
    account: "Tyagi Group",
    name: "bayarealandscapingmaterials.com",
    timezone: "America/Los_Angeles",
  },
} as const;

/**
 * GTM container ID (GTM-5MXCJBSJ in production).
 *
 * Read from the environment so preview/dev builds can stay untagged — it is the
 * ONLY Google ID that varies. Inlined at build time like every NEXT_PUBLIC_*
 * var, so it must be set BEFORE `next build`, not just at runtime.
 *
 * Unset → no tag renders at all. There is no direct-gtag fallback on purpose:
 * a second way to load a tag is how duplicate-tag bugs ship. A value that is not
 * a container ID is treated as unset: it is written into an inline script.
 */
const rawGtmId = process.env.NEXT_PUBLIC_GTM_ID ?? "";
export const GTM_ID = /^GTM-[A-Z0-9]+$/.test(rawGtmId) ? rawGtmId : "";

/**
 * The only Google Ads account this site reports to. The review on 7 Oct 2026
 * saw a second one, AW-18488088344, firing on the live site; it is in no file
 * here, so it comes from a tag inside the GTM container (deploy/DEPLOY.md,
 * "Google Ads", has what to check there). lib/google-tags.test.ts fails if any
 * other AW- id is ever written into the code.
 */
export const ALLOWED_ADS_IDS: readonly string[] = [GOOGLE.adsConversionId];

/** Whether a Google Ads `send_to` (AW-<id> or AW-<id>/<label>) names our account. */
export function isAllowedAdsTarget(sendTo: string): boolean {
  return ALLOWED_ADS_IDS.includes(sendTo.split("/")[0] ?? "");
}
