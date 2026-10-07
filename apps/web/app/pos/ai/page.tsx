"use client";

import { useEffect, useState } from "react";
import { Sparkles, UserCheck, Clock3 } from "lucide-react";
import { api } from "@/lib/api-client";

interface AiStatus {
  phase: number;
  managedBy: string;
  humanInLoop: boolean;
  enabled: boolean;
  capabilities: { key: string; title: string; desc: string }[];
}

export default function AiPage() {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .aiStatus()
      .then(setStatus)
      .catch(() => setError(true));
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-5 py-4">
        <div>
          <h1 className="font-display text-xl font-bold text-[var(--color-text-primary)]">AI Assist</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Smart workflow assistance · managed by {status?.managedBy ?? "inerica systems"}
          </p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-[var(--color-clay-500)]/15 px-3 py-1 text-xs font-semibold text-[var(--color-warning)]">
          <Clock3 className="h-3.5 w-3.5" /> Phase 2 · coming soon
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-5">
        {error ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Can&apos;t reach the API — start it with <code className="rounded bg-[var(--color-bg-surface)] px-1.5 py-0.5">pnpm dev</code> in apps/api.
          </p>
        ) : (
          <>
            <div className="mb-6 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-[var(--color-moss-100)] text-[var(--color-moss-700)]">
                <UserCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium text-[var(--color-text-primary)]">Human-in-the-loop by design</p>
                <p className="mt-0.5 text-sm text-[var(--color-text-secondary)]">
                  The assistant proposes; your team decides. Every AI suggestion — reorders, routes,
                  pricing — is surfaced for a person to approve, edit, or reject. Nothing is actioned
                  automatically. Integration lands in Phase 2.
                </p>
              </div>
            </div>

            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">
              Planned capabilities
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(status?.capabilities ?? []).map((c) => (
                <div key={c.key} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-[var(--color-text-brand)]" />
                    <h3 className="font-display font-semibold text-[var(--color-text-primary)]">{c.title}</h3>
                  </div>
                  <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">{c.desc}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
