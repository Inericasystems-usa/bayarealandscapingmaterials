"use client";

import { useEffect } from "react";

/** POS-segment error boundary — a render crash here won't white-screen the till. */
export default function PosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-sm">
        <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)]">This screen hit an error</h2>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          Your session is fine. Retry this screen, or use the menu to switch screens.
        </p>
        <button
          onClick={reset}
          className="mt-5 rounded-[var(--radius-md)] bg-[var(--color-action)] px-4 py-2 text-sm font-semibold text-[var(--color-action-fg)] hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
