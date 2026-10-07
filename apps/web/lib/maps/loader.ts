/**
 * The one and only Google Maps JS API loader for this app.
 *
 * Both features (address selector + store locator) go through `loadMapsLibrary`,
 * so the API bootstrap script is injected at most once per page no matter how
 * many map components mount. Concurrent callers share a single in-flight promise.
 *
 * Uses Google's dynamic-library import bootstrap: nothing is downloaded until a
 * component actually asks for a library, and each library ("maps", "places",
 * "marker") is fetched on demand and cached by the API itself.
 *
 * Browser-only. Every entry point throws on the server rather than touching
 * `document`, so an accidental server import fails loudly instead of breaking
 * the build or hydration.
 */

export const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";

/** Vector maps need a Map ID; Google's public demo ID works without cloud setup. */
export const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID";

/** Distinguishes "no key configured" from "key rejected" for the UI. */
export class MapsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapsConfigError";
  }
}

export function isMapsConfigured(): boolean {
  return MAPS_API_KEY.length > 0;
}

const SCRIPT_ID = "google-maps-bootstrap";

/**
 * Has the API finished initialising? The bundled types declare
 * `importLibrary` as always defined, so probe it with `typeof` rather than a
 * truthiness check (which TS rejects as always-true).
 */
function mapsApiReady(): boolean {
  return typeof window.google?.maps?.importLibrary === "function";
}

let bootstrapPromise: Promise<void> | null = null;

/**
 * Inject the bootstrap loader once. Resolves when `google.maps.importLibrary`
 * exists; rejects if the script fails to download (offline, blocked, bad host).
 */
function bootstrap(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new MapsConfigError("Google Maps can only load in the browser."));
  }
  if (!MAPS_API_KEY) {
    return Promise.reject(
      new MapsConfigError(
        "NEXT_PUBLIC_GOOGLE_MAPS_KEY is not set — Google Maps features are disabled.",
      ),
    );
  }
  if (mapsApiReady()) return Promise.resolve();
  if (bootstrapPromise) return bootstrapPromise;

  bootstrapPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;

    const onLoad = () => {
      if (mapsApiReady()) resolve();
      else reject(new Error("Google Maps loaded but exposed no importLibrary()."));
    };
    const onError = () => {
      // Let a later attempt retry (e.g. the visitor regained connectivity).
      bootstrapPromise = null;
      document.getElementById(SCRIPT_ID)?.remove();
      reject(new Error("Could not reach Google Maps. Check the network or the API key."));
    };

    if (existing) {
      existing.addEventListener("load", onLoad, { once: true });
      existing.addEventListener("error", onError, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src =
      "https://maps.googleapis.com/maps/api/js" +
      `?key=${encodeURIComponent(MAPS_API_KEY)}` +
      "&v=weekly" +
      "&loading=async" +
      "&libraries=places,marker" +
      "&callback=__balmMapsReady";
    script.addEventListener("error", onError, { once: true });

    // `callback` fires only once the API is fully initialised; the load event
    // alone can be too early for importLibrary to exist.
    (window as unknown as Record<string, unknown>).__balmMapsReady = onLoad;

    document.head.appendChild(script);
  });

  return bootstrapPromise;
}

/** Per-library cache so two components asking for "places" import it once. */
const libraryCache = new Map<string, Promise<unknown>>();

/**
 * Load one Google Maps library, e.g.
 *   const { Map } = await loadMapsLibrary<google.maps.MapsLibrary>("maps");
 */
export async function loadMapsLibrary<T>(name: string): Promise<T> {
  await bootstrap();
  let cached = libraryCache.get(name);
  if (!cached) {
    cached = window.google.maps.importLibrary(name);
    libraryCache.set(name, cached);
    // A failed import must not poison the cache for later retries.
    cached.catch(() => libraryCache.delete(name));
  }
  return cached as Promise<T>;
}

/** Human-readable reason a map could not load, for the fallback UI. */
export function describeMapsError(err: unknown): string {
  if (err instanceof MapsConfigError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return "Google Maps is unavailable right now.";
}
