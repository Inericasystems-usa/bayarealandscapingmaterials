"use client";

import React from "react";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

/** Last-resort boundary that replaces the root layout if it throws. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    // To the API, which passes it to Sentry when SENTRY_DSN is set.
    reportClientError(error, "global");
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: "1.5rem", maxWidth: 420 }}>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>Something went wrong</h1>
          <p style={{ marginTop: 8, color: "#555" }}>The application hit an unexpected error.</p>
          <button
            onClick={reset}
            style={{ marginTop: 20, padding: "0.5rem 1rem", borderRadius: 8, border: 0, background: "#2f6f4f", color: "#fff", fontWeight: 600, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
