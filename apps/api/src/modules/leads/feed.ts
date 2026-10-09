import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Credentials for the scheduled Google Ads upload (GET
 * /api/v1/leads/offline-conversions/feed.csv, HTTP Basic). Google Ads'
 * "Schedule uploads → HTTPS" fetches that file with a username and password;
 * deploy/DEPLOY.md, "Offline conversions", has the setup.
 *
 * Off unless both are set in api.env, and off when the password is shorter
 * than MIN_FEED_PASSWORD (a placeholder, or something guessable): the file is
 * real revenue per ad click.
 */
export const MIN_FEED_PASSWORD = 32;

export interface FeedCredentials {
  user: string;
  password: string;
}

export function feedCredentials(env: NodeJS.ProcessEnv = process.env): FeedCredentials | null {
  const user = env.OFFLINE_CONVERSIONS_FEED_USER?.trim() ?? "";
  const password = env.OFFLINE_CONVERSIONS_FEED_PASSWORD?.trim() ?? "";
  if (!user || password.length < MIN_FEED_PASSWORD) return null;
  return { user, password };
}

// Hash both sides first so the comparison takes the same time whatever the
// lengths, and compare user and password together so neither leaks on its own.
const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Whether an Authorization header carries exactly these credentials. */
export function basicAuthMatches(header: string | undefined, expected: FeedCredentials): boolean {
  const m = /^Basic ([A-Za-z0-9+/=]+)$/.exec(header?.trim() ?? "");
  const decoded = m ? Buffer.from(m[1]!, "base64").toString("utf8") : "";
  const sep = decoded.indexOf(":");
  const user = sep >= 0 ? decoded.slice(0, sep) : "";
  const password = sep >= 0 ? decoded.slice(sep + 1) : "";
  const given = Buffer.concat([digest(user), digest(password)]);
  const want = Buffer.concat([digest(expected.user), digest(expected.password)]);
  return timingSafeEqual(given, want) && sep >= 0;
}

/**
 * The first day the feed covers, as YYYY-MM-DD: Google Ads accepts a
 * conversion only within 90 days of its click, so older rows would only be
 * rejected on every fetch.
 */
export const FEED_WINDOW_DAYS = 90;

export function feedFrom(now: Date = new Date()): string {
  return new Date(now.getTime() - FEED_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
