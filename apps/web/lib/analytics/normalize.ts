/**
 * Identity normalization for Google conversion matching.
 *
 * `normalizeEmail`, `toE164` and `normalizeName` live in @balm/lib-domain so the
 * website and the API normalize a value IDENTICALLY — the server hashes the same
 * string the Google tag hashes, or the digests never line up. Re-exported here
 * so analytics code keeps a local import.
 */
export { normalizeEmail, toE164, normalizeName, splitName } from "@balm/lib-domain";

import { normalizeEmail, toE164, splitName } from "@balm/lib-domain";
import type { UserData } from "./types";

/**
 * Strip `undefined`, `null` and empty strings, recursively.
 *
 * Google matches on hashes, so an empty field is worse than an absent one: it
 * hashes to a real digest that matches nothing and drags the match rate down.
 * A nested object left with no keys is dropped too.
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "object" && !Array.isArray(value)) {
      const inner = compact(value as Record<string, unknown>);
      if (Object.keys(inner).length > 0) out[key] = inner;
      continue;
    }
    out[key] = value;
  }
  return out as Partial<T>;
}

export interface UserDataInput {
  name?: string | undefined;
  email?: string | undefined;
  phone?: string | undefined;
  street?: string | undefined;
  city?: string | undefined;
  region?: string | undefined;
  postalCode?: string | undefined;
}

/**
 * Build `user_data` from raw form values. Never logs, never persists, never
 * ends up in a URL — it goes straight onto the dataLayer and nowhere else.
 */
export function buildUserData(input: UserDataInput): UserData {
  const { firstName, lastName } = splitName(input.name);

  const address = compact({
    first_name: firstName,
    last_name: lastName,
    // Street keeps its digits (house numbers matter) — lowercase + trim only.
    street: input.street?.trim().toLowerCase(),
    city: input.city?.trim().toLowerCase(),
    region: input.region?.trim().toLowerCase(),
    postal_code: input.postalCode?.trim(),
  });

  return compact({
    email_address: normalizeEmail(input.email),
    phone_number: toE164(input.phone),
    // `country` is required whenever an address block is sent at all, so only
    // attach one once there is something to put in it.
    ...(Object.keys(address).length > 0
      ? { address: { ...address, country: "US" as const } }
      : {}),
  }) as UserData;
}
