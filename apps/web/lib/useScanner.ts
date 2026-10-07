import { useEffect, useRef } from "react";

/**
 * Detects a hardware barcode/QR scanner: scanners emit a burst of very fast
 * keystrokes terminated by Enter, whereas a human types slowly. We buffer keys,
 * resetting the buffer on any gap longer than `GAP_MS`, and on Enter treat the
 * buffer as a scan only if it's long enough and was entered fast enough. Manual
 * typing (and a manual Enter in a search box) therefore never triggers a scan.
 *
 * Runs at the window level so it works no matter what's focused. It does not
 * swallow the individual characters (harmless if they land in a search box), but
 * it does preventDefault the terminating Enter of a detected scan.
 */
const GAP_MS = 50; // max time between two keystrokes within one scan
const MIN_LEN = 4; // ignore very short bursts
const PER_CHAR_MS = 40; // a scan averages under this per character

export function useScanner(onScan: (code: string) => void, enabled = true): void {
  const buf = useRef("");
  const start = useRef(0);
  const last = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent): void => {
      const now = e.timeStamp;
      if (now - last.current > GAP_MS) {
        buf.current = "";
        start.current = now;
      }
      last.current = now;

      if (e.key === "Enter") {
        const code = buf.current;
        buf.current = "";
        const elapsed = now - start.current;
        if (code.length >= MIN_LEN && elapsed <= code.length * PER_CHAR_MS + GAP_MS) {
          // Consume the terminating Enter so other handlers (e.g. Enter-to-charge)
          // don't also fire on a scan.
          e.preventDefault();
          e.stopPropagation();
          onScan(code);
        }
        return;
      }
      if (e.key.length === 1) buf.current += e.key; // printable characters only
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onScan, enabled]);
}
