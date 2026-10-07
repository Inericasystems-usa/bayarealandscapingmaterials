import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal accessibility: Esc closes, Tab is trapped inside the dialog, and focus
 * is restored to the trigger on close. On open it focuses the first control —
 * unless an element inside is already focused (e.g. an autoFocus input), which
 * it leaves alone. Pass the modal's content element ref + its open state.
 */
export function useModalDismiss(open: boolean, onClose: () => void, ref: RefObject<HTMLElement | null>): void {
  // Hold onClose in a ref so an inline callback doesn't re-run the effect every
  // render (which would repeatedly restore focus and fight the user).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const node = ref.current;
    const restoreTo = document.activeElement as HTMLElement | null;
    const focusables = (): HTMLElement[] => (node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);

    if (!node?.contains(document.activeElement)) focusables()[0]?.focus();

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab" && node) {
        const f = focusables();
        if (f.length === 0) return;
        const first = f[0]!;
        const last = f[f.length - 1]!;
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !node.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !node.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      restoreTo?.focus?.();
    };
  }, [open, ref]);
}
