/**
 * A one-shot "the visitor has seen this" flag in localStorage.
 *
 * For per-device UI state only — never for tracking or advertising. It stores a
 * single literal "1" under a fixed key; nothing about the visitor is recorded,
 * and it is never read by analytics.
 *
 * Every access is guarded: localStorage THROWS (not returns null) in Safari
 * private mode, when site data is blocked, and inside some embedded webviews.
 * A notice failing to display is acceptable; a page crashing over it is not —
 * so a failed read reports "not seen" and a failed write is swallowed.
 */

export function hasSeen(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    // Storage unavailable — treat as unseen. The notice shows for the session
    // but can still be dismissed, which is the safe failure direction.
    return false;
  }
}

export function markSeen(key: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Nothing to do: the dismissal still works for this page view.
  }
}
