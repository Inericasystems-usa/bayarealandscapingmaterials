"use client";

import { useState } from "react";
import { Lock, Loader2 } from "lucide-react";
import { Button } from "@balm/ui";
import { Logo } from "@/components/Logo";
import { useAuth } from "./auth";

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-theme="dark"
      className="grid min-h-[100dvh] place-items-center bg-[var(--color-moss-950)] p-4"
    >
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo tone="inverted" height={56} />
          <p className="text-sm text-[var(--color-moss-200)]">Inerica POS · Staff sign-in</p>
        </div>

        <form
          onSubmit={submit}
          className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 shadow-[var(--shadow-xl)]"
        >
          <h1 className="mb-4 font-display text-lg font-bold text-[var(--color-text-primary)]">
            Sign in
          </h1>

          <label
            htmlFor="login-email"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
          >
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="mb-4 h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
            required
          />

          <label
            htmlFor="login-password"
            className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
          >
            Password or PIN
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="mb-4 h-10 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus-visible:border-[var(--color-border-focus)] focus-visible:outline-none"
            required
          />

          {error && <p className="mb-3 text-sm text-[var(--color-danger)]">{error}</p>}

          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" strokeWidth={1.75} />}
            {busy ? "Signing in…" : "Sign in"}
          </Button>
          {/* Never show or prefill sign-in details here, in any build: this
              screen is reachable from the internet (PCI DSS 2.2.2). */}
        </form>

        <p className="mt-4 text-center text-xs text-[var(--color-moss-200)]">
          <a href="/download" className="hover:text-white hover:underline">
            Download the Windows / tablet app →
          </a>
        </p>
      </div>
    </div>
  );
}
