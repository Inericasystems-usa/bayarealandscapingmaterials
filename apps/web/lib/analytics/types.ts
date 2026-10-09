/**
 * The dataLayer contract — every event the site is allowed to emit, as a
 * discriminated union.
 *
 * Adding a field here without adding it in GTM means it silently goes nowhere;
 * renaming one breaks a live trigger. Treat this file as the interface between
 * the app and the GTM container (GTM-5MXCJBSJ).
 */

/** Where a phone link sits. Mirrors the GTM `location` dimension exactly. */
export type CallLocation =
  | "header"
  | "footer"
  | "sticky_bar"
  | "material_page"
  | "contact_page"
  | "unknown";

/**
 * Google Enhanced Conversions identity block.
 *
 * NORMALIZED BUT UNHASHED — the Google tag SHA-256s these before anything
 * leaves the browser. Hashing here would double-hash and match nothing.
 * Absent fields are omitted entirely (see `compact`), never sent empty.
 */
export interface UserData {
  email_address?: string;
  phone_number?: string;
  address?: {
    first_name?: string;
    last_name?: string;
    street?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country: "US";
  };
}

export type AnalyticsEvent =
  | {
      event: "quote_form_submitted";
      /** Server-assigned lead id. Its presence is the proof of a real lead. */
      lead_id: string;
      material: string;
      quantity?: string | null;
      city?: string | null;
      form_location: string;
      user_data: UserData;
    }
  | {
      event: "contact_form_submitted";
      lead_id: string;
      user_data: UserData;
      /** Google Ads conversion label, present only when one is configured. */
      ads_conversion_label?: string;
    }
  | {
      event: "phone_click";
      phone_number: string;
      location: CallLocation;
      page_path: string;
    }
  | {
      event: "email_click";
      location: CallLocation;
      page_path: string;
    }
  | {
      event: "directions_click";
      location: string;
      page_path: string;
    }
  | {
      event: "calculator_completed";
      material: string;
      quantity: number;
    }
  | {
      event: "quote_form_started";
      form_location: string;
    }
  | {
      event: "price_list_view";
      page_path: string;
      item_count: number;
    }
  | {
      event: "material_page_view";
      material: string;
      slug: string;
      page_path: string;
    };

export type AnalyticsEventName = AnalyticsEvent["event"];
