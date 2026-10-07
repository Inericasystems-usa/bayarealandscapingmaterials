"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { cn } from "@balm/ui";
import { loadMapsLibrary, describeMapsError, isMapsConfigured } from "@/lib/maps/loader";

/** One suggestion, flattened out of Google's prediction object. */
interface Suggestion {
  placeId: string;
  primary: string;
  secondary: string;
}

interface AddressAutocompleteProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Fires with a *fetched* Place — address components and location included. */
  onPlaceSelected: (place: google.maps.places.Place) => void;
  /** Place fields to fetch on selection. */
  fields: readonly string[];
  placeholder?: string;
  hint?: string;
  required?: boolean;
  /** Restrict predictions, e.g. ["street_address"] or ["geocode"]. */
  includedPrimaryTypes?: readonly string[];
  /** Bias results toward the yard so local addresses rank first. */
  locationBias?: google.maps.places.LocationBias;
  className?: string;
}

const DEBOUNCE_MS = 250;

const inputBase =
  "block w-full rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] py-2.5 pe-9 ps-10 text-base text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)] focus-visible:outline-offset-2 transition-colors";

/**
 * Places autocomplete built on the current `AutocompleteSuggestion` API rather
 * than the legacy `places.Autocomplete` widget (deprecated for new customers).
 *
 * Doing it programmatically means the dropdown is our own markup, so it inherits
 * the site's tokens, fonts and focus ring instead of Google's blue/Roboto chrome.
 *
 * Billing: one `AutocompleteSessionToken` covers every keystroke of a session
 * plus the closing `fetchFields`, so a session bills once rather than per letter.
 * A fresh token is minted after each selection.
 *
 * Accessibility: implements the ARIA combobox pattern (listbox popup, active
 * descendant, full keyboard control).
 */
export function AddressAutocomplete({
  id,
  label,
  value,
  onValueChange,
  onPlaceSelected,
  fields,
  placeholder,
  hint,
  required,
  includedPrimaryTypes,
  locationBias,
  className,
}: AddressAutocompleteProps) {
  const listId = useId();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noResults, setNoResults] = useState(false);

  const sessionRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Guards against an older, slower response overwriting a newer one.
  const requestIdRef = useRef(0);
  const configured = isMapsConfigured();

  // Close the dropdown when the pointer goes down outside the widget.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const runSearch = useCallback(
    async (input: string) => {
      const requestId = ++requestIdRef.current;
      setBusy(true);
      setError(null);

      try {
        const places = await loadMapsLibrary<google.maps.PlacesLibrary>("places");
        if (requestId !== requestIdRef.current) return;

        sessionRef.current ??= new places.AutocompleteSessionToken();

        const request: google.maps.places.AutocompleteRequest = {
          input,
          sessionToken: sessionRef.current,
          region: "us",
          ...(includedPrimaryTypes ? { includedPrimaryTypes: [...includedPrimaryTypes] } : {}),
          ...(locationBias ? { locationBias } : {}),
        };

        const { suggestions: raw } =
          await places.AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        if (requestId !== requestIdRef.current) return;

        const mapped: Suggestion[] = [];
        for (const item of raw) {
          const prediction = item.placePrediction;
          if (!prediction) continue;
          mapped.push({
            placeId: prediction.placeId,
            primary: prediction.mainText?.text ?? prediction.text.text,
            secondary: prediction.secondaryText?.text ?? "",
          });
        }

        setSuggestions(mapped);
        setNoResults(mapped.length === 0);
        setActiveIndex(-1);
        setOpen(true);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        setSuggestions([]);
        setNoResults(false);
        setError(describeMapsError(err));
        setOpen(true);
      } finally {
        if (requestId === requestIdRef.current) setBusy(false);
      }
    },
    [includedPrimaryTypes, locationBias],
  );

  // Debounce so a typed address costs a few requests, not one per character.
  useEffect(() => {
    if (!configured) return;
    const query = value.trim();
    if (query.length < 3) {
      requestIdRef.current++;
      setSuggestions([]);
      setNoResults(false);
      setOpen(false);
      setBusy(false);
      return;
    }
    const timer = setTimeout(() => void runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [value, configured, runSearch]);

  const choose = useCallback(
    async (suggestion: Suggestion) => {
      setOpen(false);
      setBusy(true);
      // Stop the pending debounce from reopening the list behind the selection.
      requestIdRef.current++;

      try {
        const places = await loadMapsLibrary<google.maps.PlacesLibrary>("places");
        const place = new places.Place({ id: suggestion.placeId });
        await place.fetchFields({ fields: [...fields] });
        onPlaceSelected(place);
        setError(null);
      } catch (err) {
        setError(describeMapsError(err));
        setOpen(true);
      } finally {
        // fetchFields closes the billing session — the next search starts a new one.
        sessionRef.current = null;
        setBusy(false);
      }
    },
    [fields, onPlaceSelected],
  );

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (!open || suggestions.length === 0) {
      if (event.key === "ArrowDown" && suggestions.length > 0) setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === "Enter") {
      const active = activeIndex >= 0 ? suggestions[activeIndex] : undefined;
      // Only swallow Enter when it is actually picking a suggestion, so the
      // form stays submittable by keyboard the rest of the time.
      if (active) {
        event.preventDefault();
        void choose(active);
      }
    }
  }

  const showPopup = open && (suggestions.length > 0 || noResults || error !== null);

  return (
    <div className={cn("relative", className)} ref={wrapperRef}>
      <label
        htmlFor={id}
        className="mb-2 block text-sm font-medium text-[var(--color-text-primary)]"
      >
        {label}
        {required ? <span className="ms-0.5 text-[var(--color-danger)]">*</span> : null}
      </label>

      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={showPopup}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined}
          aria-describedby={hint ? `${id}-hint` : undefined}
          autoComplete="off"
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => {
            if (suggestions.length > 0) setOpen(true);
          }}
          className={inputBase}
        />
        {busy ? (
          <Loader2
            className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[var(--color-text-muted)]"
            strokeWidth={1.5}
            aria-hidden
          />
        ) : null}
      </div>

      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-[var(--color-text-muted)]">
          {hint}
        </p>
      ) : null}

      {showPopup ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Address suggestions"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] py-1 shadow-[var(--shadow-lg)]"
        >
          {error ? (
            <li className="px-3.5 py-3 text-sm text-[var(--color-text-secondary)]">
              {error} You can type the address by hand instead.
            </li>
          ) : noResults ? (
            <li className="px-3.5 py-3 text-sm text-[var(--color-text-secondary)]">
              No matching addresses. Keep typing, or enter it by hand below.
            </li>
          ) : (
            suggestions.map((s, index) => (
              <li key={s.placeId} role="none">
                <button
                  type="button"
                  id={`${listId}-option-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void choose(s)}
                  className={cn(
                    "flex w-full items-start gap-2.5 px-3.5 py-2.5 text-start transition-colors",
                    index === activeIndex
                      ? "bg-[var(--color-moss-50)]"
                      : "bg-transparent hover:bg-[var(--color-bg-surface)]",
                  )}
                >
                  <MapPin
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-text-brand)]"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-[var(--color-text-primary)]">
                      {s.primary}
                    </span>
                    {s.secondary ? (
                      <span className="block truncate text-xs text-[var(--color-text-secondary)]">
                        {s.secondary}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
