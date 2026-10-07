import { COMPANY } from "@/lib/company";

/**
 * The SMS / A2P 10DLC programme disclosures — ONE source, rendered by both the
 * Terms of Service page and the site-wide SMS terms modal.
 *
 * COMPLIANCE CONTRACT — read before editing:
 *   1. This is legally supplied wording. Do not paraphrase, shorten or "improve"
 *      it. A carrier audit compares what a visitor was shown against what was
 *      filed; the two must match exactly.
 *   2. `PROGRAM_TERMS` is the wording that has been on /terms-of-service. It is
 *      reproduced here verbatim so moving it into this module changed nothing
 *      a visitor reads.
 *   3. Nothing here opts anyone in. The only SMS opt-in on this site is the
 *      unchecked checkbox on the quote/contact forms
 *      (components/forms/SmsConsentCheckbox), whose exact text lives separately
 *      in @balm/shared-types because the API stores it on each consent record.
 */

/** Inline emphasis without embedding JSX in the content data. */
export type TermPart =
  | string
  | { strong: string }
  | { link: { href: string; label: string } };

export interface TermBullet {
  id: string;
  /** Bolded lead-in, e.g. "Opt out:". */
  lead?: string;
  parts: TermPart[];
}

/** The heading both surfaces use. */
export const SMS_TERMS_HEADING = "SMS Terms & Conditions";

/**
 * Opening disclosure shown in the modal.
 *
 * NOTE: the Terms page keeps its own, longer opening sentence (which also names
 * marketing messages). Both are business-supplied; see the discrepancy flagged
 * in the implementation notes.
 */
export const SMS_TERMS_INTRO =
  `By providing your mobile number to ${COMPANY.legalName}, you consent to receive ` +
  `text messages from us at that number. Consent is not a condition of purchase.`;

export const SMS_MESSAGE_TYPES_HEADING = "Types of messages you may receive";

export const SMS_MESSAGE_TYPES: readonly string[] = [
  "Quote and estimate responses",
  "Order confirmations and material availability updates",
  "Delivery scheduling, driver ETA, and delivery-complete notifications",
  "Invoice, payment, and account notifications",
  "Customer service replies to your inquiries",
];

export const SMS_FREQUENCY_HEADING = "Message frequency";

export const SMS_FREQUENCY =
  "Message frequency may vary based on your order activity and interactions with us.";

/**
 * The programme terms as published on /terms-of-service — verbatim.
 *
 * `frequency` is tagged so the modal can skip it: the modal already states
 * frequency in its own dedicated section above, and saying it twice in one
 * dialog reads as sloppy. The Terms page renders all of them.
 */
export const PROGRAM_TERMS: readonly TermBullet[] = [
  {
    id: "program",
    lead: "Program:",
    parts: [" order, delivery, and account notifications, plus promotions where you opted in."],
  },
  {
    id: "frequency",
    lead: "Message frequency",
    parts: [" varies based on your orders and activity."],
  },
  {
    id: "rates",
    lead: "Message and data rates may apply",
    parts: [" per your mobile carrier plan."],
  },
  {
    id: "stop",
    lead: "Opt out:",
    parts: [" reply ", { strong: "STOP" }, " to any message to unsubscribe. You will receive a confirmation."],
  },
  {
    id: "help",
    lead: "Help:",
    parts: [` reply `, { strong: "HELP" }, `, or contact us at ${COMPANY.phone} or ${COMPANY.email}.`],
  },
  {
    id: "carriers",
    parts: ["Carriers are not liable for delayed or undelivered messages."],
  },
  {
    id: "privacy",
    parts: [
      "Your consent and the handling of your information are described in our ",
      { link: { href: "/privacy-policy", label: "Privacy Policy" } },
      ". We do not share mobile opt-in data with third parties for their marketing.",
    ],
  },
];

/** Programme terms minus the ones the modal states in its own sections. */
export const MODAL_PROGRAM_TERMS = PROGRAM_TERMS.filter((b) => b.id !== "frequency");
