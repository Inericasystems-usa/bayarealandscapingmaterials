"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import Link from "next/link";
import React from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // To the API, which passes it to Sentry when SENTRY_DSN is set.
    reportClientError(error, "page");
  }, [error]);

  return (
    <div className="grid min-h-[60vh] place-items-center px-6 text-center">
      <div className="max-w-md">
        <h1 className="font-display text-2xl font-bold text-[var(--color-text-primary)]">Something went wrong</h1>
        <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
          An unexpected error occurred. You can retry, or reload the page.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-[var(--radius-md)] bg-[var(--color-action)] px-4 py-2 text-sm font-semibold text-[var(--color-action-fg)] hover:opacity-90"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-surface)]"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
