import { ArrowUpRight, Star } from "lucide-react";

/**
 * Real Google reviews for the home page's trust band, read server-side from the
 * Places API (New) with GOOGLE_MAPS_SERVER_KEY and the yard's GOOGLE_PLACE_ID,
 * refreshed once a day. Reviews are shown as Google returns them (its "most
 * relevant" order, never filtered by rating), with the author's name and
 * Google's attribution, as the Maps Platform terms require.
 *
 * Without the key or place id, or if Google does not answer, it renders
 * nothing and the band keeps its plain "Read our reviews" link.
 */

interface PlaceReview {
  rating?: number;
  text?: { text?: string };
  originalText?: { text?: string };
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string; uri?: string };
}

interface PlaceDetails {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: PlaceReview[];
}

const MAX_REVIEWS = 3;
const MAX_CHARS = 320;

async function fetchPlace(): Promise<PlaceDetails | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;
  if (!key || !placeId || !/^[\w-]{10,}$/.test(placeId)) return null;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
      headers: {
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "rating,userRatingCount,googleMapsUri,reviews",
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as PlaceDetails;
  } catch {
    return null;
  }
}

function excerpt(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= MAX_CHARS ? t : `${t.slice(0, MAX_CHARS).replace(/\s+\S*$/, "")}…`;
}

function Stars({ value }: { value: number }) {
  const full = Math.round(value);
  return (
    <span className="flex items-center gap-0.5" role="img" aria-label={`${value} out of 5 stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < full ? "fill-[#b7791f] text-[#b7791f]" : "text-[var(--color-stone-300)]"}`}
          strokeWidth={1.5}
          aria-hidden
        />
      ))}
    </span>
  );
}

export async function GoogleReviews() {
  const place = await fetchPlace();
  const reviews = (place?.reviews ?? [])
    .map((r) => ({
      rating: r.rating ?? 0,
      text: r.text?.text ?? r.originalText?.text ?? "",
      when: r.relativePublishTimeDescription ?? "",
      author: r.authorAttribution?.displayName ?? "Google user",
      authorUri: r.authorAttribution?.uri,
    }))
    .filter((r) => r.text)
    .slice(0, MAX_REVIEWS);
  if (!place || reviews.length === 0) return null;

  return (
    <div className="mt-10 text-left">
      {place.rating && place.userRatingCount ? (
        <p className="mb-6 flex flex-wrap items-center justify-center gap-2 text-center text-sm text-[var(--color-text-secondary)]">
          <Stars value={place.rating} />
          <span>
            <strong className="text-[var(--color-text-primary)]">{place.rating.toFixed(1)}</strong> from{" "}
            {place.userRatingCount.toLocaleString("en-US")} Google reviews
          </span>
        </p>
      ) : null}
      <ul className="grid gap-4 md:grid-cols-3">
        {reviews.map((r, i) => (
          <li
            key={i}
            className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)]"
          >
            <Stars value={r.rating} />
            <blockquote className="flex-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
              “{excerpt(r.text)}”
            </blockquote>
            <footer className="text-xs text-[var(--color-text-muted)]">
              {r.authorUri ? (
                <a href={r.authorUri} target="_blank" rel="noopener noreferrer nofollow" className="font-semibold text-[var(--color-text-primary)] hover:underline">
                  {r.author}
                </a>
              ) : (
                <span className="font-semibold text-[var(--color-text-primary)]">{r.author}</span>
              )}
              {r.when ? ` · ${r.when}` : ""} · on Google
            </footer>
          </li>
        ))}
      </ul>
      {place.googleMapsUri ? (
        <p className="mt-4 text-center text-xs text-[var(--color-text-muted)]">
          Reviews from Google.{" "}
          <a href={place.googleMapsUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
            See all on Google Maps <ArrowUpRight className="h-3 w-3" aria-hidden />
          </a>
        </p>
      ) : null}
    </div>
  );
}
